// Task #2084 — Pre-warn before the GitHub build-mirror push token expires.
//
// The post-merge mirror push (scripts/post-merge.sh → sync_github_build_mirror)
// authenticates with GITHUB_TOKEN, a manually-managed fine-grained PAT named
// "GoodTunes Push" that GitHub caps at ~90 days. On lapse the push fails
// *silently* (best-effort WARNING only) → iOS builds from stale code and
// Android internal testers keep getting the old .aab with no failed-build
// signal. Rotation otherwise depends on a human remembering the date.
//
// This rides the existing ops-alerting path (alertOps → email/log) and fires a
// loud, throttled warning when fewer than WARN_WINDOW_DAYS remain. It reads the
// token's REAL expiry from the `github-authentication-token-expiration` header
// returned on any authenticated api.github.com request — no token value ever
// touches a log or alert, only the expiry date.
//
// Fully guarded: no token → quiet no-op; network/API hiccup → logged, never
// thrown; the scheduler never blocks a merge or a request.

import { alertOps } from "./opsAlert";
import { log } from "./index";

const WARN_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // twice a day
const FIRST_CHECK_DELAY_MS = 2 * 60 * 1000; // let boot settle first

const TOKEN_NAME = "GoodTunes Push";
const ROTATION_RUNBOOK =
  "docs/codemagic-builds.md → “Rotating the GitHub mirror push token”";

export type TokenExpiryResult =
  | { status: "no-token" }
  | { status: "no-expiry-header" }
  | { status: "error"; reason: string; httpStatus?: number }
  | { status: "ok"; expiresAt: Date; daysRemaining: number };

// Reads the token's real expiry off an authenticated api.github.com response.
// GitHub returns `github-authentication-token-expiration` on every request made
// with a fine-grained PAT that has an expiry; a never-expiring token omits it.
export async function checkGithubTokenExpiry(): Promise<TokenExpiryResult> {
  const token = (process.env.GITHUB_TOKEN || "").trim();
  if (!token) return { status: "no-token" };

  let res: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      res = await fetch("https://api.github.com/", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "goodtunes-token-expiry-check",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    return { status: "error", reason: e?.message ?? String(e) };
  }

  if (!res.ok) {
    // 401 = bad/expired token, 403 = perms — either way we can't read expiry.
    return { status: "error", reason: `api.github.com returned HTTP ${res.status}`, httpStatus: res.status };
  }

  const header = res.headers.get("github-authentication-token-expiration");
  if (!header) return { status: "no-expiry-header" };

  // Header looks like "2026-09-22 17:00:00 UTC". Date.parse handles the UTC
  // form; fall back to a normalised form if a runtime is fussy.
  let ms = Date.parse(header);
  if (Number.isNaN(ms)) ms = Date.parse(header.replace(" UTC", "Z").replace(" ", "T"));
  if (Number.isNaN(ms)) {
    return { status: "error", reason: `unparseable expiry header: ${header}` };
  }

  const expiresAt = new Date(ms);
  const daysRemaining = Math.floor((ms - Date.now()) / DAY_MS);
  return { status: "ok", expiresAt, daysRemaining };
}

// One check pass. Alerts (throttled, via alertOps) when the token is inside the
// warning window or already expired. Returns the result for tests/logging.
export async function runGithubTokenExpiryCheck(): Promise<TokenExpiryResult> {
  const result = await checkGithubTokenExpiry();

  switch (result.status) {
    case "no-token":
      // Nothing to warn about — no mirror push happens without a token.
      return result;
    case "no-expiry-header":
      log("github-token-expiry: token has no expiry header (non-expiring or classic PAT)", "github-token");
      return result;
    case "error":
      // A 401/403 means the token itself is rejected (already expired or
      // perms revoked) — that's the very failure this watch exists to catch,
      // so page on it rather than just logging. Transient network/5xx hiccups
      // stay log-only so a flaky GitHub edge doesn't fan out alerts.
      if (result.httpStatus === 401 || result.httpStatus === 403) {
        const headline = `GitHub build-mirror token "${TOKEN_NAME}" is REJECTED (HTTP ${result.httpStatus})`;
        alertOps({
          signature: `github-token-rejected ${result.httpStatus}`,
          subject: headline,
          detail:
            `${headline}.\n\n` +
            `An authenticated check against api.github.com was refused, so the token (GITHUB_TOKEN) ` +
            `is almost certainly expired or had its permissions revoked. The post-merge mirror push ` +
            `(github.com/billdenk/goodtunes-app) is now failing silently — iOS builds from stale code ` +
            `and Android internal testers keep getting the old build with no failed-build signal.\n\n` +
            `Rotate it now: ${ROTATION_RUNBOOK}.\n\n` +
            `(The token value is never logged — only its status.)`,
        });
        log(`github-token-expiry: WARNING — ${headline} (alerting on-call)`, "github-token");
      } else {
        log(`github-token-expiry: check skipped — ${result.reason}`, "github-token");
      }
      return result;
    case "ok":
      break;
  }

  const { expiresAt, daysRemaining } = result;
  const expiryDate = expiresAt.toISOString().slice(0, 10);

  if (daysRemaining > WARN_WINDOW_DAYS) {
    log(`github-token-expiry: "${TOKEN_NAME}" healthy — ${daysRemaining}d left (expires ${expiryDate})`, "github-token");
    return result;
  }

  const expired = daysRemaining < 0;
  const headline = expired
    ? `GitHub build-mirror token "${TOKEN_NAME}" EXPIRED on ${expiryDate}`
    : `GitHub build-mirror token "${TOKEN_NAME}" expires in ${daysRemaining} day(s) — on ${expiryDate}`;

  alertOps({
    // Coarse signature so the daily checks collapse to one email per cooldown.
    signature: `github-token-expiry ${expiryDate}`,
    subject: headline,
    detail:
      `${headline}.\n\n` +
      `This is the fine-grained PAT (GITHUB_TOKEN) that auto-pushes merged code to the ` +
      `Codemagic build mirror (github.com/billdenk/goodtunes-app). Once it lapses, the ` +
      `post-merge mirror push fails silently — iOS builds from stale code and Android ` +
      `internal testers keep getting the old build with no failed-build signal.\n\n` +
      `Rotate it now: ${ROTATION_RUNBOOK}.\n\n` +
      `(The token value is never logged — only its expiry date.)`,
  });
  log(`github-token-expiry: WARNING — ${headline} (alerting on-call)`, "github-token");
  return result;
}

// Arm the in-process scheduler. Mirrors the other boot daemons in
// server/index.ts: a short first-run delay so boot logs settle, then a steady
// tick, with an in-process guard against overlap. Never throws.
export function armGithubTokenExpiryScheduler(): void {
  let checking = false;
  const tick = async () => {
    if (checking) return;
    checking = true;
    try {
      await runGithubTokenExpiryCheck();
    } catch (e: any) {
      log(`github-token-expiry tick failed: ${e?.message ?? e}`, "github-token");
    } finally {
      checking = false;
    }
  };
  setTimeout(tick, FIRST_CHECK_DELAY_MS);
  setInterval(tick, CHECK_INTERVAL_MS);
  log(`github-token expiry watch armed (${WARN_WINDOW_DAYS}d warn window, 12h tick)`, "github-token");
}
