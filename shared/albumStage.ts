// Single source of truth for the album lifecycle stage.
//
// The four admin tabs (Prepping / Staged / Released / Sunset) and the
// fan-facing "is this album live yet?" gate all derive from the same rule
// here so they can never disagree. Nothing is persisted — the stage is a
// pure function of `isPrepping`, `isHidden`, and the existing
// `goodTunesReleaseDate` sunrise. (Task #800.)
//
// Dates are stored as ISO `YYYY-MM-DD` strings, so a lexicographic string
// compare is also a chronological compare — no Date parsing or timezone
// math needed at the boundary. "Today" is computed from local civil time
// (see `todayISODate`) so "the moment its date arrives" lines up with the
// operator's / fan's calendar day rather than a UTC midnight.

export type AlbumStage = "prepping" | "staged" | "released" | "sunset";

// The minimal album shape the stage rule reads. Both the admin AlbumLite
// and the full DB album row structurally satisfy this.
export interface StageInput {
  isPrepping?: boolean | null;
  isHidden?: boolean | null;
  goodTunesReleaseDate?: string | null;
  // "Sunset date" (stored on the legacy `streamingReleaseDate` column): the
  // day the album leaves its GoodTunes exclusive window and goes to
  // streaming. Reaching it surfaces the "Listen on…" links and ends the
  // buy window (sold out).
  streamingReleaseDate?: string | null;
}

// Current civil date as `YYYY-MM-DD`. Built from local date parts (not
// `toISOString`, which would shift to UTC and flip the day near midnight
// for non-UTC servers/clients).
export function todayISODate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// True when the sunrise hasn't arrived yet: a non-null release date that is
// strictly after today. Null/today/past all return false (= live now).
export function isSunrisePending(
  goodTunesReleaseDate: string | null | undefined,
  today: string = todayISODate(),
): boolean {
  if (!goodTunesReleaseDate) return false;
  return goodTunesReleaseDate > today;
}

// Whole-day countdown to a pending sunrise. Returns the number of calendar
// days from `today` to the (strictly future) release date, or null when
// there's no future sunrise (null date / today / past). Parsed from the ISO
// date parts at local midnight so the count matches the operator's calendar
// rather than drifting with UTC/timezone math.
export function daysUntilSunrise(
  goodTunesReleaseDate: string | null | undefined,
  today: string = todayISODate(),
): number | null {
  if (!isSunrisePending(goodTunesReleaseDate, today)) return null;
  const [ty, tm, td] = today.split("-").map(Number);
  const [ry, rm, rd] = (goodTunesReleaseDate as string).split("-").map(Number);
  const todayMs = new Date(ty, tm - 1, td).getTime();
  const releaseMs = new Date(ry, rm - 1, rd).getTime();
  if (Number.isNaN(todayMs) || Number.isNaN(releaseMs)) return null;
  return Math.round((releaseMs - todayMs) / 86_400_000);
}

// Short, human date label for an ISO `YYYY-MM-DD`, e.g. "Jun 14". The year
// is appended ("Jun 14, 2027") only when it differs from `today`'s year so
// near-term dates stay terse. Built from the string parts (no Date parsing)
// to avoid timezone day-shifts.
export function formatSunriseDate(
  goodTunesReleaseDate: string,
  today: string = todayISODate(),
): string {
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const [ry, rm, rd] = goodTunesReleaseDate.split("-").map(Number);
  const base = `${MONTHS[rm - 1]} ${rd}`;
  const curYear = Number(today.split("-")[0]);
  return ry === curYear ? base : `${base}, ${ry}`;
}

// Combined scannable countdown label for a staged release, e.g.
// "Live Jun 14 · in 13 days" (or "· tomorrow" for a one-day countdown).
// Returns null when the album has no pending sunrise.
export function sunriseCountdownLabel(
  goodTunesReleaseDate: string | null | undefined,
  today: string = todayISODate(),
): string | null {
  const days = daysUntilSunrise(goodTunesReleaseDate, today);
  if (days == null) return null;
  const when = formatSunriseDate(goodTunesReleaseDate as string, today);
  const rel = days === 1 ? "tomorrow" : `in ${days} days`;
  return `Live ${when} · ${rel}`;
}

// True when the album's sunset date is set and has arrived: a non-null
// `streamingReleaseDate` that is today or in the past. Null/future return
// false (still inside the GoodTunes exclusive window). Same local-civil /
// lexicographic-string compare as `isSunrisePending`, just inverted.
export function hasReachedSunset(
  streamingReleaseDate: string | null | undefined,
  today: string = todayISODate(),
): boolean {
  if (!streamingReleaseDate) return false;
  return streamingReleaseDate <= today;
}

// Derive the lifecycle stage. Order matters: Prepping and (hidden) Sunset
// are hard flags that win over the dates; a still-pending sunrise is Staged;
// then a reached sunset date sunsets a live album; otherwise Released.
export function albumStage(
  album: StageInput,
  today: string = todayISODate(),
): AlbumStage {
  if (album.isPrepping) return "prepping";
  if (album.isHidden) return "sunset";
  if (isSunrisePending(album.goodTunesReleaseDate, today)) return "staged";
  if (hasReachedSunset(album.streamingReleaseDate, today)) return "sunset";
  return "released";
}
