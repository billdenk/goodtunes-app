// Task #734 — fan's chosen streaming service for stream-elsewhere handoffs.
//
// GoodTunes never plays stream-only masters in-app: tapping a "Stream this"
// control hands the fan off to whichever service they prefer (Spotify or
// Apple Music). The choice is remembered so the first tap shows a picker and
// every tap after that opens the saved service directly. It persists in
// localStorage for signed-out / guest fans and is mirrored to the customer
// profile (`PUT /api/me`) for signed-in fans so it follows them across
// devices.

export type StreamingServiceId = "spotify" | "apple_music";

export interface StreamingServiceDef {
  id: StreamingServiceId;
  label: string;
}

export const STREAMING_SERVICES: StreamingServiceDef[] = [
  { id: "spotify", label: "Spotify" },
  { id: "apple_music", label: "Apple Music" },
];

const FAV_KEY = "gt:fav-streaming-service";

export function isStreamingServiceId(v: unknown): v is StreamingServiceId {
  return v === "spotify" || v === "apple_music";
}

export function getFavoriteStreamingService(): StreamingServiceId | null {
  try {
    const v = localStorage.getItem(FAV_KEY);
    return isStreamingServiceId(v) ? v : null;
  } catch {
    return null;
  }
}

export function setFavoriteStreamingService(id: StreamingServiceId | null): void {
  try {
    if (id) localStorage.setItem(FAV_KEY, id);
    else localStorage.removeItem(FAV_KEY);
  } catch {
    /* private-mode / storage-disabled — favorite just isn't remembered */
  }
}

export function serviceLabel(id: StreamingServiceId): string {
  return STREAMING_SERVICES.find((s) => s.id === id)?.label ?? id;
}

export interface StreamLinks {
  spotify?: string | null;
  apple?: string | null;
}

export function linkForService(
  id: StreamingServiceId,
  links: StreamLinks,
): string | null {
  if (id === "spotify") return links.spotify ?? null;
  if (id === "apple_music") return links.apple ?? null;
  return null;
}

// Which services actually have a link for this track/album.
export function availableServices(links: StreamLinks): StreamingServiceId[] {
  return STREAMING_SERVICES.filter((s) => !!linkForService(s.id, links)).map(
    (s) => s.id,
  );
}

// Open a streaming link in a new tab/window. Handoffs always leave the app.
export function openStreamLink(url: string): void {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    window.location.href = url;
  }
}
