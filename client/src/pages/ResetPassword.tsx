import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuthKind } from "@/hooks/useAuthKind";
import gtLogo from "@assets/2025_GoodTunes_Logo-dark.1_1778271422870.png";
import { GoodTunesLogo } from "@/components/GoodTunesLogo";
import { ADMIN_CHROME } from "./authChrome";

const isValidPassword = (v: string) => v.length >= 8 && /[a-zA-Z]/.test(v) && /\d/.test(v);

// Single component for both shells:
//   /admin/reset-password/:token  → light admin chrome,  /api/admin/auth/reset-password
//   /reset-password/:token        → dark player chrome,  /api/auth/reset-password
export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const kind = useAuthKind();
  const isAdmin = kind === "admin";

  const apiBase = isAdmin ? "/api/admin/auth/reset-password" : "/api/auth/reset-password";
  const forgotPath = isAdmin ? "/admin/forgot-password" : "/forgot-password";
  const loginPath = isAdmin ? "/admin/login" : "/login";

  const { data, isLoading, error } = useQuery<{ ok: boolean; email?: string }>({
    queryKey: [apiBase, token],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/${token}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({ message: "This reset link is invalid or has expired." }));
        throw new Error(j.message || "This reset link is invalid or has expired.");
      }
      return r.json();
    },
    retry: false,
  });

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrMsg(null);
    if (!isValidPassword(password)) {
      setErrMsg("Pick a password with at least 8 characters, a letter, and a number.");
      return;
    }
    if (password !== confirm) {
      setErrMsg("The two passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, newPassword: password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || "Could not reset your password.");
      setDone(true);
    } catch (e: any) {
      setErrMsg(e.message || "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (isAdmin) {
    const s = ADMIN_CHROME;
    if (isLoading) {
      return (
        <main className={s.page}>
          <div className="text-slate-500">Checking link…</div>
        </main>
      );
    }
    if (error || !data?.ok) {
      return (
        <main className={s.page}>
          <div className={`${s.card} text-center`} data-testid="reset-invalid">
            <img src={gtLogo} alt="GoodTunes" className="h-10 w-auto mx-auto mb-6" />
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Reset link unavailable</h1>
            <p className="text-sm text-slate-600">{(error as Error)?.message || "This reset link is invalid or has expired."}</p>
            <button
              type="button"
              onClick={() => navigate(forgotPath)}
              className={`${s.ghostBtn} font-semibold`}
              data-testid="link-request-new"
            >
              Request a new link →
            </button>
          </div>
        </main>
      );
    }
    if (done) {
      return (
        <main className={s.page}>
          <div className={`${s.card} text-center`} data-testid="reset-done">
            <img src={gtLogo} alt="GoodTunes" className="h-10 w-auto mx-auto mb-6" />
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Password updated</h1>
            <p className="text-sm text-slate-600 mb-6">
              Sign in with your new password — you'll still need your authenticator (or email code) to finish.
            </p>
            <button
              type="button"
              onClick={() => navigate(loginPath)}
              className={s.primaryBtn}
              data-testid="button-go-sign-in"
            >
              Go to sign in
            </button>
          </div>
        </main>
      );
    }
    // Password-manager binding: render a real <form method="post" action>
    // and a hidden, readonly username input above the password fields tied
    // to the admin's email (returned by the reset-token validation). Chrome
    // / Safari / 1Password need both an identity AND a `new-password`
    // autocomplete to file the new credential away — without the username
    // they can't bind the save to anyone, so /admin/login never offers it.
    return (
      <main className={s.page}>
        <form
          onSubmit={handleSubmit}
          method="post"
          action={apiBase}
          className={s.card}
          data-testid="form-reset-password"
        >
          <img src={gtLogo} alt="GoodTunes" className="h-10 w-auto mb-6" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Choose a new password</h1>
          <p className="text-sm text-slate-600 mb-6">
            Pick something at least 8 characters long with a letter and a number.
          </p>
          {data?.email && (
            <input
              type="email"
              name="username"
              autoComplete="username"
              value={data.email}
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              style={{ position: "absolute", opacity: 0, pointerEvents: "none", height: 0, width: 0 }}
              data-testid="input-reset-username"
            />
          )}
          <label className={s.label}>New password</label>
          <input
            type="password" name="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoFocus autoComplete="new-password"
            className={`${s.input} gt-admin-autofill mb-4`}
            data-testid="input-new-password"
          />
          <label className={s.label}>Confirm new password</label>
          <input
            type="password" name="confirm-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password"
            className={`${s.input} gt-admin-autofill mb-4`}
            data-testid="input-confirm-password"
          />
          {errMsg && (
            <div className={`${s.errorBox} mb-4`} data-testid="reset-error">
              {errMsg}
            </div>
          )}
          <button
            type="submit" disabled={submitting}
            className={s.primaryBtn}
            data-testid="button-submit-reset"
          >
            {submitting ? "Updating…" : "Reset password"}
          </button>
          <p className="mt-4 text-xs text-slate-500 text-center">
            You'll still need your authenticator (or email code) to sign in after this.
          </p>
        </form>
      </main>
    );
  }

  // ─── Customer (dark player) chrome ────────────────────────────────
  if (isLoading) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center p-6">
        <div className="text-white/55">Checking link…</div>
      </main>
    );
  }
  if (error || !data?.ok) {
    return (
      <main className="min-h-screen w-full flex flex-col items-center justify-center gap-10 py-10 px-4">
        <div className="relative w-full max-w-[390px] px-6 text-center" data-testid="reset-invalid">
          <div className="flex flex-col items-center mb-6"><GoodTunesLogo size="lg" variant="white" /></div>
          <h1 className="text-xl font-semibold text-white mb-2">Reset link unavailable</h1>
          <p className="text-sm text-white/55">{(error as Error)?.message || "This reset link is invalid or has expired."}</p>
          <button
            type="button"
            onClick={() => navigate(forgotPath)}
            className="mt-6 text-sm font-semibold text-[var(--brand-mint)] hover:underline"
            data-testid="link-request-new"
          >
            Request a new link →
          </button>
        </div>
      </main>
    );
  }
  if (done) {
    return (
      <main className="min-h-screen w-full flex flex-col items-center justify-center gap-10 py-10 px-4">
        <div className="relative w-full max-w-[390px] px-6 text-center" data-testid="reset-done">
          <div className="flex flex-col items-center mb-6"><GoodTunesLogo size="lg" variant="white" /></div>
          <h1 className="text-xl font-semibold text-white mb-2">Password updated</h1>
          <p className="text-sm text-white/55 mb-6">
            Sign in with your new password and you're back in.
          </p>
          <button
            type="button"
            onClick={() => navigate(loginPath)}
            className="mt-2 w-full py-4 rounded-2xl font-semibold text-base text-white transition-all active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #1D5E8F, var(--brand-blue))" }}
            data-testid="button-go-sign-in"
          >
            Go to sign in
          </button>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center gap-10 py-10 px-4">
      <form onSubmit={handleSubmit} className="relative w-full max-w-[390px] px-6" data-testid="form-reset-password">
        <div className="flex flex-col items-center mb-6"><GoodTunesLogo size="lg" variant="white" /></div>
        <h1 className="text-2xl font-bold text-white text-center mb-2">Choose a new password</h1>
        <p className="text-white/55 text-sm text-center mb-6">
          Pick something at least 8 characters long with a letter and a number.
        </p>
        <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1">New password</label>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoFocus autoComplete="new-password"
          className="w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[var(--brand-blue)] transition-colors mb-4"
          style={{ background: "rgba(255,255,255,0.06)" }}
          data-testid="input-new-password"
        />
        <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-1.5 ml-1">Confirm new password</label>
        <input
          type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password"
          className="w-full border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[var(--brand-blue)] transition-colors mb-4"
          style={{ background: "rgba(255,255,255,0.06)" }}
          data-testid="input-confirm-password"
        />
        {errMsg && (
          <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3" data-testid="reset-error">
            {errMsg}
          </div>
        )}
        <button
          type="submit" disabled={submitting}
          className="mt-2 w-full py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #1D5E8F, var(--brand-blue))" }}
          data-testid="button-submit-reset"
        >
          {submitting ? "Updating…" : "Reset password"}
        </button>
      </form>
    </main>
  );
}
