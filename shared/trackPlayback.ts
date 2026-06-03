// Single source of truth for how a track row should behave on the album
// surfaces: a quiet "locked" row, a 30-second "preview" row, or a fully
// playable "full" row.
//
// The desktop album view and the mobile album surface used to each compute
// this inline. They agreed, but inline ternaries on two surfaces can drift
// (e.g. adding a sunset/stream-only nuance to only one). Both now call this
// helper so the rule can never disagree. (Task #1095.)

export type TrackPlaybackState = "locked" | "preview" | "full";

// The minimal track shape the rule reads.
export interface TrackPlaybackInput {
  // Whether the viewer owns the album (purchased / granted). Owners always
  // get the full track.
  isOwned?: boolean | null;
  // Whether the operator left this track previewable on a not-owned album.
  // `false` means the preview was hidden → the row is locked.
  isPreviewable?: boolean | null;
}

// Owned → "full". Otherwise previewable → "preview", or "locked" when the
// operator hid the preview.
export function trackPlaybackState({
  isOwned,
  isPreviewable,
}: TrackPlaybackInput): TrackPlaybackState {
  if (isOwned) return "full";
  return isPreviewable ? "preview" : "locked";
}
