import { useRef, useEffect, type ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useScrollHideNav } from "@/hooks/useNavVisibility";
import { useLyricsRailOpen } from "@/components/ui/DesktopLyricsRail";
import { LYRICS_RAIL_CONTENT_OFFSET } from "@/hooks/useDesktopShell";
import { FAN_TOP_CHROME_INSET } from "@/components/ui/SheetChrome";

// ---------------------------------------------------------------------------
// Shared screen chrome — Apple-Music large header + collapsing title, the
// scroll container that drives the dock's collapse-to-puck, the iOS-WebKit
// re-layout nudge, and the MiniPlayer + BottomNav stack. Every fan-library
// page renders inside one of these so the chrome can't drift. The big title
// fades + lifts on scroll; the trailing slot fades too only when
// `fadeTrailing` (the account avatar on root tabs) — detail-view controls
// (back + sort) stay pinned so they're always reachable. (Task #1376.)
// ---------------------------------------------------------------------------
export function FanScreen({
  title,
  leading,
  trailing,
  fadeTrailing = false,
  footer,
  children,
}: {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  fadeTrailing?: boolean;
  // Optional bottom-pinned overlay rendered as a sibling of the scroll
  // container (the section is `relative`), e.g. the Search page's
  // bottom-anchored search bar that floats above the MiniPlayer + BottomNav.
  footer?: ReactNode;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const trailingRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(scrollRef);
  // When the persistent lyrics rail is open (desktop only), reserve its width
  // on the right so content + the centered dock clear the rail card. railOpen
  // is already gated on the desktop shell, so the inline padding is only ever
  // set at lg+ web. (Task #1523)
  const railOpen = useLyricsRailOpen();

  // iOS Safari renderer-OOM / stale-scroll-bounds mitigation: when content
  // grows asynchronously (artwork decodes, "Show more" appends), nudge a
  // re-layout so WebKit recomputes the scrollable bounds and the bottom row
  // stays reachable.
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    let firstRun = true;
    const nudge = () => {
      const top = el.scrollTop;
      el.style.overflowY = "hidden";
      void el.offsetHeight;
      el.style.overflowY = "auto";
      el.scrollTop = top;
    };
    const ro = new ResizeObserver(() => {
      if (firstRun) {
        firstRun = false;
        return;
      }
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(nudge);
    });
    ro.observe(content);
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Apple-Music collapsing header: the large title fades + lifts away first
  // (0 → 28px of scroll); the account avatar follows a beat later when
  // `fadeTrailing`. Driven imperatively off the scroll container (DOM style
  // mutation inside rAF) so it never re-renders per frame.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let ticking = false;
    let raf = 0;
    const apply = () => {
      const y = el.scrollTop;
      const tp = Math.min(1, Math.max(0, y / 28));
      if (titleRef.current) {
        titleRef.current.style.opacity = String(1 - tp);
        titleRef.current.style.transform = `translateY(${-10 * tp}px)`;
      }
      if (fadeTrailing && trailingRef.current) {
        const ap = Math.min(1, Math.max(0, (y - 20) / 50));
        trailingRef.current.style.opacity = String(1 - ap);
        trailingRef.current.style.transform = `scale(${1 - 0.12 * ap})`;
        trailingRef.current.style.pointerEvents = ap > 0.9 ? "none" : "auto";
      }
      ticking = false;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(apply);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    apply();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [fadeTrailing]);

  return (
    <main
      className="h-screen w-full flex justify-center overflow-hidden lg:justify-start lg:pl-[284px]"
      // `100dvh` (inline) tracks the visible viewport on iPad Safari so the
      // shell exactly fills the screen — `h-screen` (100vh) resolves against
      // the chrome-HIDDEN viewport, making the shell taller than what's
      // visible, which lets the whole page rubber-band/overscroll and reveal a
      // navy/black gap at the top. Falls back to the `h-screen` class where
      // `dvh` is unsupported (the invalid inline value is simply dropped).
      style={{
        height: "100dvh",
        ...(railOpen ? { paddingRight: LYRICS_RAIL_CONTENT_OFFSET } : {}),
      }}
    >
      <section
        className="relative w-full max-w-[390px] md:max-w-[760px] lg:max-w-[1200px] lg:mx-auto h-screen text-fan-primary flex flex-col"
        style={{ height: "100dvh" }}
      >
        {/* The leading (left/back) and trailing (right/sort-filter) slots both
            pin their `top` to the shared FAN_TOP_CHROME_INSET (Task #1621) so
            they sit on ONE horizontal line at a consistent height, tucked just
            below the device status / info bar — resolving the old `top-3` vs
            `top-14` mismatch. The header's top padding derives from the same
            inset plus the 44px control height so the title row always clears the
            control line on every device (incl. notched / safe-area surfaces). */}
        <header
          className="absolute top-0 inset-x-0 z-20 px-5 pb-3 pointer-events-none"
          style={{ paddingTop: `calc(${FAN_TOP_CHROME_INSET} + 44px)` }}
        >
          {leading && (
            <div
              className="pointer-events-auto absolute left-4"
              style={{ top: FAN_TOP_CHROME_INSET }}
            >
              {leading}
            </div>
          )}
          {trailing && (
            <div
              ref={trailingRef}
              className="pointer-events-auto absolute right-5 will-change-[opacity,transform]"
              style={{ top: FAN_TOP_CHROME_INSET }}
            >
              {trailing}
            </div>
          )}
          {/* Title sits in a fixed-height (36px) row so its vertical position is
              anchored to the content top regardless of which trailing control is
              rendered. The trailing slot is absolutely positioned at the same
              content top, so a taller control (44px IconButton) no longer
              bottom-shifts the title the way `items-end` against the row did. */}
          <div className="flex items-end h-9 pr-14">
            <h1
              ref={titleRef}
              className="text-fan-primary text-[34px] font-bold leading-none tracking-tight will-change-[opacity,transform]"
              data-testid="text-page-title"
            >
              {title}
            </h1>
          </div>
        </header>

        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto overscroll-contain scrollbar-hide pb-[170px]">
          <div ref={contentRef}>
            {/* Spacer that pushes the first content row below the absolutely
                positioned header. Derive it from the SAME chrome inset the
                header uses (FAN_TOP_CHROME_INSET + 44px control + 36px title
                row + 12px pb = header bottom edge) plus a comfortable ~20px
                Apple-Music large-title margin, so the title always clears the
                content with breathing room on flat AND notched/safe-area
                devices — a fixed height under-clears on notched screens. */}
            <div
              aria-hidden
              style={{ height: `calc(${FAN_TOP_CHROME_INSET} + 112px)`, flexShrink: 0 }}
            />
            {children}
          </div>
        </div>

        {footer}
        <MiniPlayer />
        <BottomNav />
      </section>
    </main>
  );
}
