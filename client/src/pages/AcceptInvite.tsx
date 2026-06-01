import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { setAuthToken } from "@/lib/queryClient";
import gtLogo from "@assets/2025_GoodTunes_Logo-dark.1_1778271422870.png";
import { TERMS_URL, PRIVACY_POLICY_URL } from "@shared/schema";

// Task #351 — Team-invite fields surfaced here so the accept page can
// render the right hero copy and (after accept) the server-supplied
// landingPath deep-links into either the album editor or the
// "nothing's waiting yet" welcome page.
type InviteInfo = {
  email: string;
  role: string;
  roleLabel: string;
  inviteRole?: "identity" | "manager" | "team" | "npo_ambassador" | "npo_staff" | null;
  targetPersonName?: string | null;
  preFlightedAlbumTitle?: string | null;
};

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<InviteInfo>({
    queryKey: ["/api/invites", token],
    queryFn: async () => {
      const r = await fetch(`/api/invites/${token}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({ message: "Invite not found" }));
        throw new Error(j.message || "Invite invalid");
      }
      return r.json();
    },
    retry: false,
  });

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);

  useEffect(() => {
    if (data?.email && !displayName) {
      const base = data.email.split("@")[0];
      setUsername(base.toLowerCase().replace(/[^a-z0-9_]/g, ""));
      setDisplayName(base.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }, [data?.email]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrMsg(null);
    try {
      const r = await fetch(`/api/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, displayName, password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Could not accept invite");
      if (j.token) setAuthToken(j.token);
      queryClient.setQueryData(["/api/me"], j);
      queryClient.invalidateQueries();
      // Task #78 — server returns landingPath so non-profit partners
      // land on /non-profit, artists on /artist, labels on /label, etc.
      navigate(j.landingPath || "/admin/albums");
    } catch (e: any) {
      setErrMsg(e.message || "Something went wrong");
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-slate-500">Loading invite…</div>
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center" data-testid="invite-invalid">
          <img src={gtLogo} alt="GoodTunes" className="h-10 w-auto mx-auto mb-6" />
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Invite unavailable</h1>
          <p className="text-sm text-slate-600">{(error as Error)?.message || "This invitation can't be used."}</p>
          <button
            type="button"
            onClick={() => navigate("/admin/login")}
            className="mt-6 text-sm font-semibold text-[#319ED8] hover:underline"
            data-testid="link-go-login"
          >
            Go to sign in →
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8" data-testid="form-accept-invite">
        <img src={gtLogo} alt="GoodTunes" className="h-10 w-auto mb-6" />
        <h1 className="text-2xl font-bold text-slate-900 mb-1" data-testid="text-invite-hero">
          {data.inviteRole === "team" ? "You're on the team"
            : data.inviteRole === "manager" ? "You're a manager"
            : data.inviteRole === "identity" ? "Claim your artist page"
            : data.inviteRole === "npo_ambassador" ? "You're an ambassador"
            : data.inviteRole === "npo_staff" ? "You're on the non-profit team"
            : "You're invited"}
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          {data.targetPersonName ? (
            <>Set up your <span className="font-semibold">{data.roleLabel}</span> account for <span className="font-semibold">{data.targetPersonName}</span> ({data.email}).</>
          ) : (
            <>Set up your <span className="font-semibold">{data.roleLabel}</span> account for <span className="font-semibold">{data.email}</span>.</>
          )}
        </p>
        {data.preFlightedAlbumTitle && (
          <div className="mb-5 rounded-lg border border-[color:var(--brand-blue)]/30 bg-[color:var(--brand-blue)]/5 px-3 py-2 text-xs text-slate-700" data-testid="banner-preflight-album">
            An album draft is waiting for you: <span className="font-semibold">{data.preFlightedAlbumTitle}</span>. We'll drop you straight into it after sign-up.
          </div>
        )}

        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Display name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          autoComplete="name"
          className="w-full px-3 py-2.5 mb-4 rounded-lg border border-slate-300 focus:border-[#319ED8] focus:outline-none focus:ring-2 focus:ring-[#319ED8]/20"
          data-testid="input-display-name"
        />

        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Username</label>
        <div className="flex items-center mb-4 rounded-lg border border-slate-300 focus-within:border-[#319ED8] focus-within:ring-2 focus-within:ring-[#319ED8]/20 overflow-hidden">
          <span className="pl-3 text-slate-400 select-none">@</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            required
            minLength={3}
            autoComplete="username"
            className="flex-1 px-2 py-2.5 focus:outline-none"
            data-testid="input-username"
          />
        </div>

        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-3 py-2.5 mb-1 rounded-lg border border-slate-300 focus:border-[#319ED8] focus:outline-none focus:ring-2 focus:ring-[#319ED8]/20"
          data-testid="input-password"
        />
        <p className="text-xs text-slate-500 mb-6">At least 8 characters.</p>

        {errMsg && (
          <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" data-testid="invite-error">
            {errMsg}
          </div>
        )}

        {/* Task #351 — Identity confirmation. For "identity" invites we
            require an explicit "I am {name}" affirmation before letting
            the account be created so a forwarded link can't be used by
            someone else to claim the artist Person. Manager/Team invites
            don't get this gate — they aren't claiming the artist. */}
        {data.inviteRole === "identity" && data.targetPersonName && (
          <label className="mb-4 flex items-start gap-2 text-sm text-slate-700" data-testid="label-identity-confirm">
            <input
              type="checkbox"
              checked={identityConfirmed}
              onChange={(e) => setIdentityConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[color:var(--brand-blue)] focus:ring-[color:var(--brand-blue)]"
              data-testid="checkbox-identity-confirm"
            />
            <span>I am <span className="font-semibold">{data.targetPersonName}</span>, or I'm authorized to claim this artist account on their behalf.</span>
          </label>
        )}

        <button
          type="submit"
          disabled={submitting || (data.inviteRole === "identity" && !!data.targetPersonName && !identityConfirmed)}
          className="w-full bg-[#319ED8] hover:bg-[#2789bd] disabled:bg-slate-300 text-white font-semibold rounded-lg py-2.5 transition-colors"
          data-testid="button-accept-invite"
        >
          {submitting ? "Creating account…" : "Accept with email & password"}
        </button>

        {/* Task #78 — OAuth invite accept. Recipients can attach a
            Google or Apple identity to the invited admin account instead
            of setting a password. The server (handleProviderCallback)
            requires identity.email to match invite.email exactly so a
            forwarded invite link can't be hijacked from another account. */}
        <div className="my-5 flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[11px] uppercase tracking-wide text-slate-400">or sign in with</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`/api/auth/google/start?invite=${encodeURIComponent(token!)}`}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800"
            data-testid="link-accept-google"
          >
            <span>Google</span>
          </a>
          <a
            href={`/api/auth/apple/start?invite=${encodeURIComponent(token!)}`}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-900 bg-slate-900 hover:bg-black px-3 py-2.5 text-sm font-semibold text-white"
            data-testid="link-accept-apple"
          >
            <span>Apple</span>
          </a>
        </div>
        <p className="mt-3 text-[11px] text-slate-500 text-center">
          The Google/Apple account email must match <span className="font-semibold">{data.email}</span>.
        </p>

        {/* Task #860 — Terms acceptance at sign-up. Industry-standard
            inline microcopy (no checkbox); covers both the password and
            OAuth accept paths above, which both provision the admin/
            partner account. Links open the public policy pages in a new
            tab. Inline-link treatment: inherit color at rest, brand-blue
            + underline on hover. */}
        <p className="mt-4 text-xs leading-relaxed text-slate-500 text-center" data-testid="text-terms-consent">
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
      </form>
    </main>
  );
}
