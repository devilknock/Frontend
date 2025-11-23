import React, { useEffect, useState } from "react";

export default function App() {
  const [status, setStatus] = useState("connecting");
  const [signal, setSignal] = useState(null);
  const [prices, setPrices] = useState([]);

  useEffect(() => {
    const ws = new WebSocket("wss://aka-g2l0.onrender.com");

    ws.onopen = () => setStatus("connected (ws)");
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = () => setStatus("error");

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);

        if (msg.type === "price") {
          const p = msg.data;

          setPrices((prev) => {
            const next = [...prev, { t: p.t, close: p.close }];
            if (next.length > 200) next.shift();
            return next;
          });
        }

        if (msg.type === "signal") {
          setSignal(msg.data);
        }

        if (msg.type === "status") {
          setStatus(msg.data);
        }
      } catch (e) {
        console.error("ws parse error", e);
      }
    };

    // Poll last signal (fallback)
    let stop = false;
    const fetchLast = async () => {
      try {
        const res = await fetch("https://aka-g2l0.onrender.com/api/last-signal");
        const j = await res.json();
        if (!stop && j && j.signal) setSignal(j);
      } catch {}
    };
    fetchLast();
    const poll = setInterval(fetchLast, 5000);

    return () => {
      stop = true;
      clearInterval(poll);
      ws.close();
    };
  }, []);

  // Function to convert timestamp properly
  const formatTime = (raw) => {
    const t = Number(raw);
    const d = new Date(t < 9999999999 ? t * 1000 : t);
    return isNaN(d.getTime()) ? "Invalid" : d.toLocaleTimeString();
  };

  return (
    <div
      style={{
        background: "#0b1220",
        color: "#e6eef8",
        minHeight: "100vh",
        padding: 20,
        fontFamily: "sans-serif",
      }}
    >
      <h1 style={{ fontSize: 22 }}>🚀 Live Binance Signal (BTCUSDT)</h1>
      <p style={{ opacity: 0.8 }}>Status: {status}</p>

      <div
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 16,
        }}
      >
        {/* PRICE LIST */}
        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <h3>Price (recent)</h3>

          <div style={{ height: 220, overflow: "auto", padding: 6 }}>
            {prices
              .slice()
              .reverse()
              .map((p, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    padding: "2px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  {formatTime(p.t)} — {p.close}
                </div>
              ))}
          </div>

          {/* TEST BUTTON */}
          <div style={{ marginTop: 10 }}>
            <button
              onClick={async () => {
                try {
                  await fetch("https://aka-g2l0.onrender.com/push-ohlc", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify([
                      {
                        t: Math.floor(Date.now() / 1000),
                        open: 100,
                        high: 105,
                        low: 99,
                        close: 102,
                        volume: 1000,
                      },
                      {
                        t: Math.floor(Date.now() / 1000) + 60,
                        open: 102,
                        high: 106,
                        low: 101,
                        close: 104,
                        volume: 900,
                      },
                      {
                        t: Math.floor(Date.now() / 1000) + 120,
                        open: 104,
                        high: 107,
                        low: 103,
                        close: 106,
                        volume: 950,
                      },
                    ]),
                  });
                } catch (e) {}
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                background: "#06b6d4",
                color: "#042a2b",
                border: "none",
              }}
            >
              Send sample OHLC (test)
            </button>
          </div>
        </div>

        {/* SIGNAL BOX */}
        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <h3>Latest Signal</h3>

          {signal ? (
            <div>
              <p>
                <b>Symbol:</b> {signal.symbol}
              </p>
              <p>
                <b>Signal:</b> {signal.signal}
              </p>
              {signal.entry && (
                <p>
                  <b>Entry:</b> {signal.entry}
                </p>
              )}
              {signal.stopLoss && (
                <p>
                  <b>SL:</b> {signal.stopLoss}
                </p>
              )}
              {signal.takeProfit && (
                <p>
                  <b>TP:</b> {signal.takeProfit}
                </p>
              )}
              {signal.confidence && (
                <p>
                  <b>Confidence:</b> {signal.confidence}
                </p>
              )}
              {signal.rsi !== undefined && (
                <p>
                  <b>RSI:</b> {signal.rsi}
                </p>
              )}
              {signal.ts && (
                <p style={{ fontSize: 12, opacity: 0.8 }}>
                  {new Date(
                    signal.ts < 9999999999
                      ? signal.ts * 1000
                      : signal.ts
                  ).toLocaleString()}
                </p>
              )}
            </div>
          ) : (
            <p>No signal yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
