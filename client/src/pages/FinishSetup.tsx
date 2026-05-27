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

type SetupState = {
  isComplete: boolean;
  suggestedHandle: string;
  displayName: string;
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
  const [state, setState] = useState<SetupState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [handleStatus, setHandleStatus] = useState<HandleStatus>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const checkTimer = useRef<number | null>(null);

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
          navigate("/account");
          return;
        }
        setState(j);
        setHandle(j.suggestedHandle || "");
        setDisplayName(j.displayName || "");
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
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
      });
      const updated = await r.json();
      // Push the freshly-stamped user into the cache so the router
      // guard relaxes immediately (no flicker through the redirect).
      queryClient.setQueryData(["/api/me"], updated);
      navigate("/account");
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
          Pick your @handle and confirm your name. This is what other fans and artists will see.
        </p>

        {/* Handle */}
        <label className="block mt-8 text-xs uppercase tracking-wider text-white/50">Your handle</label>
        <div className="mt-2 flex items-center bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus-within:border-[var(--brand-blue)]">
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

        {/* Display name */}
        <label className="block mt-6 text-xs uppercase tracking-wider text-white/50">Display name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.slice(0, 80))}
          placeholder="What should we call you?"
          className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none text-lg focus:border-[var(--brand-blue)]"
          data-testid="input-display-name"
        />

        {/* Private-relay contact (Apple only) */}
        {state.requiresContact && (
          <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-4">
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
              className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none text-lg focus:border-[var(--brand-blue)]"
              data-testid="input-contact-email"
            />
            <p className="mt-3 text-center text-xs text-white/40">or</p>
            <label className="block mt-2 text-xs uppercase tracking-wider text-white/50">Phone</label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+1 555 555 5555"
              className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none text-lg focus:border-[var(--brand-blue)]"
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
      </div>
    </main>
  );
}
