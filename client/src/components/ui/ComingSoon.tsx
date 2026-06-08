import { useState } from "react";
import { Bell } from "lucide-react";
import { LockedOfferModal } from "@/components/ui/LockedOfferModal";

/**
 * Task #1766 — branded "Coming <date>" placeholder for a release that is still
 * being prepped (album.isPrepping). The full by-slug routes 404 a prepping
 * release for regular fans, so a shared link would otherwise dead-end on
 * "not found". ShareSlugTwo falls back to this when /api/public/coming-soon
 * resolves. Mirrors the brand-correct navy hero of the real album page (cover,
 * artist, title) and offers a single Get-Notified capture, reusing
 * LockedOfferModal's waitlist flow so the notify POST never drifts.
 *
 * Once the operator flips the release live, the by-slug route serves the real
 * Preview & Purchase page and this never renders again — no second deploy.
 */
export type ComingSoonRelease = {
  id: string;
  title: string;
  artist: string;
  artwork?: string | null;
  goodTunesReleaseDate?: string | null;
};

function formatComingLabel(iso?: string | null): string {
  if (!iso) return "Coming soon";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Coming soon";
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  return `Coming ${month} ${day}`;
}

export function ComingSoon({ release }: { release: ComingSoonRelease }) {
  const [showNotify, setShowNotify] = useState(false);
  const comingLabel = formatComingLabel(release.goodTunesReleaseDate);

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-6 py-12 text-fan-primary"
      style={{ background: "var(--brand-bg)" }}
      data-testid="page-coming-soon"
    >
      <div className="w-full max-w-[360px] flex flex-col items-center text-center">
        {release.artwork ? (
          <img
            src={release.artwork}
            alt={release.title}
            className="w-56 h-56 rounded-2xl object-cover shadow-2xl"
            data-testid="img-coming-soon-art"
          />
        ) : (
          <div className="w-56 h-56 rounded-2xl bg-white/5" />
        )}

        <div
          className="mt-7 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold"
          style={{ background: "var(--brand-blue-soft)", color: "var(--brand-blue)" }}
          data-testid="badge-coming-soon"
        >
          {comingLabel}
        </div>

        <h1
          className="mt-5 text-2xl font-bold leading-tight"
          data-testid="text-coming-soon-title"
        >
          {release.title}
        </h1>
        <p className="mt-1 text-base text-fan-secondary" data-testid="text-coming-soon-artist">
          {release.artist}
        </p>

        <button
          type="button"
          onClick={() => setShowNotify(true)}
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-full px-7 py-3 text-base font-semibold text-white"
          style={{ background: "var(--brand-blue)" }}
          data-testid="button-coming-soon-notify"
        >
          <Bell className="w-4 h-4" />
          Get Notified
        </button>
        <p className="mt-3 text-xs text-fan-secondary/80">
          We'll email you the moment it's available.
        </p>
      </div>

      <LockedOfferModal
        open={showNotify}
        onClose={() => setShowNotify(false)}
        albumId={release.id}
        title={release.title}
        artist={release.artist}
        artworkUrl={release.artwork ?? null}
        priceCents={null}
        salesPending={true}
        notifyOnly={true}
        salesBeginLabel={release.goodTunesReleaseDate ?? null}
        onBuy={() => setShowNotify(false)}
        source="coming-soon"
      />
    </div>
  );
}
