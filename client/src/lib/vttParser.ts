// WebVTT parser for synced lyrics. Returns a flat list of cues with the
// cue's start time (ms) + cue text. We deliberately ignore end times,
// cue settings, regions, and styling — for the line-level lyrics overlay
// in Player.tsx, all we need is "at time T, show line X". Multi-line
// cues are collapsed to a single line with " " between fragments because
// the overlay renders one line per cue.
//
// Spec reference: https://www.w3.org/TR/webvtt1/. We don't use the
// browser's native TextTrack API because it requires an attached
// <video>/<audio> element and a same-origin .vtt URL; we want to parse a
// user-pasted file directly in the admin editor.

export type SyncedLyricCue = { timeMs: number; text: string };

// Matches `HH:MM:SS.mmm` or `MM:SS.mmm` (hours optional, per spec).
const TS_RE = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\.(\d{3})/;
// A cue timing line has the form "<start> --> <end> [settings]".
const TIMING_LINE_RE = /-->/;

function parseTimestamp(ts: string): number | null {
  const m = ts.match(TS_RE);
  if (!m) return null;
  const hours = m[1] ? Number(m[1]) : 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  const millis = Number(m[4]);
  if ([hours, minutes, seconds, millis].some((n) => Number.isNaN(n))) return null;
  return hours * 3_600_000 + minutes * 60_000 + seconds * 1_000 + millis;
}

// Strip WebVTT inline tags like <c.classname>, <v Speaker>, <i>, etc.
// We keep only the visible text so the overlay renders cleanly.
function stripInlineTags(s: string): string {
  return s.replace(/<\/?[^>]+>/g, "").trim();
}

export function parseVtt(raw: string): SyncedLyricCue[] {
  if (!raw) return [];
  // Normalize line endings — VTT files in the wild come with CRLF.
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");

  // Spec requires the file to start with "WEBVTT". We tolerate a missing
  // header (some tooling omits it) but require it if present to look
  // sane — anything else is almost certainly not VTT.
  let i = 0;
  if (lines[i]?.trim().startsWith("WEBVTT")) {
    i += 1;
  }

  const cues: SyncedLyricCue[] = [];
  while (i < lines.length) {
    const line = lines[i];

    // NOTE / STYLE / REGION blocks run from their keyword line to the
    // next blank line (per spec). We have to skip the entire block —
    // not just the keyword line — because the block body can legally
    // contain text that looks like a cue timing (e.g. a NOTE comment
    // mentioning "00:01.000 --> 00:02.000") and would otherwise be
    // misparsed as a real cue.
    const trimmed = line?.trim() ?? "";
    if (
      trimmed === "NOTE" ||
      trimmed.startsWith("NOTE ") ||
      trimmed.startsWith("NOTE\t") ||
      trimmed === "STYLE" ||
      trimmed === "REGION"
    ) {
      i += 1;
      while (i < lines.length && lines[i].trim() !== "") i += 1;
      i += 1; // step over the terminating blank line
      continue;
    }

    // Skip blank lines and cue-identifier lines — anything not a timing
    // line gets advanced past until the main loop finds a "-->".
    if (!line || !TIMING_LINE_RE.test(line)) {
      i += 1;
      continue;
    }

    // Timing line found. Pull the start timestamp.
    const startRaw = line.split("-->")[0]?.trim() ?? "";
    const startMs = parseTimestamp(startRaw);
    i += 1;

    // Collect cue body until blank line / EOF.
    const bodyParts: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      const cleaned = stripInlineTags(lines[i]);
      if (cleaned) bodyParts.push(cleaned);
      i += 1;
    }
    if (startMs != null) {
      cues.push({ timeMs: startMs, text: bodyParts.join(" ") });
    }
    // Advance past the trailing blank line.
    i += 1;
  }

  // Stable sort by time — VTT cues *should* be ordered, but a hand-edited
  // file might not be. The overlay binary-searches by time so order matters.
  cues.sort((a, b) => a.timeMs - b.timeMs);
  return cues;
}

// Format ms back to "MM:SS.mmm" for the admin preview row.
export function formatVttTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "00:00.000";
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const millis = Math.round(ms % 1000);
  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0") +
    "." +
    String(millis).padStart(3, "0")
  );
}
