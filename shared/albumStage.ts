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

// Derive the lifecycle stage. Order matters: Prepping and Sunset are hard
// flags that win over the date, and Staged/Released split purely on the
// sunrise once an album is neither prepping nor hidden.
export function albumStage(
  album: StageInput,
  today: string = todayISODate(),
): AlbumStage {
  if (album.isPrepping) return "prepping";
  if (album.isHidden) return "sunset";
  return isSunrisePending(album.goodTunesReleaseDate, today)
    ? "staged"
    : "released";
}
