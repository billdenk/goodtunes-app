// Shared Dropbox share-URL → direct-stream rewrite.
//
// `www.dropbox.com/scl/fi/…` serves an HTML preview page, so an
// <audio> tag (or any direct fetch) sees a text/html body and fires
// onError. Swapping the host to `dl.dropboxusercontent.com` and
// dropping the `dl` / `raw` query params returns the raw audio bytes
// with the correct Content-Type — same pattern the Nick Carter
// masters use (client/src/data/musicData.ts: NC_BASE).
//
// Lives in `shared/` so both the admin editors (AdminAlbum.tsx,
// Admin.tsx) and the server (PUT /api/admin/songs/:id) canonicalize
// identically, no matter where the URL enters the system.
export function normalizeAudioUrl(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname === "www.dropbox.com" || u.hostname === "dropbox.com") {
      u.hostname = "dl.dropboxusercontent.com";
      u.searchParams.delete("dl");
      u.searchParams.delete("raw");
      return u.toString();
    }
  } catch {
    // Not a parseable URL — return the trimmed string so callers can
    // keep treating it as a draft value.
  }
  return trimmed;
}
