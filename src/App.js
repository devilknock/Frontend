import React, { useEffect, useState } from "react";

function toNumber(v) {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

function normalizeTs(ts) {
  if (!ts) return undefined;
  let n = Number(ts);
  if (n < 1e12) n *= 1000;
  return n;
}

function extractClose(obj) {
  if (!obj) return undefined;
  if (Array.isArray(obj) && obj.length > 4) return Number(obj[4]);

  return (
    toNumber(obj.close) ||
    toNumber(obj.c) ||
    toNumber(obj.price) ||
    (obj.k && toNumber(obj.k.c))
  );
}

function extractTs(obj) {
  if (!obj) return undefined;
  return (
    normalizeTs(obj.t) ||
    normalizeTs(obj.time) ||
    normalizeTs(obj.ts) ||
    normalizeTs(obj.timestamp) ||
    (obj.k && normalizeTs(obj.k.t)) ||
    (Array.isArray(obj) && normalizeTs(obj[0]))
  );
}

export default function App() {
  const [status, setStatus] = useState("Connecting...");
  const [signal, setSignal] = useState(null);
  const [prices, setPrices] = useState([]);
  const [pattern, setPattern] = useState("No Pattern Yet");

  useEffect(() => {
    const ws = new WebSocket("wss://aka-g2l0.onrender.com");

    ws.onopen = () => setStatus("🟢 Connected");
    ws.onerror = () => setStatus("🔴 Error Connecting");
    ws.onclose = () => setStatus("⚠ Disconnected");

    ws.onmessage = (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch { return; }

      if (data.type === "pattern" && data.data?.pattern) {
        setPattern(data.data.pattern);
        return;
      }

      if (data.type === "signal" || data.signal) {
        const raw = data.data || data.signal || data;
        const s = { ...raw, ts: extractTs(raw) };
        setSignal(s);
        return;
      }

      const close = extractClose(data);
      const ts = extractTs(data);

      if (close !== undefined) {
        setPrices((prev) => {
          const next = [...prev, { t: ts || Date.now(), close }];
          if (next.length > 200) next.shift();
          return next;
        });
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div style={{
      background: "#0b1220",
      color: "#e6eef8",
      minHeight: "100vh",
      padding: 20,
      fontFamily: "Poppins, sans-serif"
    }}>
      
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>📈 Trading Signal Indicator</h1>
        <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>
          Made by <b>Ansh & Nitin</b>
        </p>
      </div>

      <p style={{ opacity: 0.7, marginTop: 6 }}>{status}</p>

      {/* Responsive Section */}
      <div style={{
        marginTop: 15,
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 16
      }}>

        {/* Price Feed */}
        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <h3>📊 Live Price Feed</h3>
          <div style={{
            height: 230,
            overflowY: "auto",
            borderRadius: 6,
            padding: 5
          }}>
            {prices.length ? (
              prices.slice().reverse().map((p, i) => (
                <div key={i} style={{
                  fontSize: 12,
                  padding: "4px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.05)"
                }}>
                  {new Date(p.t).toLocaleTimeString()} — <b>{p.close.toFixed(2)}</b>
                </div>
              ))
            ) : (
              <p style={{ opacity: 0.6 }}>⏳ Waiting for live price...</p>
            )}
          </div>
        </div>

        {/* Signal Box */}
        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <h3>🚀 Latest Trading Signal</h3>
          {signal ? (
            <div style={{ lineHeight: "22px" }}>
              <p><b>Symbol:</b> {signal.symbol || "BTCUSDT"}</p>
              <p>
                <b>Signal:</b>{" "}
                <span style={{
                  color: signal.signal === "BUY" ? "#27ef75" :
                         signal.signal === "SELL" ? "#ff4d4d" : "#ffd54c"
                }}>
                  {signal.signal}
                </span>
              </p>

              <p><b>Pattern Detected:</b> {pattern}</p>

              {signal.stopLoss && <p><b>Stop Loss:</b> {signal.stopLoss}</p>}
              {signal.takeProfit && <p><b>Take Profit:</b> {signal.takeProfit}</p>}
              {signal.rsi && <p><b>RSI:</b> {signal.rsi}</p>}

              <p style={{ opacity: 0.6, fontSize: 11 }}>
                ⏱ {new Date(signal.ts).toLocaleString()}
              </p>
            </div>
          ) : (
            <p>No signal yet...</p>
          )}
        </div>
      </div>
    </div>
  );
        }
