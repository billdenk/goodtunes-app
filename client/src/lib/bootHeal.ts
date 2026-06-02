import { paintFatalBanner } from "@/components/GlobalErrorBoundary";

/**
 * Task #921 — Self-heal the blank white admin screen.
 *
 * Bill intermittently lands on a blank white screen at
 * admin.goodtunes.music after a redeploy: the HTML loads (correct tab
 * title + light admin body background) but React never paints. The
 * server is healthy — the cause is a stale/orphaned page holding an old
 * index.html whose content-hashed bundle no longer exists, so a same-
 * origin <script>/<link> 404s and the shell never mounts. A manual
 * reload fixes it (index.html is `no-store`, so the reload fetches the
 * fresh hash).
 *
 * This module turns that manual reload into an automatic, **strictly
 * bounded** one:
 *
 * - At most ONE automatic reload per boot attempt (`firedThisLoad`),
 *   and at most one reload per 30s window across reloads
 *   (`SELF_HEAL_KEY` in sessionStorage). A genuinely broken deploy
 *   therefore reloads exactly once, then falls through to the visible
 *   brand fatal banner instead of reload-looping forever.
 * - `markBootSucceeded()` clears the window flag the instant React
 *   mounts, so ordinary navigation and ordinary in-app runtime errors
 *   (which still route through GlobalErrorBoundary → FriendlyError) are
 *   never affected.
 *
 * See `docs/auth-and-dual-shell.md` → "Self-heal on boot failure".
 */

const SELF_HEAL_KEY = "__gt_boot_self_heal_at";
// Two failed boots inside this window count as the same broken-deploy
// episode — the second shows the diagnosis instead of reloading again.
const SELF_HEAL_WINDOW_MS = 30_000;

// One self-heal decision per page load, no matter how many failure
// signals fire (a script 404 AND the mount watchdog can both trip).
let firedThisLoad = false;

// Marker appended to `window.name` as a storage-independent fallback for
// the reload guard. `window.name` survives a same-tab reload even when
// `sessionStorage` is blocked (Safari Private Browsing, storage-
// partitioned / sandboxed contexts), so it lets us still bound the
// reload to once even there. We append (and later strip) so we never
// clobber a value another flow may have parked in `window.name`.
const NAME_SENTINEL = "~__gt_boot_self_heal__~";

function nameHasSentinel(): boolean {
  try {
    return typeof window.name === "string" && window.name.includes(NAME_SENTINEL);
  } catch {
    return false;
  }
}

/**
 * Have we already auto-reloaded for this boot-failure episode? Checks
 * BOTH the time-windowed sessionStorage stamp and the storage-
 * independent `window.name` sentinel, so a reload is bounded to once
 * regardless of which one we were able to persist.
 */
function recentlySelfHealed(): boolean {
  try {
    const raw = sessionStorage.getItem(SELF_HEAL_KEY);
    if (raw) {
      const ts = Number.parseInt(raw, 10);
      if (Number.isFinite(ts) && Date.now() - ts < SELF_HEAL_WINDOW_MS) return true;
    }
  } catch {
    /* storage unreadable — fall through to the window.name check */
  }
  return nameHasSentinel();
}

/**
 * Persist a "we just auto-reloaded" marker that must survive the reload.
 * Returns true only if at least one marker actually stuck. If NOTHING
 * could be persisted, the caller MUST NOT reload (fail closed) — without
 * a durable marker an automatic reload could loop forever, which is
 * worse than a visible diagnosis.
 */
function armReloadGuard(): boolean {
  let armed = false;
  try {
    sessionStorage.setItem(SELF_HEAL_KEY, String(Date.now()));
    armed = sessionStorage.getItem(SELF_HEAL_KEY) != null;
  } catch {
    armed = false;
  }
  try {
    if (typeof window.name === "string") {
      if (!window.name.includes(NAME_SENTINEL)) window.name += NAME_SENTINEL;
    } else {
      window.name = NAME_SENTINEL;
    }
    armed = armed || nameHasSentinel();
  } catch {
    /* window.name unavailable — rely on whatever sessionStorage managed */
  }
  return armed;
}

/**
 * Call as soon as the React shell has actually mounted. Clears the
 * self-heal guard (both markers) so the NEXT boot failure (e.g. a future
 * redeploy) can recover again, and so normal navigation is never
 * mistaken for a broken boot.
 */
export function markBootSucceeded(): void {
  firedThisLoad = false;
  try {
    sessionStorage.removeItem(SELF_HEAL_KEY);
  } catch {
    /* ignore */
  }
  try {
    if (typeof window.name === "string" && window.name.includes(NAME_SENTINEL)) {
      window.name = window.name.split(NAME_SENTINEL).join("");
    }
  } catch {
    /* ignore */
  }
}

/**
 * Report that the app failed to boot. Recovers with exactly one guarded
 * automatic reload; if we've already reloaded for this episode — OR if we
 * couldn't persist a reload guard at all — paints the visible brand fatal
 * banner so Bill gets a screenshot-able diagnosis instead of a silent
 * white screen (and, crucially, never a reload loop).
 */
export function reportBootFailure(reason: string, detail: string): void {
  if (firedThisLoad) return;
  firedThisLoad = true;

  // Only reload if we have NOT already healed this episode AND we can
  // actually arm a durable guard. armReloadGuard() returning false means
  // no marker survived (storage blocked + window.name unavailable), so we
  // fail closed to the diagnosis rather than risk an infinite reload.
  if (!recentlySelfHealed() && armReloadGuard()) {
    try {
      window.location.reload();
      return;
    } catch {
      /* if reload throws, fall through to the visible diagnosis */
    }
  }

  paintFatalBanner(reason, detail);
}

/**
 * Arm a one-shot watchdog: if the React shell hasn't mounted anything
 * into #root after `delayMs`, treat the page as a failed boot and
 * self-heal. If it HAS mounted, clear the guard. This is the backstop
 * for "rendered nothing for an unknown reason"; the capture-phase
 * <script>/<link> 404 listener in installGlobalErrorReporter catches
 * the common stale-bundle case faster.
 *
 * The delay is generous on purpose — a healthy app mounts in well under
 * a second even on slow connections once its (single, non-code-split)
 * bundle has executed, while the blank-screen failure is permanent, so
 * waiting a few seconds before the recovery reload avoids false
 * positives on genuinely slow loads.
 */
export function armBootWatchdog(rootId = "root", delayMs = 7000): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    const root = document.getElementById(rootId);
    const mounted = !!root && root.childElementCount > 0;
    if (mounted) {
      markBootSucceeded();
      return;
    }
    reportBootFailure(
      "Couldn't start the app",
      "The page loaded but the app didn't finish starting. This can happen right after an update — reloading usually fixes it.",
    );
  }, delayMs);
}
