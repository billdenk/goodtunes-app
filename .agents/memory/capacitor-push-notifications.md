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

## Rich notification artwork (album art)
PushPayload.image (raw `/objects/uploads/<id>` OR absolute URL) is resolved to
an absolute https URL via `absolutePushImage()` using config-driven
`fanOrigin()` (APP_URL → GOODTUNES_HOST → my.goodtunes.music) because the
triggers have no inbound req. FCM uses `android.notification.image` (big
picture) — FCM fetches it itself. APNs sets `aps.mutable-content:1` + rides the
absolute URL at the payload TOP LEVEL under key `image` (NOT inside aps); the
iOS Notification Service Extension reads `request.content.userInfo["image"]`,
downloads it, attaches it. Both degrade to plain text when no/unresolvable
image.

**The NSE is a SECOND in-tree iOS target** (`ios/App/NotificationService/`,
bundle id `Io.GoGoods.music.NotificationService`) hand-wired into
`project.pbxproj` (target + Sources/Frameworks/Resources phases + product
.appex + Embed App Extensions copy phase on the App target + target dependency
+ container proxy + Debug/Release configs + config list; FE-prefixed object
ids). cap sync won't add it — keep it in lockstep like SystemVolumePlugin.
codemagic.yaml runs a SECOND `fetch-signing-files` for the extension bundle id
(its own App Store provisioning profile; no special capabilities needed).
**Why the payload contract matters:** the server `image` key + `mutable-content`
must match exactly what the NSE parses, or iOS silently shows text only.
