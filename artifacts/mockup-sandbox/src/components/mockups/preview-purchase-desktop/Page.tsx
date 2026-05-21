import { useState } from "react";

import {
  AlbumHero,
  BRAND_BG,
  Breadcrumb,
  DesktopSidebar,
  HeroTabs,
  TabPlaceholder,
  TopNowPlayingStrip,
  TRACKS,
  TrackRow,
  type TabKey,
} from "./_shared";

/**
 * Preview & Purchase — desktop v1.
 *
 * First customer-facing surface for an album, served from the mockup
 * sandbox at `/__mockup/preview/preview-purchase-desktop/Page`. Visual
 * counterpart to `/admin/albums/:id` but with fan chrome: brand-navy
 * background, Apple-Music-style rounded photo-forward layout, brand-blue
 * (never rose/red) accents.
 *
 * Read-only on purpose — every interactive control logs to the console
 * rather than touching real audio / checkout / cart. v1 lives in the
 * sandbox only; primitives stay inline in `_shared.tsx` until the design
 * is signed off, then they graduate into `client/src/components/ui/`.
 */
export default function PreviewPurchaseDesktop() {
  const [tab, setTab] = useState<TabKey>("music");

  return (
    <div
      className="flex w-full h-screen overflow-hidden"
      style={{ background: BRAND_BG, fontFamily: "system-ui, -apple-system, 'SF Pro Text', sans-serif" }}
      data-testid="preview-purchase-desktop"
    >
      <DesktopSidebar />

      {/* Content column */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        <TopNowPlayingStrip />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[960px] mx-auto px-10 py-8">
            <Breadcrumb />

            <div className="mt-7">
              <AlbumHero />
            </div>

            <div className="mt-10 border-b border-white/8 pb-1">
              <HeroTabs active={tab} onChange={setTab} />
            </div>

            <div className="mt-6">
              {tab === "music" && (
                <div className="flex flex-col gap-1.5" data-testid="track-list">
                  {TRACKS.map((t) => (
                    <TrackRow key={t.n} track={t} />
                  ))}
                </div>
              )}
              {tab === "video" && <TabPlaceholder kind="video" />}
              {tab === "photos" && <TabPlaceholder kind="photos" />}
            </div>

            {/* Sentinel anchor — keeps the bottom of the scroll area
                breathing under the last track row. */}
            <div className="h-16" aria-hidden />
          </div>
        </main>
      </div>

    </div>
  );
}
