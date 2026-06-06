/**
 * System-volume bridge for the native iOS app.
 *
 *   - Web (any browser, incl. Mobile Safari): a no-op. Web pages can't read
 *     or write the device's hardware volume, and on iOS Safari an
 *     HTMLMediaElement's `.volume` is read-only — so the volume slider is
 *     simply hidden there (see `isWebIOS` in `platform.ts`).
 *   - Native iOS (Capacitor): talks to the `SystemVolume` plugin
 *     (`ios/App/App/SystemVolumePlugin.swift`), which wraps MPVolumeView +
 *     AVAudioSession to read the current output volume, set it, and emit a
 *     `volumeChange` event whenever the hardware buttons move it. This lets
 *     the in-app slider mirror — and drive — the phone's real volume.
 *
 * Everything here is guarded so importing the module on web is harmless;
 * the plugin is only ever invoked when `isNativeIOS` is true.
 */
import { useCallback, useEffect, useState } from "react";
import { registerPlugin } from "@capacitor/core";
import { isNativeIOS } from "./platform";

interface VolumePayload {
  /** Output volume as a 0–1 float (matches AVAudioSession.outputVolume). */
  value: number;
}

interface PluginListenerHandle {
  remove: () => Promise<void>;
}

interface SystemVolumePlugin {
  /** Current system output volume (0–1). */
  getVolume(): Promise<VolumePayload>;
  /** Set the system output volume (0–1). */
  setVolume(options: VolumePayload): Promise<void>;
  /** Fires whenever the system volume changes (hardware buttons, etc.). */
  addListener(
    eventName: "volumeChange",
    listenerFunc: (data: VolumePayload) => void,
  ): Promise<PluginListenerHandle>;
}

const SystemVolume = registerPlugin<SystemVolumePlugin>("SystemVolume");

/**
 * Hook that mirrors the device's hardware volume into a 0–100 slider value
 * and writes user drags back out to the system.
 *
 * On every surface except native iOS it returns `active: false` and a null
 * level so callers fall back to the in-app PlayerContext volume (or hide the
 * slider entirely on web iOS). When active it:
 *   - reads the current system volume on mount,
 *   - subscribes to `volumeChange` so pressing the hardware buttons moves
 *     the on-screen slider live, and
 *   - exposes `setLevel` which both optimistically updates the local value
 *     and pushes it to the system volume.
 */
export function useSystemVolume(): {
  active: boolean;
  level: number | null;
  setLevel: (level: number) => void;
} {
  const [level, setLevelState] = useState<number | null>(null);

  useEffect(() => {
    if (!isNativeIOS) return;
    let cancelled = false;
    let handle: PluginListenerHandle | null = null;

    SystemVolume.getVolume()
      .then(({ value }) => {
        if (!cancelled) setLevelState(Math.round(value * 100));
      })
      .catch(() => {
        /* plugin unavailable — leave null, caller falls back */
      });

    SystemVolume.addListener("volumeChange", ({ value }) => {
      if (!cancelled) setLevelState(Math.round(value * 100));
    })
      .then((h) => {
        if (cancelled) h.remove();
        else handle = h;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, []);

  const setLevel = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(next)));
    setLevelState(clamped);
    if (isNativeIOS) {
      SystemVolume.setVolume({ value: clamped / 100 }).catch(() => {});
    }
  }, []);

  return { active: isNativeIOS, level, setLevel };
}
