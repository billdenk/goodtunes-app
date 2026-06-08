// Task #1514 — friendly fallback for the legacy gogoods.com QR bridge.
// Fans who scan an old gogoods-era certificate whose collectible can't be
// mapped to a live GoodTunes provenance page (e.g. an extra copy that never
// minted its own cert, or a code that predates the import) land here instead
// of a dead 404. The server resolver (GET /legacy/g/:code) redirects here on
// any miss; the happy path forwards straight to /g/:shortId.
import { Link } from "wouter";
import { Award, Search } from "lucide-react";

export function FindGoodDeed() {
  return (
    <main className="min-h-screen bg-[var(--brand-bg)] text-white" data-testid="page-find-gooddeed">
      <div className="max-w-[480px] mx-auto px-5 pt-10 pb-16">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 text-xs uppercase tracking-widest text-fan-secondary">
            <Award className="w-4 h-4 text-[var(--brand-mint)]" />
            GoodTunes GoodDeed
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/5 mb-4">
            <Search className="w-5 h-5 text-[var(--brand-mint)]" />
          </div>
          <h1 className="text-xl font-bold" data-testid="text-find-title">
            Let's find your GoodDeed
          </h1>
          <p className="text-fan-secondary text-sm mt-2 leading-relaxed" data-testid="text-find-body">
            This certificate was made in the earlier gogoods.com era, and its
            old code couldn't be matched automatically. Your record and its
            GoodDeed live in your GoodTunes library — sign in with the email you
            used to buy it and you'll find it there.
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center w-full py-3 rounded-full bg-[var(--brand-blue)] text-white font-semibold active:opacity-80"
            data-testid="link-library"
          >
            Sign in to your library
          </Link>
        </div>

        <p className="text-center text-sm text-fan-faint mt-6 leading-relaxed">
          A GoodDeed is a record bought direct from the artist on GoodTunes —
          supporting the people who made it. Need a hand?{" "}
          <a
            href="mailto:hello@goodtunes.music"
            className="text-[var(--brand-mint)] underline underline-offset-2"
            data-testid="link-support"
          >
            Email us
          </a>{" "}
          and we'll track it down.
        </p>
      </div>
    </main>
  );
}

export default FindGoodDeed;
