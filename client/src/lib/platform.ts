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

/**
 * Fan-facing Buy affordances (album BuySheet, price pill, etc.).
 *
 * Apple's App Review guideline 3.1.1 bans selling digital goods inside an
 * iOS app without going through StoreKit / IAP (and taking Apple's cut).
 * GoodTunes albums are bundles of digital downloads + physical media, and
 * the whole pricing model assumes a Stripe checkout — IAP is out of scope
 * for v1. The clean answer is: on iOS native, hide every Buy CTA. Fans
 * already in the app keep playing what they own; new purchases happen on
 * the web at goodtunes.music.
 *
 * Android does not have an equivalent rule for music purchases that
 * happen through an external website (Play allows external payment for
 * digital goods, especially physical-media bundles), so Android native
 * keeps the Buy buttons.
 */
export const buyEnabled = !(isNative && nativePlatform === "ios");
