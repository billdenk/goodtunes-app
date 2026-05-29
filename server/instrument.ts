// Sentry error tracking. This module is imported FIRST in server/index.ts —
// before express or any route code — so the SDK's auto-instrumentation can
// hook the runtime and attach request context to captured errors.
//
// It is entirely inert until SENTRY_DSN is set: with no DSN we skip init, and
// every Sentry.* call elsewhere becomes a safe no-op. So the app runs
// identically with or without the secret — set SENTRY_DSN (production) to
// light it up. We only send in production so local dev crashes never pollute
// the prod issue stream.
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;
const isProd = process.env.NODE_ENV === "production";

if (dsn && isProd) {
  Sentry.init({
    dsn,
    environment: "production",
    // Errors are the goal, not latency tracing — keep transaction sampling
    // off so this stays cheap and quiet. Raise tracesSampleRate later if we
    // want performance spans.
    tracesSampleRate: 0,
  });
  console.log("[sentry] error tracking armed (production)");
} else if (dsn) {
  console.log("[sentry] SENTRY_DSN set but NODE_ENV is not production — not sending in dev");
} else {
  console.log("[sentry] SENTRY_DSN not set — error tracking inactive (no-op)");
}
