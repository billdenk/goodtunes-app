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
 *       1. Encrypted at rest with AES-256-GCM. The per-device key is backed by
 *          the platform's HARDWARE secret store — iOS Keychain / Android
 *          Keystore — via the `SecureKeyStore` native plugin
 *          (`client/src/lib/nativeSecureKey.ts`). `getDeviceKey` reads the raw
 *          key from there and imports it as a NON-extractable `CryptoKey`, so
 *          the secret lives in the secure element rather than just the app
 *          sandbox. If the hardware store is unavailable (older native build,
 *          plugin error), it transparently falls back to the legacy
 *          non-exportable `CryptoKey` in WebKit-sandboxed IndexedDB so
 *          downloads keep working. Either way the raw bytes never exist
 *          anywhere a copy could grab them, so a file lifted off the device is
 *          undecryptable elsewhere — the "per-device key" the DRM ladder asks
 *          for (see docs/roadmap.md Tier 3).
 *       2. Written to `Directory.Cache` (iOS `Library/Caches`, Android cache
 *          dir) under `goodtunes/offline/<songId>.enc`. That location is
 *          private app storage — never surfaced in the iOS Files app and
 *          automatically EXCLUDED from iCloud/iTunes and device backups —
 *          and it's the Apple-blessed home for re-downloadable content.
 *       3. Revocable: `purgeRevokedDownloads` deletes the files for any album
 *          the fan no longer owns the next time the app is online, and a
 *          missing/undecryptable file self-heals (purge + re-download).
 *       4. TLS-pinned in transit: the download bytes are fetched over the
 *          native, certificate-pinned HTTP path (`fetchProtectedBytes` →
 *          `pinnedDownloadBytes`) so a man-in-the-middle on a GoodTunes host
 *          can't swap the master. A WebView `fetch()` would NOT honor the pin
 *          config, so we route through URLSession / HttpsURLConnection
 *          instead. See docs/cert-pinning.md (older builds fall back to the
 *          WebView fetch; pin failures never silently downgrade).
 *
 * Playback resolution lives in `offlineSrcFor` — it decrypts a stored file
 * into a short-lived in-memory blob URL. The fan player is otherwise
 * Mux-only (see `mux-only-fan-playback`); offline playback is the deliberate
 * exception precisely BECAUSE the bytes are encrypted, device-bound, and
 * revocable.
 */
import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNative } from "./platform";
import { getHardwareKeyBytes, isDeviceCompromised, pinnedDownloadBytes } from "./nativeSecureKey";

const STORAGE_PREFIX = "gt:downloaded-songs:";
/** Private, backup-excluded home for encrypted offline audio. */
const OFFLINE_DIR = "goodtunes/offline";
/** Pre-encryption plaintext location (Documents) we migrate away from. */
const LEGACY_DIR = "goodtunes/songs";
const MIGRATION_FLAG = "gt:offline-encrypted-migrated:v1";
/** Set once existing downloads have been re-encrypted under the hardware key. */
const HW_KEY_MIGRATION_FLAG = "gt:offline-hw-key-migrated:v1";

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

/**
 * Read the per-install software key from sandboxed IndexedDB. With
 * `create=false` it returns `null` when absent (used by the hardware-key
 * migration to decrypt legacy files without re-minting a software key);
 * otherwise it generates a NON-EXTRACTABLE key on first use so its raw bytes
 * can never be read back out — not even by our own code.
 */
async function getIdbKey(create: boolean): Promise<CryptoKey | null> {
  if (typeof indexedDB === "undefined" || !crypto?.subtle) {
    throw new Error("secure key store unavailable");
  }
  const db = await openKeyDb();
  try {
    const readStore = db.transaction(KEY_STORE, "readonly").objectStore(KEY_STORE);
    const existing = await idbReq<CryptoKey | undefined>(readStore.get(KEY_ID));
    if (existing) return existing;
    if (!create) return null;
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
}

/** Delete the legacy software key once everything is re-encrypted under HW. */
async function deleteIdbKey(): Promise<void> {
  try {
    const db = await openKeyDb();
    try {
      const store = db.transaction(KEY_STORE, "readwrite").objectStore(KEY_STORE);
      await idbReq(store.delete(KEY_ID));
    } finally {
      db.close();
    }
  } catch {
    /* nothing to delete */
  }
}

/**
 * Import the hardware-backed master key (iOS Keychain / Android Keystore) as
 * a NON-extractable AES-GCM `CryptoKey`, or `null` if no hardware key is
 * available (web, older native build, plugin error). The raw key buffer is
 * zeroed immediately after import so it doesn't linger in JS memory.
 */
async function getHardwareKey(): Promise<CryptoKey | null> {
  if (!crypto?.subtle) return null;
  const bytes = await getHardwareKeyBytes();
  if (!bytes) return null;
  try {
    return await crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "AES-GCM" },
      false, // non-extractable once imported
      ["encrypt", "decrypt"],
    );
  } finally {
    bytes.fill(0);
  }
}

let deviceKeyPromise: Promise<CryptoKey> | null = null;

/**
 * The ACTIVE per-device AES-256-GCM key used for all new encrypt/decrypt.
 * Prefers the hardware-backed key (Keychain/Keystore); falls back to the
 * legacy sandboxed-IndexedDB key when the hardware store isn't available so
 * downloads never break on older builds or a transient plugin failure.
 */
function getDeviceKey(): Promise<CryptoKey> {
  if (deviceKeyPromise) return deviceKeyPromise;
  deviceKeyPromise = (async () => {
    const hw = await getHardwareKey().catch(() => null);
    if (hw) return hw;
    const idb = await getIdbKey(true);
    if (!idb) throw new Error("secure key store unavailable");
    return idb;
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
async function encryptToBase64(plain: ArrayBuffer, key?: CryptoKey): Promise<string> {
  const k = key ?? (await getDeviceKey());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, plain);
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return bytesToBase64(out);
}

async function decryptFromBase64(b64: string, key?: CryptoKey): Promise<ArrayBuffer> {
  const k = key ?? (await getDeviceKey());
  const buf = base64ToBytes(b64);
  const iv = buf.subarray(0, 12);
  const ct = buf.subarray(12);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, ct);
}

/* ───────────────────── compromised-device gate ───────────────────── */

let compromisedPromise: Promise<boolean> | null = null;

/**
 * Cached jailbreak/root probe. On a compromised device the OS sandbox no
 * longer protects the encrypted cache or the key store, so we refuse to land
 * NEW protected downloads and refuse to decrypt existing ones — playback
 * falls back to online streaming (the fan can still listen, just not
 * offline). Fails SAFE: if the probe errors or the plugin is missing it
 * resolves `false`, so legitimate users are never blocked by a false alarm.
 */
function deviceIsCompromised(): Promise<boolean> {
  if (!compromisedPromise) {
    compromisedPromise = isDeviceCompromised().catch(() => false);
  }
  return compromisedPromise;
}

/**
 * Fetch the bytes for an offline download, preferring the native TLS-PINNED
 * path so a man-in-the-middle on a GoodTunes host can't swap the master.
 *
 * `pinnedDownloadBytes` returns the body over URLSession / HttpsURLConnection
 * (which honor the app's pin config; a WebView `fetch()` does NOT) for hosts
 * covered by the pin set, and `null` ONLY when that path is unavailable — web,
 * or an older native build predating the plugin method — in which case we fall
 * back to the WebView fetch. A genuine pin mismatch / network error from the
 * pinned path REJECTS and propagates here; we deliberately do NOT fall back on
 * failure, or a tampered connection could force the unpinned path.
 *
 * Note: only `goodtunes.music` hosts are pinned. Legacy Dropbox-hosted masters
 * fetch over the native path with normal validation (still off the WebView),
 * and become pinned automatically once migrated to object storage on
 * my.goodtunes.music. See docs/cert-pinning.md.
 */
async function fetchProtectedBytes(audioUrl: string): Promise<ArrayBuffer> {
  const pinned = await pinnedDownloadBytes(audioUrl);
  if (pinned) return pinned;
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return res.arrayBuffer();
}

/* ──────────────────────────── public API ──────────────────────────── */

/**
 * Download or "register" a song as available offline.
 *
 *  - Web: just flips the localStorage flag (no fetch, no file, no crypto).
 *  - Native: fetches `audioUrl`, encrypts the bytes with the per-device key,
 *    and writes the ciphertext into private, backup-excluded storage.
 *    Throws if the fetch or encryption fails so the caller can surface a
 *    toast (and we never write plaintext as a fallback). Also throws on a
 *    jailbroken/rooted device, where the sandbox protections don't hold, so
 *    no new protected content lands there.
 */
export async function downloadSong(
  albumId: string,
  songId: string,
  audioUrl: string | undefined,
): Promise<void> {
  if (isNative && audioUrl) {
    if (await deviceIsCompromised()) {
      throw new Error("offline downloads are unavailable on this device");
    }
    await ensureDir();
    const bytes = await fetchProtectedBytes(audioUrl);
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
  // Don't decrypt protected content on a compromised device — stream instead.
  if (await deviceIsCompromised()) return null;
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

/**
 * One-time re-encryption of existing downloads from the legacy software key
 * (sandboxed IndexedDB) onto the hardware-backed key (Keychain/Keystore).
 *
 * Older builds encrypted offline audio under a non-exportable `CryptoKey`
 * held in IndexedDB. Once a hardware key is available we decrypt each file
 * with that legacy key and re-encrypt it under the hardware key in place, then
 * delete the legacy key so it can no longer be used.
 *
 * Best-effort and idempotent:
 *  - No-op on web and on any build/device where the hardware key isn't
 *    available (we leave the IndexedDB key in place and DON'T set the flag, so
 *    a later launch with a working plugin can still migrate).
 *  - Files that don't decrypt under the legacy key are left untouched — they
 *    are either already on the hardware key or corrupt, and `offlineSrcFor`
 *    self-heals corrupt files on next playback.
 *  - Even without this migration, downloads stay correct: new files use the
 *    hardware key and any legacy file that won't decrypt is purged and
 *    re-downloaded on demand. This just avoids that re-download.
 */
export async function migrateToHardwareKey(): Promise<void> {
  if (!isNative) return;
  try {
    if (localStorage.getItem(HW_KEY_MIGRATION_FLAG)) return;
  } catch {
    return;
  }

  // No hardware key yet → nothing to migrate onto. Leave the flag unset so a
  // future launch (newer build / plugin recovered) can migrate later.
  const hwKey = await getHardwareKey().catch(() => null);
  if (!hwKey) return;

  // No legacy software key → clean install or already hardware-only. Mark done.
  const legacyKey = await getIdbKey(false).catch(() => null);
  if (!legacyKey) {
    try {
      localStorage.setItem(HW_KEY_MIGRATION_FLAG, "1");
    } catch {
      /* ignore */
    }
    return;
  }

  for (const albumId of listDownloadedAlbumIds()) {
    for (const songId of Array.from(readSet(albumId))) {
      try {
        const file = await Filesystem.readFile({
          path: encPath(songId),
          directory: Directory.Cache,
        });
        const b64 = typeof file.data === "string" ? file.data : "";
        if (!b64) continue;
        // Decrypt under the legacy key; skip if it doesn't (already on HW key
        // or corrupt — offlineSrcFor self-heals the latter).
        const plain = await decryptFromBase64(b64, legacyKey);
        const data = await encryptToBase64(plain, hwKey);
        await Filesystem.writeFile({ path: encPath(songId), directory: Directory.Cache, data });
      } catch {
        /* leave this file as-is */
      }
    }
  }

  // Everything that could migrate has; retire the legacy key.
  await deleteIdbKey();
  try {
    localStorage.setItem(HW_KEY_MIGRATION_FLAG, "1");
  } catch {
    /* ignore */
  }
}
