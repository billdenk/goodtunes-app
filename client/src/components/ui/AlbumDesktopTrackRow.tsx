import { useState } from "react";
import { MoreHorizontal, Play, Pause, ListStart, ListEnd, ListPlus, Heart } from "lucide-react";
import { ExplicitBadge } from "@/components/ui/ExplicitBadge";
import { IconButton } from "@/components/ui/IconButton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/* Rose accent — currently-playing row + hover play-affordance.
   Task #70 calls for "rose" play triangle / equalizer / paused glyph
   (Apple-Music desktop accent). #FF5470 is the only rose in the GoodTunes
   palette. Inline so this primitive stays self-contained. */
const ROSE = "#FF5470";

export type AlbumDesktopTrackRowProps = {
  trackNumber: number;
  title: string;
  duration: string;
  isCurrent: boolean;
  isPlaying: boolean;
  isExplicit?: boolean;
  /** Display-only — when true and the row is not currently playing,
   *  the leading number cell renders a small dimmed-white favorite heart
   *  (rgba(255,255,255,0.55), the shared quiet-indicator value) instead.
   *  Not a tap target; favoriting is toggled from the ⋯ menu. */
  isFavorite?: boolean;
  state: "locked" | "preview" | "full";
  onPlay?: () => void;
  /** Optional "add to playlist" affordance — drives the ⋯ menu's
   *  "Add to Playlist" item. Omit to hide the menu item. */
  onAdd?: () => void;
  /** ⋯ track-menu actions (Apple-Music context menu). Omit any to hide
   *  that one item; the ⋯ trigger renders whenever the row isn't locked. */
  onPlayNext?: () => void;
  onPlayLast?: () => void;
  onToggleFavorite?: () => void;
  /** When false, the trailing ⋯ context menu is suppressed entirely (used
   *  on the not-owned preview/buy surface, where queue/playlist/favorite
   *  actions don't apply yet). Defaults to true for the owned library. */
  showMenu?: boolean;
};

/**
 * Desktop fan-facing track row — Apple-Music density.
 *
 * States:
 *   • Default      → `#` · title · ⋯ · runtime.
 *   • Hover        → `#` swaps to a rose Play triangle; row gets a soft
 *                     elevated background; `+` chip appears beside runtime.
 *   • Currently playing → soft elevated background, `#` replaced by a
 *                     rose animated equalizer (or rose `❚❚` when paused).
 *   • Locked       → muted text, no runtime/menu/play.
 */
export function AlbumDesktopTrackRow({
  trackNumber,
  title,
  duration,
  isCurrent,
  isPlaying,
  isExplicit,
  isFavorite = false,
  state,
  onPlay,
  onAdd,
  onPlayNext,
  onPlayLast,
  onToggleFavorite,
  showMenu = true,
}: AlbumDesktopTrackRowProps) {
  const [hover, setHover] = useState(false);
  const interactive = state !== "locked";
  const showPlayGlyph = interactive && hover && !isCurrent;

  // Apple parity: rows are FLUSH (transparent) at rest with a thin
  // hairline separator between them — they should not all look pre-
  // hovered. The soft elevated background lifts in only on the hovered
  // row and the currently-playing row.
  const elevated = hover || isCurrent;
  const bg = elevated ? "rgba(255,255,255,0.08)" : "transparent";

  return (
    <div
      className="group relative flex items-center gap-3 h-11 px-3 rounded-xl transition-colors"
      style={{ background: bg, cursor: interactive && onPlay ? "pointer" : "default" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (interactive && onPlay) onPlay();
      }}
      data-testid={`row-track-${trackNumber}`}
      data-row-state={state}
      data-row-current={isCurrent ? "true" : "false"}
    >
      {/* Apple-style hairline separator between flush rows. Light, persistent
          `white/10` line that stays visible on hover and on the currently-
          playing row (matching Apple Music, where the dividers are always
          present). See docs/design-system.md → "Track-row hairline". */}
      <span
        aria-hidden
        className="absolute left-3 right-3 bottom-0 h-px bg-white/10"
      />
      {/* Leading favorite heart — Apple-style, sits in the left gutter
          (absolute, just left of the number) so it never pushes the number
          or title inward. Quiet white ~55%, not the loud brand rose; not a
          tap target. Favoriting is toggled from the ⋯ menu. */}
      {isFavorite && (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="rgba(255,255,255,0.55)"
          aria-hidden
          data-testid={`icon-favorite-row-${trackNumber}`}
          className="absolute left-0 -ml-1 top-1/2 -translate-y-1/2"
        >
          <path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5 6.5 5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3 4 0 5.5 4 4 7-2.5 4.5-9.5 9-9.5 9z" />
        </svg>
      )}

      {/* Track number / play affordance / equalizer cell. */}
      <div className="w-6 relative h-5">
        {/* Plain number — visible whenever the row is at rest. Stacked
            absolute + flex-centered + justify-end pr-[1px] so it occupies the
            EXACT same box as the play triangle / equalizer below; otherwise
            the glyph jumps a hair on hover. */}
        <span
          className={[
            "absolute inset-0 inline-flex items-center justify-end pr-[1px] text-xs tabular-nums transition-opacity",
            state === "locked" ? "text-fan-faint" : "text-fan-primary/[0.32]",
            showPlayGlyph || isCurrent ? "opacity-0" : "opacity-100",
          ].join(" ")}
        >
          {trackNumber}
        </span>

        {/* Hover play triangle — rose, replaces the number on hover. */}
        {interactive && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlay?.();
            }}
            aria-label={`Play track ${trackNumber}`}
            data-testid={`button-play-row-${trackNumber}`}
            className={[
              "absolute inset-0 inline-flex items-center justify-end pr-[1px] transition-opacity",
              showPlayGlyph ? "opacity-100" : "opacity-0 pointer-events-none",
            ].join(" ")}
            style={{ color: ROSE }}
          >
            {/* Nudge right ~2px: the Lucide Play triangle's tip ends at
                x=20/24, so it carries transparent whitespace on its right
                edge — without this the triangle's visual edge sits left of
                the right-aligned resting numbers above/below it. */}
            <Play className="w-3.5 h-3.5 fill-current translate-x-[2px]" strokeWidth={0} />
          </button>
        )}

        {/* Currently-playing indicator — animated equalizer while playing,
            rose ❚❚ glyph while paused. Sits on top of the number cell. */}
        {isCurrent && (
          <div
            className="absolute inset-0 inline-flex items-center justify-end pr-[1px]"
            aria-hidden
            data-testid={`indicator-current-${trackNumber}`}
          >
            {isPlaying ? <Equalizer color={ROSE} /> : <PausedGlyph color={ROSE} />}
          </div>
        )}
      </div>

      {/* Title. */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        <span
          className={[
            "truncate text-[14px]",
            state === "locked" ? "text-fan-secondary font-medium" : "text-fan-primary",
            state === "preview" ? "font-semibold" : state === "full" ? "font-medium" : "",
            isCurrent ? "font-semibold" : "",
          ].join(" ")}
          style={isCurrent ? { color: ROSE } : undefined}
          data-testid={`text-track-title-${trackNumber}`}
        >
          {title}
        </span>
        {isExplicit && <ExplicitBadge tone="slate" />}
      </div>

      {/* Runtime — hidden on locked rows (Apple's pre-release pattern). */}
      <div className="w-12 text-right">
        {state !== "locked" && (
          <span className="text-fan-secondary text-[13px] tabular-nums">{duration}</span>
        )}
      </div>

      {/* ⋯ menu — hidden on locked rows and wherever showMenu is false
          (the not-owned preview/buy surface). Apple-Music track context
          menu: Play Next / Play Last / Add to Playlist / Favorite. */}
      {state !== "locked" && showMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              variant="ghost"
              size="md"
              label={`More options for ${title}`}
              data-testid={`button-track-more-${trackNumber}`}
              onClick={(e) => e.stopPropagation()}
              className="-mr-2 text-fan-secondary hover:text-white"
            >
              <MoreHorizontal strokeWidth={2} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(e) => e.stopPropagation()}
            className="min-w-[208px] rounded-2xl p-1.5 text-white backdrop-blur-xl"
            style={{
              background: "rgba(11,19,54,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {onPlayNext && (
              <DropdownMenuItem
                data-testid={`menu-track-play-next-${trackNumber}`}
                onSelect={() => onPlayNext()}
                className="gap-3 rounded-lg px-3 py-2 text-sm font-normal text-white focus:bg-white/10 focus:text-white"
              >
                <ListStart className="w-4 h-4" /> Play Next
              </DropdownMenuItem>
            )}
            {onPlayLast && (
              <DropdownMenuItem
                data-testid={`menu-track-play-last-${trackNumber}`}
                onSelect={() => onPlayLast()}
                className="gap-3 rounded-lg px-3 py-2 text-sm font-normal text-white focus:bg-white/10 focus:text-white"
              >
                <ListEnd className="w-4 h-4" /> Play Last
              </DropdownMenuItem>
            )}
            {(onPlayNext || onPlayLast) && (onAdd || onToggleFavorite) && (
              <DropdownMenuSeparator className="bg-white/10" />
            )}
            {onAdd && (
              <DropdownMenuItem
                data-testid={`menu-track-add-playlist-${trackNumber}`}
                onSelect={() => onAdd()}
                className="gap-3 rounded-lg px-3 py-2 text-sm font-normal text-white focus:bg-white/10 focus:text-white"
              >
                <ListPlus className="w-4 h-4" /> Add to Playlist…
              </DropdownMenuItem>
            )}
            {onToggleFavorite && (
              <DropdownMenuItem
                data-testid={`menu-track-favorite-${trackNumber}`}
                onSelect={() => onToggleFavorite()}
                className="gap-3 rounded-lg px-3 py-2 text-sm font-normal text-white focus:bg-white/10 focus:text-white"
              >
                <Heart
                  className="w-4 h-4"
                  style={isFavorite ? { color: ROSE, fill: ROSE } : undefined}
                />
                {isFavorite ? "Remove from Favorites" : "Add to Favorites"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {(state === "locked" || !showMenu) && (
        <div className="w-11 -mr-2" aria-hidden />
      )}
    </div>
  );
}

/**
 * Three-bar animated equalizer. CSS-only — each bar has its own keyframe
 * + delay so they bob out of phase. Used for the currently-playing row
 * indicator. Brand-rose (#FF5470).
 */
function Equalizer({ color }: { color: string }) {
  return (
    <div
      className="flex items-end gap-[2px] h-3.5"
      role="img"
      aria-label="Now playing"
    >
      <span
        className="w-[3px] rounded-sm"
        style={{ background: color, animation: "gt-eq 0.9s ease-in-out -0.2s infinite" }}
      />
      <span
        className="w-[3px] rounded-sm"
        style={{ background: color, animation: "gt-eq 0.9s ease-in-out -0.6s infinite" }}
      />
      <span
        className="w-[3px] rounded-sm"
        style={{ background: color, animation: "gt-eq 0.9s ease-in-out -0.4s infinite" }}
      />
      <style>{`
        @keyframes gt-eq {
          0%, 100% { height: 30%; }
          50% { height: 100%; }
        }
      `}</style>
    </div>
  );
}

/**
 * Static rose "❚❚" glyph shown on the currently-playing row while
 * playback is paused. Same dimensions as the equalizer so the cell
 * doesn't jump between states.
 */
function PausedGlyph({ color }: { color: string }) {
  return (
    // Nudge right ~3.5px: the Lucide Pause glyph's right bar ends at
    // x=18/24, leaving transparent whitespace on its right edge. Without
    // this it would sit left of the right-aligned numbers / equalizer and
    // produce a horizontal jump when switching playing → paused.
    <Pause
      className="w-3.5 h-3.5 fill-current translate-x-[3.5px]"
      strokeWidth={0}
      style={{ color }}
    />
  );
}
