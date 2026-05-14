import { getAuthToken } from "./queryClient";

export type AnalyticsEvent = {
  id: string;
  name: string;
  payload: Record<string, any>;
  ts: number;
  sessionId: string;
};

const STORAGE_KEY = "gt:analytics-queue";
const FLUSH_INTERVAL_MS = 15_000;
const MAX_BATCH = 100;
const ENDPOINT = "/api/events";

function uuid(): string {
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const sessionId = uuid();
let queue: AnalyticsEvent[] = [];
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
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {}
}

async function flush(useBeacon = false): Promise<void> {
  if (queue.length === 0 || flushing) return;
  const batch = queue.slice(0, MAX_BATCH);
  const body = JSON.stringify({ events: batch });

  if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    // sendBeacon can't carry custom headers — relies on the session cookie
    // for auth (already sent automatically). The Bearer-token path is only
    // exercised by the regular fetch flush below.
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
  loadFromStorage();
  setInterval(() => { void flush(); }, FLUSH_INTERVAL_MS);
  window.addEventListener("pagehide", () => { void flush(true); });
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush(true);
  });
}

export function track(name: string, payload: Record<string, any> = {}) {
  if (typeof window === "undefined") return;
  ensureInit();
  queue.push({ id: uuid(), name, payload, ts: Date.now(), sessionId });
  saveToStorage();
}

export async function clearLocalAnalytics(): Promise<void> {
  queue = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
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

export function getAnalyticsQueueDepth() {
  return queue.length;
}
