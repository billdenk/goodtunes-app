---
name: Capacitor push notifications wiring
description: Non-obvious requirements to make @capacitor/push-notifications deliver end-to-end on this codebase.
---

# Capacitor push notifications

The native apps load the REMOTE deployed site (capacitor.config server.url),
so the push-registration JS must ship in the deployed web bundle — it is not
a build-time-only native concern. The plugin's native side is auto-discovered
by `cap sync` (npm plugin; no manual pod/registration like in-tree .swift
plugins).

**iOS AppDelegate forwarding is mandatory.** `@capacitor/push-notifications`
does NOT get the APNs token on its own — the host app's `AppDelegate` must
implement `didRegisterForRemoteNotificationsWithDeviceToken` /
`didFailToRegisterForRemoteNotificationsWithError` and re-post them to
`NotificationCenter` as `.capacitorDidRegisterForRemoteNotifications` /
`.capacitorDidFailToRegisterForRemoteNotifications`. Without those two methods
the JS `PushNotifications.register()` listener never fires a token. The shipped
AppDelegate started bare, so this is easy to miss.

**Delivery is credential-gated and inert without keys** (same family as
opsAlert / Sentry / Resend): no provider secrets ⇒ every send is a no-op that
logs one `[push:dry-run]` line, so the whole path is verifiable without an
Apple/Google account. APNs = HTTP/2 + ES256 JWT (jose) from a .p8
(`APNS_KEY_P8`/`APNS_KEY_ID`/`APNS_TEAM_ID`, bundle defaults `Io.GoGoods.music`,
`APNS_PRODUCTION=0` for sandbox). FCM = HTTP v1, OAuth from
`FCM_SERVICE_ACCOUNT_JSON` via google-auth-library; Android also needs
`google-services.json` in the Android build.

**Why:** registration silently no-ops if any of the three legs (web bundle JS,
AppDelegate forwarding, native plugin sync) is missing, and there's no error —
the token just never arrives. Knowing all three are required saves a long
"why is there no token" hunt.
