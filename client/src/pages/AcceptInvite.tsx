import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { setAuthToken } from "@/lib/queryClient";
import gtLogo from "@assets/2025_GoodTunes_Logo-dark.1_1778271422870.png";

type InviteInfo = { email: string; role: string; roleLabel: string };

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
        <h1 className="text-2xl font-bold text-slate-900 mb-1">You're invited</h1>
        <p className="text-sm text-slate-600 mb-6">
          Set up your <span className="font-semibold">{data.roleLabel}</span> account for <span className="font-semibold">{data.email}</span>.
        </p>

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

        <button
          type="submit"
          disabled={submitting}
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
      </form>
    </main>
  );
}
