// Task #734 / #816 — fan's chosen streaming service for stream-elsewhere
// handoffs.
//
// GoodTunes never plays stream-only masters in-app: tapping a "Stream this"
// control hands the fan off to whichever service they prefer (Spotify, Apple
// Music, Tidal, Qobuz, Deezer, or Pandora). The choice is remembered so the
// first tap shows a picker and every tap after that opens the saved service
// directly. It persists in localStorage for signed-out / guest fans and is
// mirrored to the customer profile (`PUT /api/me`) for signed-in fans so it
// follows them across devices.

import spotifyLogo from "@/assets/brand/spotify.svg";
import appleMusicLogo from "@/assets/brand/apple-music.svg";
import tidalLogo from "@/assets/brand/tidal.svg";
import qobuzLogo from "@/assets/brand/qobuz.svg";
import deezerLogo from "@/assets/brand/deezer.svg";
import pandoraLogo from "@/assets/brand/pandora.svg";

export type StreamingServiceId =
  | "spotify"
  | "apple_music"
  | "tidal"
  | "qobuz"
  | "deezer"
  | "pandora";

export interface StreamingServiceDef {
  id: StreamingServiceId;
  label: string;
}

// Display order across every surface (picker, settings sheet). Spotify +
// Apple Music stay first since they're the most common handoffs.
export const STREAMING_SERVICES: StreamingServiceDef[] = [
  { id: "spotify", label: "Spotify" },
  { id: "apple_music", label: "Apple Music" },
  { id: "tidal", label: "Tidal" },
  { id: "qobuz", label: "Qobuz" },
  { id: "deezer", label: "Deezer" },
  { id: "pandora", label: "Pandora" },
];

const SERVICE_IDS = new Set<string>(STREAMING_SERVICES.map((s) => s.id));

const FAV_KEY = "gt:fav-streaming-service";

export function isStreamingServiceId(v: unknown): v is StreamingServiceId {
  return typeof v === "string" && SERVICE_IDS.has(v);
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
  tidal?: string | null;
  qobuz?: string | null;
  deezer?: string | null;
  pandora?: string | null;
}

export function linkForService(
  id: StreamingServiceId,
  links: StreamLinks,
): string | null {
  switch (id) {
    case "spotify":
      return links.spotify ?? null;
    case "apple_music":
      return links.apple ?? null;
    case "tidal":
      return links.tidal ?? null;
    case "qobuz":
      return links.qobuz ?? null;
    case "deezer":
      return links.deezer ?? null;
    case "pandora":
      return links.pandora ?? null;
    default:
      return null;
  }
}

// Which services actually have a link for this track/album.
export function availableServices(links: StreamLinks): StreamingServiceId[] {
  return STREAMING_SERVICES.filter((s) => !!linkForService(s.id, links)).map(
    (s) => s.id,
  );
}

// Per-service search URL — the handoff fallback when a release has no stored
// deep link for that service (mirrors the Spotify search fallback the artist
// "How to Play" sheet has always used). `query` is typically
// "<artist name> <release title>".
export function searchUrlForService(
  id: StreamingServiceId,
  query: string,
): string {
  const q = encodeURIComponent(query);
  switch (id) {
    case "spotify":
      return `https://open.spotify.com/search/${q}`;
    case "apple_music":
      return `https://music.apple.com/us/search?term=${q}`;
    case "tidal":
      return `https://tidal.com/search?q=${q}`;
    case "qobuz":
      return `https://www.qobuz.com/search?q=${q}`;
    case "deezer":
      return `https://www.deezer.com/search/${q}`;
    case "pandora":
      return `https://www.pandora.com/search/${q}/all`;
  }
}

// Resolve a service's handoff URL for a release: the stored deep link if we
// have one, otherwise a service search built from artist + title.
export function handoffUrlForService(
  id: StreamingServiceId,
  links: StreamLinks,
  searchQuery: string,
): string {
  return linkForService(id, links) ?? searchUrlForService(id, searchQuery);
}

// Open a streaming link in a new tab/window. Handoffs always leave the app.
export function openStreamLink(url: string): void {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    window.location.href = url;
  }
}

// Official-style app-icon SVG for each service, shared by every fan surface
// that renders the service menu (the artist "How to Play" sheet, the in-album
// picker sheet, and the Account settings sheet) so the icons can never drift
// between them. Each asset is a self-contained 44px-ready brand tile — a
// rounded square (or, for Spotify, a circle) carrying the service's own brand
// color + mark, used as-supplied (never recolored). Spotify / Apple Music /
// Tidal use their published app icons. Deezer (black tile + purple
// equalizer-heart + "DEEZER" wordmark), Pandora (white tile + gradient "P"),
// and Qobuz (black tile + "qobuz" wordmark) are vector reproductions of each
// service's current App Store app icon.
export const SERVICE_LOGO: Record<StreamingServiceId, string> = {
  spotify: spotifyLogo,
  apple_music: appleMusicLogo,
  tidal: tidalLogo,
  qobuz: qobuzLogo,
  deezer: deezerLogo,
  pandora: pandoraLogo,
};

export const SERVICE_COLOR: Record<StreamingServiceId, string> = {
  spotify: "#1DB954",
  apple_music: "#FC3C44",
  tidal: "#000000",
  qobuz: "#005BB8",
  deezer: "#00C7F2",
  pandora: "#224099",
};
