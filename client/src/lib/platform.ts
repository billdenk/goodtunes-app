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

/**
 * True on iOS WebKit (iPhone/iPad/iPod Safari + iOS in-app web views).
 *
 * iOS Safari makes an HTMLMediaElement's `.volume` read-only — assigning to
 * it is silently ignored and the hardware buttons own loudness — so any
 * in-app volume slider there is a dead control. Surfaces hide the slider
 * when this is true rather than show one that does nothing. iPadOS 13+
 * reports as "MacIntel", so disambiguate it via touch points.
 */
export const isIOS: boolean =
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1));

/**
 * True only inside the Capacitor-wrapped native iOS app.
 *
 * The native shell can reach a real system-volume API (MPVolumeView /
 * AVAudioSession) via the SystemVolume plugin, so unlike web iOS we *can*
 * show a working volume slider that mirrors the hardware volume. Use this
 * (not `isIOS`) to switch on native-only iOS capabilities.
 */
export const isNativeIOS: boolean = isNative && nativePlatform === "ios";

/**
 * True only on iOS *web* (Mobile Safari / iOS in-app web views) — i.e. iOS
 * minus the native app. This is the surface where an HTMLMediaElement's
 * `.volume` is read-only and the hardware buttons own loudness, so an
 * in-app volume slider is a dead control and gets hidden. Native iOS is
 * excluded because the SystemVolume plugin makes the slider work there.
 */
export const isWebIOS: boolean = isIOS && !isNative;

/** Chat tab + every "Chat with vendor" CTA. */
export const chatEnabled = !isNative;

/**
 * Real on-device file downloads (Capacitor Filesystem).
 *
 * Android-native only. iOS hides every download affordance (per-track,
 * album-level, and any other) — the iPhone player is a streaming surface in
 * this build, matching the streaming-first product direction and avoiding a
 * half-wired download path on iOS. Web never downloads. Re-enable iOS by
 * widening this back to `isNative`.
 */
export const nativeDownloadsEnabled = isNative && nativePlatform === "android";

/**
 * Fan-facing Buy affordances (album BuySheet, price pill, etc.).
 *
 * Product architecture (confirmed by Bill): buying is exclusively a WEB
 * function. `get.goodtunes.music` is the preview + purchase funnel; after a
 * sale the fan is sent to `my.goodtunes.music` to view/play what they own.
 * The native apps ARE that "my" player experience — they're for owned
 * content, never a storefront. So ALL native builds (iOS *and* Android)
 * hide every Buy CTA; fans in the app keep playing what they own and any
 * new purchase happens on the web.
 *
 * This also satisfies Apple's App Review guideline 3.1.1 (no selling digital
 * goods in an iOS app outside StoreKit/IAP) for free. iOS was always no-buy;
 * Android is now matched to the same rule per the launch spec (was
 * previously left on because Play permits external payment for
 * physical-media bundles — re-enable by gating on `nativePlatform` if that
 * revenue path is ever wanted back).
 */
export const buyEnabled = !isNative;

/**
 * Orders & order-tracking entry point (Account "My Orders" row → /orders).
 * Web-only for the first native build: the in-app Orders/Library cards
 * aren't built yet, so native fans check orders on the web. Widen this
 * (or drop the `!isNative`) once the native Orders surface ships.
 */
export const ordersEnabled = !isNative;

/* ───────────────────── Apple App Store build content gates ──────────────────
 * Task #1406 — tonight's iOS submission hides a handful of fan surfaces that
 * aren't review-ready: dead links, half-built flows, and external streaming
 * handoffs we're keeping out of this build. Each is its own named flag so
 * re-enabling a surface is a one-line change — nothing here is deleted, and
 * the admin/CMS streaming tools are unaffected.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Public streaming-service handoffs: the Account "Streaming Service" picker,
 * artist external-discography "How to Play", and album/song "Stream on…"
 * buttons. Flip to `true` to bring the public streaming handoff back.
 * (Admin/CMS streaming management does NOT read this flag.)
 */
export const streamingHandoffEnabled: boolean = false;

/** Account "Notifications" row — no settings screen behind it yet. */
export const notificationsEnabled: boolean = false;

/** Account "About GoodTunes®" row — no destination yet. */
export const aboutEnabled: boolean = false;

/** Account "Linked Accounts" section (unlink / Link Google · Apple). */
export const linkedAccountsEnabled: boolean = false;

/** Account "Set a password" / magic-link opt-in panel. */
export const setPasswordEnabled: boolean = false;
