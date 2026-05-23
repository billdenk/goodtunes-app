import { useState } from "react";
import { useLocation } from "wouter";
import gtLogo from "@assets/2025_GoodTunes_Logo-dark.1_1778271422870.png";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/admin/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
    } catch {
      // Neutral UX — show the same confirmation whether the request
      // succeeded or quietly failed. The endpoint is intentionally
      // non-enumerating, so the client should be too.
    }
    setSent(true);
    setSubmitting(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8" data-testid="page-forgot-password">
        <img src={gtLogo} alt="GoodTunes" className="h-10 w-auto mb-6" />
        {sent ? (
          <>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h1>
            <p className="text-sm text-slate-600 mb-6" data-testid="text-forgot-confirm">
              If an admin account exists for <span className="font-semibold">{email.trim() || "that address"}</span>, a reset link is on its way. It expires in 30 minutes.
            </p>
            <button
              type="button"
              onClick={() => navigate("/admin/login")}
              className="w-full bg-[var(--brand-blue)] hover:bg-[var(--brand-blue-hover)] text-white font-semibold rounded-lg py-2.5 transition-colors"
              data-testid="button-back-to-login"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} data-testid="form-forgot-password">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Forgot your password?</h1>
            <p className="text-sm text-slate-600 mb-6">
              Enter the email on your GoodTunes admin account and we'll send you a link to choose a new one.
            </p>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Email</label>
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
              className="w-full px-3 py-2.5 mb-6 rounded-lg border border-slate-300 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
              data-testid="input-forgot-email"
            />
            <button
              type="submit"
              disabled={submitting || !EMAIL_RE.test(email.trim())}
              className="w-full bg-[var(--brand-blue)] hover:bg-[var(--brand-blue-hover)] disabled:bg-slate-300 text-white font-semibold rounded-lg py-2.5 transition-colors"
              data-testid="button-submit-forgot"
            >
              {submitting ? "Sending…" : "Send reset link"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/login")}
              className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700"
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
