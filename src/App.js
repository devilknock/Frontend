import React, { useEffect, useState } from "react";

function toNumber(v) {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

function normalizeTs(rawTs) {
  if (rawTs === undefined || rawTs === null) return undefined;
  let n = toNumber(rawTs);
  // sometimes ts comes as string like "168..." or number in seconds (e.g. 1690000000)
  if (n === undefined) return undefined;
  // if looks like seconds (less than ~1e12), treat as seconds and convert to ms
  if (n < 1e12) n = n * 1000;
  return n;
}

function extractClose(obj) {
  if (obj === undefined || obj === null) return undefined;

  // If it's an array like [openTime, open, high, low, close, ...]
  if (Array.isArray(obj)) {
    // common OHLC arrays put close at index 4
    if (obj.length > 4) return toNumber(obj[4]);
  }

  // direct fields
  if (obj.close !== undefined) return toNumber(obj.close);
  if (obj.c !== undefined) return toNumber(obj.c);
  if (obj.price !== undefined) return toNumber(obj.price);
  if (obj.closePrice !== undefined) return toNumber(obj.closePrice);

  // Binance style kline nested object
  if (obj.k) {
    if (obj.k.c !== undefined) return toNumber(obj.k.c);
    if (obj.k.close !== undefined) return toNumber(obj.k.close);
    if (obj.k[4] !== undefined) return toNumber(obj.k[4]);
  }

  // maybe data has 'p' or 'last' etc.
  if (obj.p !== undefined) return toNumber(obj.p);
  if (obj.last !== undefined) return toNumber(obj.last);

  return undefined;
}

function extractTs(obj) {
  if (obj === undefined || obj === null) return undefined;

  // common props: t, time, ts, timestamp
  if (obj.t !== undefined) return normalizeTs(obj.t);
  if (obj.time !== undefined) return normalizeTs(obj.time);
  if (obj.ts !== undefined) return normalizeTs(obj.ts);
  if (obj.timestamp !== undefined) return normalizeTs(obj.timestamp);
  if (obj.openTime !== undefined) return normalizeTs(obj.openTime);
  if (obj.k && obj.k.t !== undefined) return normalizeTs(obj.k.t);
  // array case: index 0 often openTime
  if (Array.isArray(obj) && obj.length > 0) return normalizeTs(obj[0]);

  return undefined;
}

export default function App() {
  const [status, setStatus] = useState("connecting");
  const [signal, setSignal] = useState(null);
  const [prices, setPrices] = useState([]); // { t: ms, close: number }
  const [lastRaw, setLastRaw] = useState(null);
  const [pattern, setPattern] = useState("None");
  useEffect(() => {
    const ws = new WebSocket("wss://aka-g2l0.onrender.com");

    ws.onopen = () => setStatus("connected (ws)");
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = (e) => {
      console.error("ws error", e);
      setStatus("error");
    };

    ws.onmessage = (ev) => {
      let parsed;
      try {
        parsed = JSON.parse(ev.data);
      } catch (e) {
        console.error("ws parse error raw:", ev.data, e);
        setLastRaw(String(ev.data).slice(0, 2000)); // store truncated raw
        return;
      }

      console.log("WS MSG:", parsed);
      setLastRaw(JSON.stringify(parsed, null, 2).slice(0, 2000)); // truncated pretty

      // Sometimes backend just sends an object without 'type'
      const type = parsed.type || parsed.msgType || parsed.t || undefined;

      // Generic price handler: try to find data payload
      if (parsed.type === "price" || parsed.type === "ohlc" || (parsed.data && parsed.data.close !== undefined)) {
        const p = parsed.data || parsed.payload || parsed;
        const close = extractClose(p);
        const t = extractTs(p);
        if (close !== undefined) {
          setPrices((prev) => {
            const next = [...prev, { t: t || Date.now(), close }];
            if (next.length > 200) next.shift();
            return next;
          });
        } else {
          console.warn("price message but couldn't extract close:", parsed);
        }
        return;
      }

      // Binance-style kline message (some websockets send {k: {...}} inside)
      if (parsed.k || parsed.e === "kline") {
        const k = parsed.k || parsed;
        const close = extractClose(k);
        const t = extractTs(k);
        if (close !== undefined) {
          setPrices((prev) => {
            const next = [...prev, { t: t || Date.now(), close }];
            if (next.length > 200) next.shift();
            return next;
          });
        }
        return;
      }
      
      // PATTERN DETECTION
     if (parsed.type === "pattern") {
      console.log("Pattern found:", parsed.data.pattern);
      setPattern(parsed.data.pattern);
      return;
    }
      
      // Signal type (explicit) -> normalize ts & set
      if (parsed.type === "signal" || parsed.signal) {
        const rawSignal = parsed.data || parsed.signal || parsed;
        // clone and normalize ts if present
        const s = { ...rawSignal };
        const tsCandidate = extractTs(rawSignal);
        if (tsCandidate) s.ts = tsCandidate;
        setSignal(s);
        return;
      }

      // Fallbacks: if message has price-like fields at top-level
      const maybeClose = extractClose(parsed);
      const maybeTs = extractTs(parsed);
      if (maybeClose !== undefined) {
        setPrices((prev) => {
          const next = [...prev, { t: maybeTs || Date.now(), close: maybeClose }];
          if (next.length > 200) next.shift();
          return next;
        });
        return;
      }

      // If message contains lastSignal endpoint shape: { signal: {...} }
      if (parsed.signal && typeof parsed.signal === "object") {
        const s = { ...parsed.signal };
        const tsCandidate = extractTs(parsed.signal);
        if (tsCandidate) s.ts = tsCandidate;
        setSignal(s);
        return;
      }

      // otherwise just log it (for debugging)
      console.info("Unhandled ws message:", parsed);
    };

    // fallback polling for last-signal
    let stopped = false;
    const fetchLast = async () => {
      try {
        const res = await fetch("https://aka-g2l0.onrender.com/api/last-signal");
        const j = await res.json();
        if (!stopped && j) {
          // many APIs return { signal: {...} } or the signal directly
          const rawSignal = j.signal || j;
          if (rawSignal) {
            const s = { ...rawSignal };
            const tsCandidate = extractTs(rawSignal);
            if (tsCandidate) s.ts = tsCandidate;
            setSignal(s);
            setLastRaw(JSON.stringify(j, null, 2).slice(0, 2000));
          }
        }
      } catch (err) {
        console.warn("fetchLast error", err);
      }
    };
    fetchLast();
    const poll = setInterval(fetchLast, 5000);

    return () => {
      stopped = true;
      clearInterval(poll);
      ws.close();
    };
  }, []);

  return (
    <div style={{ background: "#0b1220", color: "#e6eef8", minHeight: "100vh", padding: 20, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>🚀 Live Binance Signal (BTCUSDT)</h1>
      <p style={{ opacity: 0.8 }}>Status: {status}</p>

      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <h3>Price (recent)</h3>
          <div style={{ height: 220, overflow: "auto", padding: 6 }}>
            {prices.slice().reverse().map((p, i) => (
              <div key={i} style={{ fontSize: 12, padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                {p.t ? new Date(p.t).toLocaleTimeString() : "—"} — {p.close !== undefined ? Number(p.close).toFixed(2) : "—"}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10 }}>
            <button
              onClick={async () => {
                try {
                  await fetch("https://aka-g2l0.onrender.com/push-ohlc", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify([
                      { t: Math.floor(Date.now() / 1000), open: 100, high: 105, low: 99, close: 102, volume: 1000 },
                      { t: Math.floor(Date.now() / 1000) + 60, open: 102, high: 106, low: 101, close: 104, volume: 900 },
                      { t: Math.floor(Date.now() / 1000) + 120, open: 104, high: 107, low: 103, close: 106, volume: 950 }
                    ])
                  });
                } catch (e) {
                  console.error("push ohlc err", e);
                }
              }}
              style={{ padding: "8px 12px", borderRadius: 6, background: "#06b6d4", color: "#042a2b", border: "none" }}
            >
              Send sample OHLC (test)
            </button>
          </div>
        </div>

        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <h3>Latest Signal</h3>
          {signal ? (
            <div>
              <p><b>Symbol:</b> {signal.symbol || signal.symbolName || "—"}</p>
              <p><b>Signal:</b> {signal.signal || signal.action || "—"}</p>
              {signal.entry && <p><b>Entry:</b> {signal.entry}</p>}
              {signal.stopLoss && <p><b>SL:</b> {signal.stopLoss}</p>}
              {signal.takeProfit && <p><b>TP:</b> {signal.takeProfit}</p>}
              {signal.confidence && <p><b>Confidence:</b> {signal.confidence}</p>}
              {signal.rsi !== undefined && <p><b>RSI:</b> {signal.rsi}</p>}
              {signal.ts && <p style={{ fontSize: 12, opacity: 0.8 }}>{new Date(signal.ts).toLocaleString()}</p>}
            </div>
          ) : (
            <p>No signal yet</p>
          )}

          <div style={{ marginTop: 12 }}>
            <h4 style={{ fontSize: 13 }}>LAST RAW (debug)</h4>
            <pre style={{ fontSize: 11, maxHeight: 160, overflow: "auto", background: "#031022", padding: 8, borderRadius: 6 }}>
              {lastRaw || "—"}
            </pre>
            <p style={{ fontSize: 11, opacity: 0.7 }}>Open browser console to see full WS logs (console.log)</p>
          </div>
        </div>
      </div> 
            <div style={{ background: "#071024", padding: 12, borderRadius: 8, marginTop: 12 }}>
  <h3>Latest Pattern</h3>
  {pattern ? (
    <div>{pattern}</div>
  ) : (
    "No pattern yet"
  )}
</div>
    </div>
  );
              }
