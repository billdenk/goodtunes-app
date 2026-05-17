type Props = {
  className?: string;
  size?: number;
  strokeWidth?: number;
};

/**
 * GoodTunes canonical "lyrics" glyph — a speech bubble with two filled
 * 9-shaped quote marks inside, tail at bottom-left. Apple-Music-style.
 *
 * One icon, two surfaces:
 *   - Mobile player (client/src/pages/Player.tsx → lyrics button)
 *   - Admin Tracks-tab BottomDock (artifacts/mockup-sandbox/.../Seamless.tsx)
 *     — the sandbox inlines the same path data (it can't import from
 *     client/src/), keep both in sync if this ever changes.
 *
 * Stroke uses `currentColor`; size + weight are tunable per surface.
 */
export function LyricsIcon({ className, size = 22, strokeWidth = 1.6 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* Rounded speech-bubble with tail dropping to bottom-left. */}
      <path d="M6 3.5h12a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1-2.5 2.5h-4.5l-3.5 3v-3H6A2.5 2.5 0 0 1 3.5 14V6A2.5 2.5 0 0 1 6 3.5z" />
      {/* Two filled quote marks — left + right, classic curly "9" shape. */}
      <path
        d="M8.3 8.2c-1.3.3-2.1 1.35-2.1 2.65V12.5h2.6V9.95h-.7c.05-.4.35-.75.8-.9z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M13.8 8.2c-1.3.3-2.1 1.35-2.1 2.65V12.5h2.6V9.95h-.7c.05-.4.35-.75.8-.9z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
