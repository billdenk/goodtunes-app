---
name: Android notification small-icon + splash framing
description: How the Android status-bar notification icon and splash are wired and why they must be brand-consistent silhouettes.
---

# Android notification small-icon + splash

- The Android status-bar notification small icon MUST be a **single-color
  white-on-transparent silhouette** — Android renders only the alpha channel
  and tints it. A full-color launcher icon there renders as a gray box on many
  devices. The asset is `res/drawable-*/ic_stat_notify.png` (mdpi 24, hdpi 36,
  xhdpi 48, xxhdpi 72, xxxhdpi 96), derived from the monochrome launcher "G"
  (`ic_launcher_monochrome`) so it matches the Android 13+ themed launcher.

- It is wired **two ways**, keep them in lockstep:
  1. AndroidManifest `<application>` FCM meta-data
     `com.google.firebase.messaging.default_notification_icon` (→
     `@drawable/ic_stat_notify`) + `default_notification_color` (→
     `@color/notification_icon_color`, brand blue #319ED8).
  2. `server/push.ts` sendFcm sets `message.android.notification.icon/color`
     explicitly.
  **Why both:** the manifest default only applies to notification-type
  payloads the OS auto-displays; the explicit server field covers the rest. If
  you rename the drawable, change BOTH or the icon silently reverts to the
  gray-box launcher fallback.

- **Splash framing:** splash drawables are full-screen `splash.png` (base +
  `drawable-port-*` + `drawable-land-*`, 11 files) used as the launch window
  background via `AppTheme.NoActionBarLaunch`. They must be the white "G" mark
  (launcher foreground, white G + orange play-dot) centered on navy `#00062B`
  — that navy is also `capacitor.config SplashScreen.backgroundColor`, so a
  white-background splash flashes white→navy on launch. Regenerate all 11 if
  the mark changes.
