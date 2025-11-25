import React, { useEffect, useState } from "react";

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeTs(rawTs) {
  const n = toNumber(rawTs);
  if (n === undefined) return undefined;
  return n < 1e12 ? n * 1000 : n; // seconds → ms
}

function extractClose(obj) {
  if (!obj) return undefined;

  if (Array.isArray(obj) && obj.length > 4) return toNumber(obj[4]);

  // Use safe access; if obj is primitive, toNumber will handle it
  return (
    toNumber(obj?.close) ??
    toNumber(obj?.c) ??
    toNumber(obj?.price) ??
    toNumber(obj?.closePrice) ??
    (obj?.k ? toNumber(obj.k.c) ?? toNumber(obj.k.close) ?? toNumber(obj.k[4]) : undefined) ??
    toNumber(obj?.p) ??
    toNumber(obj?.last)
  );
}

function extractTs(obj) {
  if (!obj) return undefined;

  return (
    normalizeTs(obj?.t) ??
    normalizeTs(obj?.time) ??
    normalizeTs(obj?.ts) ??
    normalizeTs(obj?.timestamp) ??
    normalizeTs(obj?.openTime) ??
    (obj?.k ? normalizeTs(obj.k.t) : undefined) ??
    (Array.isArray(obj) ? normalizeTs(obj[0]) : undefined)
  );
}

export default function App() {
  const [status, setStatus] = useState("connecting");
  const [signal, setSignal] = useState(null);
  const [prices, setPrices] = useState([]);
  const [lastRaw, setLastRaw] = useState(null);
  const [pattern, setPattern] = useState("None");

  useEffect(() => {
    const ws = new WebSocket("wss://aka-g2l0.onrender.com");

    ws.onopen = () => setStatus("connected (ws)");
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = (e) => {
      console.warn("ws error", e);
      setStatus("error");
    };

    ws.onmessage = (ev) => {
      let parsed;
      try {
        parsed = JSON.parse(ev.data);
      } catch (err) {
        // show raw text if parse fails
        setLastRaw(String(ev.data).slice(0, 2000));
        console.warn("ws parse error", err);
        return;
      }

      setLastRaw(JSON.stringify(parsed, null, 2).slice(0, 2000));

      // PRICE / OHLC messages
      if (parsed?.type === "price" || parsed?.type === "ohlc") {
        const p = parsed.data || parsed;
        const close = extractClose(p);
        const t = extractTs(p);
        if (close !== undefined) {
          setPrices((prev) => {
            const arr = [...prev, { t: t || Date.now(), close }];
            if (arr.length > 200) arr.shift();
            return arr;
          });
        } else {
          console.warn("price message but couldn't extract close:", parsed);
        }
        return;
      }

      // binance kline-ish
      if (parsed?.k) {
        const close = extractClose(parsed.k);
        const t = extractTs(parsed.k);
        if (close !== undefined) {
          setPrices((prev) => {
            const arr = [...prev, { t: t || Date.now(), close }];
            if (arr.length > 200) arr.shift();
            return arr;
          });
        }
        return;
      }

      // PATTERN (safe)
      if (parsed?.type === "pattern") {
        // parsed.data might be object or string or missing -> handle safely
        const pd = parsed.data;
        const value =
          (pd && typeof pd === "object" && pd.pattern) ??
          (typeof pd === "string" ? pd : undefined) ??
          "Unknown";
        setPattern(value);
        return;
      }

      // SIGNAL (safe)
      if (parsed?.type === "signal" || parsed?.signal) {
        const raw = parsed.data ?? parsed.signal ?? parsed;
        // raw may be null/primitive/object - ensure we always store an object
        const safeRaw = raw && typeof raw === "object" ? raw : { value: raw };
        const ts = extractTs(raw);
        setSignal({ ...safeRaw, ts });
        return;
      }

      // generic price fallback
      const maybeClose = extractClose(parsed);
      const maybeTs = extractTs(parsed);
      if (maybeClose !== undefined) {
        setPrices((prev) => {
          const arr = [...prev, { t: maybeTs || Date.now(), close: maybeClose }];
          if (arr.length > 200) arr.shift();
          return arr;
        });
        return;
      }

      // last-signal shape fallback
      if (parsed?.signal && typeof parsed.signal === "object") {
        const raw = parsed.signal;
        const ts = extractTs(raw);
        setSignal({ ...raw, ts });
        return;
      }

      console.info("Unhandled ws message:", parsed);
    };

    let stop = false;

    const fetchLast = async () => {
      try {
        const res = await fetch("https://aka-g2l0.onrender.com/api/last-signal");
        const j = await res.json();
        if (!stop && j) {
          const raw = j.signal ?? j;
          const safeRaw = raw && typeof raw === "object" ? raw : { value: raw };
          const ts = extractTs(raw);
          setSignal({ ...safeRaw, ts });
          setLastRaw(JSON.stringify(j, null, 2).slice(0, 2000));
        }
      } catch (err) {
        console.warn("fetchLast error", err);
      }
    };

    fetchLast();
    const int = setInterval(fetchLast, 5000);

    return () => {
      stop = true;
      try {
        ws.close();
      } catch {}
      clearInterval(int);
    };
  }, []);

  // safety: ensure prices is array before mapping
  const safePrices = Array.isArray(prices) ? prices : [];

  return (
    <div style={{ background: "#0b1220", color: "#e6eef8", minHeight: "100vh", padding: 20 }}>
      <h1 style={{ fontSize: 22 }}>🚀 Live Binance Signal (BTCUSDT)</h1>
      <p>Status: {status}</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, marginTop: 10 }}>
        {/* PRICE LIST */}
        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <h3>Price (recent)</h3>
          <div style={{ height: 220, overflow: "auto", padding: 6 }}>
            {safePrices
              .slice()
              .reverse()
              .map((p, i) => (
                <div key={i} style={{ fontSize: 12, padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  {p.t ? new Date(p.t).toLocaleTimeString() : "—"} —{" "}
                  {p.close !== undefined ? (Number.isFinite(Number(p.close)) ? Number(p.close).toFixed(2) : String(p.close)) : "—"}
                </div>
              ))}
          </div>
        </div>

        {/* SIGNAL BLOCK */}
        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <h3>Latest Signal</h3>

          {signal ? (
            <div>
              <p><b>Symbol:</b> {signal.symbol ?? signal.symbolName ?? signal.value ?? "—"}</p>
              <p><b>Signal:</b> {signal.signal ?? signal.action ?? "—"}</p>

              {/* SAFE FIELDS */}
              <p><b>Entry:</b> {signal.entry !== undefined ? String(signal.entry) : "—"}</p>
              <p><b>SL:</b> {signal.stopLoss !== undefined ? String(signal.stopLoss) : "—"}</p>
              <p><b>TP:</b> {signal.takeProfit !== undefined ? String(signal.takeProfit) : "—"}</p>

              {signal.confidence !== undefined && <p><b>Confidence:</b> {String(signal.confidence)}</p>}
              {signal.rsi !== undefined && <p><b>RSI:</b> {String(signal.rsi)}</p>}
              {signal.ts && <p style={{ fontSize: 11, opacity: 0.7 }}>{new Date(signal.ts).toLocaleString()}</p>}
            </div>
          ) : (
            <p>No signal yet</p>
          )}

          <h4 style={{ fontSize: 13, marginTop: 12 }}>LAST RAW (debug)</h4>
          <pre style={{ fontSize: 11, background: "#031022", padding: 8, borderRadius: 6, maxHeight: 160, overflow: "auto" }}>
            {lastRaw || "—"}
          </pre>
        </div>
      </div>

      {/* PATTERN */}
      <div style={{ background: "#071024", padding: 12, borderRadius: 8, marginTop: 12 }}>
        <h3>Latest Pattern</h3>
        {pattern || "No pattern yet"}
      </div>
    </div>
  );
}
