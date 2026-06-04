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
  // Per-track preview gate. Previews are store-wide by default — every track
  // is auditionable before purchase (server-capped to the artist's 30-second
  // window). An operator can embargo a SINGLE track's pre-purchase preview
  // via the Master tile's "Hide preview" toggle (`previewHidden` → the server
  // sends `isPreviewable: false`); only an explicit `false` locks the row.
  // `true` / `null` / absent all stay store-wide previews.
  isPreviewable?: boolean | null;
}

// Owned → "full". Not owned → "preview", EXCEPT a track whose preview the
// operator hid (`isPreviewable === false`) → "locked": the fan sees the track
// number + title only (no runtime, not playable), matching Apple's pre-release
// pattern. Store-wide previews stay leak-proof — the server hard-caps a
// not-owned listen to the artist's 30-second window — and the playback-url
// route independently refuses to sign a hidden track, so a "locked" row can
// never be coaxed into playing.
export function trackPlaybackState({
  isOwned,
  isPreviewable,
}: TrackPlaybackInput): TrackPlaybackState {
  if (isOwned) return "full";
  return isPreviewable === false ? "locked" : "preview";
}
