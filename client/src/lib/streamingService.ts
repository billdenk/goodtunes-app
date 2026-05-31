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

import type { IconType } from "react-icons";
import { SiSpotify, SiApplemusic, SiTidal, SiPandora } from "react-icons/si";

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

// Open a streaming link in a new tab/window. Handoffs always leave the app.
export function openStreamLink(url: string): void {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    window.location.href = url;
  }
}

// Brand glyph + color for each service, shared by every fan surface that
// renders the service menu (the in-album picker sheet + the Account settings
// sheet) so the icons can never drift between them. `react-icons/si` covers
// Spotify / Apple Music / Tidal / Pandora; Qobuz and Deezer have no Simple
// Icon in the installed version, so they fall back to a brand-colored letter.
export type ServiceGlyph =
  | { kind: "icon"; Icon: IconType; color: string }
  | { kind: "letter"; letter: string; color: string };

export const SERVICE_GLYPH: Record<StreamingServiceId, ServiceGlyph> = {
  spotify: { kind: "icon", Icon: SiSpotify, color: "#1DB954" },
  apple_music: { kind: "icon", Icon: SiApplemusic, color: "#FA243C" },
  // Tidal's wordmark is black; render it white so it reads on the dark sheet.
  tidal: { kind: "icon", Icon: SiTidal, color: "#FFFFFF" },
  qobuz: { kind: "letter", letter: "Q", color: "#41B4E6" },
  deezer: { kind: "letter", letter: "D", color: "#A238FF" },
  pandora: { kind: "icon", Icon: SiPandora, color: "#3668FF" },
};
