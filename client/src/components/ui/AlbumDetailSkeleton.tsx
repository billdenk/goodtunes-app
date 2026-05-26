import { Disc3 } from "lucide-react";
import { useLocation } from "wouter";
import { BRAND_BG } from "@/components/ui/AlbumDesktopSidebar";

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

export function AlbumDetailMobileSkeleton() {
  return (
    <main
      className="h-screen w-full flex justify-center overflow-hidden relative text-white"
      style={{ background: "var(--brand-bg)" }}
      data-testid="skeleton-album-mobile"
    >
      <section className="relative w-full h-screen flex flex-col">
        {/* Back / share/⋯ chrome placeholders — mirror AlbumDetailMobileSurface */}
        <div className="absolute top-14 left-4 z-50 w-11 h-11 rounded-full bg-white/10" />
        <div className="absolute top-14 right-4 z-50 w-[92px] h-11 rounded-full bg-white/10" />

        <div className="flex-1 overflow-hidden" style={{ paddingBottom: 160 }}>
          <div style={{ background: "var(--brand-bg)" }}>
            {/* Artwork — matches real `w-[72%] max-w-[300px] aspect-square` */}
            <div className="pt-32 px-6 flex justify-center">
              <div
                className="w-[72%] max-w-[300px] rounded-xl bg-white/10"
                style={{ aspectRatio: "1 / 1" }}
              />
            </div>

            {/* Title + artist + meta */}
            <div className="pt-4 pb-3 px-5 flex flex-col items-center gap-2">
              <div className={`${SHIMMER} h-6 w-[62%]`} />
              <div className={`${SHIMMER} h-5 w-[34%]`} />
              <div className={`${SHIMMER} h-3.5 w-[48%] mt-1`} />
            </div>
          </div>

          {/* Action row — shuffle / play / download placeholders */}
          <div className="flex items-center justify-center gap-3 px-5 mt-1 mb-5">
            <div className="w-12 h-12 rounded-full bg-white/10" />
            <div className="h-12 w-[180px] rounded-full bg-white/10" />
            <div className="w-12 h-12 rounded-full bg-white/10" />
          </div>

          {/* Track rows */}
          <div
            className="px-5 mt-5 border-t"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 py-3.5 border-b"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}
              >
                <div className="w-4 h-4 rounded bg-white/10 flex-shrink-0" />
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className={`${SHIMMER} h-3.5`} style={{ width: `${64 - i * 5}%` }} />
                  <div className={`${SHIMMER} h-3`} style={{ width: `${36 + i * 3}%` }} />
                </div>
                <div className="w-5 h-5 rounded bg-white/10 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </section>
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
      {/* Sidebar placeholder — same ~248px column as AlbumDesktopSidebar */}
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

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto px-6 md:px-8 lg:px-10 py-8 max-w-[960px]">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
              <div className={`${SHIMMER} h-3.5 w-16`} />
              <div className={`${SHIMMER} h-3.5 w-32`} />
            </div>

            {/* Hero — cover + title/artist column */}
            <section className="mt-6 flex gap-7">
              <div
                className="rounded-2xl bg-white/10 flex-shrink-0"
                style={{ width: 280, height: 280 }}
              />
              <div className="flex-1 min-w-0 flex flex-col gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <div className="w-11 h-11 rounded-full bg-white/10" />
                  <div className={`${SHIMMER} h-4 w-40`} />
                </div>
                <div className={`${SHIMMER} h-9 w-[70%] mt-1`} />
                <div className={`${SHIMMER} h-3.5 w-48 mt-2`} />
                <div className="mt-3 flex flex-col gap-2">
                  <div className={`${SHIMMER} h-3 w-[88%]`} />
                  <div className={`${SHIMMER} h-3 w-[78%]`} />
                  <div className={`${SHIMMER} h-3 w-[64%]`} />
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <div className="h-11 w-28 rounded-full bg-white/10" />
                  <div className="h-11 w-11 rounded-full bg-white/10" />
                  <div className="h-11 w-11 rounded-full bg-white/10" />
                </div>
              </div>
            </section>

            {/* Tracklist */}
            <div className="mt-10 flex flex-col">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 py-3 border-b"
                  style={{ borderColor: "rgba(255,255,255,0.06)" }}
                >
                  <div className={`${SHIMMER} h-4 w-4`} />
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className={`${SHIMMER} h-3.5`} style={{ width: `${60 - i * 4}%` }} />
                    <div className={`${SHIMMER} h-3`} style={{ width: `${30 + i * 3}%` }} />
                  </div>
                  <div className={`${SHIMMER} h-3 w-10`} />
                </div>
              ))}
            </div>
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
