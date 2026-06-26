/**
 * Sanitize a raw stored artwork value, returning `undefined` when the value
 * is a sentinel that should be treated as "no artwork":
 *   - falsy (null / undefined / "")
 *   - the literal strings "null" or "undefined"
 *   - the legacy placeholder path "/album-placeholder.svg"
 *
 * Pass the result into <AlbumCover artwork={...}> so the branded placeholder
 * always renders instead of a broken/black square.
 */
export function realArtwork(artwork: string | null | undefined): string | undefined {
  if (!artwork) return undefined;
  const v = artwork.trim();
  if (v === "" || v === "null" || v === "undefined" || v === "/album-placeholder.svg") {
    return undefined;
  }
  return v;
}
