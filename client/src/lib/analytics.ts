import { getAuthToken } from "./queryClient";
import type {
  AnalyticsEnvelope,
  AnalyticsEventEnvelope,
  AnalyticsEventMap,
  AnalyticsEventName,
  AnalyticsPlatform,
} from "@shared/analytics";

// Client-side analytics SDK.
//
// Every `track(name, payload)` call lands here, gets wrapped in a typed
// envelope (deviceId, sessionId, userId, platform, referrer), is persisted
// to localStorage so it survives reloads, and is flushed in batches to
// `POST /api/events`. The server stamps geo (country/region) from the
// request IP and forwards to PostHog server-side so ad-blockers can't drop
// events.
//
// Typed end-to-end: `track<N>(name, payload)` is generic over the event
// name and forces `payload` to match the shape declared in
// `shared/analytics.ts`. A misspelled name or a dropped field is a
// compile error, so the client and server can't drift.

export type AnalyticsEvent = AnalyticsEventEnvelope;

const STORAGE_KEY = "gt:analytics-queue";
const DEVICE_KEY = "gt:device-id";
const RECENT_KEY = "gt:analytics-recent"; // ring-buffer for admin debug overlay
const FLUSH_INTERVAL_MS = 15_000;
const MAX_BATCH = 100;
const MAX_RECENT = 20;
const ENDPOINT = "/api/events";

function uuid(): string {
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const cur = localStorage.getItem(DEVICE_KEY);
    if (cur) return cur;
  } catch {}
  const id = uuid();
  try { localStorage.setItem(DEVICE_KEY, id); } catch {}
  return id;
}

function detectPlatform(): AnalyticsPlatform | undefined {
  if (typeof window === "undefined") return undefined;
  // Coarse split — refined later as we add more shells. Apple-Music-style
  // shell at ≤1024 is the mobile experience; ≥1024 is the desktop one.
  const w = window.innerWidth || 0;
  return w >= 1024 ? "web-desktop" : "web-mobile";
}

const sessionId = uuid();
const deviceId = readDeviceId();
let currentUserId: string | null = null;

// ─── Campaign attribution (first-touch) ─────────────────────────────────
// On the first page load that carries any campaign params in the URL, we
// snapshot them and persist for the rest of the session. In-session
// navigation strips the query string, so first-touch must win — once a
// session is attributed we never overwrite it. Persisted to sessionStorage
// (not localStorage) so it scopes to this tab/session, matching the
// in-memory `sessionId`.
type Attribution = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  referrerHost: string | null;
};
const ATTRIBUTION_KEY = "gt:attribution";
let attribution: Attribution | null = null;

// ─── Internal / test-traffic device marker (Task #2257) ─────────────────
// Operators and staff hammer the live release pages (QA, demos, "does the
// buy flow still work?"), inflating the top of the acquisition funnel. We
// can't reliably catch that server-side because most of it is logged-out, so
// we durably flag the DEVICE: once an admin — or a full-access operator
// account — has signed in on this browser, every analytics event it emits
// (even later, even logged-out) carries `_internal: true` in its payload.
// The admin Funnels report exposes an opt-in toggle to drop those sessions.
// localStorage (not session) so the flag survives sign-out and new tabs.
// Default analytics stay honest — the marker only EXCLUDES when asked.
const INTERNAL_KEY = "gt:internal-device";
let internalDevice = false;
function loadInternalFlag() {
  try {
    internalDevice = localStorage.getItem(INTERNAL_KEY) === "1";
  } catch {}
}

// Durably flag (or clear) this browser as internal/test traffic. Called from
// useAuth when an admin or full-access operator signs in; idempotent.
export function markInternalDevice(on: boolean) {
  internalDevice = on;
  try {
    if (on) localStorage.setItem(INTERNAL_KEY, "1");
    else localStorage.removeItem(INTERNAL_KEY);
  } catch {}
}

// Current first-touch campaign attribution snapshot (or null). Lets the
// checkout call forward the landing session's source across the cross-domain
// purchase redirect so the server can stitch the completion back to it.
export function getAnalyticsAttribution(): Attribution | null {
  if (!attribution) captureAttribution();
  return attribution;
}

function referrerHost(): string | null {
  try {
    if (typeof document === "undefined" || !document.referrer) return null;
    const host = new URL(document.referrer).hostname || null;
    // Drop our own host — a same-site referrer isn't an acquisition source.
    if (host && typeof window !== "undefined" && host === window.location.hostname) return null;
    return host;
  } catch {
    return null;
  }
}

function captureAttribution() {
  if (typeof window === "undefined") return;
  // First-touch already persisted? Keep it — never overwrite.
  if (attribution) return;
  try {
    const saved = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (saved) {
      attribution = JSON.parse(saved) as Attribution;
      return;
    }
  } catch {}
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return;
  }
  const get = (k: string) => {
    const v = params.get(k);
    return v && v.trim() ? v.trim().slice(0, 256) : null;
  };
  const next: Attribution = {
    utmSource: get("utm_source"),
    utmMedium: get("utm_medium"),
    utmCampaign: get("utm_campaign"),
    utmContent: get("utm_content"),
    utmTerm: get("utm_term"),
    gclid: get("gclid"),
    fbclid: get("fbclid"),
    referrerHost: referrerHost(),
  };
  // Only persist if we actually learned something — otherwise leave the
  // session unattributed so a later inbound link (rare, but possible on a
  // long-lived tab) can still set first-touch.
  const hasAny = Object.entries(next).some(([, v]) => v !== null);
  if (!hasAny) return;
  attribution = next;
  try {
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(next));
  } catch {}
}

let queue: AnalyticsEvent[] = [];
let recent: AnalyticsEvent[] = [];
let initialized = false;
let flushing = false;

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) queue = parsed;
    }
  } catch {}
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) recent = parsed.slice(-MAX_RECENT);
    }
  } catch {}
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {}
}

function saveRecent() {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent("gt:analytics-tick"));
  } catch {}
}

async function flush(useBeacon = false): Promise<void> {
  if (queue.length === 0 || flushing) return;
  const batch = queue.slice(0, MAX_BATCH);
  const body = JSON.stringify({ events: batch });

  if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(ENDPOINT, blob)) {
      queue = queue.slice(batch.length);
      saveToStorage();
    }
    return;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  flushing = true;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body,
      credentials: "include",
      keepalive: true,
    });
    if (res.ok) {
      queue = queue.slice(batch.length);
      saveToStorage();
    }
  } catch {
    // network down — events stay queued and we'll retry on the next interval
  } finally {
    flushing = false;
  }
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  captureAttribution();
  loadInternalFlag();
  loadFromStorage();
  setInterval(() => { void flush(); }, FLUSH_INTERVAL_MS);
  window.addEventListener("pagehide", () => { void flush(true); });
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush(true);
  });
}

function buildEnvelope(): AnalyticsEnvelope {
  // Cheap safety net: if the very first tracked event somehow fires before
  // ensureInit ran (it shouldn't — track() calls ensureInit first), still
  // attempt first-touch capture so we never miss the landing event's UTMs.
  if (!attribution) captureAttribution();
  return {
    deviceId,
    sessionId,
    userId: currentUserId,
    platform: detectPlatform(),
    referrer: typeof document !== "undefined" ? document.referrer || null : null,
    utmSource: attribution?.utmSource ?? null,
    utmMedium: attribution?.utmMedium ?? null,
    utmCampaign: attribution?.utmCampaign ?? null,
    utmContent: attribution?.utmContent ?? null,
    utmTerm: attribution?.utmTerm ?? null,
    gclid: attribution?.gclid ?? null,
    fbclid: attribution?.fbclid ?? null,
    referrerHost: attribution?.referrerHost ?? null,
  };
}

// Strictly typed. `name` must be a registered event; `payload` must
// match its declared shape in `shared/analytics.ts`.
export function track<N extends AnalyticsEventName>(name: N, payload: AnalyticsEventMap[N]) {
  if (typeof window === "undefined") return;
  ensureInit();
  const envelope = buildEnvelope();
  const event: AnalyticsEvent = {
    id: uuid(),
    name,
    // Stamp `_internal` into the payload on flagged operator/staff devices so
    // the funnel report can opt-in exclude this session (Task #2257).
    payload: (internalDevice ? { ...(payload as any), _internal: true } : payload) as any,
    ts: Date.now(),
    ...envelope,
  };
  queue.push(event);
  recent.push(event);
  if (recent.length > MAX_RECENT) recent = recent.slice(-MAX_RECENT);
  saveToStorage();
  saveRecent();
}

// Backwards-compatible alias retained for older call sites that imported
// `trackTyped` while the registry was being staged. New code should use
// `track` — it carries the same generic enforcement.
export const trackTyped = track;

// Returns true when the admin debug overlay should mount. Gated on both
// the user being an admin (checked in App.tsx) AND a feature-flag opt-in
// so we don't show the overlay to admins by default — they have to flip
// `localStorage["gt:analytics-debug"] = "1"` or set
// `VITE_ANALYTICS_DEBUG_OVERLAY=1` in the build.
export function isAnalyticsDebugOverlayEnabled(): boolean {
  try {
    if ((import.meta as any)?.env?.VITE_ANALYTICS_DEBUG_OVERLAY === "1") return true;
  } catch {}
  try {
    return localStorage.getItem("gt:analytics-debug") === "1";
  } catch {
    return false;
  }
}

// Identify the current user. Called from useAuth on sign-in so subsequent
// events are stitched to the user; clears on sign-out.
export function identifyAnalyticsUser(userId: string | null) {
  currentUserId = userId;
}

export async function clearLocalAnalytics(): Promise<void> {
  queue = [];
  recent = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  try { localStorage.removeItem(RECENT_KEY); } catch {}
  saveRecent();
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    await fetch(ENDPOINT, { method: "DELETE", headers, credentials: "include" });
  } catch {}
}

export function getAnalyticsSessionId() {
  return sessionId;
}

export function getAnalyticsDeviceId() {
  return deviceId;
}

export function getAnalyticsQueueDepth() {
  return queue.length;
}

// Snapshot of the last ~20 events fired (in chronological order). Powers
// the admin debug overlay; non-reactive — overlay listens to the
// `gt:analytics-tick` window event to refresh.
export function getRecentAnalyticsEvents(): AnalyticsEvent[] {
  return recent.slice();
}
