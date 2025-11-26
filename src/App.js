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
    const ws1 = new WebSocket("wss://aka-g2l0.onrender.com");
    const ws2 = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@ticker");

    ws1.onopen = () => setStatus("🟢 Connected");
    ws1.onerror = () => setStatus("🔴 Error Connecting");
    ws1.onclose = () => setStatus("⚠ Disconnected");

    ws1.onmessage = (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch { return; }

      if (data.type === "pattern" && data?.data?.pattern) {
        setPattern(data.data.pattern);
        return;
      }

      if (data.type === "signal" || data.signal) {
        const raw = data.data || data.signal || data;
        const s = { ...raw, ts: extractTs(raw) };
        setSignal(s);
        return;
      }
    };

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

  // Dynamic Signal Color
  const getSignalColor = (sg) => {
    if (!sg) return "#ffe258";
    if (sg === "BUY") return "#28ff84";
    if (sg === "SELL") return "#ff4d4d";
    return "#4da6ff"; // HOLD
  };

  return (
    <div style={{
      background: "#0b1220",
      color: "white",
      minHeight: "100vh",
      padding: 20,
      fontFamily: "Poppins"
    }}>

      {/* ======= 3D Heading ======= */}
      <div style={{ textAlign: "center", position: "relative", marginBottom: 40 }}>
        <h1 style={{
          fontSize: 40,
          fontWeight: "bold",
          textShadow: "3px 3px 10px rgba(0,0,0,0.8), -3px -3px 10px rgba(255,255,255,0.1)"
        }}>
          TRADING SIGNAL INDICATOR
        </h1>

        {/* Made By */}
        <p style={{
          position: "absolute",
          top: 10,
          right: 20,
          fontSize: 13,
          color: "#5bd1ff",
          fontWeight: "bold"
        }}>
          Made by Ansh & Nitin
        </p>
      </div>

      {/* Connection status */}
      <p style={{ opacity: 0.6, textAlign: "center" }}>{status}</p>

      {/* ======= Blank Chart Area ======= */}
      <div style={{
        height: 250,
        margin: "25px 0",
        borderRadius: 12,
        background: "#071024",
        boxShadow: "0 3px 10px rgba(0,0,0,0.4)"
      }}>
        {/* Chart will come here */}
      </div>

      {/* ======= Latest Signal + Price Box ======= */}
      <div style={{
        background: "#071024",
        padding: 20,
        borderRadius: 12,
        boxShadow: "0 3px 10px rgba(0,0,0,0.4)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        
        {/* LEFT SIDE - Signal with box */}
        {signal ? (
          <div>
            <div style={{
              display: "inline-block",
              padding: "7px 18px",
              borderRadius: 8,
              background: getSignalColor(signal.signal),
              color: "#000",
              fontWeight: "bold",
              marginBottom: 8
            }}>
              {signal.signal}
            </div>

            <p>Pattern: {pattern}</p>
            {signal.stopLoss && <p>SL: {signal.stopLoss}</p>}
            {signal.takeProfit && <p>TP: {signal.takeProfit}</p>}
            {signal.rsi && <p>RSI: {signal.rsi}</p>}

            <p style={{ opacity: 0.5, fontSize: 11 }}>
              ⏱ {new Date(signal.ts).toLocaleString()}
            </p>
          </div>
        ) : (
          <p style={{ opacity: 0.5 }}>No signal detected yet...</p>
        )}

        {/* RIGHT SIDE - Live Price */}
        <div style={{
          textAlign: "right",
          fontWeight: "bold",
          fontSize: 22
        }}>
          {prices.length ? prices[prices.length - 1].close.toFixed(2) : "----"}
        </div>

      </div>

    </div>
  );
}
