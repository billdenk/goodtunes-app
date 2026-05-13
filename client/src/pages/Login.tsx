import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { GoodTunesLogo } from "@/components/GoodTunesLogo";
import { useToast } from "@/hooks/use-toast";

type Mode = "login" | "register";
type Step = 1 | 2;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());
const isValidPassword = (v: string) => v.length >= 8 && /[a-zA-Z]/.test(v) && /\d/.test(v);

function suggestUsername(realName: string, email: string): string {
  const base =
    realName
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .replace(/\s+/g, "") ||
    email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "";
  return base.slice(0, 20);
}

function suggestDisplayName(realName: string): string {
  const first = realName.trim().split(/\s+/)[0] ?? "";
  return first || realName.trim();
}

export function Login() {
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

  const { login, register, isLoginPending, isRegisterPending, loginError, registerError } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const suggestedUsername = useMemo(() => suggestUsername(realName, email), [realName, email]);
  const suggestedDisplay = useMemo(() => suggestDisplayName(realName), [realName]);

  const loginValid = loginIdent.trim().length > 0 && password.length > 0;
  const step1Valid =
    realName.trim().length > 0 && isValidEmail(email) && isValidPassword(password);
  const finalUsernameLive = (usernameTouched ? username : suggestedUsername)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  const finalDisplayLive = (displayTouched ? displayName : suggestedDisplay).trim();
  const step2Valid = finalUsernameLive.length >= 3 && finalDisplayLive.length > 0;

  const handleOAuth = (provider: "Google" | "Apple") => {
    toast({
      title: `Continue with ${provider}`,
      description: "Coming soon — single sign-on is on the way.",
    });
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setStep(1);
  };

  const goToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!step1Valid) return;
    setUsername(suggestedUsername);
    setDisplayName(suggestedDisplay);
    setStep(2);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalUsername = (usernameTouched ? username : suggestedUsername).toLowerCase().replace(/[^a-z0-9_]/g, "");
    const finalDisplay = (displayTouched ? displayName : suggestedDisplay).trim();
    if (!finalUsername || !finalDisplay) return;
    try {
      await register({
        username: finalUsername,
        email: email.trim(),
        displayName: finalDisplay,
        realName: realName.trim(),
        password,
      });
      navigate("/collection");
    } catch {}
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ username: loginIdent.trim(), password });
      navigate("/collection");
    } catch {}
  };

  const isPending = mode === "login" ? isLoginPending : isRegisterPending;
  const error = mode === "login" ? loginError : registerError;

  return (
    <main className="min-h-screen w-full bg-[#00062B] flex justify-center items-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-25" style={{ background: "radial-gradient(circle, #319ED8, transparent)" }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #7F10A7, transparent)" }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #4AFFCA, transparent)" }} />
      </div>

      <div className="relative w-full max-w-[390px] px-6">
        <div className="flex flex-col items-center mb-10">
          <GoodTunesLogo size="lg" className="mb-4" />
          <p className="text-white/40 text-sm text-center mt-3">
            {mode === "login"
              ? "Sign in to access your collection."
              : step === 1
              ? "Create your account to get started."
              : "Pick how you'll appear in GoodTunes®."}
          </p>
        </div>

        <div className="relative flex mb-6 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.07)" }}>
          <div
            className="absolute top-1 bottom-1 rounded-xl transition-all duration-200"
            style={{
              width: "calc(50% - 4px)",
              left: mode === "login" ? "4px" : "calc(50%)",
              background: "rgba(255,255,255,0.15)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
            }}
          />
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`relative flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150 ${mode === "login" ? "text-white" : "text-white/35"}`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode("register")}
            className={`relative flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150 ${mode === "register" ? "text-white" : "text-white/35"}`}
          >
            Create Account
          </button>
        </div>

        {mode === "register" && (
          <div className="flex items-center justify-center gap-2 mb-5">
            <div className={`h-1 w-10 rounded-full ${step === 1 ? "bg-[#319ED8]" : "bg-white/15"}`} />
            <div className={`h-1 w-10 rounded-full ${step === 2 ? "bg-[#319ED8]" : "bg-white/15"}`} />
            <span className="text-white/40 text-[11px] ml-2">Step {step} of 2</span>
          </div>
        )}

        {mode === "login" && (
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <div>
              <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1">Username</label>
              <input
                type="text"
                value={loginIdent}
                onChange={(e) => setLoginIdent(e.target.value.toLowerCase().replace(/\s/g, ""))}
                placeholder="@username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8] transition-colors"
                style={{ background: "rgba(255,255,255,0.06)" }}
                required
                data-testid="input-login-username"
              />
            </div>
            <div>
              <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8] transition-colors"
                style={{ background: "rgba(255,255,255,0.06)" }}
                required
                data-testid="input-login-password"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={isPending || !loginValid}
              className="mt-2 py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
              data-testid="button-submit-login"
            >
              {isPending ? "Signing in..." : "Sign In"}
            </button>
          </form>
        )}

        {mode === "register" && step === 1 && (
          <form onSubmit={goToStep2} className="flex flex-col gap-3">
            <div>
              <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1">Name</label>
              <input
                type="text"
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                placeholder="Tina Banner"
                autoComplete="name"
                className="w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8] transition-colors"
                style={{ background: "rgba(255,255,255,0.06)" }}
                required
                data-testid="input-real-name"
              />
            </div>
            <div>
              <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8] transition-colors"
                style={{ background: "rgba(255,255,255,0.06)" }}
                required
                data-testid="input-email"
              />
            </div>
            <div>
              <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={8}
                className="w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8] transition-colors"
                style={{ background: "rgba(255,255,255,0.06)" }}
                required
                data-testid="input-password"
              />
              <p className={`text-[11px] mt-1.5 ml-1 ${password.length === 0 ? "text-white/35" : isValidPassword(password) ? "text-[#4AFFCA]" : "text-white/55"}`}>
                At least 8 characters with a letter and a number.
              </p>
            </div>

            <button
              type="submit"
              disabled={!step1Valid}
              className="mt-2 py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
              data-testid="button-continue-step1"
            >
              Continue
            </button>
          </form>
        )}

        {mode === "register" && step === 2 && (
          <form onSubmit={handleRegister} className="flex flex-col gap-3">
            <div>
              <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1">Username</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">@</span>
                <input
                  type="text"
                  value={usernameTouched ? username : suggestedUsername}
                  onChange={(e) => {
                    setUsernameTouched(true);
                    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                  }}
                  placeholder="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full border border-white/10 rounded-2xl pl-9 pr-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8] transition-colors"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                  required
                  data-testid="input-username"
                />
              </div>
              <p className="text-white/35 text-[11px] mt-1.5 ml-1">Your unique handle. You can share GoodDeeds® as @{usernameTouched ? username || "username" : suggestedUsername}.</p>
            </div>
            <div>
              <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1">Display Name</label>
              <input
                type="text"
                value={displayTouched ? displayName : suggestedDisplay}
                onChange={(e) => {
                  setDisplayTouched(true);
                  setDisplayName(e.target.value);
                }}
                placeholder="What friends call you"
                autoComplete="off"
                className="w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8] transition-colors"
                style={{ background: "rgba(255,255,255,0.06)" }}
                required
                data-testid="input-display-name"
              />
              <p className="text-white/35 text-[11px] mt-1.5 ml-1">Shown across the app and on shared GoodDeeds® by default.</p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
            )}

            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                aria-label="Back"
                className="w-14 h-14 shrink-0 rounded-full flex items-center justify-center text-white/85 hover:text-white active:scale-[0.94] transition-all"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)" }}
                data-testid="button-back-step2"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                type="submit"
                disabled={isPending || !step2Valid}
                className="flex-1 py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
                data-testid="button-submit-register"
              >
                {isPending ? "Creating account..." : "Create Account"}
              </button>
            </div>
          </form>
        )}

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-white/15" />
          <span className="text-white/40 text-xs">or</span>
          <div className="flex-1 h-px bg-white/15" />
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => handleOAuth("Google")}
            className="w-full py-3.5 rounded-full bg-white text-[#0f0f0f] text-sm font-semibold flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform"
            data-testid="button-google-signin"
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.5 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C40.9 36.4 44 30.7 44 24c0-1.3-.1-2.4-.4-3.5z"/>
            </svg>
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => handleOAuth("Apple")}
            className="w-full py-3.5 rounded-full bg-white text-[#0f0f0f] text-sm font-semibold flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform"
            data-testid="button-apple-signin"
          >
            <svg width="16" height="18" viewBox="0 0 24 24" fill="#0f0f0f">
              <path d="M17.05 12.04c-.03-3.02 2.47-4.49 2.58-4.56-1.41-2.06-3.6-2.34-4.38-2.37-1.86-.19-3.64 1.1-4.59 1.1-.96 0-2.42-1.07-3.98-1.04-2.05.03-3.95 1.19-5 3.02-2.13 3.7-.55 9.17 1.53 12.18 1.02 1.47 2.23 3.13 3.81 3.07 1.53-.06 2.11-.99 3.96-.99 1.85 0 2.37.99 3.99.96 1.65-.03 2.69-1.5 3.69-2.98 1.16-1.71 1.64-3.36 1.67-3.45-.04-.02-3.21-1.23-3.24-4.94zM14.13 3.4c.84-1.02 1.41-2.43 1.25-3.84-1.21.05-2.69.81-3.56 1.83-.78.9-1.47 2.34-1.29 3.72 1.36.1 2.74-.69 3.6-1.71z"/>
            </svg>
            Continue with Apple
          </button>
        </div>

        <p className="text-center text-white/30 text-[10px] mt-6 leading-snug px-4">
          GoodTunes® and GoodDeed® are registered trademarks of GoGoods® Inc. Patent pending. All other trademarks are the property of their respective owners.
        </p>
      </div>
    </main>
  );
}
