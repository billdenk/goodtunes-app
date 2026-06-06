import { useRef, useEffect, type ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useScrollHideNav } from "@/hooks/useNavVisibility";

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
  children,
}: {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  fadeTrailing?: boolean;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const trailingRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(scrollRef);

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
    <main className="h-screen w-full flex justify-center overflow-hidden lg:justify-start lg:pl-[284px]">
      <section className="relative w-full max-w-[390px] md:max-w-[760px] lg:max-w-[1200px] lg:mx-auto h-screen text-fan-primary flex flex-col">
        <header className="absolute top-0 inset-x-0 z-20 px-5 pt-14 pb-3 pointer-events-none">
          {leading && (
            <div className="pointer-events-auto absolute left-4 top-3">{leading}</div>
          )}
          <div className="flex items-end justify-between gap-2">
            <h1
              ref={titleRef}
              className="text-fan-primary text-[34px] font-bold leading-none tracking-tight will-change-[opacity,transform]"
              data-testid="text-page-title"
            >
              {title}
            </h1>
            {trailing && (
              <div ref={trailingRef} className="pointer-events-auto will-change-[opacity,transform] flex-shrink-0">
                {trailing}
              </div>
            )}
          </div>
        </header>

        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto scrollbar-hide pb-[170px]">
          <div ref={contentRef}>
            <div aria-hidden style={{ height: 128, flexShrink: 0 }} />
            {children}
          </div>
        </div>

        <MiniPlayer />
        <BottomNav />
      </section>
    </main>
  );
}
