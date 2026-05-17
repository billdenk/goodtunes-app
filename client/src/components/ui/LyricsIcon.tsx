import { Mic2 } from "lucide-react";

type Props = {
  className?: string;
  size?: number;
  strokeWidth?: number;
};

/**
 * GoodTunes canonical "lyrics" glyph.
 *
 * We use Lucide's `Mic2` (the singer's mic / cardioid mic). Considered Apple's
 * `quote.bubble` SF Symbol but decided against it — the SF Symbol relies on
 * Apple's custom font hinting to render the quote marks at small sizes, and
 * any inline-SVG approximation we tried looked off. Mic2 reads cleanly at
 * 16–22px, is what Spotify uses for the same concept, and Bill prefers it.
 *
 * One icon, two surfaces:
 *   - Mobile player (client/src/pages/Player.tsx → lyrics button)
 *   - Admin Tracks-tab BottomDock (artifacts/mockup-sandbox/.../Seamless.tsx)
 *     — sandbox imports Mic2 from lucide-react directly since it can't reach
 *       this primitive. Keep both surfaces on Mic2 unless this wrapper changes.
 */
export function LyricsIcon({ className, size = 22, strokeWidth = 1.8 }: Props) {
  return (
    <Mic2
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden
    />
  );
}
