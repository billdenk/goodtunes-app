// Task #537 — Finish-signup for OAuth-minted customer accounts.
//
// One-screen onboarding that runs once for every fan who signed in
// via Google or Apple. We capture:
//   • a public @handle, vetted live against the reserved-artists
//     table and existing customer handles,
//   • a confirmed display name (Google passes one, Apple usually
//     doesn't — pre-filled either way, fan can edit),
//   • a deliverable contact email or phone, but ONLY when the email
//     on the account is an Apple private-relay alias. Non-relay
//     accounts skip the contact step entirely.
//
// Gating:
//   • The Router-level guard in App.tsx redirects every navigation
//     here until `signupCompletedAt` is stamped, so a fan can't
//     side-step the screen.
//   • The page itself also re-checks via
//     GET /api/auth/complete-signup/state — a fan who lands here
//     after they've already completed gets bounced to /account.
//
// Visual style mirrors WelcomeBack.tsx (Apple-Music dark chrome,
// brand accent gradient on the primary CTA, 440px max width). All
// font sizes use the shadcn scale per the mechanical design-lint
// (xs/sm/base/lg/xl) — no `text-[Npx]` here.

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Matches the server (FINISH_SIGNUP_HANDLE_RE in server/routes.ts).
const HANDLE_RE = /^[a-z0-9._-]{3,30}$/;
const HANDLE_STRIP = /[^a-z0-9._-]/g;

// Build a few tasteful fallback handles from what the fan typed, so a
// taken/reserved pick is never a dead end. Candidates are validated against
// HANDLE_RE (which also caps length at 30) and probed for availability before
// any are shown.
function buildHandleCandidates(base: string): string[] {
  const root = base.replace(HANDLE_STRIP, "").slice(0, 28);
  if (root.length < 2) return [];
  return [`${root}.1`, `${root}.2`, `${root}.3`, `${root}music`, `${root}.official`]
    .filter((c) => HANDLE_RE.test(c));
}

type SetupState = {
  isComplete: boolean;
  suggestedHandle: string;
  displayName: string;
  realName: string;
  email: string;
  isPrivateRelay: boolean;
  requiresContact: boolean;
};

type HandleStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "format" }
  | { kind: "reserved" }
  | { kind: "taken" };

export function FinishSetup() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  // Read the purchase-resume target that App.tsx carries as ?next= when it
  // bounces a new OAuth fan here mid-checkout.  Falls back to /account so a
  // plain signup (no cart) still lands on the profile page.
  const postSetupDest = (() => {
    try {
      const q = new URL(window.location.href).searchParams.get("next");
      if (q && q.startsWith("/")) return q;
    } catch {}
    return "/account";
  })();
  const [state, setState] = useState<SetupState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [realName, setRealName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [handleStatus, setHandleStatus] = useState<HandleStatus>({ kind: "idle" });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const checkTimer = useRef<number | null>(null);
  const suggestSeq = useRef(0);

  // Load the pre-fill + private-relay flag. If the row already shows
  // `isComplete` (fan navigated here on purpose) bounce them home.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiRequest("GET", "/api/auth/complete-signup/state");
        const j: SetupState = await r.json();
        if (cancelled) return;
        if (j.isComplete) {
          navigate(postSetupDest);
          return;
        }
        setState(j);
        setHandle(j.suggestedHandle || "");
        setDisplayName(j.displayName || "");
        setRealName(j.realName || "");
      } catch (err: any) {
        if (!cancelled) setLoadErr(err?.message ?? "Couldn't load your account.");
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  // Debounced live availability check. 250ms feels instant but avoids
  // hammering the endpoint on every keystroke.
  useEffect(() => {
    if (!handle) {
      setHandleStatus({ kind: "idle" });
      return;
    }
    if (!HANDLE_RE.test(handle)) {
      setHandleStatus({ kind: "format" });
      return;
    }
    setHandleStatus({ kind: "checking" });
    if (checkTimer.current) window.clearTimeout(checkTimer.current);
    checkTimer.current = window.setTimeout(async () => {
      try {
        const r = await apiRequest("GET", `/api/auth/handle-available?u=${encodeURIComponent(handle)}`);
        const j: { ok: boolean; reason: "format" | "reserved" | "taken" | null } = await r.json();
        if (j.ok) setHandleStatus({ kind: "ok" });
        else setHandleStatus({ kind: (j.reason ?? "taken") as HandleStatus["kind"] });
      } catch {
        setHandleStatus({ kind: "idle" });
      }
    }, 250) as unknown as number;
    return () => {
      if (checkTimer.current) window.clearTimeout(checkTimer.current);
    };
  }, [handle]);

  // When the chosen handle is taken or reserved, surface a few available
  // alternatives the fan can tap — so they're never stuck on a dead-end pick
  // with no way forward. (The full artist-reclaim-with-temp-handle flow is
  // tracked separately; this is the everyday "pick another" path.)
  useEffect(() => {
    // Bump the sequence on EVERY run so any in-flight probe from a previous
    // handle/status is poisoned and can't commit stale chips later.
    const seq = ++suggestSeq.current;
    if (handleStatus.kind !== "taken" && handleStatus.kind !== "reserved") {
      setSuggestions([]);
      return;
    }
    // Drop old chips immediately so nothing stale shows while we re-probe.
    setSuggestions([]);
    const candidates = buildHandleCandidates(handle);
    if (candidates.length === 0) {
      return;
    }
    (async () => {
      const checked = await Promise.all(
        candidates.map(async (c) => {
          try {
            const r = await apiRequest("GET", `/api/auth/handle-available?u=${encodeURIComponent(c)}`);
            const j: { ok: boolean } = await r.json();
            return j.ok ? c : null;
          } catch {
            return null;
          }
        }),
      );
      if (seq !== suggestSeq.current) return;
      setSuggestions(checked.filter((c): c is string => c !== null).slice(0, 3));
    })();
  }, [handleStatus.kind, handle]);

  const handleHint = useMemo(() => {
    switch (handleStatus.kind) {
      case "ok":       return { text: `@${handle} is available`, tone: "ok" as const };
      case "checking": return { text: "Checking…", tone: "muted" as const };
      case "format":   return { text: "3–30 characters: lowercase letters, numbers, dot, underscore, hyphen.", tone: "warn" as const };
      case "reserved": return { text: "This handle is held for the artist — please pick another.", tone: "warn" as const };
      case "taken":    return { text: "That handle is already taken.", tone: "warn" as const };
      default:         return { text: "", tone: "muted" as const };
    }
  }, [handleStatus, handle]);

  const canSubmit =
    !saving &&
    handleStatus.kind === "ok" &&
    displayName.trim().length > 0 &&
    (!state?.requiresContact || contactEmail.trim().length > 0 || contactPhone.trim().length > 0);

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const r = await apiRequest("POST", "/api/auth/complete-signup", {
        handle,
        displayName: displayName.trim(),
        realName: realName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
      });
      const updated = await r.json();
      // Push the freshly-stamped user into the cache so the router
      // guard relaxes immediately (no flicker through the redirect).
      queryClient.setQueryData(["/api/me"], updated);
      navigate(postSetupDest);
    } catch (err: any) {
      let msg = "Couldn't save your account. Please try again.";
      try {
        const parsed = JSON.parse(err?.message?.split(": ").slice(1).join(": ") ?? "{}");
        if (parsed?.message) msg = parsed.message;
        if (parsed?.field === "handle") setHandleStatus({ kind: (parsed.reason ?? "taken") as HandleStatus["kind"] });
      } catch { /* ignore */ }
      toast({ title: "Couldn't finish setup", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // Escape hatch — the router gates every route to this screen until signup is
  // complete, so without this a fan who can't get the handle they want (or who
  // landed here signed in as the wrong account) would be trapped with no way
  // back. Sign out and hard-reload to a clean login.
  async function useDifferentAccount() {
    try {
      await apiRequest("POST", "/api/logout");
    } catch {
      /* ignore — we're leaving regardless */
    }
    queryClient.clear();
    window.location.href = "/";
  }

  if (loadErr) {
    return (
      <main className="min-h-screen bg-[var(--brand-bg)] text-white flex items-center justify-center p-6">
        <div className="max-w-[440px] w-full text-center">
          <p className="text-[var(--brand-heart)]" data-testid="text-finish-setup-error">{loadErr}</p>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="min-h-screen bg-[var(--brand-bg)] flex items-center justify-center">
        <div className="w-11 h-11 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  const hintColor =
    handleHint.tone === "ok"   ? "text-[var(--brand-mint)]" :
    handleHint.tone === "warn" ? "text-[var(--brand-heart)]" :
    "text-white/50";

  return (
    <main className="min-h-screen bg-[var(--brand-bg)] text-white px-5 pt-12 pb-10">
      <div className="max-w-[440px] mx-auto">
        <h1 className="text-3xl leading-tight font-semibold tracking-tight" data-testid="text-finish-setup-heading">
          One last thing
        </h1>
        <p className="mt-2 text-white/60 text-base">
          Pick your @handle and tell us your name. Your @handle is what other fans and artists see.
        </p>

        {/* Handle */}
        <label className="block mt-8 text-xs uppercase tracking-wider text-white/50">Your handle</label>
        <div
          className={`mt-2 flex items-center bg-[color:var(--fan-surface-strong)] rounded-xl px-4 py-3 border transition-[border-color,box-shadow] ${
            handleStatus.kind === "ok"
              ? "border-[color:rgba(74,255,202,0.55)] shadow-[0_0_0_3px_rgba(74,255,202,0.12)]"
              : "border-white/20 focus-within:border-[var(--brand-blue)] focus-within:shadow-[0_0_0_3px_rgba(49,158,216,0.18)]"
          }`}
        >
          <span className="text-white/40 text-lg">@</span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase().replace(HANDLE_STRIP, "").slice(0, 30))}
            placeholder="yourhandle"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="bg-transparent outline-none flex-1 ml-1 text-lg placeholder-white/30"
            data-testid="input-handle"
          />
        </div>
        <p className={`mt-2 text-xs ${hintColor}`} data-testid="text-handle-hint">{handleHint.text || "\u00A0"}</p>
        <p className="mt-1 text-xs text-white/40">
          Handles that match a famous artist may be reclaimed by that artist's team later.
        </p>

        {/* Never a dead end: when the pick is taken/reserved, offer a few
            available alternatives the fan can tap to fill the field. */}
        {(handleStatus.kind === "taken" || handleStatus.kind === "reserved") && suggestions.length > 0 && (
          <div className="mt-3" data-testid="handle-suggestions">
            <p className="text-xs text-fan-secondary">Available instead — tap to use:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setHandle(s)}
                  className="px-3 py-1.5 rounded-full bg-[color:var(--fan-surface)] border border-[color:var(--fan-field-border)] text-sm text-white hover:border-[var(--brand-blue)] transition-colors"
                  data-testid={`button-suggest-${s}`}
                >
                  @{s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Full name — drives the profile header + avatar initials. Apple
            "Hide My Email" withholds this, so it's pre-filled when the
            provider gave us one and blank otherwise. Optional: a fan who
            skips it just gets a header that falls back to display name. */}
        <label className="block mt-6 text-xs uppercase tracking-wider text-white/50">Full name</label>
        <input
          type="text"
          value={realName}
          onChange={(e) => setRealName(e.target.value.slice(0, 120))}
          placeholder="Your name"
          autoComplete="name"
          className="mt-2 w-full bg-[color:var(--fan-surface-strong)] border border-white/20 rounded-xl px-4 py-3 outline-none text-lg placeholder-white/45 transition-[border-color,box-shadow] focus:border-[var(--brand-blue)] focus:shadow-[0_0_0_3px_rgba(49,158,216,0.18)]"
          data-testid="input-real-name"
        />

        {/* Display name */}
        <label className="block mt-6 text-xs uppercase tracking-wider text-white/50">Display name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.slice(0, 80))}
          placeholder="What should we call you?"
          className="mt-2 w-full bg-[color:var(--fan-surface-strong)] border border-white/20 rounded-xl px-4 py-3 outline-none text-lg placeholder-white/45 transition-[border-color,box-shadow] focus:border-[var(--brand-blue)] focus:shadow-[0_0_0_3px_rgba(49,158,216,0.18)]"
          data-testid="input-display-name"
        />

        {/* Private-relay contact (Apple only) */}
        {state.requiresContact && (
          <div className="mt-8 rounded-xl bg-[color:var(--fan-surface)] p-4">
            <p className="text-sm text-white/80">
              Apple is hiding your email from us — add a way to send you receipts, gift notifications, and order updates.
            </p>
            <label className="block mt-4 text-xs uppercase tracking-wider text-white/50">Contact email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-2 w-full bg-[color:var(--fan-surface-strong)] border border-white/20 rounded-xl px-4 py-3 outline-none text-lg placeholder-white/45 transition-[border-color,box-shadow] focus:border-[var(--brand-blue)] focus:shadow-[0_0_0_3px_rgba(49,158,216,0.18)]"
              data-testid="input-contact-email"
            />
            <p className="mt-3 text-center text-xs text-white/40">or</p>
            <label className="block mt-2 text-xs uppercase tracking-wider text-white/50">Phone</label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+1 555 555 5555"
              className="mt-2 w-full bg-[color:var(--fan-surface-strong)] border border-white/20 rounded-xl px-4 py-3 outline-none text-lg placeholder-white/45 transition-[border-color,box-shadow] focus:border-[var(--brand-blue)] focus:shadow-[0_0_0_3px_rgba(49,158,216,0.18)]"
              data-testid="input-contact-phone"
            />
          </div>
        )}

        {/* Primary CTA — brand gradient. Disabled until the form is valid. */}
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="mt-10 w-full py-4 rounded-full text-lg font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          style={{
            background: "linear-gradient(135deg, var(--brand-blue) 0%, var(--brand-purple) 100%)",
          }}
          data-testid="button-finish-setup"
        >
          {saving ? "Saving…" : "Continue"}
        </button>

        {/* Escape hatch so a fan can never get trapped on the gate. */}
        <button
          type="button"
          onClick={useDifferentAccount}
          className="mt-6 w-full text-center text-sm text-fan-secondary hover:text-fan-primary transition-colors"
          data-testid="button-use-different-account"
        >
          Use a different account
        </button>
      </div>
    </main>
  );
}
