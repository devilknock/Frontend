import React, { useEffect, useState } from "react";

function toNumber(v) {
  if (!v && v !== 0) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

function normalizeTs(ts) {
  if (!ts && ts !== 0) return undefined;
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
  const [latestPrice, setLatestPrice] = useState(null);
  const [pattern, setPattern] = useState("Analyzing...");

  useEffect(() => {
    const ws = new WebSocket("wss://aka-g2l0.onrender.com");

    ws.onopen = () => setStatus("🟢 Connected");
    ws.onerror = () => setStatus("🔴 Error");
    ws.onclose = () => setStatus("⚠️ Disconnected");

    ws.onmessage = (ev) => {
      let data;
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (data.type === "pattern" && data.data?.pattern) {
        setPattern(data.data.pattern);
        return;
      }

      if (data.type === "signal" || data.signal) {
        const raw = data.data || data.signal || data;
        setSignal(raw);
        return;
      }

      const close = extractClose(data);
      const ts = extractTs(data);

      if (close !== undefined && close !== null) {
        setLatestPrice({ time: ts || Date.now(), close });
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div style={{ background: "#02070f", minHeight: "100vh", padding: 15, color: "white", fontFamily: "Poppins" }}>
      
      <h2>📊 Live Price Feed</h2>
      <p style={{ opacity: 0.7 }}>{status}</p>

      <div style={{
        background: "#0b1328",
        padding: 15,
        borderRadius: 10,
        marginBottom: 20,
      }}>
        {latestPrice ? (
          <h1 style={{ fontSize: 36, fontWeight: "bold", color: "#1cff79" }}>
            ${latestPrice.close.toLocaleString()}
          </h1>
        ) : (
          <p>⏳ Waiting for live price...</p>
        )}
      </div>

      <h2>🚀 Latest Trading Signal</h2>

      <div style={{
        background: "#0b1328",
        padding: 15,
        borderRadius: 10,
      }}>
        {signal ? (
          <div style={{ lineHeight: "22px" }}>
            <p><b>Symbol:</b> {signal.symbol || "BTCUSDT"}</p>
            <p><b>Signal:</b> <span style={{
              color:
                signal.signal === "BUY"
                  ? "#1cff79"
                  : signal.signal === "SELL"
                  ? "#ff4f4f"
                  : "#ffd32a",
            }}>{signal.signal || "HOLD"}</span></p>

            <p><b>Pattern:</b> {pattern}</p>
            {signal.stopLoss && <p><b>Stop Loss:</b> {signal.stopLoss}</p>}
            {signal.takeProfit && <p><b>Take Profit:</b> {signal.takeProfit}</p>}
            {signal.rsi && <p><b>RSI:</b> {signal.rsi}</p>}
          </div>
        ) : (
          <p>⌛ Waiting for signal...</p>
        )}
      </div>
    </div>
  );
          }
