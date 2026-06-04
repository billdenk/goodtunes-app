// Single source of truth for how a track row should behave on the album
// surfaces: a quiet "locked" row, a 30-second "preview" row, or a fully
// playable "full" row.
//
// The desktop album view and the mobile album surface used to each compute
// this inline. They agreed, but inline ternaries on two surfaces can drift
// (e.g. adding a sunset/stream-only nuance to only one). Both now call this
// helper so the rule can never disagree. (Task #1095.)

// "locked" is retained in the union for back-compat with surfaces that still
// branch on it, but the rule never returns it anymore — see below.
export type TrackPlaybackState = "locked" | "preview" | "full";

// The minimal track shape the rule reads.
export interface TrackPlaybackInput {
  // Whether the viewer owns the album (purchased / granted). Owners always
  // get the full track.
  isOwned?: boolean | null;
  // Legacy preview flag. Previews are now store-wide — every track is
  // previewable before purchase (server-capped to the artist's 30-second
  // window) — so this no longer gates the row. Kept so existing callers
  // keep compiling.
  isPreviewable?: boolean | null;
}

// Owned → "full"; everyone else → "preview". Previews are store-wide and
// leak-proof (the server hard-caps a not-owned listen to the artist's
// 30-second window), so a not-owned track is never "locked" on any fan
// surface — fans can always audition the music before buying.
export function trackPlaybackState({
  isOwned,
}: TrackPlaybackInput): TrackPlaybackState {
  return isOwned ? "full" : "preview";
}
