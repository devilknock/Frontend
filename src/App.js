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
    // Backend WebSocket - Only signals + patterns
    const ws1 = new WebSocket("wss://aka-g2l0.onrender.com");

    // Binance WebSocket - Live price stream
    const ws2 = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@ticker");

    ws1.onopen = () => setStatus("🟢 Connected");
    ws1.onerror = () => setStatus("🔴 Error Connecting");
    ws1.onclose = () => setStatus("⚠ Disconnected");

    ws1.onmessage = (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch { return; }

      // Pattern
      if (data.type === "pattern" && data?.data?.pattern) {
        setPattern(data.data.pattern);
        return;
      }

      // Signal
      if (data.type === "signal" || data.signal) {
        const raw = data.data || data.signal || data;
        const s = { ...raw, ts: extractTs(raw) };
        setSignal(s);
        return;
      }
    };

    // Binance live price feed
    ws2.onmessage = (ev) => {
      let d = JSON.parse(ev.data);
      const close = extractClose(d);
      const ts = extractTs(d);

      if (close !== undefined) {
        setPrices(prev => {
          const next = [...prev, { t: ts || Date.now(), close }];
          if (next.length > 200) next.shift();
          return next;
        });
      }
    };

    return () => {
      ws1.close();
      ws2.close();
    };
  }, []);

  return (
    <div style={{
      background: "#0b1220",
      color: "white",
      minHeight: "100vh",
      padding: 18,
      fontFamily: "Poppins"
    }}>
      
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>📈 Trading Signal Indicator</h2>
        <p style={{ opacity: 0.6 }}>Made by <b>Ansh & Nitin</b></p>
      </div>

      <p style={{ opacity: 0.6 }}>{status}</p>

      {/* Layout */}
      <div style={{
        marginTop: 15,
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 16
      }}>
        
        {/* Live Price Box */}
        <div style={{
          background: "#071024",
          padding: 15,
          borderRadius: 10
        }}>
          <h3>📊 Live Price Feed</h3>

          <div style={{
            height: 250,
            overflowY: "auto",
            paddingRight: 5
          }}>
            {prices.length ? prices.slice().reverse().map((p, i) => (
              <div key={i} style={{
                fontSize: 13,
                padding: "5px 0",
                borderBottom: "1px solid rgba(255,255,255,0.08)"
              }}>
                {new Date(p.t).toLocaleTimeString()} — <b>{p.close.toFixed(2)}</b>
              </div>
            )) : (
              <p style={{ opacity: 0.6 }}>⏳ Waiting for live price...</p>
            )}
          </div>
        </div>

        {/* Signal Box */}
        <div style={{
          background: "#071024",
          padding: 15,
          borderRadius: 10
        }}>
          <h3>🚀 Latest Trading Signal</h3>

          {signal ? (
            <>
              <p><b>Symbol:</b> {signal.symbol || "BTCUSDT"}</p>
              <p>
                <b>Signal:</b>{" "}
                <span style={{
                  color:
                    signal.signal === "BUY" ? "#28ff84" :
                    signal.signal === "SELL" ? "#ff4d4d" :
                    "#ffe258"
                }}>
                  {signal.signal}
                </span>
              </p>

              <p><b>Pattern:</b> {pattern}</p>
              {signal.stopLoss && <p><b>Stop Loss:</b> {signal.stopLoss}</p>}
              {signal.takeProfit && <p><b>Take Profit:</b> {signal.takeProfit}</p>}
              {signal.rsi && <p><b>RSI:</b> {signal.rsi}</p>}

              <p style={{ opacity: 0.5, fontSize: 11 }}>
                ⏱ {new Date(signal.ts).toLocaleString()}
              </p>
            </>
          ) : (
            <p style={{ opacity: 0.5 }}>No signal detected yet...</p>
          )}
        </div>
      </div>
    </div>
  );
        }
