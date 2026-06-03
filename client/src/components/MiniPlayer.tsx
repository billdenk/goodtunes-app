import { usePlayer } from "@/context/PlayerContext";
import { useLocation } from "wouter";
import { useReducedMotion } from "framer-motion";
import { useNavVisibility } from "@/hooks/useNavVisibility";

export function MiniPlayer() {
  const { currentSong, isPlaying, togglePlay, next, setShowPlayer } = usePlayer();
  const [location] = useLocation();
  const { hidden } = useNavVisibility();
  const reduceMotion = useReducedMotion();

  if (!currentSong || location === "/player") return null;

  // Apple-style: when scrolled (nav hidden), the mini-player shrinks into a
  // small capsule anchored to the RIGHT, sitting next to the collapsed nav
  // pill on the left. When the nav is visible, the mini-player floats above
  // the nav as a full-width capsule.
  // Task #530 split-nav geometry:
  //   * Collapsed: 48px tab circle on the LEFT (at left:12), 48px search
  //     circle on the RIGHT (at right:12). MiniPlayer fills the gap
  //     between them (left:70, right:70) so it's a wide capsule that
  //     reads as the "Now playing" surface, not a third pill.
  //   * Expanded: MiniPlayer floats above the labeled pillow + search
  //     circle as a full-width capsule (same 79px lift as before).
  const containerClass = hidden
    ? "absolute z-30 flex"
    : "absolute left-0 right-0 z-30 px-3 pb-1";
  // Apple-style spring on the grow/shrink morph: a tuned overshoot bezier
  // (y > 1 = the capsule squishes past its target, then settles) instead
  // of the flat ease-out. Honors prefers-reduced-motion by falling back to
  // the original non-overshoot curve. CSS transition (not framer) keeps the
  // fixed-position left/right/bottom geometry exact — only the easing
  // changes, never the layout.
  const morphTransition = reduceMotion
    ? "all 260ms cubic-bezier(0.32, 0.72, 0, 1)"
    : "all 340ms cubic-bezier(0.34, 1.3, 0.5, 1)";
  const containerStyle: React.CSSProperties = hidden
    ? { bottom: 12, left: 70, right: 70, transition: morphTransition }
    : { bottom: 79, transition: morphTransition };

  // Task #547 — on lg+ web (storefront sidebar mounted) the MiniPlayer
  // anchors to the bottom-right of the content area instead of the
  // center of the viewport. Mobile/tablet stay on the 390px-wide
  // centered capsule. (We can't read `useDesktopShell` here without
  // an extra subscription; Tailwind `lg:` responsive classes do the
  // work and keep this purely declarative.)
  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-30 pointer-events-none lg:left-auto lg:right-6 lg:translate-x-0 lg:bottom-6 lg:max-w-[420px]">
    <div className={`pointer-events-auto ${containerClass}`} style={containerStyle}>
      <div
        className="relative cursor-pointer active:scale-[0.98] transition-transform"
        style={{
          borderRadius: 9999,
          // iOS 26 mobile WebKit renderer-kill mitigation: this surface
          // and BottomNav used to both run blur(36px) saturate(200%)
          // backdrops, stacked, fixed over the /collection scroll
          // list — enough GPU compositor work to trigger "A problem
          // repeatedly occurred" on iPhone 14 Pro. Light blur + higher
          // bg opacity keeps the frosted look at a tiny fraction of
          // the cost. Mirror the values used in BottomNav.glassStyle.
          background: "rgba(20, 22, 38, 0.82)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 8px 36px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset",
        }}
        onClick={() => setShowPlayer(true)}
      >
        {hidden ? (
          <div className="flex items-center gap-3 pl-3 pr-2.5 py-2">
            <img
              src={currentSong.album.artwork}
              alt={currentSong.album.title}
              className="flex-shrink-0 object-cover"
              style={{ width: 32, height: 32, borderRadius: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-fan-primary text-[13px] font-semibold truncate leading-tight">{currentSong.title}</p>
              <p className="text-fan-secondary text-[11px] truncate leading-tight">{currentSong.album.artist}</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-white active:opacity-60 transition-opacity"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="4" width="4" height="16" rx="1.5" />
                  <rect x="15" y="4" width="4" height="16" rx="1.5" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18a1 1 0 000-1.69L9.54 5.98A.998.998 0 008 6.82z" />
                </svg>
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 pl-3 pr-3 py-1.5">
            <img
              src={currentSong.album.artwork}
              alt={currentSong.album.title}
              className="flex-shrink-0 object-cover"
              style={{ width: 32, height: 32, borderRadius: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }}
            />

            <div className="flex-1 min-w-0">
              <p className="text-fan-primary text-[14px] font-semibold truncate leading-snug">{currentSong.title}</p>
              <p className="text-fan-secondary text-[12px] truncate leading-snug">{currentSong.album.artist}</p>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={togglePlay}
                className="w-9 h-9 flex items-center justify-center text-white active:opacity-60 transition-opacity"
              >
                {isPlaying ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="4" width="4" height="16" rx="1.5" />
                    <rect x="15" y="4" width="4" height="16" rx="1.5" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18a1 1 0 000-1.69L9.54 5.98A.998.998 0 008 6.82z" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={next}
                className="w-9 h-9 flex items-center justify-center text-white active:opacity-60 transition-opacity"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12z" />
                  <rect x="16" y="6" width="2" height="12" rx="1" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
