// Task #2089 — Warn us before hand-managed, time-limited credentials lapse.
//
// Task #2084 added a single watcher for the GitHub build-mirror push token: it
// reads the token's real expiry and pages on-call (via alertOps) before it
// lapses, so the silent mirror-push failure never surprises us. The same
// silent-failure risk applies to every other credential a human rotates by
// hand — the Apple Sign-In .p8, the APNs auth key, the Stripe webhook secret,
// the FCM service-account key. When any of those lapse, sign-in / payments /
// push quietly break with no proactive signal.
//
// This module is the generalisation: a small registry of "credentials with a
// known or derivable expiry," each of which the in-process scheduler probes a
// couple of times a day and pages on (throttled, via alertOps) when it nears
// expiry or is already lapsed/rejected. It rides the exact same path Task #2084
// used; the GitHub token is now just one source in this registry.
//
// Two ways a source learns its expiry, mirroring the task's "read it live where
// the API exposes it, fall back to an operator-recorded date otherwise":
//   • LIVE   — the credential's own API hands back its expiry (GitHub's
//              `github-authentication-token-expiration` header; an X.509 cert's
//              notAfter). We read it directly so it's always current.
//   • RECORDED — the credential has no machine-readable expiry (a .p8 key, a
//              Stripe secret). The operator records the rotation date in a
//              `<NAME>_EXPIRES_AT` Replit Secret and we warn against that.
//
// Every probe is fully guarded: an unconfigured credential is a quiet no-op, a
// configured-but-undated one logs a one-line "unmonitored" nudge (never pages —
// we have no date to warn against), and a network/parse hiccup is logged, never
// thrown. The scheduler never blocks boot or a request, and no secret value is
// ever logged or alerted — only its expiry date / status.

import { X509Certificate } from "node:crypto";
import { alertOps } from "./opsAlert";

// `log` lives in server/index.ts, whose module top-level boots the server. Pull
// it in lazily so importing this module (e.g. from a unit test) stays
// side-effect-free; by the time anything here actually logs, the scheduler has
// been armed from an already-booted server so the require("./log") is a cache hit.
function log(message: string, source = "cred-expiry"): void {
  try {
    require("./log").log(message, source);
  } catch {
    console.log(`[${source}] ${message}`);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WARN_WINDOW_DAYS = 14;
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // twice a day
const FIRST_CHECK_DELAY_MS = 3 * 60 * 1000; // let boot settle first

// The outcome of probing one credential.
export type ExpiryProbe =
  // Credential not present in this environment — nothing to watch, stay silent.
  | { kind: "not-configured" }
  // Configured, but we have no expiry source/date for it. Logged, never paged —
  // there's nothing to warn against until an operator records a date.
  | { kind: "unmonitored"; note: string }
  // The credential is actively being rejected (e.g. a 401 from its API) — it has
  // almost certainly already lapsed or been revoked. Page immediately.
  | { kind: "rejected"; reason: string }
  // A transient hiccup reading the expiry (network, 5xx, parse). Log only so a
  // flaky upstream edge doesn't fan out alerts.
  | { kind: "transient"; reason: string }
  // We know when it expires. The engine decides whether that's within the warn
  // window.
  | { kind: "expires"; expiresAt: Date };

export type CredentialSource = {
  // Stable id used as the log prefix and the alert dedup signature. Keep it
  // kebab-case and unchanging so throttling stays coherent across deploys.
  id: string;
  // Human name shown in the alert subject/body.
  label: string;
  // One sentence on what silently breaks when this credential lapses.
  impact: string;
  // Where the operator goes to rotate it.
  rotationRunbook: string;
  // Per-source override of the default 14-day warning window.
  warnWindowDays?: number;
  probe: () => Promise<ExpiryProbe> | ExpiryProbe;
};

// ── shared probe helpers ─────────────────────────────────────────────────

// Parse an operator-recorded date. Accepts a bare ISO day ("2026-09-22") or any
// Date-parseable string; returns null if absent/unparseable so the caller can
// downgrade to "unmonitored" rather than alerting on garbage.
export function parseRecordedExpiry(raw: string | undefined | null): Date | null {
  const v = (raw || "").trim();
  if (!v) return null;
  let ms = Date.parse(v);
  // A bare yyyy-mm-dd parses as UTC midnight which is fine; try a normalised
  // form for "yyyy-mm-dd HH:MM:SS UTC"-style strings too.
  if (Number.isNaN(ms)) ms = Date.parse(v.replace(" UTC", "Z").replace(" ", "T"));
  return Number.isNaN(ms) ? null : new Date(ms);
}

// Build a probe for a credential whose expiry an operator records by hand in a
// `<NAME>_EXPIRES_AT` Replit Secret. `configured` says whether the credential
// itself is present in this environment.
export function operatorRecordedProbe(opts: {
  configured: boolean;
  dateEnvVar: string;
}): () => ExpiryProbe {
  return () => {
    if (!opts.configured) return { kind: "not-configured" };
    const expiresAt = parseRecordedExpiry(process.env[opts.dateEnvVar]);
    if (!expiresAt) {
      return {
        kind: "unmonitored",
        note: `set ${opts.dateEnvVar} (an ISO date like 2026-09-22) to enable lapse warnings`,
      };
    }
    return { kind: "expires", expiresAt };
  };
}

// Build a probe that reads an X.509 certificate's real notAfter out of a PEM in
// an env var — the "read it live" path for anything that ships as a cert (e.g.
// an Apple Pay merchant identity cert). Uses node's built-in X509Certificate so
// there's no new dependency. Wired to the apple-pay-merchant-cert source below;
// it stays a quiet no-op until APPLE_PAY_MERCHANT_CERT_PEM is added as a secret.
export function certNotAfterProbe(pemEnvVar: string): () => ExpiryProbe {
  return () => {
    const pem = (process.env[pemEnvVar] || "").trim();
    if (!pem) return { kind: "not-configured" };
    try {
      const cert = new X509Certificate(pem);
      const ms = Date.parse(cert.validTo);
      if (Number.isNaN(ms)) {
        return { kind: "transient", reason: `unparseable cert validTo: ${cert.validTo}` };
      }
      return { kind: "expires", expiresAt: new Date(ms) };
    } catch (e: any) {
      return { kind: "transient", reason: `cert parse failed: ${e?.message ?? e}` };
    }
  };
}

// ── the registry ─────────────────────────────────────────────────────────

// All credentials we know how to watch.
//
// NOTE: the GitHub build-mirror push used to be a LIVE source here (it handed
// back its own expiry header), but it was retired — the mirror push now
// authenticates with a non-expiring repo-scoped SSH deploy key
// (GITHUB_MIRROR_DEPLOY_KEY; see scripts/post-merge.sh → sync_github_build_mirror
// and docs/codemagic-builds.md), so there is no GitHub expiry left to watch.
async function buildRegistry(): Promise<CredentialSource[]> {
  const appleSignInConfigured = !!(
    process.env.APPLE_PRIVATE_KEY &&
    process.env.APPLE_KEY_ID &&
    process.env.APPLE_TEAM_ID
  );
  const apnsConfigured = !!(
    process.env.APNS_KEY_P8 &&
    process.env.APNS_KEY_ID &&
    process.env.APNS_TEAM_ID
  );
  const fcmConfigured = (process.env.FCM_SERVICE_ACCOUNT_JSON || "").trim().length > 0;
  const stripeWebhookConfigured = (process.env.STRIPE_WEBHOOK_SECRET || "").trim().length > 0;

  return [
    // LIVE — Apple Pay merchant identity certificate (X.509). Unlike the .p8
    // keys above, a real cert carries its own machine-readable expiry (notAfter)
    // baked into the PEM, so we read it live and never need an operator-recorded
    // date. Apple issues these for ~25 months and they must be renewed before
    // they lapse. The probe is a quiet no-op until APPLE_PAY_MERCHANT_CERT_PEM
    // is added as a secret — no cert is stored in this environment today — so
    // this source is safe to register unconditionally.
    {
      id: "apple-pay-merchant-cert",
      label: "Apple Pay merchant identity certificate",
      impact:
        "Apple Pay payments stop working once the merchant identity certificate lapses — the Apple Pay express button in checkout fails to process.",
      rotationRunbook:
        "Apple Developer → Certificates, Identifiers & Profiles → Identifiers → your Merchant ID → create a new Apple Pay Merchant Identity Certificate, then update APPLE_PAY_MERCHANT_CERT_PEM with the new PEM.",
      probe: certNotAfterProbe("APPLE_PAY_MERCHANT_CERT_PEM"),
    },

    // RECORDED — Apple's .p8 sign-in key. The key has no machine-readable
    // expiry, but the client-secret JWT minted from it is capped at ~6 months
    // by Apple, so teams rotate the key on roughly that cadence. Operator
    // records the next rotation date.
    {
      id: "apple-signin-key",
      label: "Apple Sign-In key (.p8)",
      impact:
        "Sign in with Apple stops working — the “Sign in with Apple” button fails for every fan and any Apple-private-relay sign-up.",
      rotationRunbook:
        "Apple Developer → Certificates, Identifiers & Profiles → Keys → create a new Sign in with Apple key, then update APPLE_PRIVATE_KEY / APPLE_KEY_ID and reset APPLE_SIGNIN_KEY_EXPIRES_AT.",
      probe: operatorRecordedProbe({
        configured: appleSignInConfigured,
        dateEnvVar: "APPLE_SIGNIN_KEY_EXPIRES_AT",
      }),
    },

    // RECORDED — APNs auth key (.p8). Doesn't auto-expire, but is revocable and
    // commonly rotated; operator records a reminder date if they want one.
    {
      id: "apns-key",
      label: "APNs auth key (.p8)",
      impact:
        "iOS push notifications stop delivering — APNs rejects the token signed with the lapsed/revoked key.",
      rotationRunbook:
        "Apple Developer → Keys → create/replace the APNs Auth Key, update APNS_KEY_P8 / APNS_KEY_ID, then set APNS_KEY_EXPIRES_AT.",
      probe: operatorRecordedProbe({
        configured: apnsConfigured,
        dateEnvVar: "APNS_KEY_EXPIRES_AT",
      }),
    },

    // RECORDED — FCM (Android push) service-account key. JSON service-account
    // keys can be set to expire by org policy; operator records that date.
    {
      id: "fcm-service-account",
      label: "FCM service-account key",
      impact:
        "Android push notifications stop delivering — the FCM v1 send is rejected once the service-account key is revoked/expired.",
      rotationRunbook:
        "Firebase/GCP console → Service accounts → generate a new key, update FCM_SERVICE_ACCOUNT_JSON, then set FCM_SERVICE_ACCOUNT_EXPIRES_AT.",
      probe: operatorRecordedProbe({
        configured: fcmConfigured,
        dateEnvVar: "FCM_SERVICE_ACCOUNT_EXPIRES_AT",
      }),
    },

    // RECORDED — Stripe webhook signing secret. Doesn't auto-expire, but is
    // rotated when an operator regenerates the endpoint; recording a date lets
    // us nudge before a planned rotation window closes.
    {
      id: "stripe-webhook-secret",
      label: "Stripe webhook signing secret",
      impact:
        "Stripe webhooks fail signature verification — paid orders stop materializing and refunds/fulfilment status stop syncing.",
      rotationRunbook:
        "Stripe Dashboard → Developers → Webhooks → roll the signing secret, update STRIPE_WEBHOOK_SECRET, then set STRIPE_WEBHOOK_SECRET_EXPIRES_AT.",
      probe: operatorRecordedProbe({
        configured: stripeWebhookConfigured,
        dateEnvVar: "STRIPE_WEBHOOK_SECRET_EXPIRES_AT",
      }),
    },
  ];
}

// ── the engine ───────────────────────────────────────────────────────────

// What the engine decided to do with one probe. Splitting the decision out from
// the side effects (alertOps/log) keeps the actual policy — when do we page vs
// log vs stay silent — pure and unit-testable without intercepting the mailer.
export type ProbeDecision =
  | { action: "silent" }
  | { action: "log"; line: string }
  | { action: "alert"; signature: string; subject: string; detail: string; logLine: string };

// Pure: maps a probe + the current time into a decision. `now` is injectable so
// tests can pin "days remaining" deterministically.
export function classifyProbe(
  source: CredentialSource,
  probe: ExpiryProbe,
  now: number = Date.now(),
): ProbeDecision {
  const warnWindow = source.warnWindowDays ?? DEFAULT_WARN_WINDOW_DAYS;

  switch (probe.kind) {
    case "not-configured":
      // Nothing to watch — stay silent so unused integrations don't add noise.
      return { action: "silent" };

    case "unmonitored":
      return {
        action: "log",
        line: `cred-expiry: ${source.id} configured but expiry not tracked — ${probe.note}`,
      };

    case "transient":
      return { action: "log", line: `cred-expiry: ${source.id} check skipped — ${probe.reason}` };

    case "rejected": {
      const headline = `${source.label} is REJECTED (likely already expired/revoked)`;
      return {
        action: "alert",
        signature: `cred-rejected ${source.id}`,
        subject: headline,
        detail:
          `${headline}.\n\n` +
          `Reason: ${probe.reason}.\n\n` +
          `Impact: ${source.impact}\n\n` +
          `Rotate it now: ${source.rotationRunbook}\n\n` +
          `(Only the credential's status is logged — never its value.)`,
        logLine: `cred-expiry: WARNING — ${headline} (alerting on-call)`,
      };
    }

    case "expires": {
      const expiryDate = probe.expiresAt.toISOString().slice(0, 10);
      const daysRemaining = Math.floor((probe.expiresAt.getTime() - now) / DAY_MS);

      if (daysRemaining > warnWindow) {
        return {
          action: "log",
          line: `cred-expiry: ${source.id} healthy — ${daysRemaining}d left (expires ${expiryDate})`,
        };
      }

      const expired = daysRemaining < 0;
      const headline = expired
        ? `${source.label} EXPIRED on ${expiryDate}`
        : `${source.label} expires in ${daysRemaining} day(s) — on ${expiryDate}`;

      return {
        action: "alert",
        // Coarse signature (id + date) so repeated daily checks collapse into
        // one email per cooldown window.
        signature: `cred-expiry ${source.id} ${expiryDate}`,
        subject: headline,
        detail:
          `${headline}.\n\n` +
          `Impact: ${source.impact}\n\n` +
          `Rotate it now: ${source.rotationRunbook}\n\n` +
          `(Only the expiry date is logged — never the credential value.)`,
        logLine: `cred-expiry: WARNING — ${headline} (alerting on-call)`,
      };
    }
  }
}

// Process one source's probe result: classify it, then carry out the decision
// (throttled ops alert and/or a log line). The throttling lives in alertOps.
export function handleProbe(source: CredentialSource, probe: ExpiryProbe): void {
  const decision = classifyProbe(source, probe);
  switch (decision.action) {
    case "silent":
      return;
    case "log":
      log(decision.line, "cred-expiry");
      return;
    case "alert":
      alertOps({ signature: decision.signature, subject: decision.subject, detail: decision.detail });
      log(decision.logLine, "cred-expiry");
      return;
  }
}

// One full check pass across every registered credential. Each source is probed
// and handled independently so one source's failure can't starve the others.
export async function runCredentialExpiryCheck(): Promise<void> {
  let registry: CredentialSource[];
  try {
    registry = await buildRegistry();
  } catch (e: any) {
    log(`cred-expiry: registry build failed — ${e?.message ?? e}`, "cred-expiry");
    return;
  }

  for (const source of registry) {
    try {
      const probe = await source.probe();
      handleProbe(source, probe);
    } catch (e: any) {
      log(`cred-expiry: ${source.id} probe threw — ${e?.message ?? e}`, "cred-expiry");
    }
  }
}

// Arm the in-process scheduler. Mirrors the other boot daemons in
// server/index.ts: a short first-run delay so boot logs settle, then a steady
// 12h tick, with an in-process guard against overlap. Never throws.
export function armCredentialExpiryScheduler(): void {
  let checking = false;
  const tick = async () => {
    if (checking) return;
    checking = true;
    try {
      await runCredentialExpiryCheck();
    } catch (e: any) {
      log(`cred-expiry tick failed: ${e?.message ?? e}`, "cred-expiry");
    } finally {
      checking = false;
    }
  };
  setTimeout(tick, FIRST_CHECK_DELAY_MS);
  setInterval(tick, CHECK_INTERVAL_MS);
  log(`credential expiry watch armed (${DEFAULT_WARN_WINDOW_DAYS}d default warn window, 12h tick)`, "cred-expiry");
}
