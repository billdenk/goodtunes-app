import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAuthKind } from "@/hooks/useAuthKind";
import { useLocation } from "wouter";
import { GoodTunesLogo } from "@/components/GoodTunesLogo";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, setAuthToken, queryClient } from "@/lib/queryClient";

type Mode = "login" | "register";
// Step 1: name/email/password (admin) or email+password (customer).
// Step 2: username/displayName (admin only — customer skips and gets a
//         server-suggested handle from the email local-part).
// Step "verify": 6-digit email code (customer only — the Task #44 gate
//         that proves email ownership before the password sticks).
type Step = 1 | 2 | "verify";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());
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
type AdminPhase = "password" | "totp" | "enroll";

// ─── Chrome styles ────────────────────────────────────────────────
// Two variants — admin (white card on slate bg, h-9 controls, slate
// borders) and customer (dark glass on #00062B, rounded-2xl, white/15
// scrims). The customer branch matches the production fan-player look
// pixel-for-pixel; the admin branch matches the rest of the CMS.
type Chrome = {
  page: string;
  card: string;
  subtitle: string;
  label: string;
  input: string;
  inputCenter: string;
  hint: string;
  primaryBtn: string;
  primaryBtnStyle?: React.CSSProperties;
  ghostBtn: string;
  segmentedWrap: string;
  segmentedThumbClass: string;
  segmentedThumbStyle: (mode: Mode) => React.CSSProperties;
  segmentedBtn: (active: boolean) => string;
  oauthBtn: string;
  oauthIcon: { googleW: number; googleH: number; appleW: number; appleH: number; appleFill: string };
  divider: string;
  dividerText: string;
  step1Tick: (on: boolean) => string;
  step2Tick: (on: boolean) => string;
  stepLabel: string;
  errorBox: string;
  totpErr: string;
  qrFrame: string;
  recoveryWrap: string;
  recoveryItem: string;
  backChip: string;
  backChevronSize: number;
  footer: string;
};

const ADMIN_CHROME: Chrome = {
  page: "min-h-screen w-full flex justify-center items-center bg-slate-50",
  card: "relative w-full max-w-[400px] px-6 py-8 bg-white rounded-xl border border-slate-200 shadow-sm",
  subtitle: "mt-3 text-slate-500 text-[13px] text-center",
  label: "text-slate-600 text-[11px] font-semibold uppercase tracking-wider block mb-1.5",
  input:
    "w-full h-9 border border-slate-300 rounded-md px-3 text-slate-900 placeholder-slate-400 text-sm bg-white focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8] transition-colors",
  inputCenter:
    "w-full h-10 border border-slate-300 rounded-md px-3 text-slate-900 text-center text-lg tracking-widest bg-white focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8]",
  hint: "text-slate-500 text-[11px] mt-1.5",
  primaryBtn:
    "mt-3 w-full h-9 rounded-md font-medium text-sm text-white bg-[#319ED8] hover:bg-[#2a8cc1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.98]",
  ghostBtn: "mt-3 w-full text-slate-500 text-sm hover:text-slate-700",
  segmentedWrap: "relative flex mb-6 p-0.5 rounded-md bg-slate-100",
  segmentedThumbClass: "absolute top-0.5 bottom-0.5 rounded-[5px] transition-all duration-200",
  segmentedThumbStyle: (mode) => ({
    width: "calc(50% - 2px)",
    left: mode === "login" ? "2px" : "calc(50%)",
    background: "white",
    boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
  }),
  segmentedBtn: (active) =>
    `relative flex-1 py-1.5 rounded-[5px] text-sm font-medium transition-colors duration-150 ${active ? "text-slate-900" : "text-slate-500"}`,
  oauthBtn:
    "w-full h-9 rounded-md border border-slate-300 bg-white text-slate-700 text-sm font-medium flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-[0.98] transition-all",
  oauthIcon: { googleW: 16, googleH: 16, appleW: 14, appleH: 16, appleFill: "currentColor" },
  divider: "flex-1 h-px bg-slate-200",
  dividerText: "text-slate-400 text-xs",
  step1Tick: (on) => `h-1 w-10 rounded-full ${on ? "bg-[#319ED8]" : "bg-slate-200"}`,
  step2Tick: (on) => `h-1 w-10 rounded-full ${on ? "bg-[#319ED8]" : "bg-slate-200"}`,
  stepLabel: "text-slate-400 text-[11px] ml-2",
  errorBox: "bg-red-50 border border-red-200 rounded-md px-3 py-2 text-red-600 text-sm",
  totpErr: "text-red-600 text-sm mt-2",
  qrFrame: "w-48 h-48 rounded-lg bg-white border border-slate-200 p-2",
  recoveryWrap: "mt-6 rounded-md p-4 border border-slate-200 bg-slate-50",
  recoveryItem: "px-2 py-1 rounded bg-white border border-slate-200",
  backChip:
    "w-9 h-9 shrink-0 rounded-md flex items-center justify-center text-slate-600 hover:text-slate-900 border border-slate-300 bg-white active:scale-[0.94] transition-all",
  backChevronSize: 18,
  footer: "",
};

const CUSTOMER_CHROME: Chrome = {
  page: "min-h-screen w-full flex justify-center items-center",
  card: "relative w-full max-w-[390px] px-6",
  subtitle: "mt-3 text-white/55 text-[13px] text-center",
  label: "text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1",
  input:
    "w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8] transition-colors",
  inputCenter:
    "w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white text-center text-lg tracking-widest focus:outline-none focus:border-[#319ED8]",
  hint: "text-white/35 text-[11px] mt-1.5 ml-1",
  primaryBtn:
    "mt-2 py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]",
  primaryBtnStyle: { background: "linear-gradient(135deg, #1D5E8F, #319ED8)" },
  ghostBtn: "mt-3 w-full text-white/55 text-sm hover:text-white",
  segmentedWrap: "relative flex mb-6 p-1 rounded-2xl",
  segmentedThumbClass: "absolute top-1 bottom-1 rounded-xl transition-all duration-200",
  segmentedThumbStyle: (mode) => ({
    width: "calc(50% - 4px)",
    left: mode === "login" ? "4px" : "calc(50%)",
    background: "rgba(255,255,255,0.15)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
  }),
  segmentedBtn: (active) =>
    `relative flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150 ${active ? "text-white" : "text-white/35"}`,
  oauthBtn:
    "w-full py-3.5 rounded-full bg-white text-[#0f0f0f] text-sm font-semibold flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform",
  oauthIcon: { googleW: 18, googleH: 18, appleW: 16, appleH: 18, appleFill: "#0f0f0f" },
  divider: "flex-1 h-px bg-white/15",
  dividerText: "text-white/40 text-xs",
  step1Tick: (on) => `h-1 w-10 rounded-full ${on ? "bg-[#319ED8]" : "bg-white/15"}`,
  step2Tick: (on) => `h-1 w-10 rounded-full ${on ? "bg-[#319ED8]" : "bg-white/15"}`,
  stepLabel: "text-white/40 text-[11px] ml-2",
  errorBox: "bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm",
  totpErr: "text-red-400 text-sm mt-2",
  qrFrame: "w-48 h-48 rounded-2xl bg-white p-2",
  recoveryWrap: "mt-6 rounded-2xl p-4",
  recoveryItem: "px-2 py-1 rounded bg-white/10",
  backChip:
    "w-14 h-14 shrink-0 rounded-full flex items-center justify-center text-white/85 hover:text-white active:scale-[0.94] transition-all",
  backChevronSize: 20,
  footer: "absolute bottom-6 left-0 right-0 text-center text-[10px] leading-snug px-8",
};

// Inputs use bg via style on customer variant (translucent), but plain
// className on admin (white). Helper so the JSX stays clean.
const inputBgStyle = (kind: "admin" | "customer"): React.CSSProperties | undefined =>
  kind === "customer" ? { background: "rgba(255,255,255,0.06)" } : undefined;

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
  useEffect(() => {
    // Any change to the email clears the previous answer so a stale
    // OAuth-swap state can't strand a fan on the wrong provider.
    setLookupProvider(null);
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
      toast({
        title: "Account exists",
        description: `An account with ${emailQ} already exists. Sign in with your password, then link ${provider} from your profile.`,
      });
      setLoginIdent(emailQ);
      setMode("login");
      window.history.replaceState({}, "", loginPath);
    }
    if (oauth && (next === "totp" || next === "enroll")) {
      setAdminPhase(next === "enroll" ? "enroll" : "totp");
      window.history.replaceState({}, "", loginPath);
    }
    if (window.location.hash.startsWith("#token=")) {
      const token = decodeURIComponent(window.location.hash.slice("#token=".length));
      setAuthToken(token);
      window.history.replaceState({}, "", "/account");
      queryClient.invalidateQueries();
      navigate("/account");
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

  const switchMode = (m: Mode) => { setMode(m); setStep(1); setVerifyCode(""); setVerifyError(null); setVerifyToken(null); };

  // Customer-side email verification state. The 6-digit code is sent to
  // the email entered on step 1; on confirm we trade it for a short-
  // lived `verifyToken` the signup-with-code endpoint consumes.
  // Admin-side users never see this path.
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const startCustomerVerify = async () => {
    setVerifyBusy(true); setVerifyError(null); setDevCode(null);
    try {
      const res = await apiRequest("POST", "/api/email-verifications/start", { email: email.trim() });
      const j = await res.json();
      if (j.devCode) setDevCode(String(j.devCode));
      setStep("verify");
    } catch (e: any) {
      setVerifyError(e?.message ?? "Couldn't send a code — check the email and try again");
    } finally {
      setVerifyBusy(false);
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
      queryClient.invalidateQueries();
      // Land in the player at the next URL if one was set (Buy flow
      // sets ?next=/album/<id>), otherwise the standard /account home.
      const next = new URL(window.location.href).searchParams.get("next") || "/account";
      navigate(next);
    } catch (e: any) {
      setVerifyError(e?.message ?? "That code didn't match");
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleOAuth = (provider: "google" | "apple") => {
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

  const finishCustomer = () => {
    queryClient.invalidateQueries();
    navigate(isAdmin ? "/admin" : "/account");
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
      } else if (result?.token) {
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
      queryClient.invalidateQueries();
      navigate("/admin");
    } catch (e: any) {
      setTotpError(e?.message ?? "Code didn't match");
    } finally {
      setSubmitting(false);
    }
  };

  const submitEnrollVerify = async () => {
    setSubmitting(true); setTotpError(null);
    try {
      const res = await apiRequest("POST", "/api/auth/totp/enroll/verify", { code: totpCode.trim() });
      const j = await res.json();
      if (j.token) setAuthToken(j.token);
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
              <p className={`${isAdmin ? "text-slate-400" : "text-white/45"} text-[11px] text-center mb-4 break-all`}>
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
                <p className={`${isAdmin ? "text-slate-500" : "text-white/55"} text-[12px] mb-3`}>Save these somewhere safe. Each works once if you lose your authenticator.</p>
                <div className={`grid grid-cols-2 gap-2 font-mono ${isAdmin ? "text-slate-800" : "text-white"} text-[13px]`}>
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

        <div
          className={s.segmentedWrap}
          style={isAdmin ? undefined : { background: "rgba(255,255,255,0.07)" }}
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

        {mode === "register" && (
          <div className="flex items-center justify-center gap-2 mb-5">
            <div className={s.step1Tick(step === 1)} />
            <div className={s.step2Tick(step === 2)} />
            <span className={s.stepLabel}>Step {step} of 2</span>
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
                  <label className={s.label}>Password</label>
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
              </>
            )}
          </form>
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
              <p className={`text-[11px] mt-1.5 ${isAdmin ? "ml-0" : "ml-1"} ${
                password.length === 0
                  ? (isAdmin ? "text-slate-400" : "text-white/35")
                  : isValidPassword(password)
                    ? (isAdmin ? "text-emerald-600" : "text-[#4AFFCA]")
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
              <div className={`text-[11px] ${isAdmin ? "text-slate-500" : "text-white/55"}`}>
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
            {verifyError && <div className={s.errorBox} data-testid="text-verify-error">{verifyError}</div>}
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => { setStep(1); setVerifyError(null); }}
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

        {!(mode === "register" && (step === 2 || step === "verify")) && (
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
      </div>
      {!isAdmin && (
        <p className={s.footer} style={{ color: "rgba(255,255,255,0.22)" }}>
          GoodTunes® and GoodDeed® are registered trademarks of GoGoods® Inc. Patent pending. All other trademarks are the property of their respective owners.
        </p>
      )}
    </main>
  );
}
