/**
 * Hardware-backed secure key store + device-integrity bridge for the native
 * apps. This is the Tier-3 hardening for offline downloads (see
 * docs/roadmap.md): the per-device master key that encrypts downloaded audio
 * moves out of the WebKit-sandboxed IndexedDB `CryptoKey` and into the
 * platform's hardware-protected secret store:
 *
 *   - iOS  → Keychain (`SecItem*`), pinned to this device with
 *            `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` so the secret
 *            never syncs to iCloud and is unreadable until first unlock.
 *   - Android → a random data key sealed by a hardware-backed AndroidKeyStore
 *            AES key (TEE / StrongBox where available) and persisted as
 *            ciphertext; only this app on this device can unseal it.
 *
 * The native plugin (`ios/App/App/SecureKeyStorePlugin.swift`,
 * `android/.../SecureKeyStorePlugin.java`) returns the raw 256-bit key bytes
 * base64-encoded; the JS side imports them as a NON-extractable WebCrypto
 * `CryptoKey` for AES-GCM use and zeroes the transient buffer. A copied
 * `.enc` file is still useless without that key, and now the key itself is
 * protected by the secure element instead of just the app sandbox.
 *
 * It also exposes a best-effort jailbreak/root probe so the download path can
 * refuse to land (or decrypt) protected content on a compromised device,
 * where the OS sandbox guarantees no longer hold — playback simply falls back
 * to online streaming.
 *
 * EVERYTHING here is a safe no-op off native: on web (and if the plugin isn't
 * present in an older native build) `getHardwareKeyBytes` resolves to `null`
 * and `isDeviceCompromised` resolves to `false`, so callers transparently
 * fall back to the existing IndexedDB key and the un-gated path. Importing
 * this module on the web is harmless — the plugin is only ever invoked when
 * `isNative` is true.
 */
import { registerPlugin } from "@capacitor/core";
import { isNative } from "./platform";

interface KeyPayload {
  /** Base64 of the raw 256-bit (32-byte) AES master key. */
  value: string;
}

interface CompromisedPayload {
  /** True if the device looks jailbroken (iOS) / rooted (Android). */
  value: boolean;
}

interface DownloadPayload {
  /** Base64 of the fetched response body. */
  value: string;
}

interface SecureKeyStorePlugin {
  /**
   * Return the per-device master key, generating + persisting one in the
   * hardware-backed store on first call. Idempotent: the same bytes come back
   * on every later call for the life of the install.
   */
  getKey(): Promise<KeyPayload>;
  /** Best-effort jailbreak (iOS) / root (Android) detection. */
  isDeviceCompromised(): Promise<CompromisedPayload>;
  /**
   * Fetch a URL over the platform HTTP stack (URLSession / HttpsURLConnection)
   * so the app's TLS pin config (Info.plist NSPinnedDomains / Android Network
   * Security Config) is ENFORCED — which a WebView `fetch()` does not honor.
   * Returns the body base64-encoded.
   */
  pinnedDownload(options: { url: string }): Promise<DownloadPayload>;
}

const SecureKeyStore = registerPlugin<SecureKeyStorePlugin>("SecureKeyStore");

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The raw 256-bit master key from the hardware secret store, or `null` when
 * unavailable — web, an older native build that predates this plugin, or any
 * plugin error. Callers MUST treat `null` as "fall back to the software key",
 * never as a failure to surface.
 *
 * The caller owns the returned buffer and should zero it after importing it
 * into a `CryptoKey` so the raw bytes don't linger in JS memory.
 */
export async function getHardwareKeyBytes(): Promise<Uint8Array | null> {
  if (!isNative) return null;
  try {
    const { value } = await SecureKeyStore.getKey();
    if (!value) return null;
    const bytes = base64ToBytes(value);
    // AES-256 only — reject anything that isn't a 32-byte key rather than
    // silently encrypting under a short/garbage key.
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * True only when the native device-integrity probe positively reports a
 * jailbroken/rooted device. Fails SAFE: web, a missing plugin, or any error
 * resolves to `false` so we never block downloads for legitimate users on a
 * detection hiccup. The gate is an extra layer, not the primary protection.
 */
export async function isDeviceCompromised(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const { value } = await SecureKeyStore.isDeviceCompromised();
    return value === true;
  } catch {
    return false;
  }
}

/**
 * Fetch `url` over the native, TLS-PINNED HTTP path and return the raw bytes,
 * or `null` only when the pinned path is UNAVAILABLE — web, or an older native
 * build that predates this plugin method. Callers treat `null` as "fall back to
 * the (unpinned) WebView fetch" — the same version-skew tolerance the rest of
 * this module uses.
 *
 * CRITICAL: a `null` is ONLY returned for unavailability. A real failure — pin
 * mismatch (MITM), bad status, network error — REJECTS and must propagate, so a
 * tampered connection can never silently downgrade to the unpinned fetch. The
 * pin enforcement itself lives in the platform config (Info.plist
 * NSPinnedDomains / Android Network Security Config); this just routes the
 * fetch through the platform HTTP stack so that config actually applies.
 */
export async function pinnedDownloadBytes(url: string): Promise<ArrayBuffer | null> {
  if (!isNative) return null;
  try {
    const { value } = await SecureKeyStore.pinnedDownload({ url });
    return base64ToBytes(value).buffer;
  } catch (err) {
    // Capacitor throws code 'UNIMPLEMENTED' when the running native binary
    // predates this method. Only THAT means "not pinned-capable" → fall back.
    const code = (err as { code?: string } | null)?.code;
    if (code === "UNIMPLEMENTED") return null;
    throw err;
  }
}
