import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAuthKind } from "@/hooks/useAuthKind";
import { useLocation } from "wouter";
import { GoodTunesLogo } from "@/components/GoodTunesLogo";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, setAuthToken, queryClient, apiErrorBody, apiErrorStatus } from "@/lib/queryClient";
import { track } from "@/lib/analytics";
import { FriendlyError } from "@/components/FriendlyError";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";

import { ADMIN_CHROME, CUSTOMER_CHROME, type Mode } from "./authChrome";
import { TERMS_URL, PRIVACY_POLICY_URL } from "@shared/schema";

// Step 1: name/email/password (admin) or email+password (customer).
// Step 2: username/displayName (admin only — customer skips and gets a
//         server-suggested handle from the email local-part).
// Step "verify": 6-digit email code (customer only — the Task #44 gate
//         that proves email ownership before the password sticks).
type Step = 1 | 2 | "verify" | "exists";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());

// A new fan who has requested a 6-digit signup code must always have
// somewhere to enter it — even after a refresh or navigating away while
// waiting for the email. We stash the pending email in sessionStorage so
// the code-entry step can be rehydrated on mount instead of dumping the
// fan back on a blank sign-in screen with "a number and nowhere to put
// it." Cleared the moment the account is created or the fan backs out.
const PENDING_VERIFY_KEY = "gt:pendingVerify";
function readPendingVerify(): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_VERIFY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const email = typeof parsed?.email === "string" ? parsed.email.trim() : "";
    return EMAIL_RE.test(email) ? email : null;
  } catch {
    return null;
  }
}
function writePendingVerify(email: string): void {
  try {
    sessionStorage.setItem(PENDING_VERIFY_KEY, JSON.stringify({ email: email.trim() }));
  } catch {}
}
function clearPendingVerify(): void {
  try {
    sessionStorage.removeItem(PENDING_VERIFY_KEY);
  } catch {}
}
const isValidPassword = (v: string) => v.length >= 8 && /[a-zA-Z]/.test(v) && /\d/.test(v);

function suggestUsername(realName: string, email: string): string {
  const base =
    realName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "") ||
    email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
  return base.slice(0, 20);
}
function suggestDisplayName(realName: string): string {
  const first = realName.trim().split(/\s+/)[0] ?? "";
  return first || realName.trim();
}

// Sub-step the admin sign-in lands on after password/OAuth succeeds.
// "emailOtp" is the Task #57 default for new admins — a 6-digit code
// delivered to the admin's email. "totp" / "enroll" remain for power
// users who opted in to an authenticator app on the security page.
type AdminPhase = "password" | "totp" | "enroll" | "emailOtp";

// ─── Chrome styles ────────────────────────────────────────────────
// ADMIN_CHROME and CUSTOMER_CHROME (plus the `Chrome` type) now live in
// `./authChrome` so the admin Forgot/Reset screens can reuse the exact
// same card, input, primary button and ghost back link tokens. Keeping
// a stale local copy below kept getting them out of lock-step.
// Inputs use bg via style on customer variant (translucent), but plain
// className on admin (white). Helper so the JSX stays clean.
const inputBgStyle = (kind: "admin" | "customer"): React.CSSProperties | undefined =>
  kind === "customer" ? { background: "rgba(255,255,255,0.06)" } : undefined;

// Task #400 / #409 — Welcome-back pill for imported gogoods.com fans
// who landed on /login on their own (didn't get the wave-1 mail, or
// lost the link). Subtle rounded pill above the sign-in card; tap it
// to open a bottom sheet that explains what's going on and offers to
// email a one-tap sign-in link. The /api/welcome-back/start endpoint
// is non-enumerating (constant-floor latency, identical response
// shape), so we surface the same friendly "if your email is on file
// we just sent a link" toast regardless of whether the address hit.
function WelcomeBackPill() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isMobile = useIsMobile();

  // Single close path so every dismiss (backdrop, ESC, the close
  // affordance, the Google/Apple hint, and a successful submit) both
  // hides the surface and clears the field — reopening should never
  // show a stale email.
  const closeWelcomeBack = () => {
    setOpen(false);
    setEmail("");
  };
  const handleOpenChange = (next: boolean) => {
    if (next) setOpen(true);
    else closeWelcomeBack();
  };

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const reason = params.get("welcomeback");
    if (reason === "expired") {
      toast({ title: "That sign-in link has expired", description: "Confirm your email below and we'll send a fresh one.", variant: "destructive" });
      setOpen(true);
    } else if (reason === "used") {
      toast({ title: "That sign-in link was already used", description: "Confirm your email below and we'll send a fresh one.", variant: "destructive" });
      setOpen(true);
    }
  }, [toast]);

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/welcome-back/start", { email: email.trim() });
    } catch {
      // Endpoint is intentionally non-enumerating — fall through to the
      // same friendly toast so timing/error never reveals account presence.
    } finally {
      setSubmitting(false);
      toast({ title: "Check your inbox", description: "If that email is on file, a sign-in link is on its way." });
      closeWelcomeBack();
    }
  };

  return (
    <>
      {/* Fixed bottom contextual bar — Apple HIG "ornament / floating
          toolbar" pattern (also seen on Instagram's profile "Get in
          touch" CTA): pinned above the home-indicator safe area, a
          single rounded-rect with the call to action and a trailing
          chevron. Stays out of the form's way but is always one tap
          away. Pointer-events scoped to the button so the surrounding
          gutter doesn't eat taps meant for the page below. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 px-4 pt-3 pointer-events-none"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 12px)` }}
      >
        <div className="mx-auto w-full max-w-[440px] pointer-events-auto">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-[rgba(49,158,216,0.28)] backdrop-blur-xl px-4 py-3 text-left transition-all hover:border-[rgba(49,158,216,0.5)] active:scale-[0.99]"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)), rgba(var(--brand-bg-rgb), 0.88)",
              boxShadow: "0 14px 34px -16px rgba(var(--brand-bg-rgb), 0.95)",
            }}
            data-testid="button-welcomeback-pill"
          >
            <span className="flex flex-col min-w-0">
              <span className="text-fan-primary text-sm font-semibold leading-tight">Can't sign in?</span>
              <span className="text-fan-secondary text-xs leading-tight mt-0.5">Email me a one-tap sign-in link — no password needed.</span>
            </span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--brand-mint)] shrink-0"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
      {/* The form body is identical across presentations — only the
          surrounding surface differs (bottom-sheet on mobile, centered
          card on desktop). Test IDs + handlers stay shared so nothing
          downstream breaks. */}
      {(() => {
        const formBody = (
          <form onSubmit={sendLink} className="mt-3 flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full rounded-2xl border border-[rgba(49,158,216,0.45)] bg-[rgba(49,158,216,0.14)] px-4 py-3.5 text-base text-white placeholder-white/45 transition-colors focus:outline-none focus:border-[var(--brand-blue)] focus:bg-[rgba(49,158,216,0.2)]"
              required
              autoFocus
              data-testid="input-welcomeback-sheet-email"
            />
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className={CUSTOMER_CHROME.primaryBtn}
              style={CUSTOMER_CHROME.primaryBtnStyle}
              data-testid="button-welcomeback-sheet-send"
            >
              {submitting ? "Sending…" : "Email me a sign-in link"}
            </button>
            {/* Quiet OAuth nudge — fans who originally used Google/Apple
                won't have a password, so the magic link isn't their path.
                Closing returns them to the main login, where the existing
                email lookup swaps in the right "Continue with …" button.
                Secondary styling: a faint line, never a second CTA. */}
            <button
              type="button"
              onClick={closeWelcomeBack}
              className="mt-0.5 w-full text-center text-xs leading-relaxed text-fan-faint transition-colors hover:text-fan-secondary"
              data-testid="button-welcomeback-oauth-hint"
            >
              Originally used Google or Apple?{" "}
              <span className="text-fan-secondary">Just sign in with that instead.</span>
            </button>
          </form>
        );

        if (isMobile) {
          return (
            <Drawer open={open} onOpenChange={handleOpenChange}>
              <DrawerContent
                className="rounded-t-3xl border border-[rgba(49,158,216,0.28)] text-white backdrop-blur-xl"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)), rgba(var(--brand-bg-rgb), 0.88)",
                }}
              >
                <div className="mx-auto w-full max-w-[440px] px-5 pb-8">
                  <DrawerHeader className="px-0 text-left">
                    <DrawerTitle className="text-fan-primary text-2xl font-bold tracking-tight">Email me a sign-in link</DrawerTitle>
                    <DrawerDescription className="text-fan-secondary text-sm leading-relaxed">
                      Forgot your password, never set one, or signed up before June 2026? Enter your email and we'll send a one-tap link to sign you in — no password required.
                    </DrawerDescription>
                  </DrawerHeader>
                  {formBody}
                </div>
              </DrawerContent>
            </Drawer>
          );
        }

        return (
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
              className="border border-[rgba(49,158,216,0.28)] text-white max-w-[440px] rounded-3xl px-6 py-7 backdrop-blur-xl"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)), rgba(var(--brand-bg-rgb), 0.88)",
              }}
            >
              <DialogHeader className="text-left space-y-1.5">
                <DialogTitle className="text-fan-primary text-2xl font-bold tracking-tight">Email me a sign-in link</DialogTitle>
                <DialogDescription className="text-fan-secondary text-sm leading-relaxed">
                  Forgot your password, never set one, or signed up before June 2026? Enter your email and we'll send a one-tap link to sign you in — no password required.
                </DialogDescription>
              </DialogHeader>
              {formBody}
            </DialogContent>
          </Dialog>
        );
      })()}
    </>
  );
}

export function Login() {
  const kind = useAuthKind();
  const isAdmin = kind === "admin";
  const s = isAdmin ? ADMIN_CHROME : CUSTOMER_CHROME;
  const inputBg = inputBgStyle(kind);
  // Customer card text is white-on-dark; admin card text is slate-on-white.
  const titleColor = isAdmin ? "text-slate-900" : "text-white";
  const recoveryGroupBg = isAdmin ? undefined : { background: "rgba(255,255,255,0.05)" };

  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>(1);
  const [loginIdent, setLoginIdent] = useState("");
  const [password, setPassword] = useState("");
  const [realName, setRealName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [displayTouched, setDisplayTouched] = useState(false);

  // Admin 2FA flow state.
  const [adminPhase, setAdminPhase] = useState<AdminPhase>("password");
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [enrollData, setEnrollData] = useState<{ qr: string; secret: string; recoveryCodes: string[] } | null>(null);
  // Task #57 — email-OTP flow state. `emailOtpInfo` carries the masked
  // recipient address and (off-prod only) the actual code so a dev
  // looking at the sign-in screen can copy it without tabbing to the
  // server log. `resendCooldown` ticks down to re-enable the button.
  const [emailCode, setEmailCode] = useState("");
  const [emailOtpInfo, setEmailOtpInfo] = useState<{ email: string; devCode?: string } | null>(null);
  const [emailOtpError, setEmailOtpError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  // TOTP fallback offered if the admin has BOTH factors set up — surfaced
  // as "Use authenticator instead" on the email-OTP screen.
  const [totpAlsoEnrolled, setTotpAlsoEnrolled] = useState(false);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { login, register, isLoginPending, isRegisterPending, loginError, registerError } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Task #45 — "How does this email sign in?" lookup. When the fan
  // finishes typing their email (blur) we ask the server which provider
  // (if any) actually authenticates that address. If it's google/apple
  // we swap the password field for a "Continue with {Provider}" CTA so
  // the fan never gets the silent "invalid credentials" lockout.
  // Only runs on customer login (admin TOTP makes the swap pointless).
  // Blur-triggered (not change-triggered) so each character doesn't
  // burn a request against the per-IP rate limiter.
  const [lookupProvider, setLookupProvider] = useState<"password" | "google" | "apple" | null>(null);
  // Task #2059 — OAuth email-collision recovery banner. When the Google/
  // Apple callback finds an existing account for the chosen email it bounces
  // back with ?prompt=link&email=…&provider=…; we keep that here so the
  // login screen can show a persistent, actionable banner (password sign-in
  // OR a one-tap welcome-back link) instead of a single ephemeral toast.
  const [oauthLinkPrompt, setOauthLinkPrompt] = useState<{ email: string; provider: string } | null>(null);
  // Task #2076 — Apple "Hide My Email" claim. When the callback can't match
  // a relay sign-in to an account it parks the verified identity on the
  // session and bounces back with ?prompt=claim. The fan proves ownership
  // of the real email they used (6-digit code) to attach this Apple login
  // to their existing collection, or taps "I'm new" to mint a fresh one.
  const [claimPrompt, setClaimPrompt] = useState<{ provider: string } | null>(null);
  const [claimPhase, setClaimPhase] = useState<"email" | "code">("email");
  const [claimEmail, setClaimEmail] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [claimDevCode, setClaimDevCode] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  useEffect(() => {
    // Any change to the email clears the previous answer so a stale
    // OAuth-swap state can't strand a fan on the wrong provider.
    setLookupProvider(null);
    // Task #2059 — drop the OAuth-collision banner once the fan edits the
    // email to something other than the one the callback flagged, so it
    // can't linger over a different address. The prompt effect sets
    // loginIdent to the flagged email, so they match and the banner stays
    // on first render. Functional update keeps oauthLinkPrompt out of deps.
    setOauthLinkPrompt((prev) =>
      prev && prev.email.toLowerCase() !== loginIdent.trim().toLowerCase() ? null : prev,
    );
  }, [loginIdent, mode]);
  const runLookup = async () => {
    if (isAdmin) return;
    if (mode !== "login") return;
    const raw = loginIdent.trim().toLowerCase();
    if (!isValidEmail(raw)) return;
    try {
      const r = await apiRequest("POST", "/api/auth/lookup", { email: raw });
      const j = await r.json();
      if (j?.exists && (j.provider === "google" || j.provider === "apple")) {
        setLookupProvider(j.provider);
      } else {
        setLookupProvider(j?.provider ?? null);
      }
    } catch {
      setLookupProvider(null);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const prompt = url.searchParams.get("prompt");
    const provider = url.searchParams.get("provider");
    const emailQ = url.searchParams.get("email");
    const oauth = url.searchParams.get("oauth");
    const next = url.searchParams.get("next");
    const link = url.searchParams.get("link");

    if (link === "ok") {
      toast({ title: "Linked", description: "Provider linked to your account." });
      window.history.replaceState({}, "", "/account");
      return;
    }
    if (link === "conflict") {
      toast({ title: "Already linked", description: "That account is linked to a different user.", variant: "destructive" });
      window.history.replaceState({}, "", "/account");
      return;
    }
    // Keep the admin/customer pathname when normalizing query strings —
    // on the dev URL useAuthKind() falls back to pathname, so dropping
    // /admin/login back to /login would silently flip the chrome to
    // customer mid-flow.
    const loginPath = window.location.pathname.startsWith("/admin") ? "/admin/login" : "/login";
    if (prompt === "link" && emailQ) {
      // Task #2059 — surface a persistent, actionable recovery banner
      // instead of an ephemeral toast. A passwordless fan (legacy import
      // or OAuth-only) has no password to "sign in with first", so the
      // banner also offers the one-tap welcome-back sign-in link.
      setOauthLinkPrompt({ email: emailQ, provider: provider ?? "" });
      setLoginIdent(emailQ);
      setMode("login");
      window.history.replaceState({}, "", loginPath);
    }
    // Task #78 — OAuth admin sign-in for an email with no existing
    // invite-bound account. The callback bounces here with
    // ?prompt=invite_required; explain the situation and direct the
    // recipient to ask for an invite.
    if (prompt === "invite_required") {
      toast({
        title: "Invite required",
        description:
          "Partner accounts are invite-only. Ask a super-admin for an invite link, or email nick@goodtunes.fm.",
        variant: "destructive",
      });
      setMode("login");
      window.history.replaceState({}, "", loginPath);
    }
    // Task #2076 — Apple "Hide My Email" claim. The relay sign-in couldn't be
    // matched to an account, so the verified identity is parked on the session
    // and we render the claim card (enter real email → code → connect, or
    // "I'm new"). Customer side only.
    if (prompt === "claim") {
      setClaimPrompt({ provider: provider ?? "apple" });
      setClaimPhase("email");
      setMode("login");
      window.history.replaceState({}, "", loginPath);
    }
    if (oauth && (next === "totp" || next === "enroll")) {
      setAdminPhase(next === "enroll" ? "enroll" : "totp");
      window.history.replaceState({}, "", loginPath);
    }
    // OAuth round-trip for an email-OTP admin: the callback set
    // `pendingTotpUserId` on the session and bounced back with
    // ?oauth=…&next=emailOtp. Drop into the email-code phase and
    // immediately ask the server to issue a code so the masked email +
    // dev-only code render without the admin having to click "resend".
    if (oauth && next === "emailOtp") {
      setAdminPhase("emailOtp");
      window.history.replaceState({}, "", loginPath);
      (async () => {
        try {
          const res = await apiRequest("POST", "/api/auth/email-otp/start");
          const j = await res.json();
          setEmailOtpInfo({ email: j.email ?? "", devCode: j.devCode });
          setTotpAlsoEnrolled(!!j.totpEnrolled);
          setResendCooldown(60);
        } catch (e: any) {
          setEmailOtpError(e?.message ?? "Couldn't send a code. Try again.");
        }
      })();
    }
    if (window.location.hash.startsWith("#token=")) {
      const token = decodeURIComponent(window.location.hash.slice("#token=".length));
      setAuthToken(token);
      // After OAuth round-trip the URL query is gone, but GiftClaim (and
      // any other gated flow) stashed the target in sessionStorage as
      // `gt:postAuthNext` before kicking us to /login — consume it here
      // so a recipient who signed in with Google lands back on the
      // claim screen, not /account.
      // Admin shell (host-based) lands on /admin; everything else goes
      // to the stashed deep-link target (gift claim, buy resume, …) or
      // /home as a fallback.
      let dest = isAdmin ? "/admin" : "/home";
      try {
        const stashed = sessionStorage.getItem("gt:postAuthNext");
        if (stashed && stashed.startsWith("/")) {
          sessionStorage.removeItem("gt:postAuthNext");
          dest = stashed;
        }
      } catch {}
      window.history.replaceState({}, "", dest);
      queryClient.invalidateQueries();
      navigate(dest);
    }
  }, []);

  useEffect(() => {
    if (adminPhase !== "enroll" || enrollData) return;
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/auth/totp/enroll/start");
        const j = await res.json();
        setEnrollData({ qr: j.qr, secret: j.secret, recoveryCodes: j.recoveryCodes });
      } catch (e: any) {
        setTotpError(e?.message ?? "Failed to start 2FA enrollment");
      }
    })();
  }, [adminPhase, enrollData]);

  const suggestedUsername = useMemo(() => suggestUsername(realName, email), [realName, email]);
  const suggestedDisplay = useMemo(() => suggestDisplayName(realName), [realName]);

  const loginValid = loginIdent.trim().length > 0 && password.length > 0;
  const step1Valid = realName.trim().length > 0 && isValidEmail(email) && isValidPassword(password);
  const finalUsernameLive = (usernameTouched ? username : suggestedUsername).toLowerCase().replace(/[^a-z0-9_]/g, "");
  const finalDisplayLive = (displayTouched ? displayName : suggestedDisplay).trim();
  const step2Valid = finalUsernameLive.length >= 3 && finalDisplayLive.length > 0;

  const switchMode = (m: Mode) => { setMode(m); setStep(1); setVerifyCode(""); setVerifyError(null); setVerifyToken(null); clearPendingVerify(); };

  // Rehydrate a pending signup-code step on mount. A new fan who asked
  // for a 6-digit code and then refreshed (or wandered off to their
  // inbox) should land right back on the code-entry screen, not a blank
  // sign-in form. Customer shell only — admins never see this step.
  useEffect(() => {
    if (isAdmin) return;
    const pending = readPendingVerify();
    if (pending) {
      setEmail(pending);
      setMode("register");
      setStep("verify");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Explicit "I already have a code" entry from the sign-in screen so an
  // emailed code always has somewhere to be entered, even if the fan
  // never reached the verify step this session. Uses whatever email they
  // typed in the sign-in field (the same address the code was sent to).
  const goToEnterCode = () => {
    const ident = loginIdent.trim().toLowerCase();
    if (!isValidEmail(ident)) {
      toast({ title: "Enter your email first", description: "Type the email you signed up with, then tap “I already have a code.”" });
      return;
    }
    setEmail(ident);
    setMode("register");
    setStep("verify");
    writePendingVerify(ident);
  };

  // Customer-side email verification state. The 6-digit code is sent to
  // the email entered on step 1; on confirm we trade it for a short-
  // lived `verifyToken` the signup-with-code endpoint consumes.
  // Admin-side users never see this path.
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  // Task #2059 — busy flag for the "email me a sign-in link" recovery
  // action shared by the signup-collision branch and the OAuth banner.
  const [linkBusy, setLinkBusy] = useState(false);

  // Task #2076 — Apple "Hide My Email" claim handlers. After a successful
  // confirm/skip the server mints a customer token; we stash it and do a
  // full navigation so the app boots signed-in on the fan's real library.
  const claimStart = async () => {
    const email = claimEmail.trim().toLowerCase();
    if (!isValidEmail(email)) {
      setClaimError("Enter the email you signed up with.");
      return;
    }
    setClaimBusy(true); setClaimError(null); setClaimDevCode(null);
    try {
      const res = await apiRequest("POST", "/api/auth/claim/start", { email });
      const j = await res.json();
      if (j?.devCode) setClaimDevCode(String(j.devCode));
      setClaimPhase("code");
    } catch (err) {
      setClaimError((apiErrorBody<{ message?: string }>(err)?.message) || "Couldn't send a code. Try again.");
    } finally {
      setClaimBusy(false);
    }
  };

  const claimConfirm = async () => {
    const email = claimEmail.trim().toLowerCase();
    const code = claimCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setClaimError("Enter the 6-digit code from your email.");
      return;
    }
    setClaimBusy(true); setClaimError(null);
    try {
      const res = await apiRequest("POST", "/api/auth/claim/confirm", { email, code });
      const j = await res.json();
      if (j?.token) setAuthToken(String(j.token));
      window.location.assign(j?.landing || "/account");
    } catch (err) {
      const status = apiErrorStatus(err);
      const body = apiErrorBody<{ message?: string; noAccount?: boolean; hasCredential?: boolean }>(err);
      if (status === 404 && body?.noAccount) {
        setClaimError("No account uses that email yet — tap “I'm new” below to create one.");
      } else {
        setClaimError(body?.message || "That code didn't match. Try again.");
      }
    } finally {
      setClaimBusy(false);
    }
  };

  const claimSkip = async () => {
    setClaimBusy(true); setClaimError(null);
    try {
      const res = await apiRequest("POST", "/api/auth/claim/skip", {});
      const j = await res.json();
      if (j?.token) setAuthToken(String(j.token));
      window.location.assign(j?.landing || "/finish-setup");
    } catch (err) {
      setClaimError((apiErrorBody<{ message?: string }>(err)?.message) || "Couldn't continue. Try again.");
    } finally {
      setClaimBusy(false);
    }
  };

  const startCustomerVerify = async () => {
    setVerifyBusy(true); setVerifyError(null); setDevCode(null);
    try {
      const res = await apiRequest("POST", "/api/email-verifications/start", { email: email.trim() });
      const j = await res.json();
      // Task #2059 — the email already has an account. No code was sent,
      // so don't drop into the code-entry step (that's what used to burn
      // codes and end in the misleading "that code didn't match"). Show
      // the recovery branch instead.
      if (j.accountExists) {
        clearPendingVerify();
        setStep("exists");
        return;
      }
      if (j.devCode) setDevCode(String(j.devCode));
      writePendingVerify(email.trim());
      setStep("verify");
    } catch (e: any) {
      setVerifyError(e?.message ?? "Couldn't send a code — check the email and try again");
    } finally {
      setVerifyBusy(false);
    }
  };

  // Task #2059 — email a one-tap welcome-back sign-in link to a fan who
  // hit either recovery surface: the signup "you already have an account"
  // branch, or the OAuth email-collision banner. Reuses the
  // non-enumerating /api/welcome-back/start rail, which mints a link for
  // ANY existing non-merged fan (passwordless included), so the on-screen
  // confirmation is the same neutral toast whether or not the email hit.
  const sendSignInLink = async (targetEmail: string) => {
    const addr = targetEmail.trim().toLowerCase();
    if (!isValidEmail(addr)) {
      toast({ title: "Enter your email first", description: "Type your email so we can send the sign-in link." });
      return;
    }
    setLinkBusy(true);
    try {
      await apiRequest("POST", "/api/welcome-back/start", { email: addr });
    } catch {
      // Endpoint is intentionally non-enumerating — fall through to the
      // same neutral toast so timing/errors never reveal account presence.
    } finally {
      setLinkBusy(false);
      toast({ title: "Check your inbox", description: "If that email is on file, a one-tap sign-in link is on its way." });
    }
  };

  const submitCustomerVerify = async () => {
    setVerifyBusy(true); setVerifyError(null);
    try {
      const r1 = await apiRequest("POST", "/api/email-verifications/confirm", { email: email.trim(), code: verifyCode });
      const j1 = await r1.json();
      const r2 = await apiRequest("POST", "/api/customer/signup-with-code", {
        email: email.trim(),
        password,
        verifyToken: j1.verifyToken,
      });
      const j2 = await r2.json();
      if (j2.token) setAuthToken(j2.token);
      clearPendingVerify();
      queryClient.invalidateQueries();
      // Land in the player at the next URL if one was set (Buy flow
      // sets ?next=/album/<id>), otherwise the standard /home landing.
      const next = new URL(window.location.href).searchParams.get("next") || "/home";
      navigate(next);
    } catch (e: any) {
      setVerifyError(e?.message ?? "That code didn't match");
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleOAuth = (provider: "google" | "apple") => {
    // Fire before the redirect (the page is about to be replaced). Mode
    // distinguishes sign-up vs sign-in for the same OAuth click — the
    // segmented control above sets `mode`.
    track(mode === "register" ? "sign_up" : "sign_in", { provider, kind });
    window.location.href = `/api/auth/${provider}/start?kind=${kind}`;
  };

  const goToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    // Customer side: skip the username/displayName step entirely
    // (Task #44) and route through the email-code verification gate.
    // Stripe collects legal name at checkout; the fan can rename their
    // handle on /welcome after payment.
    if (!isAdmin) {
      if (!isValidEmail(email) || !isValidPassword(password)) return;
      startCustomerVerify();
      return;
    }
    if (!step1Valid) return;
    setUsername(suggestedUsername);
    setDisplayName(suggestedDisplay);
    setStep(2);
  };

  // Respect ?next=<path> so flows that gate on auth (gift claim, buy,
  // playlist follow, etc.) resume where they left off. Admin shell
  // always lands on /admin regardless — admin pages aren't valid
  // continuation targets for customer auth. The same `next` value is
  // also stashed in localStorage as `gt:postAuthNext` so the OAuth
  // round-trip (which loses query params across the IdP redirect) can
  // pick it up via the hash-token handler higher up.
  const nextPath = (): string => {
    if (isAdmin) return "/admin";
    try {
      const q = new URL(window.location.href).searchParams.get("next");
      if (q && q.startsWith("/")) return q;
      const stashed = sessionStorage.getItem("gt:postAuthNext");
      if (stashed && stashed.startsWith("/")) {
        sessionStorage.removeItem("gt:postAuthNext");
        return stashed;
      }
    } catch {}
    return "/home";
  };

  const finishCustomer = () => {
    queryClient.invalidateQueries();
    navigate(nextPath());
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalUsername = (usernameTouched ? username : suggestedUsername).toLowerCase().replace(/[^a-z0-9_]/g, "");
    const finalDisplay = (displayTouched ? displayName : suggestedDisplay).trim();
    if (!finalUsername || !finalDisplay) return;
    try {
      const result: any = await register({
        username: finalUsername,
        email: email.trim(),
        displayName: finalDisplay,
        realName: realName.trim(),
        password,
      });
      track("sign_up", { provider: "password", kind });
      if (isAdmin || result?.requiresLogin) {
        setMode("login");
        setLoginIdent(finalUsername);
        setPassword("");
        toast({ title: "Account created", description: "Now sign in to set up 2FA." });
      } else {
        finishCustomer();
      }
    } catch {}
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result: any = await login({ username: loginIdent.trim(), password });
      if (result?.requiresEnrollment) {
        setAdminPhase("enroll");
      } else if (result?.requires2fa) {
        setAdminPhase("totp");
      } else if (result?.requiresEmailCode) {
        setEmailOtpInfo({ email: result.email, devCode: result.devCode });
        setTotpAlsoEnrolled(!!result.totpEnrolled);
        setResendCooldown(60);
        setAdminPhase("emailOtp");
      } else if (result?.token) {
        track("sign_in", { provider: "password", kind });
        finishCustomer();
      }
    } catch {}
  };

  const submitTotp = async () => {
    setSubmitting(true); setTotpError(null);
    try {
      const body: any = {};
      if (useRecovery) body.recovery = recoveryCode.trim();
      else body.code = totpCode.trim();
      const res = await apiRequest("POST", "/api/auth/totp/verify", body);
      const j = await res.json();
      if (j.token) setAuthToken(j.token);
      // Seed the signed-in user before navigating so the protected admin
      // route sees an authenticated user on first mount instead of
      // bouncing back to the login screen (mirrors the password-login path).
      const { token, landingPath, ...user } = j;
      queryClient.setQueryData(["/api/me"], user);
      queryClient.invalidateQueries();
      // Task #78 — honor server-supplied role-scoped landing so OAuth
      // invite recipients land in their partner shell (/non-profit etc).
      navigate(typeof landingPath === "string" && landingPath.startsWith("/") ? landingPath : "/admin");
    } catch (e: any) {
      setTotpError(e?.message ?? "Code didn't match");
    } finally {
      setSubmitting(false);
    }
  };

  const submitEmailOtp = async () => {
    setSubmitting(true); setEmailOtpError(null);
    try {
      const res = await apiRequest("POST", "/api/auth/email-otp/verify", { code: emailCode.trim() });
      const j = await res.json();
      if (j.token) setAuthToken(j.token);
      // Seed the signed-in user before navigating so the protected admin
      // route sees an authenticated user on first mount instead of
      // bouncing back to the login screen (mirrors the password-login path).
      const { token, landingPath, ...user } = j;
      queryClient.setQueryData(["/api/me"], user);
      queryClient.invalidateQueries();
      navigate(typeof landingPath === "string" && landingPath.startsWith("/") ? landingPath : "/admin");
    } catch (e: any) {
      setEmailOtpError(e?.message ?? "Code didn't match");
    } finally {
      setSubmitting(false);
    }
  };

  const resendEmailOtp = async () => {
    setEmailOtpError(null);
    try {
      const res = await apiRequest("POST", "/api/auth/email-otp/start");
      const j = await res.json();
      setEmailOtpInfo({ email: j.email ?? emailOtpInfo?.email ?? "", devCode: j.devCode });
      setResendCooldown(60);
      setEmailCode("");
      toast({ title: "Code sent", description: "A fresh code is on its way." });
    } catch (e: any) {
      setEmailOtpError(e?.message ?? "Couldn't send a new code");
    }
  };

  // Tick down the resend cooldown once per second while > 0.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const submitEnrollVerify = async () => {
    setSubmitting(true); setTotpError(null);
    try {
      const res = await apiRequest("POST", "/api/auth/totp/enroll/verify", { code: totpCode.trim() });
      const j = await res.json();
      if (j.token) setAuthToken(j.token);
      // Seed the signed-in user before navigating so the protected admin
      // route sees an authenticated user on first mount instead of
      // bouncing back to the login screen (mirrors the password-login path).
      const { token, ...user } = j;
      queryClient.setQueryData(["/api/me"], user);
      queryClient.invalidateQueries();
      navigate("/admin");
    } catch (e: any) {
      setTotpError(e?.message ?? "Code didn't match");
    } finally {
      setSubmitting(false);
    }
  };

  const isPending = mode === "login" ? isLoginPending : isRegisterPending;
  const error = mode === "login" ? loginError : registerError;

  // ─── TOTP phases (admin only — chrome is always admin here) ──────
  if (adminPhase === "enroll") {
    return (
      <main className={s.page}>
        <div className={s.card}>
          <div className="flex flex-col items-center mb-6"><GoodTunesLogo size="lg" variant={isAdmin ? "color" : "white"} /></div>
          <h1 className={`text-xl font-semibold text-center mb-2 ${titleColor}`}>Set up 2FA</h1>
          <p className={`${isAdmin ? "text-slate-500" : "text-white/55"} text-sm text-center mb-6`}>
            Admin accounts require an authenticator app (Google Authenticator, 1Password, Authy, etc.). Scan this QR code, then enter the 6-digit code to confirm.
          </p>
          {enrollData ? (
            <>
              <div className="flex justify-center mb-4">
                <img src={enrollData.qr} alt="2FA QR code" className={s.qrFrame} />
              </div>
              <p className={`${isAdmin ? "text-slate-400" : "text-white/45"} text-xs text-center mb-4 break-all`}>
                Or enter secret manually: <span className={`${isAdmin ? "text-slate-700" : "text-white/80"} font-mono`}>{enrollData.secret}</span>
              </p>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123 456"
                inputMode="numeric"
                autoComplete="one-time-code"
                className={s.inputCenter}
                style={inputBg}
                data-testid="input-totp-enroll"
              />
              {totpError && <p className={s.totpErr}>{totpError}</p>}
              <button
                type="button"
                onClick={submitEnrollVerify}
                disabled={submitting || totpCode.length !== 6}
                className={s.primaryBtn}
                style={s.primaryBtnStyle}
                data-testid="button-totp-enroll-verify"
              >
                {submitting ? "Verifying..." : "Confirm & enable"}
              </button>
              <div className={s.recoveryWrap} style={recoveryGroupBg}>
                <p className={`${isAdmin ? "text-slate-900" : "text-white/85"} text-sm font-semibold mb-2`}>Recovery codes</p>
                <p className={`${isAdmin ? "text-slate-500" : "text-white/55"} text-xs mb-3`}>Save these somewhere safe. Each works once if you lose your authenticator.</p>
                <div className={`grid grid-cols-2 gap-2 font-mono ${isAdmin ? "text-slate-800" : "text-white"} text-sm`}>
                  {enrollData.recoveryCodes.map((c) => <div key={c} className={s.recoveryItem}>{c}</div>)}
                </div>
              </div>
            </>
          ) : (
            <p className={`${isAdmin ? "text-slate-500" : "text-white/55"} text-center`}>Loading…</p>
          )}
        </div>
      </main>
    );
  }

  if (adminPhase === "emailOtp") {
    return (
      <main className={s.page}>
        <div className={s.card}>
          <div className="flex flex-col items-center mb-6"><GoodTunesLogo size="lg" variant={isAdmin ? "color" : "white"} /></div>
          <h1 className={`text-xl font-semibold text-center mb-2 ${titleColor}`}>Check your email</h1>
          <p className={`${isAdmin ? "text-slate-500" : "text-white/55"} text-sm text-center mb-6`}>
            We sent a 6-digit code to <span className={`${isAdmin ? "text-slate-800" : "text-white/85"} font-medium`}>{emailOtpInfo?.email ?? "your inbox"}</span>. It expires in 10 minutes.
          </p>
          {emailOtpInfo?.devCode && (
            <p className={`${isAdmin ? "text-amber-700 bg-amber-50 border-amber-200" : "text-amber-200 bg-amber-500/10 border-amber-400/30"} text-xs border rounded px-2 py-1 mb-3 text-center`}>
              Dev only — your code is <span className="font-mono font-semibold">{emailOtpInfo.devCode}</span>
            </p>
          )}
          <input
            type="text"
            value={emailCode}
            onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123 456"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            className={s.inputCenter}
            style={inputBg}
            data-testid="input-email-otp"
          />
          {emailOtpError && <p className={s.totpErr}>{emailOtpError}</p>}
          <button
            type="button"
            onClick={submitEmailOtp}
            disabled={submitting || emailCode.length !== 6}
            className={s.primaryBtn}
            style={s.primaryBtnStyle}
            data-testid="button-email-otp-verify"
          >
            {submitting ? "Verifying..." : "Verify"}
          </button>
          <button
            type="button"
            onClick={resendEmailOtp}
            disabled={resendCooldown > 0}
            className={s.ghostBtn}
            data-testid="button-email-otp-resend"
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Didn't get it? Resend"}
          </button>
          {totpAlsoEnrolled && (
            <button
              type="button"
              onClick={() => { setAdminPhase("totp"); setEmailOtpError(null); }}
              className={s.ghostBtn}
              data-testid="button-use-authenticator-instead"
            >
              Use authenticator app instead
            </button>
          )}
        </div>
      </main>
    );
  }

  if (adminPhase === "totp") {
    return (
      <main className={s.page}>
        <div className={s.card}>
          <div className="flex flex-col items-center mb-6"><GoodTunesLogo size="lg" variant={isAdmin ? "color" : "white"} /></div>
          <h1 className={`text-xl font-semibold text-center mb-2 ${titleColor}`}>Two-factor required</h1>
          <p className={`${isAdmin ? "text-slate-500" : "text-white/55"} text-sm text-center mb-6`}>
            Enter the 6-digit code from your authenticator app.
          </p>
          {!useRecovery ? (
            <input
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123 456"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              className={s.inputCenter}
              style={inputBg}
              data-testid="input-totp"
            />
          ) : (
            <input
              type="text"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
              placeholder="XXXXX-XXXXX"
              autoCapitalize="characters"
              autoFocus
              className={`${s.inputCenter} font-mono`}
              style={inputBg}
              data-testid="input-recovery"
            />
          )}
          {totpError && <p className={s.totpErr}>{totpError}</p>}
          <button
            type="button"
            onClick={submitTotp}
            disabled={submitting || (!useRecovery && totpCode.length !== 6) || (useRecovery && recoveryCode.length < 8)}
            className={s.primaryBtn}
            style={s.primaryBtnStyle}
            data-testid="button-totp-verify"
          >
            {submitting ? "Verifying..." : "Verify"}
          </button>
          <button
            type="button"
            onClick={() => { setUseRecovery(!useRecovery); setTotpError(null); }}
            className={s.ghostBtn}
            data-testid="button-toggle-recovery"
          >
            {useRecovery ? "Use authenticator code instead" : "Use a recovery code instead"}
          </button>
        </div>
      </main>
    );
  }

  // ─── Default password / OAuth UI ─────────────────────────────────
  return (
    <main className={s.page}>
      <div className={s.card}>
        <div className="flex flex-col items-center mb-6">
          <GoodTunesLogo size="lg" variant={isAdmin ? "color" : "white"} />
          <p className={s.subtitle}>
            {isAdmin ? "Sign in to GoodTunes Admin" : "Sign in to your GoodTunes account"}
          </p>
        </div>

        {/* Task #78 — admin/partner accounts are invite-only; with
            only one tab the segmented control collapses into a
            redundant "Sign In" pill stacked under the heading. Skip
            it entirely on the admin shell — the invite-only notice
            below does the explaining. */}
        {!isAdmin && (
          <div
            className={s.segmentedWrap}
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <div
              className={s.segmentedThumbClass}
              style={s.segmentedThumbStyle(mode)}
            />
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={s.segmentedBtn(mode === "login")}
              data-testid="tab-login"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={s.segmentedBtn(mode === "register")}
              data-testid="tab-register"
            >
              Create Account
            </button>
          </div>
        )}
        {mode === "register" && step !== "exists" && (
          <div className="flex items-center justify-center gap-2 mb-5">
            <div className={s.step1Tick(step === 1)} />
            <div className={s.step2Tick(step === 2)} />
            <span className={s.stepLabel}>Step {step} of 2</span>
          </div>
        )}

        {/* Task #400 / #409 — Welcome-back pill. Customer login only.
            Subtle rounded pill above the form; tap to open a bottom
            sheet with explainer + email field. Posts to
            /api/welcome-back/start with constant-floor latency and
            no-enumeration semantics, so it's safe to show pre-auth. */}
        {!isAdmin && mode === "login" && <WelcomeBackPill />}
        {/* Task #2076 — Apple "Hide My Email" claim card. The relay sign-in
            couldn't be matched to an account; the verified Apple identity is
            parked on the session. The fan enters the real email they used to
            attach this Apple login to their existing collection (email → code
            → connect), or taps "I'm new" to mint a fresh account. */}
        {!isAdmin && mode === "login" && claimPrompt && (
          <div
            className="mb-4 rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
            data-testid="card-oauth-claim"
          >
            <p className="text-sm font-semibold text-fan-primary">Connect your account</p>
            <p className="mt-1 text-xs leading-relaxed text-fan-secondary">
              You signed in with Apple’s private email. Enter the email you originally
              used so we can connect this sign-in to your existing collection.
            </p>
            {claimPhase === "email" ? (
              <div className="mt-3 flex flex-col gap-2.5">
                <input
                  type="email"
                  value={claimEmail}
                  onChange={(e) => { setClaimEmail(e.target.value.replace(/\s/g, "")); setClaimError(null); }}
                  placeholder="you@example.com"
                  autoComplete="email" autoCapitalize="none" spellCheck={false} inputMode="email"
                  className={s.input} style={inputBg}
                  data-testid="input-claim-email"
                />
                <button
                  type="button"
                  onClick={claimStart}
                  disabled={claimBusy}
                  className={s.oauthBtn}
                  data-testid="button-claim-send-code"
                >
                  {claimBusy ? "Sending…" : "Send me a code"}
                </button>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2.5">
                <p className="text-xs text-fan-secondary">
                  Enter the 6-digit code we sent to <strong className="text-fan-primary">{claimEmail}</strong>.
                </p>
                <input
                  type="text"
                  value={claimCode}
                  onChange={(e) => { setClaimCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setClaimError(null); }}
                  placeholder="000000"
                  autoComplete="one-time-code" inputMode="numeric" maxLength={6}
                  className={s.input} style={inputBg}
                  data-testid="input-claim-code"
                />
                {claimDevCode && (
                  <p className="text-xs text-fan-faint" data-testid="text-claim-devcode">Dev code: {claimDevCode}</p>
                )}
                <button
                  type="button"
                  onClick={claimConfirm}
                  disabled={claimBusy}
                  className={s.oauthBtn}
                  data-testid="button-claim-confirm"
                >
                  {claimBusy ? "Connecting…" : "Connect my account"}
                </button>
                <button
                  type="button"
                  onClick={() => { setClaimPhase("email"); setClaimCode(""); setClaimError(null); }}
                  className={s.ghostBtn}
                  data-testid="button-claim-change-email"
                >
                  Use a different email
                </button>
              </div>
            )}
            {claimError && (
              <p className="mt-2 text-xs text-fan-heart" data-testid="text-claim-error">{claimError}</p>
            )}
            <button
              type="button"
              onClick={claimSkip}
              disabled={claimBusy}
              className={`${s.ghostBtn} mt-2`}
              data-testid="button-claim-skip"
            >
              I’m new — create a fresh account
            </button>
          </div>
        )}
        {/* Task #2059 — OAuth email-collision recovery banner. The Google/
            Apple callback bounced back with ?prompt=link because the chosen
            email already has an account. Instead of a single ephemeral
            toast that dead-ends a passwordless (legacy/OAuth-only) fan, show
            a persistent banner that keeps the password sign-in path AND
            offers a one-tap welcome-back link. No-auto-merge stays: linking
            the provider happens from the profile after they're in. */}
        {!isAdmin && mode === "login" && oauthLinkPrompt && (
          <div
            className="mb-4 rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
            data-testid="banner-oauth-link"
          >
            <p className="text-sm font-semibold text-fan-primary">You already have an account</p>
            <p className="mt-1 text-xs leading-relaxed text-fan-secondary">
              <strong className="text-fan-primary">{oauthLinkPrompt.email}</strong> is already registered. Sign in below
              {oauthLinkPrompt.provider
                ? ` to finish linking ${oauthLinkPrompt.provider[0].toUpperCase()}${oauthLinkPrompt.provider.slice(1)} from your profile`
                : ""}
              {" "}— or, if you never set a password, email yourself a one-tap sign-in link instead.
            </p>
            <button
              type="button"
              onClick={() => sendSignInLink(oauthLinkPrompt.email)}
              disabled={linkBusy}
              className={s.ghostBtn}
              data-testid="button-oauth-link-send"
            >
              {linkBusy ? "Sending…" : "Email me a sign-in link"}
            </button>
          </div>
        )}
        {mode === "login" && (
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <div>
              <label className={s.label}>Username or Email</label>
              <input
                type="text" name="username" value={loginIdent}
                onChange={(e) => setLoginIdent(e.target.value.replace(/\s/g, ""))}
                onBlur={runLookup}
                placeholder="@username or you@example.com"
                autoComplete="username" autoCapitalize="none" spellCheck={false} inputMode="email"
                className={s.input} style={inputBg} required data-testid="input-login-username"
              />
            </div>
            {lookupProvider === "google" || lookupProvider === "apple" ? (
              <div className="flex flex-col gap-2.5" data-testid="oauth-swap">
                <div className={`text-sm ${isAdmin ? "text-slate-600" : "text-white/70"}`} data-testid="text-oauth-hint">
                  This email signs in with <strong>{lookupProvider === "google" ? "Google" : "Apple"}</strong> — use the button below.
                </div>
                <button
                  type="button"
                  onClick={() => handleOAuth(lookupProvider)}
                  className={s.oauthBtn}
                  data-testid={`button-${lookupProvider}-continue`}
                >
                  {lookupProvider === "google" ? (
                    <svg width={s.oauthIcon.googleW} height={s.oauthIcon.googleH} viewBox="0 0 48 48">
                      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
                      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
                      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.5 16.2 44 24 44z"/>
                      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C40.9 36.4 44 30.7 44 24c0-1.3-.1-2.4-.4-3.5z"/>
                    </svg>
                  ) : (
                    <svg width={s.oauthIcon.appleW} height={s.oauthIcon.appleH} viewBox="0 0 24 24" fill={s.oauthIcon.appleFill}>
                      <path d="M17.05 12.04c-.03-3.02 2.47-4.49 2.58-4.56-1.41-2.06-3.6-2.34-4.38-2.37-1.86-.19-3.64 1.1-4.59 1.1-.96 0-2.42-1.07-3.98-1.04-2.05.03-3.95 1.19-5 3.02-2.13 3.7-.55 9.17 1.53 12.18 1.02 1.47 2.23 3.13 3.81 3.07 1.53-.06 2.11-.99 3.96-.99 1.85 0 2.37.99 3.99.96 1.65-.03 2.69-1.5 3.69-2.98 1.16-1.71 1.64-3.36 1.67-3.45-.04-.02-3.21-1.23-3.24-4.94zM14.13 3.4c.84-1.02 1.41-2.43 1.25-3.84-1.21.05-2.69.81-3.56 1.83-.78.9-1.47 2.34-1.29 3.72 1.36.1 2.74-.69 3.6-1.71z"/>
                    </svg>
                  )}
                  Continue with {lookupProvider === "google" ? "Google" : "Apple"}
                </button>
                <button
                  type="button"
                  onClick={() => setLookupProvider("password")}
                  className={s.ghostBtn}
                  data-testid="button-use-password-anyway"
                >
                  Use a password instead
                </button>
              </div>
            ) : (
              <>
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <label className={`${s.label} mb-0`}>Password</label>
                    <button
                      type="button"
                      onClick={() => navigate(isAdmin ? "/admin/forgot-password" : "/forgot-password")}
                      className={`text-xs font-medium hover:underline transition-colors ${isAdmin ? "text-[var(--brand-blue)]" : "text-fan-faint hover:text-fan-secondary"}`}
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" name="password" autoComplete="current-password"
                    className={s.input} style={inputBg} required data-testid="input-login-password"
                  />
                </div>
                {error && <div className={s.errorBox}>{error}</div>}
                <button
                  type="submit" disabled={isPending || !loginValid}
                  className={s.primaryBtn} style={s.primaryBtnStyle}
                  data-testid="button-submit-login"
                >
                  {isPending ? "Signing in..." : "Sign In"}
                </button>
                {/* Preview-only escape hatch. On *.replit.dev the root
                    page shows fan chrome, so Bill's admin password always
                    comes back "Invalid." This button hits the existing
                    GET /dev-login-bill route (full navigation so the
                    server redirect to /admin/login#token=… runs and the
                    hash-token pickup completes sign-in) and lands the
                    operator in the admin shell as the super-admin — no
                    password, no 2FA. It renders ONLY in the dev/preview
                    build (import.meta.env.DEV); the production bundle ships
                    without it, and even a hand-crafted request 404s
                    because /dev-login-bill is gated on NODE_ENV. */}
                {isAdmin && import.meta.env.DEV && (
                  <button
                    type="button"
                    onClick={() => { window.location.href = "/dev-login-bill"; }}
                    className={`${s.ghostBtn} rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 font-medium transition-colors hover:bg-slate-100`}
                    data-testid="button-dev-admin-login"
                  >
                    🛠 Dev admin login (preview only)
                  </button>
                )}
              </>
            )}
          </form>
        )}

        {/* Any fan who already has an emailed signup code needs somewhere
            to enter it — even if they never reached the verify step this
            session (or refreshed away from it). Customer sign-in only. */}
        {!isAdmin && mode === "login" && (
          <button
            type="button"
            onClick={goToEnterCode}
            className="mt-3 w-full text-center text-xs leading-relaxed text-fan-faint transition-colors hover:text-fan-secondary"
            data-testid="button-have-code"
          >
            Already have a code?{" "}
            <span className="text-fan-secondary">Enter it here.</span>
          </button>
        )}

        {mode === "register" && step === 1 && (
          <form onSubmit={goToStep2} className="flex flex-col gap-3">
            {/* Customer signup skips the Name field — Stripe collects
                legal name at checkout (it's the name on the card, so
                fans type it carefully). Admin still asks for it because
                admins never go through Stripe. */}
            {isAdmin && (
              <div>
                <label className={s.label}>Name</label>
                <input
                  type="text" value={realName} onChange={(e) => setRealName(e.target.value)}
                  placeholder="Nigel Tufnel" autoComplete="name"
                  className={s.input} style={inputBg} required data-testid="input-real-name"
                />
              </div>
            )}
            <div>
              <label className={s.label}>Email</label>
              <input
                type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" autoComplete="email" inputMode="email"
                autoCapitalize="none" spellCheck={false}
                className={s.input} style={inputBg} required data-testid="input-email"
              />
            </div>
            <div>
              <label className={s.label}>Password</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" name="new-password" autoComplete="new-password" minLength={8}
                className={s.input} style={inputBg} required data-testid="input-password"
              />
              <p className={`text-xs mt-1.5 ${isAdmin ? "ml-0" : "ml-1"} ${
                password.length === 0
                  ? (isAdmin ? "text-slate-400" : "text-white/35")
                  : isValidPassword(password)
                    ? (isAdmin ? "text-emerald-600" : "text-[var(--brand-mint)]")
                    : (isAdmin ? "text-slate-600" : "text-white/55")
              }`}>
                At least 8 characters with a letter and a number.
              </p>
            </div>
            <button
              type="submit"
              disabled={isAdmin
                ? !step1Valid
                : (verifyBusy || !isValidEmail(email) || !isValidPassword(password))}
              className={s.primaryBtn} style={s.primaryBtnStyle}
              data-testid="button-continue-step1"
            >
              {!isAdmin && verifyBusy ? "Sending code…" : "Continue"}
            </button>
            {!isAdmin && verifyError && <div className={s.errorBox}>{verifyError}</div>}
          </form>
        )}

        {mode === "register" && step === "verify" && !isAdmin && (
          <form
            onSubmit={(e) => { e.preventDefault(); submitCustomerVerify(); }}
            className="flex flex-col gap-3"
            data-testid="form-verify-code"
          >
            <p className={s.subtitle}>
              We sent a 6-digit code to <strong>{email}</strong>. Enter it below to finish creating your account.
            </p>
            {devCode && (
              <div className={`text-xs ${isAdmin ? "text-slate-500" : "text-white/55"}`}>
                Dev mode: code is <code className="font-mono">{devCode}</code>
              </div>
            )}
            <div>
              <label className={s.label}>6-digit code</label>
              <input
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                className={s.inputCenter} style={inputBg}
                required
                data-testid="input-verify-code"
              />
            </div>
            {verifyError && (
              <div data-testid="text-verify-error">
                <FriendlyError
                  headline="That didn't work"
                  explanation="We couldn't finish creating your account. Double-check the code, try again, or send this to GoodTunes so we can look at it."
                  context={{ source: "signup-verify", step: "confirm" }}
                  error={{ name: "SignupVerifyError", message: verifyError }}
                  knownEmail={email.trim() || null}
                  variant="inline"
                  testIdPrefix="verify-error"
                />
              </div>
            )}
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => { setStep(1); setVerifyError(null); clearPendingVerify(); }}
                aria-label="Back"
                className={s.backChip}
                style={isAdmin ? undefined : { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)" }}
                data-testid="button-back-verify"
              >
                <svg width={s.backChevronSize} height={s.backChevronSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <button
                type="submit"
                disabled={verifyBusy || verifyCode.length !== 6}
                className={`${s.primaryBtn} flex-1 mt-0`}
                style={s.primaryBtnStyle}
                data-testid="button-submit-verify"
              >
                {verifyBusy ? "Verifying…" : "Verify & create"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => startCustomerVerify()}
              disabled={verifyBusy}
              className={s.ghostBtn}
              data-testid="button-resend-code"
            >
              Resend code
            </button>
          </form>
        )}

        {/* Task #2059 — signup "account already exists" recovery branch.
            Reached when /api/email-verifications/start reports the email is
            already registered, BEFORE any code is minted. Replaces the old
            dead-end (burn codes → "that code didn't match"). Customer-only:
            this step is only ever set from startCustomerVerify. */}
        {mode === "register" && step === "exists" && !isAdmin && (
          <div className="flex flex-col gap-3" data-testid="step-account-exists">
            <div
              className="rounded-2xl p-4"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              <p className="text-sm font-semibold text-fan-primary">You already have an account</p>
              <p className="mt-1 text-xs leading-relaxed text-fan-secondary">
                <strong className="text-fan-primary">{email.trim()}</strong> is already registered with GoodTunes. No new
                code was sent. Sign in to pick up where you left off — or, if you never set a password, email yourself a
                one-tap sign-in link.
              </p>
            </div>
            <button
              type="button"
              onClick={() => sendSignInLink(email)}
              disabled={linkBusy}
              className={s.primaryBtn}
              style={s.primaryBtnStyle}
              data-testid="button-exists-send-link"
            >
              {linkBusy ? "Sending…" : "Email me a sign-in link"}
            </button>
            <button
              type="button"
              onClick={() => { setLoginIdent(email.trim()); setPassword(""); setMode("login"); setStep(1); }}
              className={s.ghostBtn}
              data-testid="button-exists-signin"
            >
              Sign in with a password instead
            </button>
          </div>
        )}

        {mode === "register" && step === 2 && isAdmin && (
          <form onSubmit={handleRegister} className="flex flex-col gap-3">
            <div>
              <label className={s.label}>Username</label>
              <div className="relative">
                <span className={`absolute left-3 top-1/2 -translate-y-1/2 ${isAdmin ? "text-slate-400" : "text-white/40"} text-sm pointer-events-none`}>@</span>
                <input
                  type="text"
                  value={usernameTouched ? username : suggestedUsername}
                  onChange={(e) => { setUsernameTouched(true); setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); }}
                  placeholder="username" autoCapitalize="none" spellCheck={false}
                  className={`${s.input} pl-7`} style={inputBg}
                  required data-testid="input-username"
                />
              </div>
              <p className={s.hint}>Your unique handle.</p>
            </div>
            <div>
              <label className={s.label}>Display Name</label>
              <input
                type="text"
                value={displayTouched ? displayName : suggestedDisplay}
                onChange={(e) => { setDisplayTouched(true); setDisplayName(e.target.value); }}
                placeholder="What friends call you" autoComplete="off"
                className={s.input} style={inputBg}
                required data-testid="input-display-name"
              />
              <p className={s.hint}>This is how people will know you.</p>
            </div>
            {error && <div className={s.errorBox}>{error}</div>}
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                aria-label="Back"
                className={s.backChip}
                style={isAdmin ? undefined : { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)" }}
                data-testid="button-back-step2"
              >
                <svg width={s.backChevronSize} height={s.backChevronSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <button
                type="submit" disabled={isPending || !step2Valid}
                className={`${s.primaryBtn} flex-1 mt-0`} style={s.primaryBtnStyle}
                data-testid="button-submit-register"
              >
                {isPending ? "Creating account..." : "Create Account"}
              </button>
            </div>
          </form>
        )}

        {!(mode === "register" && (step === 2 || step === "verify" || step === "exists")) && (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className={s.divider} />
              <span className={s.dividerText}>or</span>
              <div className={s.divider} />
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                type="button" onClick={() => handleOAuth("google")}
                className={s.oauthBtn} data-testid="button-google-signin"
              >
                <svg width={s.oauthIcon.googleW} height={s.oauthIcon.googleH} viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.5 16.2 44 24 44z"/>
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C40.9 36.4 44 30.7 44 24c0-1.3-.1-2.4-.4-3.5z"/>
                </svg>
                Continue with Google
              </button>
              <button
                type="button" onClick={() => handleOAuth("apple")}
                className={s.oauthBtn} data-testid="button-apple-signin"
              >
                <svg width={s.oauthIcon.appleW} height={s.oauthIcon.appleH} viewBox="0 0 24 24" fill={s.oauthIcon.appleFill}>
                  <path d="M17.05 12.04c-.03-3.02 2.47-4.49 2.58-4.56-1.41-2.06-3.6-2.34-4.38-2.37-1.86-.19-3.64 1.1-4.59 1.1-.96 0-2.42-1.07-3.98-1.04-2.05.03-3.95 1.19-5 3.02-2.13 3.7-.55 9.17 1.53 12.18 1.02 1.47 2.23 3.13 3.81 3.07 1.53-.06 2.11-.99 3.96-.99 1.85 0 2.37.99 3.99.96 1.65-.03 2.69-1.5 3.69-2.98 1.16-1.71 1.64-3.36 1.67-3.45-.04-.02-3.21-1.23-3.24-4.94zM14.13 3.4c.84-1.02 1.41-2.43 1.25-3.84-1.21.05-2.69.81-3.56 1.83-.78.9-1.47 2.34-1.29 3.72 1.36.1 2.74-.69 3.6-1.71z"/>
                </svg>
                Continue with Apple
              </button>
            </div>
          </>
        )}

        {/* Task #860 — Terms acceptance at sign-up. Industry-standard
            inline microcopy under the signup CTA (no checkbox); applies
            to both the password "Continue/Verify & create" flow and the
            OAuth buttons on this screen. Customer-only — admin/partner
            consent is captured on the invite-accept page. Links open the
            public policy pages in a new tab. Inline-link treatment:
            inherit color at rest, brand-blue + underline on hover. */}
        {!isAdmin && mode === "register" && step !== "exists" && (
          <p className="mt-5 text-center text-xs leading-relaxed text-white/40" data-testid="text-terms-consent">
            By continuing, you agree to our{" "}
            <a
              href={TERMS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 transition-colors hover:text-[color:var(--brand-blue)] hover:underline"
              data-testid="link-terms"
            >
              Terms
            </a>{" "}
            and{" "}
            <a
              href={PRIVACY_POLICY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 transition-colors hover:text-[color:var(--brand-blue)] hover:underline"
              data-testid="link-privacy"
            >
              Privacy Policy
            </a>
            .
          </p>
        )}
      </div>
      {!isAdmin && (
        <p className={s.footer} style={{ color: "rgba(255,255,255,0.22)" }}>
          GoodTunes® and GoodDeed® are registered trademarks of GoGoods® Inc. Patent pending. All other trademarks are the property of their respective owners.
        </p>
      )}
    </main>
  );
}
