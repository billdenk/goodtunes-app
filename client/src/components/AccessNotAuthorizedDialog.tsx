import { ArrowLeft } from "lucide-react";

// Task #256 — Branded "you don't have admin access" modal shown when a
// signed-in customer lands on admin.goodtunes.music. By the time this
// renders, the server has already recorded the access request and
// (first-of-the-day) emailed every super_admin, so the copy is honest.
//
// Design rules: dark brand bg, mint accent, 44×44 touch target on the
// action — see docs/design-system.md.
export function AccessNotAuthorizedDialog({
  customer,
}: {
  customer: { displayName: string; email: string };
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
  return (
    <main
      className="min-h-screen bg-[hsl(232_100%_8%)] flex items-center justify-center p-6"
      data-testid="dialog-access-not-authorized"
    >
      <div className="w-full max-w-[440px] rounded-2xl bg-[hsl(232_70%_15%)] border border-white/10 p-7 text-white shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-3 mb-5">
          <img src="/figmaAssets/--.svg" alt="GoodTunes" className="w-7 h-9 opacity-90" />
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--brand-mint)] font-semibold">
            GoodTunes Admin
          </span>
        </div>
        <h1 className="text-xl leading-tight font-semibold mb-3" data-testid="text-dialog-title">
          Access not authorized
        </h1>
        <p className="text-base leading-relaxed text-white/75 mb-2">
          The administrator has been notified and will be in touch.
        </p>
        <p className="text-sm leading-relaxed text-white/55 mb-6" data-testid="text-dialog-account">
          Signed in as <span className="text-white/80">{customer.displayName}</span>{" "}
          &lt;{customer.email}&gt;.
        </p>
        <button
          type="button"
          onClick={back}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-full bg-[var(--brand-mint)] text-[hsl(232_100%_8%)] text-base font-semibold hover:opacity-90 transition-opacity"
          data-testid="button-back-to-goodtunes"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to GoodTunes
        </button>
      </div>
    </main>
  );
}
