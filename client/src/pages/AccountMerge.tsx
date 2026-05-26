// Task #400 — Account merge confirmation landing.
//
// The fan tapped "These two accounts are me" on their profile while
// signed in as the surviving account. We emailed a confirmation link
// to the *other* address; clicking it lands here. We POST the token +
// surviving id to /api/me/welcome-back/merge/confirm, which reparents
// orders + user_albums + playlists and soft-deletes the losing row.
//
// The fan must already be signed in as the surviving account — if
// they're not, we send them to /login with a friendly explainer.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

type Phase = "loading" | "confirming" | "done" | "error" | "needs-signin";
type MovedCounts = { albums: number; orders: number; playlists: number };

export function AccountMerge() {
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();
  const [phase, setPhase] = useState<Phase>("loading");
  const [moved, setMoved] = useState<MovedCounts | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const params = new URL(window.location.href).searchParams;
    const token = params.get("token");
    const surviving = params.get("surviving");
    if (!token || !surviving) {
      setErrorMsg("Missing merge link. Check the email and try again.");
      setPhase("error");
      return;
    }
    if (!user) {
      setPhase("needs-signin");
      return;
    }
    if (user.id !== surviving) {
      setErrorMsg(`Sign in as the account you're keeping (not ${user.email}) and re-open the email link.`);
      setPhase("error");
      return;
    }
    setPhase("confirming");
    (async () => {
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
    })();
  }, [isLoading, user]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--brand-bg)] text-white px-6 py-12" data-testid="page-account-merge">
      <div className="w-full max-w-[440px] text-center">
        {(phase === "loading" || phase === "confirming") && (
          <>
            <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-[var(--brand-blue)] animate-spin mx-auto mb-4" />
            <div className="text-white/70 text-sm" data-testid="merge-status">
              {phase === "loading" ? "Loading…" : "Merging your accounts…"}
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
