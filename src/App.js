import React, { useEffect, useState } from "react";

// ---------- Utils ----------
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
  if (Array.isArray(obj) && obj.length > 4) return toNumber(obj[4]);
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

// ---------- App ----------
export default function App() {
  const API_BASE = "https://aka-g2l0.onrender.com";
  const WS_URL = "wss://aka-g2l0.onrender.com";

  const [status, setStatus] = useState("connecting");
  const [signal, setSignal] = useState(null);
  const [prices, setPrices] = useState([]);
  const [lastRaw, setLastRaw] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState("btcusdt");
  const [availableSymbols, setAvailableSymbols] = useState(["btcusdt", "ethusdt", "bnbusdt"]);
  const [switching, setSwitching] = useState(false);

  // ---------- Load symbols ----------
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/available-symbols`);
        const j = await r.json();
        if (j && Array.isArray(j.symbols)) setAvailableSymbols(j.symbols);
      } catch {}
    })();
  }, []);

  // ---------- Main WS ----------
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    let stopped = false;

    ws.onopen = () => setStatus("connected");
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = () => setStatus("error");

    ws.onmessage = (ev) => {
      let parsed;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }

      setLastRaw(JSON.stringify(parsed, null, 2).slice(0, 2000));

      // Use a single "data" object to read price/symbol/signal consistently
      const data = parsed.data || parsed.payload || parsed;

      // If the server sends a symbol inside the price message, reflect it in UI.
      // (This only updates the frontend selectedSymbol for display — it does NOT call change-symbol API.)
      if (data && data.symbol) {
        try {
          const sym = String(data.symbol).toLowerCase();
          // avoid toggling while user intentionally switching
          setSelectedSymbol((prev) => (switching ? prev : sym));
        } catch {}
      }

      // ---- Price update ----
      const close = extractClose(data);
      const ts = extractTs(data);

      if (close !== undefined) {
        setPrices((p) => {
          const next = [...p, { t: ts || Date.now(), close }];
          if (next.length > 200) next.shift();
          return next;
        });
      }

      // ---- Signal update (more robust) ----
      const rawSignal =
        parsed.signal ||
        data?.signal ||
        (parsed.type === "signal" ? data : null);

      if (rawSignal) {
        const s = { ...rawSignal };
        const sTs = extractTs(rawSignal);
        if (sTs) s.ts = sTs;
        setSignal((prev) => ({ ...prev, ...s })); // merge so we don't lose partial fields
      }
    };

    // ---------- Poll fallback every 5s ----------
    const poll = setInterval(async () => {
      if (stopped) return;
      try {
        const r = await fetch(`${API_BASE}/api/last-signal`);
        const j = await r.json();
        if (j?.signal) {
          const s = { ...j.signal };
          const sTs = extractTs(j.signal);
          if (sTs) s.ts = sTs;
          setSignal((prev) => ({ ...prev, ...s }));
        }
      } catch {}
    }, 5000);

    return () => {
      stopped = true;
      clearInterval(poll);
      ws.close();
    };
  }, [switching]); // added switching to deps so we can check it inside message handler

  // ---------- Change symbol ----------
  async function changeSymbol(sym) {
    setSwitching(true);
    try {
      const r = await fetch(`${API_BASE}/change-symbol`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym }),
      });
      const j = await r.json();
      if (j.ok) setSelectedSymbol(j.symbol.toLowerCase());
    } catch {}
    setSwitching(false);
  }

  return (
    <div style={{ background: "#0b1220", color: "#e6eef8", minHeight: "100vh", padding: 20, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>🚀 Live Binance Signal ({selectedSymbol.toUpperCase()})</h1>
      <p>Status: {status}</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        {/* ---------- Prices ---------- */}
        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <h3>Price (recent)</h3>
          <div style={{ height: 220, overflow: "auto" }}>
            {prices.slice().reverse().map((p, i) => (
              <div key={i} style={{ fontSize: 12, opacity: 0.9 }}>
                {new Date(p.t).toLocaleTimeString()} — {p.close?.toFixed(2)}
              </div>
            ))}
          </div>
        </div>

        {/* ---------- Signal Panel ---------- */}
        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <h3>Latest Signal</h3>

          {signal ? (
            <div style={{ fontSize: 14 }}>
              <p><b>Symbol:</b> {signal.symbol || selectedSymbol}</p>
              <p><b>Signal:</b> {signal.signal}</p>
              {signal.entry && <p><b>Entry:</b> {signal.entry}</p>}
              {signal.stopLoss && <p><b>SL:</b> {signal.stopLoss}</p>}
              {signal.takeProfit && <p><b>TP:</b> {signal.takeProfit}</p>}
              {signal.confidence && <p><b>Confidence:</b> {signal.confidence}</p>}
              {signal.rsi && <p><b>RSI:</b> {signal.rsi}</p>}
              {signal.ts && <p style={{ fontSize: 11 }}>{new Date(signal.ts).toLocaleString()}</p>}
            </div>
          ) : (
            <p>No signal yet</p>
          )}

          <h4 style={{ fontSize: 13, marginTop: 10 }}>RAW (debug)</h4>
          <pre style={{ fontSize: 11, maxHeight: 150, overflow: "auto", background: "#031022", padding: 8 }}>
            {lastRaw || "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}
