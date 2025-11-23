import React, { useEffect, useState } from "react";

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
  if (!obj) return undefined;

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
  if (!obj) return undefined;
  if (obj.t !== undefined) return normalizeTs(obj.t);
  if (obj.time !== undefined) return normalizeTs(obj.time);
  if (obj.ts !== undefined) return normalizeTs(obj.ts);
  if (obj.timestamp !== undefined) return normalizeTs(obj.timestamp);
  if (obj.openTime !== undefined) return normalizeTs(obj.openTime);
  if (obj.k && obj.k.t !== undefined) return normalizeTs(obj.k.t);
  if (Array.isArray(obj) && obj.length > 0) return normalizeTs(obj[0]);
  return undefined;
}

export default function App() {
  const [status, setStatus] = useState("connecting");
  const [signal, setSignal] = useState(null);
  const [prices, setPrices] = useState([]);
  const [lastRaw, setLastRaw] = useState(null);

  // NEW:
  const [selectedSymbol, setSelectedSymbol] = useState("btcusdt");
  const [symbolList] = useState(["btcusdt", "ethusdt", "bnbusdt", "xrpusdt"]);

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
        setLastRaw(String(ev.data).slice(0, 2000));
        return;
      }

      setLastRaw(JSON.stringify(parsed, null, 2).slice(0, 2000));

      if (parsed.type === "price") {
        const p = parsed.data || parsed;
        const close = extractClose(p);
        const t = extractTs(p);
        if (close !== undefined) {
          setPrices((prev) => {
            const next = [...prev, { t: t || Date.now(), close }];
            if (next.length > 200) next.shift();
            return next;
          });
        }
        return;
      }

      if (parsed.type === "signal" || parsed.signal) {
        const rawSignal = parsed.data || parsed.signal || parsed;
        const s = { ...rawSignal };
        const ts = extractTs(rawSignal);
        if (ts) s.ts = ts;
        setSignal(s);
        return;
      }

      const maybeClose = extractClose(parsed);
      if (maybeClose !== undefined) {
        const maybeTs = extractTs(parsed);
        setPrices((prev) => {
          const next = [...prev, { t: maybeTs || Date.now(), close: maybeClose }];
          if (next.length > 200) next.shift();
          return next;
        });
      }
    };

    let stopped = false;
    const fetchLast = async () => {
      try {
        const res = await fetch("https://aka-g2l0.onrender.com/api/last-signal");
        const j = await res.json();
        if (!stopped && j) {
          const rawSignal = j.signal || j;
          if (rawSignal) {
            const s = { ...rawSignal };
            const ts = extractTs(rawSignal);
            if (ts) s.ts = ts;
            setSignal(s);
            setLastRaw(JSON.stringify(j, null, 2).slice(0, 2000));
          }
        }
      } catch {}
    };

    fetchLast();
    const poll = setInterval(fetchLast, 5000);

    return () => {
      stopped = true;
      clearInterval(poll);
      ws.close();
    };
  }, []);

  // NEW FUNCTION → backend symbol change
  async function changeSymbol() {
    try {
      const res = await fetch("https://aka-g2l0.onrender.com/change-symbol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: selectedSymbol }),
      });

      const j = await res.json();
      console.log("Symbol Change Response:", j);

      setPrices([]); // clear chart for new symbol fresh feed
      setSignal(null);
    } catch (err) {
      console.error("Symbol change error:", err);
    }
  }

  return (
    <div style={{ background: "#0b1220", color: "#e6eef8", minHeight: "100vh", padding: 20 }}>
      
      <h1 style={{ fontSize: 22 }}>
        🚀 Live Binance Signal ({selectedSymbol.toUpperCase()})
      </h1>
      <p>Status: {status}</p>

      {/* SYMBOL CHANGE UI */}
      <div style={{ marginTop: 10, marginBottom: 20 }}>
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
          {symbolList.map((s) => (
            <option key={s} value={s}>{s.toUpperCase()}</option>
          ))}
        </select>

        <button
          onClick={changeSymbol}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            background: "#06b6d4",
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
          <div style={{ height: 220, overflow: "auto" }}>
            {prices.slice().reverse().map((p, i) => (
              <div key={i} style={{ fontSize: 12, opacity: 0.9 }}>
                {new Date(p.t).toLocaleTimeString()} — {p.close.toFixed(2)}
              </div>
            ))}
          </div>
        </div>

        {/* SIGNAL PANEL */}
        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <h3>Latest Signal</h3>

          {signal ? (
            <div>
              <p><b>Symbol:</b> {signal.symbol || selectedSymbol}</p>
              <p><b>Signal:</b> {signal.signal}</p>
              {signal.entry && <p><b>Entry:</b> {signal.entry}</p>}
              {signal.stopLoss && <p><b>SL:</b> {signal.stopLoss}</p>}
              {signal.takeProfit && <p><b>TP:</b> {signal.takeProfit}</p>}
              {signal.ts && <p>{new Date(signal.ts).toLocaleString()}</p>}
            </div>
          ) : (
            <p>No signal yet</p>
          )}

          <h4 style={{ marginTop: 10 }}>RAW</h4>
          <pre style={{ fontSize: 11, maxHeight: 150, overflow: "auto", background: "#031022", padding: 8 }}>
            {lastRaw || "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}
