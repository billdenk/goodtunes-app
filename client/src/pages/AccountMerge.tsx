// Task #400 — Account merge confirmation landing.
// Task #409 — Two-step preview: show what would move before confirming.
//
// The fan tapped "These two accounts are me" on their profile while
// signed in as the surviving account. We emailed a confirmation link
// to the *other* address; clicking it lands here.
//
// Step 1 — GET /api/me/welcome-back/merge/preview reads the move
//          counts (albums / orders / playlists) and the losing email
//          *without* touching any data. The fan sees the impact and
//          chooses Confirm or Cancel.
// Step 2 — only on Confirm do we POST to merge/confirm to actually
//          reparent the rows. Cancel marks the token consumed so the
//          link is one-shot.
//
// The fan must already be signed in as the surviving account — if
// they're not, we send them to /login with a friendly explainer.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

type Phase = "loading" | "preview" | "confirming" | "cancelling" | "done" | "error" | "needs-signin";
type MovedCounts = { albums: number; orders: number; playlists: number };
type Preview = { losingEmail: string; counts: MovedCounts; alreadyMerged: boolean };

export function AccountMerge() {
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();
  const [phase, setPhase] = useState<Phase>("loading");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [moved, setMoved] = useState<MovedCounts | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [surviving, setSurviving] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const params = new URL(window.location.href).searchParams;
    const t = params.get("token");
    const s = params.get("surviving");
    if (!t || !s) {
      setErrorMsg("Missing merge link. Check the email and try again.");
      setPhase("error");
      return;
    }
    setToken(t);
    setSurviving(s);
    if (!user) {
      setPhase("needs-signin");
      return;
    }
    if (user.id !== s) {
      setErrorMsg(`Sign in as the account you're keeping (not ${user.email}) and re-open the email link.`);
      setPhase("error");
      return;
    }
    (async () => {
      try {
        const r = await apiRequest("GET", `/api/me/welcome-back/merge/preview?token=${encodeURIComponent(t)}`);
        const j = (await r.json()) as Preview;
        setPreview(j);
        if (j.alreadyMerged) {
          // Server already has an audit row for this exact merge —
          // surface the prior counts as success rather than asking
          // the fan to re-confirm a no-op.
          setMoved(j.counts);
          setPhase("done");
        } else {
          setPhase("preview");
        }
      } catch (e: any) {
        setErrorMsg(e?.message ?? "Couldn't load the merge preview.");
        setPhase("error");
      }
    })();
  }, [isLoading, user]);

  async function onConfirm() {
    if (!token || !surviving) return;
    setPhase("confirming");
    try {
      const r = await apiRequest("POST", "/api/me/welcome-back/merge/confirm", { token, surviving });
      const j = await r.json();
      setMoved(j.moved as MovedCounts);
      queryClient.invalidateQueries();
      setPhase("done");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Couldn't merge the accounts.");
      setPhase("error");
    }
  }

  async function onCancel() {
    if (!token) {
      navigate("/account");
      return;
    }
    setPhase("cancelling");
    try {
      await apiRequest("POST", "/api/me/welcome-back/merge/cancel", { token });
    } catch {
      // Cancel is best-effort — the token will still expire on its own.
    }
    navigate("/account");
  }

  const c = preview?.counts;
  const total = c ? c.albums + c.orders + c.playlists : 0;

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--brand-bg)] text-white px-6 py-12" data-testid="page-account-merge">
      <div className="w-full max-w-[440px] text-center">
        {(phase === "loading" || phase === "confirming" || phase === "cancelling") && (
          <>
            <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-[var(--brand-blue)] animate-spin mx-auto mb-4" />
            <div className="text-white/70 text-sm" data-testid="merge-status">
              {phase === "loading" ? "Loading…" : phase === "confirming" ? "Merging your accounts…" : "Cancelling…"}
            </div>
          </>
        )}
        {phase === "needs-signin" && (
          <>
            <h1 className="text-3xl font-bold mb-2">One more step.</h1>
            <p className="text-white/55 text-sm mb-6 leading-relaxed">
              Sign in as the account you want to keep first, then re-open the link from your inbox.
            </p>
            <button
              onClick={() => { sessionStorage.setItem("gt:postAuthNext", window.location.pathname + window.location.search); navigate("/login"); }}
              className="px-5 py-3 rounded-2xl font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #1D5E8F, var(--brand-blue))" }}
              data-testid="button-merge-signin"
            >
              Sign in
            </button>
          </>
        )}
        {phase === "preview" && preview && c && (
          <>
            <h1 className="text-3xl font-bold mb-2" data-testid="text-merge-preview-title">Merge these accounts?</h1>
            <p className="text-white/55 text-sm mb-6 leading-relaxed">
              We'll move everything from <strong data-testid="text-merge-losing-email">{preview.losingEmail}</strong> onto <strong>{user?.email}</strong>.
              {total === 0 ? " That other account is empty — nothing will move, but it'll be parked." : " The other email will be signed out and parked — sign in with this one from now on."}
            </p>
            <ul className="text-left bg-white/5 rounded-2xl px-5 py-4 mb-6 divide-y divide-white/10">
              <li className="flex justify-between py-2.5 text-sm" data-testid="row-merge-count-albums">
                <span className="text-white/70">Albums</span>
                <span className="font-semibold tabular-nums">{c.albums}</span>
              </li>
              <li className="flex justify-between py-2.5 text-sm" data-testid="row-merge-count-orders">
                <span className="text-white/70">Orders</span>
                <span className="font-semibold tabular-nums">{c.orders}</span>
              </li>
              <li className="flex justify-between py-2.5 text-sm" data-testid="row-merge-count-playlists">
                <span className="text-white/70">Playlists</span>
                <span className="font-semibold tabular-nums">{c.playlists}</span>
              </li>
            </ul>
            <button
              onClick={onConfirm}
              className="w-full py-3.5 rounded-2xl font-semibold text-white mb-3"
              style={{ background: "linear-gradient(135deg, #1D5E8F, var(--brand-blue))" }}
              data-testid="button-merge-confirm"
            >
              {total === 0 ? "Park the other account" : "Confirm merge"}
            </button>
            <button
              onClick={onCancel}
              className="w-full py-3 rounded-2xl bg-white/10 text-white text-sm"
              data-testid="button-merge-cancel"
            >
              Cancel
            </button>
            <p className="text-white/40 text-xs mt-4 leading-relaxed">
              Cancelling discards this link. If you change your mind, ask for a new one from your account page.
            </p>
          </>
        )}
        {phase === "error" && (
          <>
            <h1 className="text-2xl font-bold mb-2">Couldn't finish the merge</h1>
            <p className="text-white/55 text-sm mb-6 leading-relaxed" data-testid="merge-error">{errorMsg}</p>
            <button onClick={() => navigate("/account")} className="px-5 py-3 rounded-2xl bg-white/10 text-white text-sm" data-testid="button-merge-back">
              Back to your account
            </button>
          </>
        )}
        {phase === "done" && moved && (
          <>
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--brand-mint)]/15 text-[var(--brand-mint)] mb-3">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h1 className="text-3xl font-bold mb-2">All in one place.</h1>
            <p className="text-white/55 text-sm mb-6 leading-relaxed">
              We moved <strong>{moved.albums}</strong> album{moved.albums === 1 ? "" : "s"}, <strong>{moved.orders}</strong> order{moved.orders === 1 ? "" : "s"}, and <strong>{moved.playlists}</strong> playlist{moved.playlists === 1 ? "" : "s"} onto your account.
              The other email is signed out and parked — sign in with this one from now on.
            </p>
            <button
              onClick={() => navigate("/collection")}
              className="w-full py-3.5 rounded-2xl font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #1D5E8F, var(--brand-blue))" }}
              data-testid="button-merge-collection"
            >
              Open my library
            </button>
          </>
        )}
      </div>
    </main>
  );
}
