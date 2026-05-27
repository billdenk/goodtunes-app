/* ─── LyricsGapDots — Apple-Music-style instrumental pulse ─────────────
   Three dots that sit above the upcoming sung line whenever there's a
   meaningful instrumental gap (≥3s of silence). They're ALWAYS rendered
   when the gap exists — never mount/unmount — so the row scrolls with
   the rest of the lyrics the way Apple's do. Three visual states:

     • upcoming → all three small + faint (placeholder)
     • active   → dots fill left→right as `progress` (0..1) advances
     • past     → all three at full size + dimmed like a past lyric line

   Sizing/opacity all live in inline styles with a longer, eased
   transition so the dots glide between states instead of snapping.

   Shared between the admin GoodSync preview (AdminAlbum) and the fan
   mobile player (Player) so the two stay visually identical. */
export function LyricsGapDots({
  state,
  progress,
}: {
  state: "upcoming" | "active" | "past";
  progress: number;
}) {
  return (
    <div
      className="flex items-center gap-1.5 py-1.5 pl-0.5"
      aria-label="Instrumental"
      data-testid="lyrics-gap-dots"
      data-state={state}
    >
      {[0, 1, 2].map((i) => {
        // p (0..1) drives the *active* fill. Upcoming = 0, past = 1.
        const p =
          state === "past"
            ? 1
            : state === "upcoming"
              ? 0
              : Math.max(0, Math.min(1, progress * 3 - i));
        // Past dots match the past-line color (slate-300); active +
        // upcoming dots use the upcoming-line color (slate-500).
        const color = state === "past" ? "rgb(203 213 225)" : "rgb(100 116 139)";
        return (
          <span
            key={i}
            className="rounded-full transition-all duration-300 ease-out"
            style={{
              width: 6 + p * 3,
              height: 6 + p * 3,
              opacity:
                state === "past" ? 0.55 : 0.25 + p * 0.7,
              backgroundColor: color,
            }}
          />
        );
      })}
    </div>
  );
}
