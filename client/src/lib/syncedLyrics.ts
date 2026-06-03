// Shared synced-lyrics engine. Extracted from the mobile Now Playing
// karaoke overlay (client/src/pages/Player.tsx) so the mobile player and
// the desktop immersive view render the exact same line timing, section
// headers, instrumental gap rows, and GoodSync auto-distribution fallback
// from a single source of truth. The React rendering that consumes this
// (active-line tracking, auto-scroll centering, focus-stack blur/fade,
// LyricsGapDots) lives in client/src/components/ui/SyncedLyrics.tsx.

// One rendered row of the lyric column.
export type SyncedLine = {
  text: string;
  isHeader: boolean;
  isEmpty: boolean;
  time: number | null;
  // Instrumental gap row — when true, the renderer draws LyricsGapDots
  // instead of a lyric line. `time` is the gap start (when the dots
  // become active) and `gapEnd` is the gap end (when the next cue
  // starts, or duration for a trailing outro gap). Only emitted when
  // we have real cue timing data (syncedLyrics with endMs); the plain-
  // lyrics fallback never produces gap rows so those tracks render
  // exactly as before.
  isGap?: boolean;
  gapEnd?: number;
};

// Build a line-level synced lyric track. Prefers real per-line timing
// (an uploaded .vtt parsed into syncedLyrics); otherwise distributes the
// plain-text lyrics evenly across the song's duration with a small lead-in
// and outro. Section headers ([Verse 1], [Chorus], etc.) render as dimmed
// labels — they're not assigned a timestamp and can't be tapped to seek.
export function buildSyncedLines(
  lyrics: string | undefined | null,
  duration: number,
  syncedLyrics?: { timeMs: number; endMs?: number; text: string }[] | null,
): SyncedLine[] {
  // Preferred path: real per-line timing from an uploaded .vtt file. Each
  // cue becomes one rendered line with seconds-precision time (the overlay
  // compares to currentTime in seconds). Section-header detection still
  // runs so [Verse 1]-style cues render dimmed + un-tappable.
  if (syncedLyrics && syncedLyrics.length > 0) {
    const out: SyncedLine[] = [];
    // Same gap-detection rule the admin GoodSync preview uses:
    // measure silence AFTER the previous cue's endMs (not from its
    // start), threshold ≥3s, and synthesize an estimated end when
    // endMs is missing (older synced data without STT timing) so
    // obvious instrumentals still get dots. Intro gap counts: prevEnd
    // is 0 before the first cue. Trailing gap is handled after the
    // loop using `duration`.
    for (let i = 0; i < syncedLyrics.length; i++) {
      const cue = syncedLyrics[i];
      const cueTime = cue.timeMs / 1000;
      const prevCue = i === 0 ? null : syncedLyrics[i - 1];
      const prevEnd = !prevCue
        ? 0
        : prevCue.endMs != null
          ? prevCue.endMs / 1000
          : Math.min(cueTime - 0.3, prevCue.timeMs / 1000 + 3);
      const silence = cueTime - prevEnd;
      if (silence >= 3) {
        out.push({
          text: "",
          isHeader: false,
          isEmpty: false,
          isGap: true,
          time: prevEnd,
          gapEnd: cueTime,
        });
      }
      const text = cue.text;
      const trimmed = text.trim();
      const isHeader = /^\[.*\]$/.test(trimmed);
      out.push({
        text,
        isHeader,
        isEmpty: trimmed === "",
        time: isHeader ? null : cueTime,
      });
    }
    // Trailing outro gap — only if we know the song duration and the
    // last cue's end (or our estimate of it).
    if (duration > 0) {
      const last = syncedLyrics[syncedLyrics.length - 1];
      const lastEnd =
        last.endMs != null
          ? last.endMs / 1000
          : Math.min(duration, last.timeMs / 1000 + 3);
      const trailing = duration - lastEnd;
      if (trailing >= 3) {
        out.push({
          text: "",
          isHeader: false,
          isEmpty: false,
          isGap: true,
          time: lastEnd,
          gapEnd: duration,
        });
      }
    }
    return out;
  }
  // Fallback: distribute the plain-text lyrics evenly across duration.
  if (!lyrics || !duration || duration <= 0) {
    return (lyrics ?? "").split("\n").map((line) => ({
      text: line,
      isHeader: /^\s*\[.*\]\s*$/.test(line),
      isEmpty: line.trim() === "",
      time: null,
    }));
  }
  const raw = lyrics.split("\n");
  // Classify each line and assign it a "weight" representing roughly how
  // long it occupies in the song:
  //   • sung line  → weight 1
  //   • blank line → weight 0.6 (represents a brief musical gap between
  //                  stanzas; gives the verse below it a realistic delay
  //                  instead of being mashed up against the previous one)
  //   • header     → weight 0 (rendered dimmed, not timed)
  // Previously blank lines were stripped entirely, so all the time that
  // should have fallen on stanza gaps got re-spread back onto the sung
  // lines — making every verse creep ahead of where it actually lands.
  type Slot = { idx: number; weight: number; timeable: boolean };
  const slots: Slot[] = raw.map((line, idx) => {
    const t = line.trim();
    if (!t) return { idx, weight: 0.6, timeable: false };
    if (/^\[.*\]$/.test(t)) return { idx, weight: 0, timeable: false };
    return { idx, weight: 1, timeable: true };
  });
  // Lead-in scales with song length so longer songs (which usually have
  // longer instrumental intros) don't fire line 1 at 1.5s while the singer
  // is still 15s away. ~4% of duration, clamped to [1.5s, 8s]. Tail stays
  // tight so the last line still lands before the fade-out. A real .vtt
  // upload overrides all of this — this is only the no-timing fallback.
  const lead = Math.max(1.5, Math.min(8, duration * 0.04));
  const tail = Math.max(2, duration * 0.02);
  const usable = Math.max(1, duration - lead - tail);
  const totalWeight = slots.reduce((s, sl) => s + sl.weight, 0) || 1;
  // Walk slots cumulatively; each sung line's timestamp is the cumulative
  // weight *up to and including* the previous slot, scaled into usable.
  // That way the line lands at the START of its own slot, not the middle,
  // and the blank-line weight pushes the next verse later. Float seconds
  // (no Math.round) — adjacent lines no longer collide on the same second
  // and the active-line transition feels continuous.
  const timeMap: Record<number, number> = {};
  let cumulative = 0;
  for (const slot of slots) {
    if (slot.timeable) {
      const t = lead + (cumulative / totalWeight) * usable;
      timeMap[slot.idx] = Math.min(Math.max(0, duration - 0.5), t);
    }
    cumulative += slot.weight;
  }
  return raw.map((line, i) => ({
    text: line,
    isHeader: /^\s*\[.*\]\s*$/.test(line),
    isEmpty: line.trim() === "",
    time: timeMap[i] ?? null,
  }));
}
