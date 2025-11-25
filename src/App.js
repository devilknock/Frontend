import React, { useEffect, useState } from "react";

export default function App() {
  const [price, setPrice] = useState(null);
  const [signal, setSignal] = useState(null);
  const [pattern, setPattern] = useState(null);

  // User Inputs
  const [range, setRange] = useState({ min: "", max: "" });
  const [sl, setSL] = useState("");
  const [tp, setTP] = useState("");

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:4000");

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);

      // PRICE
      if (data.type === "price") {
        setPrice(data.data.close);
      }

      // SIGNAL
      if (data.type === "signal") {
        setSignal(data.data);
      }

      // PATTERN
      if (data.type === "pattern") {
        setPattern(data.data.pattern);
      }
    };

    ws.onopen = () => console.log("Frontend connected");
    ws.onclose = () => console.log("Disconnected");

    return () => ws.close();
  }, []);

  // Price-Range Filter
  function filterStatus() {
    if (!price) return "";
    if (range.min && price < Number(range.min)) return "⛔ Price Below Range";
    if (range.max && price > Number(range.max)) return "⛔ Price Above Range";
    return "✅ Price Inside Range";
  }

  // Stop Loss / Take Profit status
  function slTpStatus() {
    if (!price) return "";

    if (sl && price <= Number(sl)) return "⚠️ Stop Loss Hit!";
    if (tp && price >= Number(tp)) return "🎯 Take Profit Hit!";
    return "⌛ Waiting…";
  }

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>Realtime Signal Dashboard</h1>

      {/* PRICE DISPLAY */}
      <div style={{ marginTop: 20, fontSize: 22 }}>
        <b>Live Price:</b> {price ?? "Loading..."}
      </div>

      {/* SIGNAL */}
      {signal && (
        <div style={{ marginTop: 15 }}>
          <h2>Signal: {signal.signal}</h2>
          <p>RSI: {signal.rsi}</p>
          <p>EMA5: {signal.ema5}</p>
          <p>EMA20: {signal.ema20}</p>
        </div>
      )}

      {/* PATTERN */}
      {pattern && (
        <div
          style={{
            marginTop: 20,
            padding: 10,
            background: "#eee",
            borderRadius: 10
          }}
        >
          <h2>Pattern Detected: {pattern}</h2>
        </div>
      )}

      {/* USER INPUTS */}
      <div style={{ marginTop: 30 }}>
        <h2>Filters & Risk Control</h2>

        <label>Min Price:</label>
        <input
          type="number"
          value={range.min}
          onChange={(e) => setRange({ ...range, min: e.target.value })}
        />

        <label>Max Price:</label>
        <input
          type="number"
          value={range.max}
          onChange={(e) => setRange({ ...range, max: e.target.value })}
        />

        <p>Status: <b>{filterStatus()}</b></p>

        <hr />

        <label>Stop Loss:</label>
        <input
          type="number"
          value={sl}
          onChange={(e) => setSL(e.target.value)}
        />

        <label>Take Profit:</label>
        <input
          type="number"
          value={tp}
          onChange={(e) => setTP(e.target.value)}
        />

        <p>Status: <b>{slTpStatus()}</b></p>
      </div>
    </div>
  );
}
