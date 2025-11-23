import React, { useEffect, useRef, useState } from "react";

/* ---------- utils (same as your old code) ---------- */
function toNumber(v) {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}
function normalizeTs(rawTs) {
  if (rawTs === undefined || rawTs === null) return undefined;
  let n = toNumber(rawTs);
  if (n === undefined) return undefined;
  if (n < 1e12) n = n * 1000;
  return n;
}
function extractClose(obj) {
  if (obj === undefined || obj === null) return undefined;
  if (Array.isArray(obj)) {
    if (obj.length > 4) return toNumber(obj[4]);
  }
  if (obj.close !== undefined) return toNumber(obj.close);
  if (obj.c !== undefined) return toNumber(obj.c);
  if (obj.price !== undefined) return toNumber(obj.price);
  if (obj.closePrice !== undefined) return toNumber(obj.closePrice);
  if (obj.k) {
    if (obj.k.c !== undefined) return toNumber(obj.k.c);
    if (obj.k.close !== undefined) return toNumber(obj.k.close);
    if (obj.k[4] !== undefined) return toNumber(obj.k[4]);
  }
  if (obj.p !== undefined) return toNumber(obj.p);
  if (obj.last !== undefined) return toNumber(obj.last);
  return undefined;
}
function extractTs(obj) {
  if (obj === undefined || obj === null) return undefined;
  if (obj.t !== undefined) return normalizeTs(obj.t);
  if (obj.time !== undefined) return normalizeTs(obj.time);
  if (obj.ts !== undefined) return normalizeTs(obj.ts);
  if (obj.timestamp !== undefined) return normalizeTs(obj.timestamp);
  if (obj.openTime !== undefined) return normalizeTs(obj.openTime);
  if (obj.k && obj.k.t !== undefined) return normalizeTs(obj.k.t);
  if (Array.isArray(obj) && obj.length > 0) return normalizeTs(obj[0]);
  return undefined;
}

/* ---------- App component (updated) ---------- */
export default function App() {
  const API_BASE = "https://aka-g2l0.onrender.com";

  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const [status, setStatus] = useState("connecting");
  const [signal, setSignal] = useState(null);
  const [prices, setPrices] = useState([]);
  const [lastRaw, setLastRaw] = useState(null);

  // symbol UI + available list
  const [selectedSymbol, setSelectedSymbol] = useState("btcusdt");
  const [availableSymbols, setAvailableSymbols] = useState(["btcusdt", "ethusdt", "bnbusdt", "xrpusdt"]);
  const [switching, setSwitching] = useState(false);

  /* ---------- fetch available symbols once ---------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/available-symbols`);
        const j = await r.json();
        if (mounted && j && Array.isArray(j.symbols)) {
          setAvailableSymbols(j.symbols);
          if (j.current) setSelectedSymbol(String(j.current).toLowerCase());
        }
      } catch (e) {
        // ignore; keep default list
      }
    })();
    return () => (mounted = false);
  }, []);

  /* ---------- connect / reconnect websocket whenever selectedSymbol changes ---------- */
  useEffect(() => {
    // cleanup old socket
    function cleanupWs() {
      try {
        if (wsRef.current) {
          try { wsRef.current.close(); } catch {}
          wsRef.current = null;
        }
      } catch {}
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    }

    // start a new socket
    function startWs() {
      // note: server WS URL is same, but we reconnect to get a clean feed and ensure filters work server-side
      const ws = new WebSocket(API_BASE.replace(/^http/, "ws"));
      wsRef.current = ws;
      setStatus("connecting (ws)");

      ws.onopen = () => {
        setStatus("connected (ws)");
        // informational - you could send a subscribe message if your server expects it
      };

      ws.onclose = () => {
        setStatus("disconnected");
        // attempt reconnect after small delay
        reconnectTimer.current = setTimeout(() => {
          startWs();
        }, 3000);
      };

      ws.onerror = (e) => {
        console.error("ws error", e);
        setStatus("error");
        try { ws.close(); } catch {}
      };

      ws.onmessage = (ev) => {
        let parsed;
        try {
          parsed = JSON.parse(ev.data);
        } catch (e) {
          console.warn("ws parse error raw:", ev.data, e);
          // don't overwrite lastRaw with unrelated binary / non-json
          return;
        }

        // Normalize message payload and detect symbol (if present)
        const data = parsed.data || parsed.payload || parsed;
        const msgSymbol =
          (parsed.data && parsed.data.symbol) ||
          parsed.symbol ||
          parsed.data?.symbol ||
          parsed.symbolName ||
          parsed.signal?.symbol ||
          parsed.data?.s ||
          undefined;

        // If message has symbol and it doesn't match currently selected symbol → ignore (keeps UI stable)
        if (msgSymbol && String(msgSymbol).toLowerCase() !== String(selectedSymbol).toLowerCase()) {
          // optionally log for debugging, but do not set UI raw
          // console.debug("Ignoring message for other symbol:", msgSymbol);
          return;
        }

        // For UI debugging we set lastRaw to the last relevant message (matching symbol)
        setLastRaw(JSON.stringify(parsed, null, 2).slice(0, 2000));

        // Price message handling
        if (parsed.type === "price" || parsed.type === "ohlc" || (data && data.close !== undefined)) {
          const close = extractClose(data);
          const t = extractTs(data);
          if (close !== undefined) {
            setPrices((prev) => {
              const next = [...prev, { t: t || Date.now(), close }];
              if (next.length > 200) next.shift();
              return next;
            });
          }
          return;
        }

        // Binance-style kline
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

        // explicit signal
        if (parsed.type === "signal" || parsed.signal) {
          const rawSignal = parsed.data || parsed.signal || parsed;
          const s = { ...rawSignal };
          const tsCandidate = extractTs(rawSignal);
          if (tsCandidate) s.ts = tsCandidate;
          setSignal(s);
          return;
        }

        // fallback: top-level price-like
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

        // fallback for { signal: {...} } shape
        if (parsed.signal && typeof parsed.signal === "object") {
          const s = { ...parsed.signal };
          const tsCandidate = extractTs(parsed.signal);
          if (tsCandidate) s.ts = tsCandidate;
          setSignal(s);
          return;
        }

        // unhandled but relevant
        // console.info("Unhandled ws message:", parsed);
      };
    }

    // When symbol changes we want fresh state
    setPrices([]);
    setSignal(null);
    setLastRaw(null);

    cleanupWs();
    startWs();

    return () => {
      cleanupWs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol]); // reconnect when selectedSymbol changes

  /* ---------- change symbol -> call backend endpoint ---------- */
  async function changeSymbol() {
    setSwitching(true);
    try {
      const r = await fetch(`${API_BASE}/change-symbol`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: selectedSymbol }),
      });
      const j = await r.json();
      if (j && j.ok) {
        // backend changed symbol. We already reconnect (useEffect) because selectedSymbol state changed.
        // But to be safe, clear UI and wait for fresh messages.
        setPrices([]);
        setSignal(null);
        setLastRaw(JSON.stringify({ notice: `Requested symbol change to ${j.symbol}` }, null, 2));
      } else {
        const err = j && j.error ? j.error : "unknown";
        setLastRaw(JSON.stringify({ error: "change-symbol failed", detail: err }, null, 2));
      }
    } catch (e) {
      console.error("changeSymbol error", e);
      setLastRaw(JSON.stringify({ error: "change-symbol request failed", detail: String(e) }, null, 2));
    } finally {
      setSwitching(false);
    }
  }

  /* ---------- initial fetch of last signal so UI has something on load ---------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/signal`);
        const j = await res.json();
        if (!mounted) return;
        if (j) {
          // only accept if symbol matches or if server didn't provide symbol
          if (!j.symbol || String(j.symbol).toLowerCase() === selectedSymbol.toLowerCase()) {
            const s = { ...j };
            if (!s.ts && j.timestamp) s.ts = extractTs(j);
            setSignal(s);
            setLastRaw(JSON.stringify({ initialSignal: j }, null, 2).slice(0, 2000));
          }
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => (mounted = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  return (
    <div style={{ background: "#0b1220", color: "#e6eef8", minHeight: "100vh", padding: 20, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>🚀 Live Binance Signal ({selectedSymbol.toUpperCase()})</h1>
      <p style={{ opacity: 0.9 }}>Status: {status} {switching ? "· changing…" : ""}</p>

      {/* SYMBOL CHANGE UI */}
      <div style={{ marginTop: 10, marginBottom: 18 }}>
        <select
          value={selectedSymbol}
          onChange={(e) => setSelectedSymbol(e.target.value)}
          style={{
            padding: 8,
            borderRadius: 6,
            background: "#071024",
            color: "white",
            border: "1px solid #0f1a33",
            marginRight: 10,
          }}
        >
          {availableSymbols.map((s) => (
            <option key={s} value={s}>
              {s.toUpperCase()}
            </option>
          ))}
        </select>

        <button
          onClick={changeSymbol}
          disabled={switching}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            background: switching ? "#0aa" : "#06b6d4",
            border: "none",
            fontWeight: "bold",
            color: "#042a2b",
          }}
        >
          Change Symbol
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        {/* PRICE PANEL */}
        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <h3>Price (recent)</h3>
          <div style={{ height: 220, overflow: "auto", padding: 6 }}>
            {prices.length === 0 && <div style={{ fontSize: 12, opacity: 0.7 }}>No prices yet</div>}
            {prices.slice().reverse().map((p, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  padding: "6px 4px",
                  borderBottom: "1px solid rgba(255,255,255,0.02)",
                }}
              >
                {p.t ? new Date(p.t).toLocaleTimeString() : "—"} — {p.close !== undefined ? Number(p.close).toFixed(2) : "—"}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10 }}>
            <button
              onClick={async () => {
                try {
                  await fetch(`${API_BASE}/push-ohlc`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify([
                      { t: Math.floor(Date.now() / 1000), open: 100, high: 105, low: 99, close: 102, volume: 1000 },
                      { t: Math.floor(Date.now() / 1000) + 60, open: 102, high: 106, low: 101, close: 104, volume: 900 },
                      { t: Math.floor(Date.now() / 1000) + 120, open: 104, high: 107, low: 103, close: 106, volume: 950 },
                    ]),
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

        {/* SIGNAL PANEL */}
        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <h3>Latest Signal</h3>

          {signal ? (
            <div>
              <p>
                <b>Symbol:</b> {signal.symbol || selectedSymbol}
              </p>
              <p>
                <b>Signal:</b> {signal.signal || signal.action || "—"}
              </p>
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
            <pre
              style={{
                fontSize: 11,
                maxHeight: 160,
                overflow: "auto",
                background: "#031022",
                padding: 8,
                borderRadius: 6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {lastRaw || "—"}
            </pre>
            <p style={{ fontSize: 11, opacity: 0.7 }}>Showing only messages for the selected symbol.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
