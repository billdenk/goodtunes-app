// AnalyticsDebugOverlay — floating panel that admins can pop open from
// any page to watch events being tracked in real time.
//
// Reads two sources:
//   1. `getRecentAnalyticsEvents()` — the client-side ring buffer; updates
//      via the `gt:analytics-tick` window event whenever `track()` fires.
//   2. `GET /api/admin/events/recent` — the last N rows persisted to the
//      `analytics_events` table; refreshed on demand. This is what
//      confirms the round-trip (client → batch → server → Postgres) is
//      actually working and lets admins debug across devices.
//
// Mounted globally inside `App.tsx`; the toggle button only renders when
// the current user is a signed-in admin so it never leaks to fans.

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  getAnalyticsDeviceId,
  getAnalyticsSessionId,
  getAnalyticsQueueDepth,
  getRecentAnalyticsEvents,
  type AnalyticsEvent,
} from "@/lib/analytics";

type ServerRow = {
  id: string;
  name: string;
  payload: any;
  ts: string | null;
  sessionId: string | null;
  userId: string | null;
  receivedAt: string | null;
};

function fmtTime(ts: number | string | null): string {
  if (!ts) return "—";
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  return d.toLocaleTimeString();
}

export function AnalyticsDebugOverlay() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"client" | "server">("client");
  const [clientEvents, setClientEvents] = useState<AnalyticsEvent[]>(() => getRecentAnalyticsEvents());
  const [serverRows, setServerRows] = useState<ServerRow[]>([]);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [queueDepth, setQueueDepth] = useState(getAnalyticsQueueDepth());

  // Refresh the client list on every `track()` call. Listening to a
  // window event keeps this decoupled from the SDK and lets us add more
  // subscribers (e.g. a future devtools panel) without changing analytics.ts.
  useEffect(() => {
    const tick = () => {
      setClientEvents(getRecentAnalyticsEvents());
      setQueueDepth(getAnalyticsQueueDepth());
    };
    window.addEventListener("gt:analytics-tick", tick);
    return () => window.removeEventListener("gt:analytics-tick", tick);
  }, []);

  const loadServer = async () => {
    setServerErr(null);
    try {
      const r = await apiRequest("GET", "/api/admin/events/recent?limit=50");
      const j = await r.json();
      setServerRows(Array.isArray(j?.events) ? j.events : []);
    } catch (e: any) {
      setServerErr(e?.message ?? "Couldn't load server tail");
    }
  };

  useEffect(() => {
    if (open && tab === "server" && serverRows.length === 0 && !serverErr) {
      void loadServer();
    }
  }, [open, tab]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open analytics debug overlay"
        data-testid="button-analytics-overlay-open"
        className="fixed bottom-4 right-4 z-[200] h-10 px-3 rounded-full bg-[#319ED8] text-white text-xs font-semibold shadow-lg active:opacity-80"
      >
        Events ({clientEvents.length}{queueDepth > 0 ? ` · ${queueDepth} q` : ""})
      </button>
    );
  }

  const items = tab === "client" ? clientEvents.slice().reverse() : serverRows;

  return (
    <div
      className="fixed bottom-4 right-4 z-[200] w-[420px] max-w-[calc(100vw-2rem)] max-h-[70vh] flex flex-col rounded-2xl bg-slate-900 text-white shadow-2xl border border-white/10"
      data-testid="overlay-analytics-debug"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="text-sm font-semibold">Analytics</div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          data-testid="button-analytics-overlay-close"
          className="text-white/60 hover:text-white text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="px-4 py-2 text-[11px] text-white/60 space-y-0.5 font-mono break-all">
        <div>device: {getAnalyticsDeviceId().slice(0, 8)}…</div>
        <div>session: {getAnalyticsSessionId().slice(0, 8)}… · queue: {queueDepth}</div>
      </div>

      <div className="px-2 pb-2 flex gap-1">
        <button
          type="button"
          onClick={() => setTab("client")}
          data-testid="tab-analytics-client"
          className={[
            "flex-1 px-3 py-1.5 rounded-lg text-xs font-medium",
            tab === "client" ? "bg-white/15" : "text-white/55 hover:text-white",
          ].join(" ")}
        >
          Client ({clientEvents.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("server")}
          data-testid="tab-analytics-server"
          className={[
            "flex-1 px-3 py-1.5 rounded-lg text-xs font-medium",
            tab === "server" ? "bg-white/15" : "text-white/55 hover:text-white",
          ].join(" ")}
        >
          Server ({serverRows.length})
        </button>
        {tab === "server" && (
          <button
            type="button"
            onClick={() => void loadServer()}
            data-testid="button-analytics-server-refresh"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#319ED8] text-white"
          >
            ↻
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
        {serverErr && tab === "server" && (
          <div className="px-3 py-2 text-[11px] text-red-300">{serverErr}</div>
        )}
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-white/40 text-xs">No events yet.</div>
        ) : (
          items.map((e) => {
            const isServer = tab === "server";
            const payload = isServer ? (e as ServerRow).payload : (e as AnalyticsEvent).payload;
            const ts = isServer ? (e as ServerRow).ts : (e as AnalyticsEvent).ts;
            return (
              <div
                key={(e as any).id}
                data-testid={`row-analytics-event-${(e as any).id}`}
                className="rounded-lg bg-white/5 px-3 py-2 text-[11px] font-mono"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[#4AFFCA] font-semibold">{(e as any).name}</span>
                  <span className="text-white/40">{fmtTime(ts)}</span>
                </div>
                {payload && Object.keys(payload).length > 0 && (
                  <pre className="mt-1 text-white/70 whitespace-pre-wrap break-all">
                    {JSON.stringify(payload, null, 0)}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
