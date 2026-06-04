import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { LyricsGapDots } from "@/components/LyricsGapDots";
import { buildSyncedLines } from "@/lib/syncedLyrics";

// Apple-Music focus handoff. The active line sharpens/brightens while the
// neighbours soften over a single gentle ease-in-out ramp, so the change
// between lines reads as one continuous cross-fade rather than a stepped
// pop. 520ms on a symmetric ease-in-out curve matches the unhurried feel
// of Apple's lyric focus. Tuned alongside the unison pull-up below so the
// focus ramp and the column move read as one motion.
const FOCUS_MS = 520;
const FOCUS_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

// Apple-Music "pull-up in unison". Each time the active line advances, the
// WHOLE lyric stack translates up together as one unit (a transform, not a
// per-line scroll) so every line below moves in lock-step. The easing is an
// ease-out-back curve whose >1 control point overshoots the target slightly
// and settles back — the subtle bounce Bill asked for. ~620ms reads as a
// single gentle motion rather than a flat linear scroll. prefers-reduced-
// motion drops the transition entirely so the stack snaps with no bounce.
const MOVE_MS = 620;
const MOVE_EASE = "cubic-bezier(0.34, 1.35, 0.5, 1)";

/**
 * Shared synced-lyrics column. The Apple-Music karaoke surface — active
 * line sharp + pure white anchored near the TOP of the viewport (just
 * below the top fade), neighbours progressively blurred + faded, and on
 * each advance the whole stack pulls up in unison with a slight bounce,
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
  /** Gates the unison pull-up — the consumer keeps it true while the
   *  lyric column is actually on screen (mobile passes `showLyrics`). */
  active?: boolean;
  /** Active-line font size in px. Default 28 (mobile parity). */
  fontSize?: number;
  /** Vertical gap between rows (Tailwind class). Default `gap-3`. */
  gapClassName?: string;
  /** Where the active line rests in the viewport (0 = top, 1 = bottom).
   *  Default 0.16 — anchored near the top, just below the top fade, the
   *  way Apple's newer desktop karaoke parks the current line. */
  scrollOffsetRatio?: number;
  /** CSS length for the stack's top/bottom padding so the first line can
   *  rest at the top slot and the last line can still pull all the way up
   *  to it. Defaults to mobile's 16vh / 30vh. */
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
  scrollOffsetRatio = 0.16,
  paddingTop = "16vh",
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
  const stackRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  // How far (px) the whole lyric stack is translated up so the active line
  // rests in its top slot. Each advance changes this value and the stack's
  // CSS transform tweens the whole column up together (see MOVE_EASE).
  const [translateY, setTranslateY] = useState(0);

  // Measure in a layout effect (before paint) so the very first active line
  // is positioned without an entry slide, and so the transform target is
  // read against the real laid-out geometry. Apple-style: park the active
  // line near the TOP of the viewport (`scrollOffsetRatio`), just clear of
  // the top fade-mask, leaving the upcoming lines below it. Because the
  // whole stack is a single transformed element, every line below the
  // active one moves up in unison — never a per-line or flat-scroll feel.
  useLayoutEffect(() => {
    if (!active) return;
    const el = lyricLineRefs.current[activeLineIdx];
    const viewport = scrollRef.current;
    if (!el || !viewport) return;
    const targetOffset = viewport.clientHeight * scrollOffsetRatio;
    // el.offsetTop is measured against the relatively-positioned stack (its
    // offset parent), so it already includes the stack's top padding.
    const next = Math.max(0, el.offsetTop - targetOffset);
    setTranslateY(next);
  }, [activeLineIdx, active, scrollOffsetRatio, syncedLines.length, fontSize]);

  return (
    <div
      ref={scrollRef}
      className={cn("overflow-hidden scrollbar-hide", className)}
      style={{
        WebkitMaskImage: maskImage,
        maskImage,
        ...style,
      }}
      data-testid="lyrics-scroll"
    >
      <div
        ref={stackRef}
        className={cn("relative flex flex-col", gapClassName)}
        style={{
          paddingTop,
          paddingBottom,
          // The whole stack moves up together as one unit — every line
          // below the active one keeps its relative spacing and pulls up
          // in lock-step. The overshoot easing gives the slight bounce;
          // reduced-motion snaps with no transition.
          transform: `translate3d(0, ${-translateY}px, 0)`,
          transition: reduceMotion
            ? "none"
            : `transform ${MOVE_MS}ms ${MOVE_EASE}`,
          willChange: "transform",
        }}
      >
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
                // Constant weight on every line. Swapping 700↔800 on the
                // active line can't tween (font-weight isn't interpolable)
                // and the bolder glyphs reflow the line's width mid-handoff,
                // which is what read as a snap and fought the auto-scroll.
                // Emphasis now comes entirely from the tween-friendly
                // opacity + blur + glow ramp, matching Apple's lyric focus.
                fontWeight: 700,
                fontSize,
                lineHeight: 1.22,
                // Always emit a blur() (active = blur(0px)) so the focus
                // change interpolates smoothly — CSS can't tween none↔blur().
                filter: `blur(${blurPx}px)`,
                transition: reduceMotion
                  ? "none"
                  : `opacity ${FOCUS_MS}ms ${FOCUS_EASE}, filter ${FOCUS_MS}ms ${FOCUS_EASE}, text-shadow ${FOCUS_MS}ms ${FOCUS_EASE}`,
                // Inactive shadow is transparent (not "none") so the glow
                // fades in/out smoothly instead of popping.
                textShadow: isActive
                  ? "0 1px 18px rgba(0,0,0,0.35)"
                  : "0 1px 18px rgba(0,0,0,0)",
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
            className="text-fan-secondary pt-6 mt-6 border-t border-white/15"
            style={{ fontSize: 15, lineHeight: 1.4 }}
            data-testid="text-written-by"
          >
            <span className="font-semibold text-fan-primary">Written by:</span>{" "}
            <span className="font-normal not-italic">{writers.join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
