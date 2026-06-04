// Task #284 — Build and POST tap-to-report error payloads to
// /api/error-reports, and provide a mailto: fallback the friendly error
// card uses when the server-side send fails (so the user is never
// stuck with un-deliverable feedback).

import { apiRequest } from "@/lib/queryClient";

export type FriendlyErrorContext = {
  source: string;
  provider?: string | null;
  step?: string | null;
  serverBody?: string | null;
  // Task #1259 — self-diagnosing reports. The error boundary parses the
  // throwing component's name out of React's componentStack and the
  // current route, and threads them here so a future tap-to-report lands
  // in the inbox already pointing at the screen + component that broke —
  // even in prod where the JS stack is otherwise minified/source-mapless.
  route?: string | null;
  componentName?: string | null;
};

export type FriendlyErrorInfo = {
  name?: string | null;
  message?: string | null;
  stack?: string | null;
};

export type ErrorReportInput = {
  summary: string;
  context: FriendlyErrorContext;
  error?: FriendlyErrorInfo | null;
  reporterEmail?: string | null;
};

export type ErrorReportResult =
  | { ok: true; replyTo: string | null }
  | { ok: false; reason: string; mailto: string };

function buildPayload(input: ErrorReportInput) {
  // Prefer the route captured at throw-time (passed in via context) so the
  // report names the screen that actually broke, not wherever the user
  // drifted to before tapping "Send". Fall back to the live URL.
  const route =
    input.context.route ??
    (typeof window !== "undefined" ? window.location.pathname + window.location.search : null);
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
  const viewport =
    typeof window !== "undefined"
      ? `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`
      : null;
  return {
    summary: input.summary,
    source: input.context.source,
    provider: input.context.provider ?? null,
    step: input.context.step ?? null,
    serverBody: input.context.serverBody ?? null,
    route,
    componentName: input.context.componentName ?? null,
    userAgent,
    viewport,
    timestamp: new Date().toISOString(),
    error: input.error
      ? {
          name: input.error.name ?? null,
          message: input.error.message ?? null,
          stack: input.error.stack ?? null,
        }
      : null,
    reporterEmail: input.reporterEmail ?? null,
  };
}

function buildMailto(target: string, input: ErrorReportInput): string {
  const payload = buildPayload(input);
  const subject = `[GoodTunes error] ${payload.source}${payload.provider ? ` / ${payload.provider}` : ""}${
    payload.step ? ` / ${payload.step}` : ""
  } — ${(payload.error?.message || "").slice(0, 80)}`;
  const lines = [
    payload.summary,
    "",
    `When: ${payload.timestamp}`,
    payload.reporterEmail ? `From: ${payload.reporterEmail}` : null,
    `Where: ${payload.route ?? ""}`,
    payload.componentName ? `Component: ${payload.componentName}` : null,
    payload.userAgent ? `UA: ${payload.userAgent}` : null,
    payload.viewport ? `Viewport: ${payload.viewport}` : null,
    payload.provider ? `Provider: ${payload.provider}${payload.step ? ` / ${payload.step}` : ""}` : null,
    "",
    `Error: ${payload.error?.name ?? "Error"}: ${payload.error?.message ?? "(no message)"}`,
    payload.error?.stack ? `\nStack:\n${payload.error.stack}` : null,
    payload.serverBody ? `\nServer response body:\n${payload.serverBody}` : null,
  ].filter(Boolean) as string[];
  const body = lines.join("\n");
  return `mailto:${target}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const FALLBACK_TARGET = "admin@goodtunes.music";

// Per-session counter so a crash loop in one tab can't spam either the
// inbox or our server. Server enforces the same window independently;
// this is just a polite client-side guard.
const SESSION_LIMIT = 3;
let sessionSentCount = 0;
export function hasHitClientReportLimit(): boolean {
  return sessionSentCount >= SESSION_LIMIT;
}

export async function sendErrorReport(input: ErrorReportInput): Promise<ErrorReportResult> {
  const payload = buildPayload(input);
  if (sessionSentCount >= SESSION_LIMIT) {
    return {
      ok: false,
      reason: "We've already sent a few reports from this session — open your mail app to send another.",
      mailto: buildMailto(FALLBACK_TARGET, input),
    };
  }
  try {
    const res = await apiRequest("POST", "/api/error-reports", payload);
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; sentTo?: string; replyTo?: string | null };
    sessionSentCount += 1;
    return { ok: true, replyTo: j?.replyTo ?? null };
  } catch (e: any) {
    // throwIfResNotOk formats as `${status}: ${text}` — surface a
    // mailto fallback so the user is never stuck.
    return {
      ok: false,
      reason: e?.message ?? "Couldn't reach our servers.",
      mailto: buildMailto(FALLBACK_TARGET, input),
    };
  }
}
