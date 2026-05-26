import { Disc3 } from "lucide-react";
import { useLocation } from "wouter";
import { BRAND_BG } from "@/components/ui/AlbumDesktopSidebar";
import { GoodTunesLogo } from "@/components/GoodTunesLogo";

/**
 * Shared loading + empty-state surfaces for the fan-facing Album page.
 *
 * Apple Music shows a skeleton of the album page (art tile, title/artist
 * bars, track rows) while data loads so the layout doesn't jump when the
 * real data lands. The skeletons here mirror the real `AlbumDetailMobile`
 * and `DesktopAlbumView` layouts at the metric level — same artwork
 * width, same spacing rhythm, same number of track-row placeholders.
 *
 * `AlbumNotFound` is the friendlier replacement for the bare
 * "Album not found / Back to Collection" block: a muted disc icon, a
 * headline, one subcopy line, and a single primary action.
 *
 * All three components live on the brand-navy background and use
 * subtle white/10 fills so the skeleton reads as "intentionally muted"
 * rather than "broken page".
 */

const SHIMMER = "bg-white/10 animate-pulse rounded-md";

/**
 * GoodDeed-certificate-style loading placeholder.
 *
 * Top ~70% is a muted rectangle sized where the album art will land
 * once data arrives. Bottom ~30% is a navy strip carrying a small
 * avatar circle + two/three text-bar placeholders on the left, the
 * GoodTunes wordmark in the top-right, and a square placeholder
 * bottom-right where a real certificate's QR code sits. A hairline
 * divider between the two halves matches the HR line on the real
 * certificate. No track rows, no chrome — this should read as
 * "the certificate is loading," not "the album page is mirroring
 * itself in grey".
 */
function CertificateSkeleton({ testId }: { testId: string }) {
  return (
    <div
      className="w-full h-full flex flex-col"
      style={{ background: "var(--brand-bg)" }}
      data-testid={testId}
    >
      {/* Image area — where the album art will land. Gentle pulse. */}
      <div
        className="flex-[7] w-full bg-white/10 animate-pulse"
        aria-hidden
      />

      {/* Hairline divider — matches the HR on the real certificate. */}
      <div
        className="h-px w-full"
        style={{ background: "rgba(255,255,255,0.12)" }}
        aria-hidden
      />

      {/* Navy info strip — avatar + text bars + wordmark + QR square. */}
      <div
        className="flex-[3] w-full relative px-5 py-4"
        style={{ background: "var(--brand-bg)" }}
      >
        {/* Wordmark top-right */}
        <div className="absolute top-3 right-4">
          <GoodTunesLogo size="sm" variant="white" />
        </div>

        {/* QR square placeholder bottom-right */}
        <div
          className="absolute bottom-4 right-4 bg-white/15 animate-pulse rounded-sm"
          style={{ width: 56, height: 56 }}
          aria-hidden
        />

        {/* Left column — avatar circle + text bars */}
        <div className="flex items-start gap-3 pr-20">
          <div
            className="rounded-full bg-white/15 flex-shrink-0 animate-pulse"
            style={{ width: 44, height: 44 }}
          />
          <div className="flex-1 min-w-0 flex flex-col gap-2 pt-1.5">
            <div className={`${SHIMMER} h-3 w-[62%]`} />
            <div className={`${SHIMMER} h-3 w-[78%]`} />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 pr-20">
          <div className={`${SHIMMER} h-3 w-[88%]`} />
          <div className={`${SHIMMER} h-3 w-[64%]`} />
        </div>
      </div>
    </div>
  );
}

export function AlbumDetailMobileSkeleton() {
  return (
    <main
      className="h-screen w-full flex justify-center overflow-hidden text-white"
      style={{ background: "var(--brand-bg)" }}
    >
      <CertificateSkeleton testId="skeleton-album-mobile" />
    </main>
  );
}

export function AlbumDetailDesktopSkeleton() {
  return (
    <div
      className="flex w-full h-screen overflow-hidden text-white"
      style={{
        background: BRAND_BG,
        fontFamily: "system-ui, -apple-system, 'SF Pro Text', sans-serif",
      }}
      data-testid="skeleton-album-desktop"
    >
      {/* Sidebar placeholder — same ~248px column as AlbumDesktopSidebar so
          the change reads as "the certificate is loading", not "the
          whole app is loading". */}
      <div
        className="hidden md:flex flex-col gap-3 px-5 pt-8 border-r border-white/5"
        style={{ width: 248, flexShrink: 0 }}
      >
        <div className={`${SHIMMER} h-5 w-32`} />
        <div className="mt-4 flex flex-col gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`${SHIMMER} h-7 w-full`} />
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        {/* Top strip placeholder */}
        <div className="h-14 border-b border-white/5 flex items-center px-6 gap-3">
          <div className={`${SHIMMER} h-5 w-40`} />
        </div>

        <main className="flex-1 overflow-y-auto flex items-center justify-center p-8">
          {/* Centered certificate at a poster-ish aspect so the cover
              tile lands roughly where the desktop hero cover does. */}
          <div
            className="w-full max-w-[520px] rounded-xl overflow-hidden shadow-2xl"
            style={{ aspectRatio: "4 / 5" }}
          >
            <CertificateSkeleton testId="skeleton-album-desktop-certificate" />
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Friendlier shared empty state. Used when the album query has actually
 * resolved with no data (or a 404). Muted Lucide disc icon at low
 * opacity, a headline, one supporting line, and a single primary action.
 *
 * Variant `desktop` mounts inside a centered shell with the brand bg;
 * `mobile` mounts inside the phone column. Both share the same body so
 * copy stays consistent across the two shells.
 */
export function AlbumNotFound({
  variant = "mobile",
}: {
  variant?: "mobile" | "desktop";
}) {
  const [, navigate] = useLocation();
  return (
    <div
      className={
        variant === "desktop"
          ? "w-full h-screen flex items-center justify-center text-white"
          : "min-h-screen w-full flex items-center justify-center text-white px-6"
      }
      style={{ background: variant === "desktop" ? BRAND_BG : "var(--brand-bg)" }}
      data-testid="empty-album-not-found"
    >
      <div className="flex flex-col items-center text-center max-w-[320px]">
        <Disc3
          className="text-white/20 mb-6"
          style={{ width: 88, height: 88 }}
          strokeWidth={1.2}
        />
        <h1
          className="text-white text-xl font-bold leading-tight tracking-tight"
          data-testid="text-album-not-found-title"
        >
          We couldn't find that album
        </h1>
        <p className="mt-2 text-base text-white/55 leading-snug">
          It may have been removed or the link is wrong.
        </p>
        <button
          type="button"
          onClick={() => navigate("/collection")}
          className="mt-7 inline-flex items-center justify-center h-11 px-6 rounded-full text-white text-sm font-semibold tracking-tight active:scale-[0.97] transition-transform"
          style={{ background: "var(--brand-blue)" }}
          data-testid="button-back-to-collection"
        >
          Back to your Collection
        </button>
      </div>
    </div>
  );
}
