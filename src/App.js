import React, { useEffect, useState } from "react";

// ---------------- SAFETY HELPERS ----------------
function safeJSON(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeTs(rawTs) {
  const n = toNumber(rawTs);
  if (n === undefined) return undefined;
  return n < 1e12 ? n * 1000 : n;
}

function extractClose(obj) {
  try {
    if (!obj) return undefined;

    if (Array.isArray(obj) && obj.length > 4) return toNumber(obj[4]);

    return (
      toNumber(obj?.close) ??
      toNumber(obj?.c) ??
      toNumber(obj?.price) ??
      toNumber(obj?.closePrice) ??
      toNumber(obj?.p) ??
      toNumber(obj?.last) ??
      (obj?.k
        ? toNumber(obj.k.c) ??
          toNumber(obj.k.close) ??
          (Array.isArray(obj.k) ? toNumber(obj.k[4]) : undefined)
        : undefined)
    );
  } catch {
    return undefined;
  }
}

function extractTs(obj) {
  try {
    if (!obj) return undefined;

    return (
      normalizeTs(obj?.t) ??
      normalizeTs(obj?.time) ??
      normalizeTs(obj?.ts) ??
      normalizeTs(obj?.timestamp) ??
      normalizeTs(obj?.openTime) ??
      (obj?.k ? normalizeTs(obj.k.t) : undefined) ??
      (Array.isArray(obj) ? normalizeTs(obj[0]) : undefined)
    );
  } catch {
    return undefined;
  }
}

export default function App() {
  const [status, setStatus] = useState("connecting");
  const [signal, setSignal] = useState(null);
  const [prices, setPrices] = useState([]);
  const [lastRaw, setLastRaw] = useState(null);
  const [pattern, setPattern] = useState("None");
  useEffect(() => {
    const ws = new WebSocket("wss://aka-g2l0.onrender.com");

    ws.onopen = () => setStatus("connected (ws)");
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = () => setStatus("error");

    ws.onmessage = (ev) => {
      const parsed = safeJSON(ev.data);
      if (!parsed || typeof parsed !== "object") {
        setLastRaw(String(ev.data).slice(0, 2000));
        return;
      }

      setLastRaw(JSON.stringify(parsed, null, 2).slice(0, 2000));

      // ----------- PRICE ----------
      if (parsed.type === "price" || parsed.type === "ohlc") {
        const p = parsed.data || parsed;
        const close = extractClose(p);
        const t = extractTs(p);

        if (Number.isFinite(close)) {
          const tsSafe = Number.isFinite(t) ? t : Date.now();
          setPrices((prev) => {
            const arr = [...prev, { t: tsSafe, close }];
            if (arr.length > 200) arr.shift();
            return arr;
          });
        }
        return;
      }

      // ----------- BINANCE KLINE ----------
      if (parsed.k && typeof parsed.k === "object") {
        const close = extractClose(parsed.k);
        const t = extractTs(parsed.k);

        if (Number.isFinite(close)) {
          const tsSafe = Number.isFinite(t) ? t : Date.now();
          setPrices((prev) => {
            const arr = [...prev, { t: tsSafe, close }];
            if (arr.length > 200) arr.shift();
            return arr;
          });
        }
        return;
      }

      // ----------- PATTERN ----------
      if (parsed.type === "pattern") {
        const pd = parsed.data;

        if (typeof pd === "string") {
          setPattern(pd);
        } else if (pd && typeof pd === "object") {
          setPattern(
            JSON.stringify(
              {
                pattern: pd.pattern ?? "Unknown",
                strength: pd.strength ?? null,
                ...pd,
              },
              null,
              2
            )
          );
        } else {
          setPattern("Unknown");
        }
        return;
      }

      // ----------- SIGNAL ----------
      if (parsed.type === "signal" || parsed.signal) {
        const raw = parsed.data ?? parsed.signal ?? parsed;
        const safeRaw =
          raw && typeof raw === "object" ? raw : { value: raw };
        const ts = extractTs(raw);

        setSignal({ ...safeRaw, ts });
        return;
      }

      // ----------- PRICE FALLBACK ----------
      const c = extractClose(parsed);
      const t = extractTs(parsed);
      if (Number.isFinite(c)) {
        const tsSafe = Number.isFinite(t) ? t : Date.now();
        setPrices((prev) => {
          const arr = [...prev, { t: tsSafe, close: c }];
          if (arr.length > 200) arr.shift();
          return arr;
        });
      }
    };

    // ----------- API FALLBACK -----------
    let stop = false;

    const fetchLast = async () => {
      try {
        const res = await fetch(
          "https://aka-g2l0.onrender.com/api/last-signal"
        );
        const j = await res.json();
        if (!stop && j) {
          const raw = j.signal ?? j;
          const safeRaw =
            raw && typeof raw === "object" ? raw : { value: raw };
          const ts = extractTs(raw);

          setSignal({ ...safeRaw, ts });
          setLastRaw(JSON.stringify(j, null, 2).slice(0, 2000));
        }
      } catch {}
    };

    fetchLast();
    const int = setInterval(fetchLast, 5000);

    return () => {
      stop = true;
      try {
        ws.close();
      } catch {}
      clearInterval(int);
    };
  }, []);

  const safePrices = Array.isArray(prices) ? prices : [];

  return (
    <div
      style={{
        background: "#0b1220",
        color: "#e6eef8",
        minHeight: "100vh",
        padding: 20,
      }}
    >
      <h1 style={{ fontSize: 22 }}>🚀 Live Binance Signal (BTCUSDT)</h1>
      <p>Status: {status}</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 16,
          marginTop: 10,
        }}
      >
        {/* PRICE LIST */}
        <div
          style={{
            background: "#071024",
            padding: 12,
            borderRadius: 8,
          }}
        >
          <h3>Price (recent)</h3>
          <div
            style={{
              height: 220,
              overflow: "auto",
              padding: 6,
            }}
          >
            {safePrices
              .slice()
              .reverse()
              .map((p, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    padding: "2px 0",
                    borderBottom:
                      "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  {p.t
                    ? new Date(p.t).toLocaleTimeString()
                    : "—"}{" "}
                  —{" "}
                  {Number.isFinite(Number(p.close))
                    ? Number(p.close).toFixed(2)
                    : String(p.close)}
                </div>
              ))}
          </div>
        </div>

        {/* SIGNAL BLOCK */}
        <div
          style={{
            background: "#071024",
            padding: 12,
            borderRadius: 8,
          }}
        >
          <h3>Latest Signal</h3>

          {signal ? (
            <div>
              <p>
                <b>Symbol:</b>{" "}
                {signal.symbol ??
                  signal.symbolName ??
                  signal.value ??
                  "—"}
              </p>
              <p>
                <b>Signal:</b>{" "}
                {String(
                  signal.signal ??
                    signal.action ??
                    signal.value ??
                    "—"
                )}
              </p>

              <p>
                <b>Entry:</b>{" "}
                {signal.entry !== undefined
                  ? String(signal.entry)
                  : "—"}
              </p>
              <p>
                <b>SL:</b>{" "}
                {signal.stopLoss !== undefined
                  ? String(signal.stopLoss)
                  : "—"}
              </p>
              <p>
                <b>TP:</b>{" "}
                {signal.takeProfit !== undefined
                  ? String(signal.takeProfit)
                  : "—"}
              </p>

              {signal.confidence !== undefined && (
                <p>
                  <b>Confidence:</b>{" "}
                  {String(signal.confidence)}
                </p>
              )}
              {signal.rsi !== undefined && (
                <p>
                  <b>RSI:</b> {String(signal.rsi)}
                </p>
              )}
              {signal.ts && (
                <p
                  style={{
                    fontSize: 11,
                    opacity: 0.7,
                  }}
                >
                  {new Date(signal.ts).toLocaleString()}
                </p>
              )}
            </div>
          ) : (
            <p>No signal yet</p>
          )}

          <h4
            style={{
              fontSize: 13,
              marginTop: 12,
            }}
          >
            LAST RAW (debug)
          </h4>
          <pre
            style={{
              fontSize: 11,
              background: "#031022",
              padding: 8,
              borderRadius: 6,
              maxHeight: 160,
              overflow: "auto",
            }}
          >
            {lastRaw || "—"}
          </pre>
        </div>
      </div>

      {/* PATTERN */}
      <div
        style={{
          background: "#071024",
          padding: 12,
          borderRadius: 8,
          marginTop: 12,
        }}
      >
        <h3>Latest Pattern</h3>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 13,
            background: "#031022",
            padding: 8,
            borderRadius: 6,
          }}
        >
          {pattern}
        </pre>
      </div>
    </div>
  );
        }
