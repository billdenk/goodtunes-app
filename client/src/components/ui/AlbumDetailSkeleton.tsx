import { Disc3 } from "lucide-react";
import { useLocation } from "wouter";
import { BRAND_BG } from "@/components/ui/AlbumDesktopSidebar";
import { GoodTunesLogo } from "@/components/GoodTunesLogo";

/**
 * Shared loading + empty-state surfaces for the fan-facing Album page.
 *
 * Tapping an album should feel instant. While `/api/albums/:id` is in
 * flight we hold a quiet brand-navy screen with the GoodTunes logo
 * dimmed to a faint background watermark — so the brief load reads as a
 * page quietly loading, not the whole app relaunching. There is no
 * centered spinner (a prominent spinner over a full-opacity logo read
 * as a startup/restart screen on device). Brand navy is painted under
 * the logo on both shells so there is never a white flash between the
 * Collection and the album page.
 *
 * The same dimmed-watermark treatment backs the app-level auth/router
 * loading branch (see `FanAppLoader`) so every full-screen fan loader
 * is uniform and calm.
 *
 * `AlbumNotFound` is the friendlier replacement for the bare
 * "Album not found / Back to Collection" block: a muted disc icon, a
 * headline, one subcopy line, and a single primary action.
 */

/**
 * Opacity of the GoodTunes logo across every full-screen fan loader.
 * Kept faint (~15%) so the mark reads as a quiet background watermark
 * rather than a centered, attention-grabbing startup screen.
 */
const LOADER_LOGO_CLASS = "opacity-[0.15]";

/**
 * Mobile album-open loader. Full-height brand-navy column with the
 * GoodTunes logo dimmed to a faint watermark. No skeleton, no spinner,
 * no wordmark in the corner — just the dimmed mark on navy so the brief
 * load reads as a quiet content load, not a relaunch.
 */
export function AlbumDetailMobileSkeleton() {
  return (
    <main
      className="h-screen w-full flex items-center justify-center overflow-hidden text-white"
      style={{ background: "var(--brand-bg)" }}
      data-testid="loading-album-mobile"
    >
      <GoodTunesLogo size="lg" variant="white" className={LOADER_LOGO_CLASS} />
    </main>
  );
}

/**
 * Desktop album-open loader. Brand-navy full-screen surface with the
 * dimmed GoodTunes logo, matching the mobile loader and the auth pages'
 * loading treatment. No sidebar/skeleton chrome so the load reads as a
 * quiet transition, not a half-painted app.
 */
export function AlbumDetailDesktopSkeleton() {
  return (
    <div
      className="flex w-full h-screen items-center justify-center overflow-hidden text-white"
      style={{
        background: BRAND_BG,
        fontFamily: "system-ui, -apple-system, 'SF Pro Text', sans-serif",
      }}
      data-testid="loading-album-desktop"
    >
      <GoodTunesLogo size="lg" variant="white" className={LOADER_LOGO_CLASS} />
    </div>
  );
}

/**
 * App-level fan loader for the auth/router loading branch. This is the
 * screen that used to show the GoodTunes logo at 50% opacity over a
 * prominent spinning blue loader — which read like the whole app was
 * restarting. It now uses the same dimmed-watermark treatment as the
 * album loaders (faint logo on brand navy, no spinner) so the wait
 * reads as a quiet load. Brand navy underlay prevents a white flash.
 */
export function FanAppLoader() {
  return (
    <main
      className="min-h-screen w-full flex items-center justify-center overflow-hidden text-white"
      style={{ background: "var(--brand-bg)" }}
      data-testid="loading-fan-app"
    >
      <GoodTunesLogo size="lg" variant="white" className={LOADER_LOGO_CLASS} />
    </main>
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
