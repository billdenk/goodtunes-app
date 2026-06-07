/**
 * Offline-download bookkeeping that works on both web and native.
 *
 *   - Web: a TRUE no-op for audio. Tapping the download icon only flips a
 *     boolean per song id in localStorage — no audio bytes are ever fetched
 *     or stored in the browser (the web product intentionally does not offer
 *     offline downloads, and masters must never land unprotected in a
 *     browser cache). Every function below short-circuits before any
 *     filesystem / crypto / network work when `isNative` is false.
 *   - Native (Capacitor, iOS/Android): downloads are *protected*. The audio
 *     bytes are:
 *       1. Encrypted at rest with AES-256-GCM. The key is a NON-EXPORTABLE
 *          `CryptoKey` minted once per install and held in the app's
 *          WebKit-sandboxed IndexedDB (`getDeviceKey`). Its raw bytes never
 *          exist anywhere a copy could grab them, so a file lifted off the
 *          device is undecryptable elsewhere — the "per-device key" the DRM
 *          ladder asks for. (Hardware Keychain/Keystore backing is the
 *          documented next hardening step — see docs/roadmap.md Tier 3.)
 *       2. Written to `Directory.Cache` (iOS `Library/Caches`, Android cache
 *          dir) under `goodtunes/offline/<songId>.enc`. That location is
 *          private app storage — never surfaced in the iOS Files app and
 *          automatically EXCLUDED from iCloud/iTunes and device backups —
 *          and it's the Apple-blessed home for re-downloadable content.
 *       3. Revocable: `purgeRevokedDownloads` deletes the files for any album
 *          the fan no longer owns the next time the app is online, and a
 *          missing/undecryptable file self-heals (purge + re-download).
 *
 * Playback resolution lives in `offlineSrcFor` — it decrypts a stored file
 * into a short-lived in-memory blob URL. The fan player is otherwise
 * Mux-only (see `mux-only-fan-playback`); offline playback is the deliberate
 * exception precisely BECAUSE the bytes are encrypted, device-bound, and
 * revocable.
 */
import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNative } from "./platform";

const STORAGE_PREFIX = "gt:downloaded-songs:";
/** Private, backup-excluded home for encrypted offline audio. */
const OFFLINE_DIR = "goodtunes/offline";
/** Pre-encryption plaintext location (Documents) we migrate away from. */
const LEGACY_DIR = "goodtunes/songs";
const MIGRATION_FLAG = "gt:offline-encrypted-migrated:v1";

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
    if (set.size === 0) localStorage.removeItem(lsKey(albumId));
    else localStorage.setItem(lsKey(albumId), JSON.stringify(Array.from(set)));
  } catch {
    /* quota / privacy mode — silent */
  }
}

export function listDownloadedSongs(albumId: string): Set<string> {
  return readSet(albumId);
}

/** Every album id that currently has at least one download flag. */
export function listDownloadedAlbumIds(): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) ids.push(k.slice(STORAGE_PREFIX.length));
    }
  } catch {
    /* localStorage unavailable */
  }
  return ids;
}

function encPath(songId: string): string {
  return `${OFFLINE_DIR}/${songId}.enc`;
}

async function ensureDir() {
  try {
    await Filesystem.mkdir({ path: OFFLINE_DIR, directory: Directory.Cache, recursive: true });
  } catch {
    /* exists */
  }
}

/* ───────────────────────── at-rest encryption ───────────────────────── */

const KEY_DB = "gt-secure";
const KEY_STORE = "keys";
const KEY_ID = "offline-master";

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEY_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbReq<T>(op: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    op.onsuccess = () => resolve(op.result);
    op.onerror = () => reject(op.error);
  });
}

let deviceKeyPromise: Promise<CryptoKey> | null = null;

/**
 * The per-install AES-256-GCM key. Generated NON-EXTRACTABLE (`false`), so
 * its raw bytes can never be read back out — not even by our own code — and
 * therefore cannot be copied off the device alongside a stolen file. Held in
 * the app's sandboxed IndexedDB across launches.
 */
function getDeviceKey(): Promise<CryptoKey> {
  if (deviceKeyPromise) return deviceKeyPromise;
  deviceKeyPromise = (async () => {
    if (typeof indexedDB === "undefined" || !crypto?.subtle) {
      throw new Error("secure key store unavailable");
    }
    const db = await openKeyDb();
    try {
      const readStore = db.transaction(KEY_STORE, "readonly").objectStore(KEY_STORE);
      const existing = await idbReq<CryptoKey | undefined>(readStore.get(KEY_ID));
      if (existing) return existing;
      const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false, // non-extractable
        ["encrypt", "decrypt"],
      );
      const writeStore = db.transaction(KEY_STORE, "readwrite").objectStore(KEY_STORE);
      await idbReq(writeStore.put(key, KEY_ID));
      return key;
    } finally {
      db.close();
    }
  })().catch((e) => {
    deviceKeyPromise = null; // allow a later retry
    throw e;
  });
  return deviceKeyPromise;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encrypt → `iv(12) || ciphertext`, base64-encoded for Filesystem.writeFile. */
async function encryptToBase64(plain: ArrayBuffer): Promise<string> {
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return bytesToBase64(out);
}

async function decryptFromBase64(b64: string): Promise<ArrayBuffer> {
  const key = await getDeviceKey();
  const buf = base64ToBytes(b64);
  const iv = buf.subarray(0, 12);
  const ct = buf.subarray(12);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
}

/* ──────────────────────────── public API ──────────────────────────── */

/**
 * Download or "register" a song as available offline.
 *
 *  - Web: just flips the localStorage flag (no fetch, no file, no crypto).
 *  - Native: fetches `audioUrl`, encrypts the bytes with the per-device key,
 *    and writes the ciphertext into private, backup-excluded storage.
 *    Throws if the fetch or encryption fails so the caller can surface a
 *    toast (and we never write plaintext as a fallback).
 */
export async function downloadSong(
  albumId: string,
  songId: string,
  audioUrl: string | undefined,
): Promise<void> {
  if (isNative && audioUrl) {
    await ensureDir();
    const res = await fetch(audioUrl);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    const bytes = await res.arrayBuffer();
    const data = await encryptToBase64(bytes);
    await Filesystem.writeFile({ path: encPath(songId), directory: Directory.Cache, data });
  }
  const set = readSet(albumId);
  set.add(songId);
  writeSet(albumId, set);
}

async function deleteEncFile(songId: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path: encPath(songId), directory: Directory.Cache });
  } catch {
    /* already gone */
  }
}

export async function removeDownload(
  albumId: string,
  songId: string,
  _audioUrl?: string,
): Promise<void> {
  if (isNative) await deleteEncFile(songId);
  const set = readSet(albumId);
  set.delete(songId);
  writeSet(albumId, set);
}

/**
 * Resolve a webview-playable source for a song's on-device file, if one
 * exists. Decrypts the stored ciphertext in memory and hands back a
 * short-lived `blob:` URL (the caller is responsible for revoking it).
 *
 * Returns `null` on web (no real files) or when the file is missing or can't
 * be decrypted — in the latter case the corrupt file is purged so the next
 * attempt re-downloads cleanly.
 */
export async function offlineSrcFor(
  songId: string,
  _audioUrl?: string,
): Promise<string | null> {
  if (!isNative) return null;
  try {
    const file = await Filesystem.readFile({ path: encPath(songId), directory: Directory.Cache });
    const b64 = typeof file.data === "string" ? file.data : "";
    if (!b64) return null;
    const plain = await decryptFromBase64(b64);
    const url = URL.createObjectURL(new Blob([plain]));
    return url;
  } catch {
    // Missing file → nothing to play. Decrypt failure (wrong/rotated key,
    // truncated file) → drop the unusable bytes so we re-fetch next time.
    await deleteEncFile(songId);
    return null;
  }
}

/**
 * Revoke offline files for any album the fan no longer owns.
 *
 * Native-only. Call this when ONLINE with a TRUSTED ownership set (i.e. a
 * successful `/api/my-albums` response — never an errored/empty fallback, or
 * a transient outage would wipe legitimately-owned downloads). Albums not in
 * `ownedAlbumIds` have their encrypted files deleted and their download flags
 * cleared.
 */
export async function purgeRevokedDownloads(ownedAlbumIds: Set<string>): Promise<void> {
  if (!isNative) return;
  for (const albumId of listDownloadedAlbumIds()) {
    if (ownedAlbumIds.has(albumId)) continue;
    const set = readSet(albumId);
    for (const songId of Array.from(set)) await deleteEncFile(songId);
    writeSet(albumId, new Set());
  }
}

/**
 * One-time migration of pre-encryption downloads. Older builds wrote raw
 * (unencrypted) masters to `Documents/goodtunes/songs/<songId>.<ext>` — a
 * location that COULD be exposed to the iOS Files app and was included in
 * backups. On first run we re-encrypt whatever is there into the new private
 * store and delete the plaintext originals. Best-effort and idempotent.
 */
export async function migrateLegacyDownloads(): Promise<void> {
  if (!isNative) return;
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return;
  } catch {
    return;
  }
  try {
    const { files } = await Filesystem.readdir({ path: LEGACY_DIR, directory: Directory.Documents });
    await ensureDir();
    for (const entry of files) {
      const name = typeof entry === "string" ? entry : (entry as any).name;
      if (!name) continue;
      const songId = name.replace(/\.[a-z0-9]+$/i, "");
      const legacyPath = `${LEGACY_DIR}/${name}`;
      try {
        const file = await Filesystem.readFile({ path: legacyPath, directory: Directory.Documents });
        const b64 = typeof file.data === "string" ? file.data : "";
        if (b64) {
          const data = await encryptToBase64(base64ToBytes(b64).buffer);
          await Filesystem.writeFile({ path: encPath(songId), directory: Directory.Cache, data });
        }
      } catch {
        /* skip unreadable / unencryptable entry */
      }
      // Always remove the plaintext original, encrypted copy or not.
      try {
        await Filesystem.deleteFile({ path: legacyPath, directory: Directory.Documents });
      } catch {
        /* already gone */
      }
    }
    try {
      await Filesystem.rmdir({ path: LEGACY_DIR, directory: Directory.Documents, recursive: true });
    } catch {
      /* dir gone / non-empty — harmless */
    }
  } catch {
    // Legacy dir doesn't exist (clean install) — nothing to migrate.
  }
  try {
    localStorage.setItem(MIGRATION_FLAG, "1");
  } catch {
    /* ignore */
  }
}
