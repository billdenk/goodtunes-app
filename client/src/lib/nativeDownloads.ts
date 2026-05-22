/**
 * Download bookkeeping that works on both web and native.
 *
 *   - Web: keeps the existing localStorage-only behavior. Tapping the
 *     download icon flips a boolean per song id; no real file is fetched
 *     (the web product intentionally does not offer offline downloads).
 *   - Native (Capacitor): writes the actual audio bytes to the device
 *     Filesystem under `Documents/goodtunes/songs/<songId>.<ext>` so the
 *     album plays in airplane mode. The same boolean store still drives
 *     the download-tick UI; the file's existence is the source of truth
 *     and we re-sync the boolean to it on load.
 *
 * Playback resolution lives in `PlayerContext` — it calls `offlineSrcFor`
 * before falling back to the network URL.
 */
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNative } from "./platform";

const STORAGE_PREFIX = "gt:downloaded-songs:";
const SONG_DIR = "goodtunes/songs";

function lsKey(albumId: string) {
  return `${STORAGE_PREFIX}${albumId}`;
}

function readSet(albumId: string): Set<string> {
  try {
    const raw = localStorage.getItem(lsKey(albumId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSet(albumId: string, set: Set<string>) {
  try {
    localStorage.setItem(lsKey(albumId), JSON.stringify(Array.from(set)));
  } catch {
    /* quota / privacy mode — silent */
  }
}

export function listDownloadedSongs(albumId: string): Set<string> {
  return readSet(albumId);
}

function extFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\.([a-z0-9]{2,5})$/i);
    return m ? m[1].toLowerCase() : "mp3";
  } catch {
    return "mp3";
  }
}

function songPath(songId: string, ext: string): string {
  return `${SONG_DIR}/${songId}.${ext}`;
}

async function ensureDir() {
  try {
    await Filesystem.mkdir({
      path: SONG_DIR,
      directory: Directory.Documents,
      recursive: true,
    });
  } catch {
    /* exists */
  }
}

/**
 * Download or "register" a song as available offline.
 *
 *  - On web: just flips the localStorage flag (no actual file).
 *  - On native: fetches `audioUrl` and writes the bytes to Documents.
 *    Throws if the fetch fails so the caller can surface a toast.
 */
export async function downloadSong(
  albumId: string,
  songId: string,
  audioUrl: string | undefined,
): Promise<void> {
  if (isNative && audioUrl) {
    await ensureDir();
    const ext = extFromUrl(audioUrl);
    const res = await fetch(audioUrl);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    const blob = await res.blob();
    // Capacitor Filesystem.writeFile accepts base64; convert via FileReader.
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(r.error);
      r.onload = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
    const base64 = dataUrl.split(",")[1] ?? "";
    await Filesystem.writeFile({
      path: songPath(songId, ext),
      directory: Directory.Documents,
      data: base64,
    });
  }
  const set = readSet(albumId);
  set.add(songId);
  writeSet(albumId, set);
}

export async function removeDownload(
  albumId: string,
  songId: string,
  audioUrl?: string,
): Promise<void> {
  if (isNative && audioUrl) {
    const ext = extFromUrl(audioUrl);
    try {
      await Filesystem.deleteFile({
        path: songPath(songId, ext),
        directory: Directory.Documents,
      });
    } catch {
      /* already gone */
    }
  }
  const set = readSet(albumId);
  set.delete(songId);
  writeSet(albumId, set);
}

/**
 * Resolve a webview-playable URL for a song's on-device file, if one
 * exists. Returns `null` on web (no real files) or when the file is
 * missing — caller should fall back to the network URL.
 */
export async function offlineSrcFor(
  songId: string,
  audioUrl: string | undefined,
): Promise<string | null> {
  if (!isNative || !audioUrl) return null;
  const ext = extFromUrl(audioUrl);
  try {
    const info = await Filesystem.getUri({
      path: songPath(songId, ext),
      directory: Directory.Documents,
    });
    // `convertFileSrc` rewrites `file://…` to the capacitor scheme the
    // webview can actually load (`capacitor://…` on iOS, `https://…` on
    // Android via the WebViewAssetLoader-style intercept).
    return Capacitor.convertFileSrc(info.uri);
  } catch {
    return null;
  }
}
