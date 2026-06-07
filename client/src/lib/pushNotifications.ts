/**
 * Push-notification registration for the Capacitor native apps.
 *
 * Web is a no-op: only the native iOS/Android shells have a push token to
 * register. On native we ask for permission, register with the OS, and on
 * success POST the APNs (iOS) / FCM (Android) token to /api/push/register
 * so the backend can deliver alerts (server/push.ts). Delivery itself is
 * credential-gated server-side and inert until the operator loads keys.
 *
 * Registration is gated on the fan being signed in (the register endpoint
 * is requireCustomer): the native apps are the "my.goodtunes.music" owned-
 * content player, so by the time the shell mounts the fan has a session.
 * <PushRegistrar/> (App.tsx) calls init() once the auth query resolves a
 * customer.
 */
import { isNative, nativePlatform } from "@/lib/platform";
import { apiRequest } from "@/lib/queryClient";

let started = false;

export async function initPushNotifications(): Promise<void> {
  // Web has no native token; never touch the plugin there.
  if (!isNative) return;
  // Idempotent: App.tsx may re-run the effect across auth refreshes.
  if (started) return;
  started = true;

  try {
    // The native apps load the LATEST web bundle from my.goodtunes.music
    // (remote origin), so this JS can be newer than the installed binary.
    // An older binary (built before push shipped) has NO native push plugin,
    // and every plugin call — including addListener() — rejects with
    // "PushNotifications plugin is not implemented on ios". Those rejections
    // are un-awaited, so they surface as the global "Unhandled promise
    // rejection" banner. Gate on the plugin actually being present in THIS
    // binary before touching it.
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isPluginAvailable("PushNotifications")) {
      console.warn("[push] plugin not in this native build — skipping");
      return;
    }

    const { PushNotifications } = await import("@capacitor/push-notifications");

    // Forward the OS-issued token to our backend. iOS hands back the raw
    // APNs token; Android hands back the FCM registration token. The
    // backend keys delivery transport on `platform`. `addListener` returns
    // a promise that REJECTS when the plugin is absent, so it must be
    // awaited inside this try (an un-awaited reject becomes the global
    // unhandled-rejection banner).
    await PushNotifications.addListener("registration", (token) => {
      const platform = nativePlatform === "ios" ? "ios" : "android";
      void apiRequest("POST", "/api/push/register", { token: token.value, platform }).catch((e) => {
        // Best-effort: a failed POST just means no alerts until the next
        // launch re-registers. Never surface into the app.
        console.warn("[push] token register failed", e);
      });
    });

    await PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push] registration error", err);
    });

    // Ask for permission, then register with APNs/FCM. `register()` is what
    // triggers the `registration` listener above with the device token.
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive === "granted") {
      await PushNotifications.register();
    }
  } catch (e) {
    // Plugin missing / not synced into this build — never break the app.
    console.warn("[push] init skipped", e);
  }
}
