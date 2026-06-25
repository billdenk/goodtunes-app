import { ArrowLeft, LogIn } from "lucide-react";
import { GoodTunesLogo } from "@/components/GoodTunesLogo";

// Task #256 / #2142 — Branded "you don't have admin access" screen shown
// when a signed-in customer lands on admin.goodtunes.music. By the time
// this renders, the server has already recorded the access request and
// (first-of-the-day) emailed every super_admin, so the copy is honest.
//
// This is an *operator* surface (it lives on the admin shell), so it uses
// the light admin slate theme — bg-slate-50 page, white card, slate text,
// brand-blue action — matching the admin/CMS and partner portals (see
// docs/design-system.md), not the fan navy chrome.
//
// `linkedAdmin` (from the access-request probe) flags a fan who already
// has a linked admin row — Andrew's case (a pre-existing fan invited as a
// partner). For them the primary action is a real "sign in to admin" path
// (→ /admin/login) instead of the old dead-end "Back to GoodTunes".
export function AccessNotAuthorizedDialog({
  customer,
}: {
  customer: { displayName: string; email: string; linkedAdmin?: boolean };
}) {
  function back() {
    // In prod, the customer shell lives on my.goodtunes.music; in dev
    // /preview both shells share a host so "/" lands on the player.
    const host = window.location.host;
    if (host === "admin.goodtunes.music") {
      window.location.href = "https://my.goodtunes.music/";
    } else {
      window.location.href = "/";
    }
  }
  function signIn() {
    // Full navigation (not wouter) so the admin login mounts with a clean
    // slate — the fan session is replaced by the admin sign-in + 2FA flow.
    window.location.href = "/admin/login";
  }
  const linked = !!customer.linkedAdmin;
  return (
    <main
      className="min-h-screen bg-slate-50 flex items-center justify-center p-6"
      data-testid="dialog-access-not-authorized"
    >
      <div className="w-full max-w-[420px] rounded-xl bg-white ring-1 ring-slate-200 shadow-sm p-7">
        <div className="flex items-center gap-3 mb-5">
          <GoodTunesLogo size="md" variant="color" />
          <span className="text-xs uppercase tracking-[0.16em] text-slate-400 font-semibold">
            GoodTunes Admin
          </span>
        </div>
        <h1 className="text-xl leading-tight font-semibold text-slate-900 mb-3" data-testid="text-dialog-title">
          {linked ? "Sign in to continue" : "Access not authorized"}
        </h1>
        {linked ? (
          <p className="text-sm leading-relaxed text-slate-600 mb-2">
            You also have a GoodTunes Admin account. Sign in here to reach your
            admin portal.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-slate-600 mb-2">
            The administrator has been notified and will be in touch.
          </p>
        )}
        <p className="text-sm leading-relaxed text-slate-400 mb-6" data-testid="text-dialog-account">
          Signed in as <span className="text-slate-600">{customer.displayName}</span>{" "}
          &lt;{customer.email}&gt;.
        </p>
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={signIn}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-md bg-[color:var(--brand-blue)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            data-testid="button-sign-in-admin"
          >
            <LogIn className="w-4 h-4" />
            Sign in to GoodTunes Admin
          </button>
          <button
            type="button"
            onClick={back}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-md text-slate-500 text-sm font-medium hover:text-slate-700 transition-colors"
            data-testid="button-back-to-goodtunes"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to GoodTunes
          </button>
        </div>
      </div>
    </main>
  );
}
