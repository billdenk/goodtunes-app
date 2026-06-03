import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { LyricsGapDots } from "@/components/LyricsGapDots";
import { buildSyncedLines } from "@/lib/syncedLyrics";

/**
 * Shared synced-lyrics column. The Apple-Music karaoke surface — active
 * line sharp + pure white, neighbours progressively blurred + faded, the
 * column auto-scrolls to keep the active line ~28% down the viewport,
 * instrumental gaps render LyricsGapDots, and a trailing "Written by …"
 * credit rides the bottom fade.
 *
 * This is the single source of truth rendered by BOTH the mobile Now
 * Playing overlay (client/src/pages/Player.tsx) and the desktop right-side
 * lyrics slide-in panel (driven by client/src/pages/AlbumDetailDesktop.tsx
 * into the panel hosted by DesktopAlbumView). The timing engine lives in
 * client/src/lib/syncedLyrics.ts. Mobile passes the defaults below verbatim
 * so its behaviour is unchanged; the desktop panel overrides sizing/padding
 * for its narrower column.
 *
 * Sizing is applied through inline `fontSize` (a number, in px) rather than
 * Tailwind `text-[Npx]` so the design linter stays happy while the visual
 * stays pixel-identical to the original mobile overlay.
 */

const DEFAULT_MASK =
  "linear-gradient(to bottom, transparent 0, transparent 4%, rgba(0,0,0,0.4) 9%, #000 16%, #000 82%, rgba(0,0,0,0.4) 92%, transparent 100%)";

export interface SyncedLyricsProps {
  lyrics?: string | null;
  duration: number;
  syncedLyrics?: { timeMs: number; endMs?: number; text: string }[] | null;
  currentTime: number;
  onSeek: (seconds: number) => void;
  writers?: string[] | null;
  /** Gates the auto-scroll effect — the consumer keeps it true while the
   *  lyric column is actually on screen (mobile passes `showLyrics`). */
  active?: boolean;
  /** Active-line font size in px. Default 28 (mobile parity). */
  fontSize?: number;
  /** Vertical gap between rows (Tailwind class). Default `gap-3`. */
  gapClassName?: string;
  /** Where the active line lands in the viewport (0 = top, 1 = bottom).
   *  Default 0.28 — Apple-Music's ~28%-down resting position. */
  scrollOffsetRatio?: number;
  /** CSS length for the scroll viewport's top/bottom padding so the first
   *  and last lines can still center. Defaults to mobile's 18vh / 30vh. */
  paddingTop?: string;
  paddingBottom?: string;
  /** Override the top/bottom fade mask. Defaults to the mobile gradient. */
  maskImage?: string;
  /** Extra classes for the scroll container (layout context: flex-1, px-*,
   *  text alignment, etc.). */
  className?: string;
  style?: React.CSSProperties;
}

export function SyncedLyrics({
  lyrics,
  duration,
  syncedLyrics,
  currentTime,
  onSeek,
  writers,
  active = true,
  fontSize = 28,
  gapClassName = "gap-3",
  scrollOffsetRatio = 0.28,
  paddingTop = "18vh",
  paddingBottom = "30vh",
  maskImage = DEFAULT_MASK,
  className,
  style,
}: SyncedLyricsProps) {
  const syncedLines = useMemo(
    () => buildSyncedLines(lyrics, duration, syncedLyrics),
    [lyrics, syncedLyrics, duration],
  );
  const activeLineIdx = useMemo(() => {
    let activeIdx = -1;
    for (let i = 0; i < syncedLines.length; i++) {
      const t = syncedLines[i].time;
      if (t != null && currentTime >= t) activeIdx = i;
    }
    return activeIdx;
  }, [syncedLines, currentTime]);

  const lyricLineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const el = lyricLineRefs.current[activeLineIdx];
    const scroll = scrollRef.current;
    if (!el || !scroll) return;
    // Apple-style: land the active line ~28% down from the top of the
    // scroll viewport (not flush with the top edge), so the line sits
    // comfortably below the header fade-mask and there's room for the
    // next 4-5 upcoming lines to be visible.
    const targetOffset = scroll.clientHeight * scrollOffsetRatio;
    const top = el.offsetTop - targetOffset;
    scroll.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [activeLineIdx, active, scrollOffsetRatio]);

  return (
    <div
      ref={scrollRef}
      className={cn("overflow-y-auto scrollbar-hide", className)}
      style={{
        paddingTop,
        paddingBottom,
        WebkitMaskImage: maskImage,
        maskImage,
        ...style,
      }}
      data-testid="lyrics-scroll"
    >
      <div className={cn("flex flex-col", gapClassName)}>
        {syncedLines.map((line, i) => {
          if (line.isGap) {
            const gapStart = line.time as number;
            const gapEnd = line.gapEnd as number;
            const gapLen = Math.max(0.0001, gapEnd - gapStart);
            const dotState: "upcoming" | "active" | "past" =
              currentTime >= gapEnd
                ? "past"
                : currentTime >= gapStart
                  ? "active"
                  : "upcoming";
            const gapProgress =
              dotState === "active"
                ? Math.max(0, Math.min(1, (currentTime - gapStart) / gapLen))
                : 0;
            return (
              <div
                key={i}
                ref={(el) => { lyricLineRefs.current[i] = el; }}
                data-testid={`lyric-gap-${i}`}
              >
                <LyricsGapDots state={dotState} progress={gapProgress} />
              </div>
            );
          }
          if (line.isEmpty) {
            return <div key={i} className="h-2" aria-hidden />;
          }
          if (line.isHeader) {
            return (
              <div
                key={i}
                ref={(el) => { lyricLineRefs.current[i] = el; }}
                className="text-white/30 font-semibold tracking-[0.18em] uppercase pt-2"
                style={{ fontSize: 10 }}
                data-testid={`lyric-header-${i}`}
              >
                {line.text.replace(/^\s*\[|\]\s*$/g, "")}
              </div>
            );
          }
          const isActive = i === activeLineIdx;
          const isPast = activeLineIdx >= 0 && i < activeLineIdx;
          const seekable = line.time != null;
          const distance = activeLineIdx < 0 ? 0 : Math.abs(i - activeLineIdx);
          // Apple-Music GoodSync™ focus stack: every line is the SAME size;
          // differentiation comes entirely from blur depth + opacity. Blur
          // ramp is monotonic (once blurry, stays at least that blurry the
          // further from active) and caps at 6px.
          const blurPx = isActive
            ? 0
            : distance === 1
              ? 1.2
              : distance === 2
                ? 2.8
                : distance === 3
                  ? 4.5
                  : 6;
          // Opacity ramp — past lines fade faster than upcoming ones so the
          // eye naturally tracks down the page.
          const opacity = isActive
            ? 1
            : isPast
              ? Math.max(0.18, 0.50 - distance * 0.10)
              : Math.max(0.30, 0.72 - distance * 0.10);
          return (
            <div
              key={i}
              ref={(el) => { lyricLineRefs.current[i] = el; }}
              role={seekable ? "button" : undefined}
              tabIndex={seekable ? 0 : -1}
              aria-current={isActive ? "true" : undefined}
              onClick={seekable ? () => onSeek(line.time as number) : undefined}
              onKeyDown={seekable ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSeek(line.time as number);
                }
              } : undefined}
              className={`select-none ${seekable ? "cursor-pointer" : "cursor-default"}`}
              style={{
                color: "#FFFFFF",
                opacity,
                fontWeight: isActive ? 800 : 700,
                fontSize,
                lineHeight: 1.22,
                filter: blurPx > 0 ? `blur(${blurPx}px)` : "none",
                transition:
                  "opacity 400ms ease, filter 400ms ease, text-shadow 350ms ease",
                textShadow: isActive ? "0 1px 18px rgba(0,0,0,0.35)" : "none",
                letterSpacing: "-0.01em",
                willChange: distance <= 2 ? "filter, opacity" : undefined,
              }}
              data-testid={`lyric-line-${i}`}
              data-active={isActive}
            >
              {line.text}
            </div>
          );
        })}
        {Array.isArray(writers) && writers.length > 0 && (
          <div
            className="text-white/45 italic pt-6"
            style={{ fontSize: 12 }}
            data-testid="text-written-by"
          >
            Written by {writers.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
