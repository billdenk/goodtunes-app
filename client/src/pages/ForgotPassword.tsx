import { useState } from "react";
import { useLocation } from "wouter";
import { useAuthKind } from "@/hooks/useAuthKind";
import gtLogo from "@assets/2025_GoodTunes_Logo-dark.1_1778271422870.png";
import { GoodTunesLogo } from "@/components/GoodTunesLogo";
import { ADMIN_CHROME } from "./authChrome";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Single component for both shells:
//   /admin/forgot-password  → light admin chrome,  POST /api/admin/auth/forgot-password
//   /forgot-password        → dark player chrome,  POST /api/auth/forgot-password
export default function ForgotPassword() {
  const kind = useAuthKind();
  const isAdmin = kind === "admin";
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const endpoint = isAdmin ? "/api/admin/auth/forgot-password" : "/api/auth/forgot-password";
  const loginPath = isAdmin ? "/admin/login" : "/login";
  const productLabel = isAdmin ? "GoodTunes admin account" : "GoodTunes account";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
    } catch {
      // Neutral UX — same confirmation whether the request succeeded
      // or quietly failed (endpoint is non-enumerating by design).
    }
    setSent(true);
    setSubmitting(false);
  }

  if (isAdmin) {
    const s = ADMIN_CHROME;
    return (
      <main className={s.page}>
        <div className={s.card} data-testid="page-forgot-password">
          <img src={gtLogo} alt="GoodTunes" className="h-10 w-auto mb-6" />
          {sent ? (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h1>
              <p className="text-sm text-slate-600 mb-6" data-testid="text-forgot-confirm">
                If an admin account exists for <span className="font-semibold">{email.trim() || "that address"}</span>, a reset link is on its way. It expires in 30 minutes.
              </p>
              <button
                type="button"
                onClick={() => navigate(loginPath)}
                className={s.primaryBtn}
                data-testid="button-back-to-login"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} data-testid="form-forgot-password">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Forgot your password?</h1>
              <p className="text-sm text-slate-600 mb-6">
                Enter the email on your {productLabel} and we'll send you a link to choose a new one.
              </p>
              <label className={s.label}>Email</label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                className={`${s.input} gt-admin-autofill mb-4`}
                data-testid="input-forgot-email"
              />
              <button
                type="submit"
                disabled={submitting || !EMAIL_RE.test(email.trim())}
                className={s.primaryBtn}
                data-testid="button-submit-forgot"
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>
              <button
                type="button"
                onClick={() => navigate(loginPath)}
                className={s.ghostBtn}
                data-testid="link-back-to-login"
              >
                ← Back to sign in
              </button>
            </form>
          )}
        </div>
      </main>
    );
  }

  // Customer (dark player) chrome
  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center gap-10 py-10 px-4">
      <div className="relative w-full max-w-[390px] px-6" data-testid="page-forgot-password">
        <div className="flex flex-col items-center mb-6"><GoodTunesLogo size="lg" variant="white" /></div>
        {sent ? (
          <>
            <h1 className="text-2xl font-bold text-white text-center mb-2">Check your email</h1>
            <p className="text-white/55 text-sm text-center mb-6" data-testid="text-forgot-confirm">
              If a GoodTunes account exists for <span className="font-semibold text-white/85">{email.trim() || "that address"}</span>, a reset link is on its way. It expires in 30 minutes.
            </p>
            <button
              type="button"
              onClick={() => navigate(loginPath)}
              className="mt-2 w-full py-4 rounded-2xl font-semibold text-base text-white transition-all active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #1D5E8F, var(--brand-blue))" }}
              data-testid="button-back-to-login"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} data-testid="form-forgot-password">
            <h1 className="text-2xl font-bold text-white text-center mb-2">Forgot your password?</h1>
            <p className="text-white/55 text-sm text-center mb-6">
              Enter the email on your {productLabel} and we'll send you a link to choose a new one.
            </p>
            <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[var(--brand-blue)] transition-colors mb-4"
              style={{ background: "rgba(255,255,255,0.06)" }}
              data-testid="input-forgot-email"
            />
            <button
              type="submit"
              disabled={submitting || !EMAIL_RE.test(email.trim())}
              className="mt-2 w-full py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #1D5E8F, var(--brand-blue))" }}
              data-testid="button-submit-forgot"
            >
              {submitting ? "Sending…" : "Send reset link"}
            </button>
            <button
              type="button"
              onClick={() => navigate(loginPath)}
              className="mt-4 w-full text-white/55 text-sm hover:text-white"
              data-testid="link-back-to-login"
            >
              ← Back to sign in
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
