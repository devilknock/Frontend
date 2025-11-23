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

export default function App() {
  const API_BASE = "https://aka-g2l0.onrender.com";
  const WS_URL = "wss://aka-g2l0.onrender.com";

  const [status, setStatus] = useState("connecting");
  const [signal, setSignal] = useState(null);
  const [prices, setPrices] = useState([]);
  const [lastRaw, setLastRaw] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState("btcusdt");
  const [availableSymbols, setAvailableSymbols] = useState(["btcusdt","ethusdt","bnbusdt"]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/available-symbols`);
        const j = await r.json();
        if (j && Array.isArray(j.symbols)) setAvailableSymbols(j.symbols);
      } catch (e) {}
    })();
  }, []);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => setStatus("connected (ws)");
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = () => setStatus("error");

    ws.onmessage = (ev) => {
      let parsed;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        setLastRaw(String(ev.data).slice(0, 2000));
        return;
      }

      setLastRaw(JSON.stringify(parsed, null, 2));

      if (parsed.type === "price" || parsed.type === "ohlc" || (parsed.data && parsed.data.close !== undefined)) {
        const p = parsed.data || parsed;
        const close = extractClose(p);
        const t = extractTs(p);
        const sym = p.symbol || selectedSymbol;

        if (close !== undefined) {
          setPrices((prev) => {
            const next = [...prev, { t: t || Date.now(), close, symbol: sym }];
            if (next.length > 200) next.shift();
            return next;
          });
        }
        return;
      }

      if (parsed.type === "signal") {
        const raw = parsed.data;
        const ts = extractTs(raw);
        const s = { ...raw, ts };
        setSignal(s);

        if (s.symbol) setSelectedSymbol(s.symbol.toLowerCase());
        return;
      }

      if (parsed.type === "symbol_changed") {
        const s = parsed.data.symbol;
        if (s) setSelectedSymbol(s.toLowerCase());
        return;
      }
    };

    const fetchLast = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/last-signal`);
        const j = await r.json();
        const raw = j.signal || j;
        const ts = extractTs(raw);
        const s = { ...raw, ts };
        setSignal(s);
      } catch {}
    };

    fetchLast();
    const poll = setInterval(fetchLast, 5000);

    return () => {
      ws.close();
      clearInterval(poll);
    };
  }, []);

  async function changeSymbol(sym) {
    setSwitching(true);
    try {
      const res = await fetch(`${API_BASE}/change-symbol`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym })
      });
      const j = await res.json();
      if (j.ok) {
        setSelectedSymbol(sym.toLowerCase());
        setPrices([]);
      }
    } catch (e) {
      console.error(e);
    }
    setSwitching(false);
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Trading Indicator Engine</h2>

      <div>Status: {status}</div>

      <label>Select Symbol:</label>
      <select
        disabled={switching}
        value={selectedSymbol}
        onChange={(e) => changeSymbol(e.target.value)}
      >
        {availableSymbols.map((s) => (
          <option key={s} value={s}>
            {s.toUpperCase()}
          </option>
        ))}
      </select>

      <pre>{lastRaw}</pre>
    </div>
  );
}
