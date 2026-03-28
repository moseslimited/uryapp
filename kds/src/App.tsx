import { useEffect, useMemo, useRef, useState } from "react";
import { confirmCancelKot, fetchReadyKots, fetchServedKots, serveKot, type KotApiResponse } from "./api";

type KotDoc = any;

function parseProductionFromPath(): string {
  const prefix = "/URYMosaic/";
  const path = window.location.pathname || "";
  const idx = path.indexOf(prefix);
  if (idx === -1) return "";
  const rest = path.slice(idx + prefix.length);
  const segment = rest.split("/")[0] || "";
  return decodeURIComponent(segment);
}

function getCurrentUser(): string {
  const boot = (window as any).frappe?.boot;
  return boot?.user?.name || boot?.user?.email || "Administrator";
}

function minutesSince(isoOrDatetime: string | undefined): number | null {
  if (!isoOrDatetime) return null;
  const dt = new Date(isoOrDatetime);
  if (Number.isNaN(dt.getTime())) return null;
  return Math.floor((Date.now() - dt.getTime()) / 60000);
}

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 140);
  } catch {
    // ignore
  }
}

function stripClassForKot(kot: KotDoc): string {
  const type = String(kot?.type || "");
  const takeaway = Boolean(kot?.table_takeaway) || String(kot?.order_type || "").toLowerCase().includes("take");

  if (type === "Order Modified") return "stripModified";
  if (type === "Cancelled" || type === "Partially cancelled") return "stripCancelled";
  if (type === "New Order" || type === "Duplicate") return takeaway ? "stripNewTakeaway" : "stripNewTable";

  return takeaway ? "stripNewTakeaway" : "stripNewTable";
}

function badgeForOrder(kot: KotDoc): string {
  const t = String(kot?.order_type || "");
  const table = kot?.restaurant_table ? `Table ${kot.restaurant_table}` : "";
  if (t) return t + (table ? ` • ${table}` : "");
  return table || "Order";
}

export default function App() {
  const production = useMemo(() => parseProductionFromPath(), []);
  const [tab, setTab] = useState<"ready" | "served">("ready");
  const [data, setData] = useState<KotApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function loadOnce() {
      if (!production) {
        setError("Missing Production Unit in URL. Use /URYMosaic/<Production Unit Name> (e.g. /URYMosaic/Kitchen).");
        setLoading(false);
        return;
      }

      try {
        setError(null);
        const resp = tab === "ready" ? await fetchReadyKots(production) : await fetchServedKots(production);
        if (cancelled) return;

        // beep on new KOTs (ready tab only) if audio_alert enabled
        if (tab === "ready" && resp?.audio_alert) {
          const names = (resp.KOT || []).map((k) => String(k?.name || "")).filter(Boolean);
          const newlyArrived = names.some((n) => !seen.current.has(n));
          names.forEach((n) => seen.current.add(n));
          if (newlyArrived) beep();
        }

        setData(resp);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load KOT list");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadOnce();
    const t = window.setInterval(loadOnce, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [production, tab]);

  const branch = data?.Branch || "";
  const kotWarnMinutes = data?.kot_alert_time ?? null;
  const kots: KotDoc[] = data?.KOT || [];

  return (
    <div className="container">
      <div className="topbar">
        <div>
          <div className="title">URY KDS • {production || "Production Unit"}</div>
          <div className="subtitle">
            {branch ? `Branch: ${branch}` : "Branch: (auto)"} {kotWarnMinutes ? `• Warning: ${kotWarnMinutes} min` : ""}
          </div>
        </div>
        <div className="tabs">
          <button className={`tab ${tab === "ready" ? "tabActive" : ""}`} onClick={() => setTab("ready")}>
            Ready
          </button>
          <button className={`tab ${tab === "served" ? "tabActive" : ""}`} onClick={() => setTab("served")}>
            Served
          </button>
        </div>
      </div>

      {error ? <div className="empty">{error}</div> : null}
      {loading && !data ? <div className="empty">Loading KOTs…</div> : null}

      {!loading && !error && kots.length === 0 ? (
        <div className="empty">No KOTs right now for {production}.</div>
      ) : null}

      <div className="grid">
        {kots.map((kot) => {
          const createdMinutes = minutesSince(kot?.creation);
          const warn = kotWarnMinutes && createdMinutes !== null ? createdMinutes >= kotWarnMinutes : false;

          const showConfirm =
            (kot?.type === "Cancelled" || kot?.type === "Partially cancelled") && Number(kot?.verified || 0) === 0;

          return (
            <div key={String(kot?.name)} className="card">
              <div className={`strip ${stripClassForKot(kot)}`} />
              <div className="cardHeader">
                <div>
                  <div className="badgeRow">
                    <span className="badge">{badgeForOrder(kot)}</span>
                    <span className="badge">{String(kot?.type || "KOT")}</span>
                    {kot?.user ? <span className="badge">By: {String(kot.user)}</span> : null}
                  </div>
                  <div className="meta" style={{ marginTop: 8 }}>
                    <div>
                      <b>Order:</b> {String(kot?.invoice || kot?.order_no || kot?.name || "")}
                    </div>
                    {kot?.customer_name ? (
                      <div>
                        <b>Customer:</b> {String(kot.customer_name)}
                      </div>
                    ) : null}
                    {kot?.comments ? (
                      <div>
                        <b>Note:</b> {String(kot.comments)}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className={`timer ${warn ? "timerWarn" : ""}`}>
                  {createdMinutes === null ? "--" : `${createdMinutes}m`}
                </div>
              </div>

              <div className="cardBody">
                <ol className="items">
                  {(kot?.kot_items || []).map((it: any, idx: number) => (
                    <li key={`${String(it?.name || it?.item || idx)}`} className="item">
                      <b>{String(it?.qty ?? "")}×</b> {String(it?.item_name || it?.item || "")}
                      {it?.comments ? <div className="itemComment">• {String(it.comments)}</div> : null}
                    </li>
                  ))}
                </ol>

                <div className="footerActions">
                  {tab === "ready" ? (
                    <button
                      className="btn btnPrimary"
                      onClick={async () => {
                        await serveKot(String(kot.name));
                      }}
                    >
                      Serve
                    </button>
                  ) : null}

                  {showConfirm ? (
                    <button
                      className="btn btnDanger"
                      onClick={async () => {
                        await confirmCancelKot(String(kot.name), getCurrentUser());
                      }}
                    >
                      Confirm Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

