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
  const [prices, setPrices] = useState([]); // { t: ms, close: number, symbol }
  const [lastRaw, setLastRaw] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState("btcusdt");
  const [availableSymbols, setAvailableSymbols] = useState(["btcusdt","ethusdt","bnbusdt"]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    // fetch available symbols (optional)
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
    ws.onerror = (e) => {
      console.error("ws error", e);
      setStatus("error");
    };

    ws.onmessage = (ev) => {
      let parsed;
      try {
        parsed = JSON.parse(ev.data);
      } catch (e) {
        console.error("ws parse error raw:", ev.data, e);
        setLastRaw(String(ev.data).slice(0, 2000));
        return;
      }

      setLastRaw(JSON.stringify(parsed, null, 2).slice(0, 2000));

      // handle by type
      if (parsed.type === "price" || parsed.type === "ohlc" || (parsed.data && parsed.data.close !== undefined)) {
        const p = parsed.data || parsed.payload || parsed;
        const close = extractClose(p);
        const t = extractTs(p);
        const sym = (p && p.symbol) || (parsed.data && parsed.data.symbol) || undefined;
        if (close !== undefined) {
          setPrices((prev) => {
            const next = [...prev, { t: t || Date.now(), close, symbol: sym || selectedSymbol }];
            if (next.length > 200) next.shift();
            return next;
          });
        }
        return;
      }

      if (parsed.type === "signal" || parsed.signal) {
        const rawSignal = parsed.data || parsed.signal || parsed;
        const s = { ...rawSignal };
        const tsCandidate = extractTs(rawSignal);
        if (tsCandidate) s.ts = tsCandidate;
        setSignal(s);
        if (s.symbol) setSelectedSymbol((prev) => s.symbol.toLowerCase());
        return;
      }

      if (parsed.type === "symbol_changed" || parsed.type === "symbol-change") {
        const sym = parsed.data && parsed.data.symbol;
        if (sym) setSelectedSymbol(sym.toLowerCase());
        return;
      }

      const maybeClose = extractClose(parsed);
      const maybeTs = extractTs(parsed);
      if (maybeClose !== undefined) {
        setPrices((prev) => {
          const next = [...prev, { t: maybeTs || Date.now(), close: maybeClose, symbol: selectedSymbol }];
          if (next.length > 200) next.shift();
          return next;
        });
        return;
      }

      if (parsed.signal && typeof parsed.signal === "object") {
        const s = { ...parsed.signal };
        const tsCandidate = extractTs(parsed.signal);
        if (tsCandidate) s.ts = tsCandidate;
        setSignal(s);
        if (s.symbol) setSelectedSymbol((prev) => s.symbol.toLowerCase());
        return;
      }

      console.info("Unhandled ws message:", parsed);
    };

    // poll fallback for last-signal
    let stopped = false;
    const fetchLast = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/last-signal`);
        const j = await res.json();
        if (!stopped && j) {
          const rawSignal = j.signal || j;
          if (rawSignal) {
            const s = { ...rawSignal };
            const tsCandidate = extractTs(rawSignal);
            if (tsCandidate) s.ts = tsCandidate;
            setSignal(s);
            setLastRaw(JSON.stringify(j, null, 2).slice(0, 2000));
            if (s.symbol) setSelectedSymbol((prev) => s.symbol.toLowerCase());
          }
        }
      } catch (err) {
        // console.warn("fetchLast error", err);
      }
    };
    fetchLast();
    const poll = setInterval(fetchLast, 5000);

    return () => {
      stopped = true;
      clearInterval(poll);
      ws.close();
    };
  }, [API_BASE, WS_URL]);

  async function changeSymbol(sym) {
    setSwitching(true);
    try {
      const res = await fetch(`${API_BASE}/change-symbol`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym }),
      });
      const j = await res.json();
      if (j && j.ok) {
        setSelectedSymbol(j.symbol.toLowerCase());
      } else {
        console.error("change-symbol failed", j);
        alert("Switch failed: " + (j && j.error ? j.error : "unknown"));
      }
    } catch (e) {
      console.error("changeSymbol err", e);
      alert("Switch error: " + e.message);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div style={{ background: "#0b1220", color: "#e6eef8", minHeight: "100vh", padding: 20, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>🚀 Live Binance Signal ({selectedSymbol ? selectedSymbol.toUpperCase() : "—"})</h1>
      <p style={{ opacity: 0.8 }}>Status: {status}</p>

      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 6, background: "#031022", color: "#e6eef8", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {availableSymbols.map((s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
            <button
              onClick={() => changeSymbol(selectedSymbol)}
              disabled={switching}
              style={{ padding: "8px 12px", borderRadius: 6, background: switching ? "#94a3b8" : "#06b6d4", color: "#042a2b", border: "none" }}
            >
              {switching ? "Switching..." : "Switch"}
            </button>
            <div style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }}>{/* hint area */}</div>
          </div>

          <h3>Price (recent)</h3>
          <div style={{ height: 220, overflow: "auto", padding: 6 }}>
            {prices
              .slice()
              .reverse()
              .map((p, i) => (
                <div key={i} style={{ fontSize: 12, padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                  {p.t ? new Date(p.t).toLocaleTimeString() : "—"} — {p.close !== undefined ? Number(p.close).toFixed(2) : "—"} {p.symbol ? `(${p.symbol.toUpperCase()})` : ""}
                </div>
              ))}
          </div>

          <div style={{ marginTop: 10 }}>
            <button
              onClick={async () => {
                try {
                  await fetch(`${API_BASE}/push-ohlc`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify([
                      { t: Math.floor(Date.now() / 1000), open: 100, high: 105, low: 99, close: 102, volume: 1000 },
                      { t: Math.floor(Date.now() / 1000) + 60, open: 102, high: 106, low: 101, close: 104, volume: 900 },
                      { t: Math.floor(Date.now() / 1000) + 120, open: 104, high: 107, low: 103, close: 106, volume: 950 }
                    ])
                  });
                } catch (e) {
                  console.error("push ohlc err", e);
                }
              }}
              style={{ padding: "8px 12px", borderRadius: 6, background: "#06b6d4", color: "#042a2b", border: "none" }}
            >
              Send sample OHLC (test)
            </button>
          </div>
        </div>

        <div style={{ background: "#071024", padding: 12, borderRadius: 8 }}>
          <h3>Latest Signal</h3>
          {signal ? (
            <div>
              <p><b>Symbol:</b> {signal.symbol || "—"}</p>
              <p><b>Signal:</b> {signal.signal || "—"}</p>
              {signal.entry && <p><b>Entry:</b> {signal.entry}</p>}
              {signal.stopLoss && <p><b>SL:</b> {signal.stopLoss}</p>}
              {signal.takeProfit && <p><b>TP:</b> {signal.takeProfit}</p>}
              {signal.confidence && <p><b>Confidence:</b> {signal.confidence}</p>}
              {signal.rsi !== undefined && <p><b>RSI:</b> {signal.rsi}</p>}
              {signal.ts && <p style={{ fontSize: 12, opacity: 0.8 }}>{new Date(signal.ts).toLocaleString()}</p>}
            </div>
          ) : (
            <p>No signal yet</p>
          )}

          <div style={{ marginTop: 12 }}>
            <h4 style={{ fontSize: 13 }}>LAST RAW (debug)</h4>
            <pre style={{ fontSize: 11, maxHeight: 160, overflow: "auto", background: "#031022", padding: 8, borderRadius: 6 }}>
              {lastRaw || "—"}
            </pre>
            <p style={{ fontSize: 11, opacity: 0.7 }}>Open browser console to see full WS logs (console.log)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
