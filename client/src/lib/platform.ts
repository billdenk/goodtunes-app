/**
 * Single source of truth for which surfaces are visible on which platform.
 *
 * Web (goodtunes.app) and the Capacitor-wrapped native apps share one
 * codebase. Product rules from Nick:
 *   - Web has Chat. Native (v1) does not.
 *   - Web does NOT download song files. Native does (real on-device files
 *     via the Capacitor Filesystem plugin, so an album plays in airplane
 *     mode).
 *
 * Every gated UI surface reads these booleans rather than calling
 * `Capacitor.isNativePlatform()` itself, so the rules stay in ONE file.
 */
import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const nativePlatform: "ios" | "android" | "web" =
  (Capacitor.getPlatform() as "ios" | "android" | "web") ?? "web";

/** Chat tab + every "Chat with vendor" CTA. */
export const chatEnabled = !isNative;

/** Real on-device file downloads (Capacitor Filesystem). */
export const nativeDownloadsEnabled = isNative;
