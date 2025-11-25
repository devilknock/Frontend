import React, { useEffect, useState, useRef } from "react";

function App() {
  const [connected, setConnected] = useState(false);
  const [price, setPrice] = useState(null);
  const [signal, setSignal] = useState(null);
  const [patternEvents, setPatternEvents] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    const host = window.location.hostname || "localhost";
    const wsUrl = `ws://${host}:4000`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log("WS connected to backend");
    };
    ws.onclose = () => {
      setConnected(false);
      console.log("WS closed");
    };
    ws.onerror = (e) => {
      console.error("WS err", e);
    };
    ws.onmessage = (msg) => {
      try {
        const d = JSON.parse(msg.data);
        if (d.type === "price") {
          setPrice(d.data);
        } else if (d.type === "signal") {
          setSignal(d.data);
        } else if (d.type === "pattern") {
          setPatternEvents(prev => [d.data, ...prev].slice(0, 20));
        }
      } catch (err) {
        console.error("msg parse", err);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <div style={{ fontFamily: "Inter, Arial", padding: 18, maxWidth: 980, margin: "0 auto" }}>
      <h2>Signal Dashboard — {connected ? "Connected" : "Disconnected"}</h2>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          <h3>Live Price</h3>
          {price ? (
            <>
              <div>Time: {new Date(price.time).toLocaleString()}</div>
              <div>Open: {Number(price.open).toFixed(4)}</div>
              <div>High: {Number(price.high).toFixed(4)}</div>
              <div>Low: {Number(price.low).toFixed(4)}</div>
              <div style={{ fontSize: 20, marginTop: 8 }}>Close: {Number(price.close).toFixed(4)}</div>
            </>
          ) : <div>Loading price...</div>}
        </div>

        <div style={{ flex: 1, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          <h3>Last Signal</h3>
          {!signal && <div>No signals yet</div>}
          {signal && (
            <>
              <div>Symbol: {signal.symbol}</div>
              <div style={{ fontSize: 22, margin: "6px 0", fontWeight: "700" }}>Signal: {signal.signal}</div>
              <div>Last Price: {Number(signal.lastPrice).toFixed(4)}</div>
              <div>Price Range: {Number(signal.priceRange).toFixed(4)}</div>
              <div>RSI: {signal.rsi}</div>
              <div>EMA5: {signal.ema5} | EMA20: {signal.ema20}</div>
              <hr />
              <div>Signal SL: {signal.signalSL ?? "—"}</div>
              <div>Signal TP: {signal.signalTP ?? "—"}</div>
              <div>Pattern: {signal.pattern ?? "—"}</div>
              <div>Pattern SL: {signal.patternSL ?? "—"}</div>
              <div>Pattern TP: {signal.patternTP ?? "—"}</div>
              <div style={{ marginTop: 8, fontWeight: 700 }}>Final SL: {signal.stopLoss ?? "—"} | Final TP: {signal.takeProfit ?? "—"}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>Updated: {signal.time}</div>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 18, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
        <h4>Recent Pattern Events</h4>
        {patternEvents.length === 0 && <div>No pattern events yet</div>}
        <ul>
          {patternEvents.map((p, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              <strong>{p.pattern}</strong> — S: {p.support} R: {p.resistance} (at {p.time})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default App;
