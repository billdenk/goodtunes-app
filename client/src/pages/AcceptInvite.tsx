import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { setAuthToken } from "@/lib/queryClient";
import { onWhitelabelHost } from "@/hooks/useAuthKind";
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
  inviteRole?: "identity" | "manager" | "team" | "label" | "npo_ambassador" | "npo_staff" | "publisher" | null;
  targetPersonName?: string | null;
  preFlightedAlbumTitle?: string | null;
  // Task #3257 — sanitized press white-label brand for press-referred
  // invites; null/absent = plain GoodTunes page exactly as before.
  pressBrand?: {
    pressName: string;
    logoUrl: string | null;
    lightLogoUrl: string | null;
    accentColor: string | null;
    cornerStyle: string | null;
  } | null;
  // Task #3329 — the invited email already has a GoodTunes login; the page
  // switches to "sign in to accept" instead of offering new credentials the
  // server would refuse.
  existingAccount?: boolean;
};

// Task #3329 — the GET can 410 with a structured payload (used/expired +
// account hints + press brand) so the unavailable page can route the person
// to the sign-in that actually matches their account instead of dead-ending.
type InviteErrorInfo = {
  message?: string;
  used?: boolean;
  expired?: boolean;
  accountExists?: boolean;
  createdByThisInvite?: boolean;
  pressBrand?: InviteInfo["pressBrand"];
};
class InviteError extends Error {
  info: InviteErrorInfo;
  constructor(message: string, info: InviteErrorInfo) {
    super(message);
    this.info = info;
  }
}

const GT_BLUE = "#319ED8";

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
        throw new InviteError(j.message || "Invite invalid", j);
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
      // Task #3329 — existing-account invitees sign in with their CURRENT
      // password to accept (signin:true); only fresh emails pick new
      // credentials. The server rejects a new-credentials submit for an
      // existing email rather than silently discarding the password.
      const body = data?.existingAccount
        ? { signin: true, password }
        : { username, displayName, password };
      const r = await fetch(`/api/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Could not accept invite");
      // Task #3329 — existing-account invitee in production: the invite
      // was granted+consumed, but the account's enrolled second factor
      // still applies (same policy as normal admin login). The session
      // carries the pending factor state; resume at the login page's
      // factor phase (?oauth=invite mirrors the OAuth invite-accept
      // round-trip params so Login drops into the right step).
      if (j.requiresSecondFactor) {
        navigate(`/admin/login?oauth=invite&next=${encodeURIComponent(j.next || "emailOtp")}`);
        return;
      }
      if (j.token) setAuthToken(j.token);
      queryClient.setQueryData(["/api/me"], j);
      queryClient.invalidateQueries();
      // Task #78 — server returns landingPath (/non-profit, /artist,
      // /label, or a specific /admin/albums/<id> when an album draft is
      // pre-flighted or already waiting).
      // Task #933 — partners get a role-aware welcome first (shown once,
      // right after sign-up). Skip it only when a specific album draft
      // is waiting, in which case we drop them straight into the editor.
      const landing = j.landingPath || "/admin/albums";
      // Drop straight into the album editor when a specific draft is waiting,
      // or into the publisher portal for publisher invites.
      // All other partners see the welcome screen first (shown once on sign-up).
      const goDirectly = landing.startsWith("/admin/albums/") || landing.startsWith("/publisher");
      navigate(goDirectly ? landing : "/welcome-invitee");
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
    // Task #3329 — the unavailable page must not dead-end. Invites always
    // mint/attach admin-kind partner accounts, so "Go to sign in" points at
    // /admin/login on THIS host (press-branded on white-label hosts) — never
    // the press-client customer login. When the email behind a spent invite
    // holds an account, say which password to use and offer the reset path.
    const info = error instanceof InviteError ? error.info : {};
    const eBrand = info.pressBrand ?? null;
    const eLogo = eBrand?.logoUrl || eBrand?.lightLogoUrl || null;
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center" data-testid="invite-invalid">
          {eLogo ? (
            <img src={eLogo} alt={eBrand?.pressName || "Press"} className="h-10 w-auto mx-auto mb-6 object-contain" data-testid="img-press-brand-logo" />
          ) : (
            <img src={gtLogo} alt="GoodTunes" className="h-10 w-auto mx-auto mb-6" />
          )}
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Invite unavailable</h1>
          <p className="text-sm text-slate-600">{(error as Error)?.message || "This invitation can't be used."}</p>
          {info.used && info.accountExists && (
            <p className="mt-3 text-sm text-slate-600" data-testid="text-used-invite-account-hint">
              {info.createdByThisInvite
                ? "Your account was created when this invite was accepted — sign in with the email the invite was sent to and the password you chose."
                : "The email this invite was sent to already has a GoodTunes account — sign in with that account's existing password."}
            </p>
          )}
          <button
            type="button"
            onClick={() => navigate("/admin/login")}
            className="mt-6 block mx-auto text-sm font-semibold hover:underline"
            style={{ color: eBrand?.accentColor && /^#[0-9a-fA-F]{6}$/.test(eBrand.accentColor) ? eBrand.accentColor : GT_BLUE }}
            data-testid="link-go-login"
          >
            Go to sign in →
          </button>
          {(info.used || info.expired) && (
            <button
              type="button"
              onClick={() => navigate("/admin/forgot-password")}
              className="mt-3 block mx-auto text-sm text-slate-500 hover:text-slate-700 hover:underline"
              data-testid="link-forgot-password"
            >
              Forgot your password?
            </button>
          )}
        </div>
      </main>
    );
  }

  // Task #3257 — white-label skin for press-referred invites. Page is light,
  // so prefer the dark-on-light logo (logoUrl); accent tints the focus rings
  // + submit button. Invalid/missing accent falls back to GoodTunes blue.
  const brand = data.pressBrand ?? null;
  const accent = brand?.accentColor && /^#[0-9a-fA-F]{6}$/.test(brand.accentColor) ? brand.accentColor : GT_BLUE;
  const cornerClass = brand?.cornerStyle === "square" ? "rounded-md" : "rounded-lg";
  const brandLogo = brand?.logoUrl || brand?.lightLogoUrl || null;
  const focusStyle = { "--tw-ring-color": `${accent}33`, borderColor: undefined } as React.CSSProperties;

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8" style={{ "--wl-accent": accent, "--wl-accent-soft": `${accent}33` } as React.CSSProperties} data-testid="form-accept-invite">
        {brandLogo ? (
          <img src={brandLogo} alt={brand?.pressName || "Press"} className="h-10 w-auto mb-6 object-contain" data-testid="img-press-brand-logo" />
        ) : (
          <img src={gtLogo} alt="GoodTunes" className="h-10 w-auto mb-6" />
        )}
        <h1 className="text-2xl font-bold text-slate-900 mb-1" data-testid="text-invite-hero">
          {data.inviteRole === "team" ? "You're on the team"
            : data.inviteRole === "manager" ? "You're a manager"
            : data.inviteRole === "identity" ? "Claim your artist page"
            : data.inviteRole === "label" ? "You're the record label"
            : data.inviteRole === "npo_ambassador" ? "You're an ambassador"
            : data.inviteRole === "npo_staff" ? "You're on the non-profit team"
            : data.inviteRole === "publisher" ? "You're a publisher"
            : "You're invited"}
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          {data.existingAccount ? (
            <span data-testid="text-existing-account-notice">
              <span className="font-semibold">{data.email}</span> already has a GoodTunes account — sign in with its existing password to accept this <span className="font-semibold">{data.roleLabel}</span> invitation{data.targetPersonName ? <> for <span className="font-semibold">{data.targetPersonName}</span></> : null}.
            </span>
          ) : data.targetPersonName ? (
            <>Set up your <span className="font-semibold">{data.roleLabel}</span> account for <span className="font-semibold">{data.targetPersonName}</span> ({data.email}).</>
          ) : (
            <>Set up your <span className="font-semibold">{data.roleLabel}</span> account for <span className="font-semibold">{data.email}</span>.</>
          )}
        </p>
        {brand && (
          <div className={`mb-5 border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 ${cornerClass}`} data-testid="banner-press-welcome">
            Welcome from <span className="font-semibold">{brand.pressName}</span> — once you&rsquo;re in, they&rsquo;ll meet you in the project builder to get your record moving.
          </div>
        )}
        {data.preFlightedAlbumTitle && (
          <div className="mb-5 rounded-lg border border-[color:var(--brand-blue)]/30 bg-[color:var(--brand-blue)]/5 px-3 py-2 text-xs text-slate-700" data-testid="banner-preflight-album">
            An album draft is waiting for you: <span className="font-semibold">{data.preFlightedAlbumTitle}</span>. We'll drop you straight into it after sign-up.
          </div>
        )}

        {!data.existingAccount && (
          <>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoComplete="name"
              className={`w-full px-3 py-2.5 mb-4 ${cornerClass} border border-slate-300 focus:border-[color:var(--wl-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--wl-accent-soft)]`}
              data-testid="input-display-name"
            />

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Username</label>
            <div className={`flex items-center mb-4 ${cornerClass} border border-slate-300 focus-within:border-[color:var(--wl-accent)] focus-within:ring-2 focus-within:ring-[color:var(--wl-accent-soft)] overflow-hidden`}>
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
          </>
        )}

        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
          {data.existingAccount ? "Your password" : "Password"}
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={data.existingAccount ? 1 : 8}
          autoComplete={data.existingAccount ? "current-password" : "new-password"}
          className={`w-full px-3 py-2.5 mb-1 ${cornerClass} border border-slate-300 focus:border-[color:var(--wl-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--wl-accent-soft)]`}
          data-testid="input-password"
        />
        {data.existingAccount ? (
          <button
            type="button"
            onClick={() => navigate("/admin/forgot-password")}
            className="text-xs text-slate-500 hover:text-slate-700 hover:underline mb-6 block"
            data-testid="link-forgot-password"
          >
            Forgot your password?
          </button>
        ) : (
          <p className="text-xs text-slate-500 mb-6">At least 8 characters.</p>
        )}

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
          disabled={
            submitting ||
            (data.existingAccount
              ? password.length === 0
              : displayName.trim().length === 0 ||
                username.trim().length < 3 ||
                password.length < 8) ||
            (data.inviteRole === "identity" && !!data.targetPersonName && !identityConfirmed)
          }
          className={`w-full bg-[#319ED8] hover:bg-[#2789bd] disabled:bg-slate-300 text-white font-semibold ${cornerClass} py-2.5 transition-colors`}
          style={accent !== GT_BLUE ? { backgroundColor: accent } : undefined}
          data-testid="button-accept-invite"
        >
          {submitting
            ? (data.existingAccount ? "Signing in…" : "Creating account…")
            : (data.existingAccount ? "Sign in & accept" : "Accept invitation")}
        </button>

        {/* Task #78 — OAuth invite accept. Recipients can attach a
            Google or Apple identity to the invited admin account instead
            of setting a password. The server (handleProviderCallback)
            requires identity.email to match invite.email exactly so a
            forwarded invite link can't be hijacked from another account. */}
        {/* Task #3423 — Google/Apple stay OFF white-label hosts (not
            rendered at all) until activation is decided (#3278). */}
        {!onWhitelabelHost() && (<>
        <div className="my-5 flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[11px] uppercase tracking-wide text-slate-400">or sign in with</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>
        <div className="flex flex-col gap-2">
          <a
            href={`/api/auth/google/start?invite=${encodeURIComponent(token!)}`}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800"
            data-testid="link-accept-google"
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.5 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C40.9 36.4 44 30.7 44 24c0-1.3-.1-2.4-.4-3.5z"/>
            </svg>
            <span>Continue with Google</span>
          </a>
          <a
            href={`/api/auth/apple/start?invite=${encodeURIComponent(token!)}`}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800"
            data-testid="link-accept-apple"
          >
            <svg width="16" height="18" viewBox="0 0 24 24" fill="#0f0f0f">
              <path d="M17.05 12.04c-.03-3.02 2.47-4.49 2.58-4.56-1.41-2.06-3.6-2.34-4.38-2.37-1.86-.19-3.64 1.1-4.59 1.1-.96 0-2.42-1.07-3.98-1.04-2.05.03-3.95 1.19-5 3.02-2.13 3.7-.55 9.17 1.53 12.18 1.02 1.47 2.23 3.13 3.81 3.07 1.53-.06 2.11-.99 3.96-.99 1.85 0 2.37.99 3.99.96 1.65-.03 2.69-1.5 3.69-2.98 1.16-1.71 1.64-3.36 1.67-3.45-.04-.02-3.21-1.23-3.24-4.94zM14.13 3.4c.84-1.02 1.41-2.43 1.25-3.84-1.21.05-2.69.81-3.56 1.83-.78.9-1.47 2.34-1.29 3.72 1.36.1 2.74-.69 3.6-1.71z"/>
            </svg>
            <span>Continue with Apple</span>
          </a>
        </div>
        <p className="mt-3 text-[11px] text-slate-500 text-center">
          The Google/Apple account email must match <span className="font-semibold">{data.email}</span>.
        </p>
        </>)}

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
