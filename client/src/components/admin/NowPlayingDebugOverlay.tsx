// NowPlayingDebugOverlay — Task #2658 diagnostic scaffolding.
//
// Bill's native lock screen + CarPlay show a generic "GoodTunes" title + the
// app logo while the scrubber/transport work. That narrows to one of three
// causes with three different fixes (see getNowPlayingDiag in
// lib/nativeNowPlaying.ts). The deciding fact is device-only, so this surfaces
// the full JS→bridge state in-app: an operator plays a track on the native
// app, locks the phone to see the generic title, unlocks, opens this panel and
// reads the fork:
//   - pluginAvailable = false           → the bridge never delivers; the
//     scrubber is iOS auto-managing the WebView <audio> (native/registration
//     fix, needs a rebuild).
//   - pluginAvailable = true AND
//     lastMetadata.title is a real title → the bridge delivered real data but
//     iOS ignored the plugin's MPNowPlayingInfoCenter write (mediaSession fix).
//   - lastMetadata.title is empty        → JS data-shape fix.
// Ships to the existing native binary via a normal web publish (the shell loads
// the remote origin). Gated to operators on native iOS in App.tsx. Remove once
// the fork is resolved.

import { useEffect, useState } from "react";
import { getNowPlayingDiag, type NowPlayingDiag } from "@/lib/nativeNowPlaying";

function fmt(at: number | undefined): string {
  if (!at) return "—";
  try {
    return new Date(at).toLocaleTimeString();
  } catch {
    return "—";
  }
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-white/5">
      <span className="text-white/50">{label}</span>
      <span
        className={[
          "text-right break-all",
          ok === undefined ? "text-white/90" : ok ? "text-emerald-400" : "text-red-300",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

export function NowPlayingDebugOverlay() {
  const [open, setOpen] = useState(false);
  const [diag, setDiag] = useState<NowPlayingDiag>(() => getNowPlayingDiag());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const tick = () => setDiag(getNowPlayingDiag());
    window.addEventListener("gt:nowplaying-diag", tick);
    // Playback ticks update the snapshot without an event, so poll while the
    // panel is open to keep the elapsed/delivered readout live.
    const iv = open ? window.setInterval(tick, 1000) : undefined;
    return () => {
      window.removeEventListener("gt:nowplaying-diag", tick);
      if (iv) window.clearInterval(iv);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Now Playing diagnostics"
        data-testid="button-nowplaying-overlay-open"
        className="fixed bottom-4 left-4 z-[200] h-10 px-3 rounded-full bg-slate-900 text-white text-xs font-semibold shadow-lg border border-white/15 active:opacity-80"
      >
        NowPlaying
      </button>
    );
  }

  const m = diag.lastMetadata;
  const p = diag.lastPlayback;
  const f = diag.lastFavorite;
  const c = diag.lastCommand;

  return (
    <div
      className="fixed bottom-4 left-4 z-[200] w-[420px] max-w-[calc(100vw-2rem)] max-h-[75vh] flex flex-col rounded-2xl bg-slate-900 text-white shadow-2xl border border-white/10"
      data-testid="overlay-nowplaying-debug"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="text-sm font-semibold">Now Playing diagnostics</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            data-testid="button-nowplaying-copy"
            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            data-testid="button-nowplaying-overlay-close"
            className="text-white/60 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 text-xs font-mono">
        <div className="text-white/40 uppercase tracking-wide mb-1">Bridge</div>
        <Row label="isNative" value={String(diag.isNative)} ok={diag.isNative} />
        <Row label="platform" value={diag.platform} />
        <Row label="pluginAvailable" value={String(diag.pluginAvailable)} ok={diag.pluginAvailable} />

        <div className="text-white/40 uppercase tracking-wide mt-3 mb-1">
          Native plugins ({diag.registeredPlugins.length})
        </div>
        <Row
          label="SystemVolume"
          value={String(diag.siblingSystemVolume)}
          ok={diag.siblingSystemVolume}
        />
        <Row
          label="SecureKeyStore"
          value={String(diag.siblingSecureKeyStore)}
          ok={diag.siblingSecureKeyStore}
        />
        <Row
          label="registered"
          value={
            diag.registeredPlugins.length ? diag.registeredPlugins.join(", ") : "(none)"
          }
          ok={diag.registeredPlugins.includes("NowPlaying")}
        />

        <div className="text-white/40 uppercase tracking-wide mt-3 mb-1">
          Last metadata ({diag.metadataCalls})
        </div>
        <Row label="title" value={m?.title ? m.title : "(empty)"} ok={!!m?.title} />
        <Row label="artist" value={m?.artist ? m.artist : "(empty)"} ok={!!m?.artist} />
        <Row label="album" value={m?.album ? m.album : "(empty)"} ok={!!m?.album} />
        <Row label="artworkUrl" value={m?.artworkUrl ? m.artworkUrl : "(empty)"} ok={!!m?.artworkUrl} />
        <Row label="duration" value={m ? String(m.duration) : "—"} />
        <Row label="delivered" value={m ? String(m.delivered) : "—"} ok={m?.delivered} />
        <Row label="error" value={m?.error ? m.error : "none"} ok={!m?.error} />
        <Row label="at" value={fmt(m?.at)} />

        <div className="text-white/40 uppercase tracking-wide mt-3 mb-1">
          Last playback ({diag.playbackCalls})
        </div>
        <Row label="isPlaying" value={p ? String(p.isPlaying) : "—"} />
        <Row label="elapsed" value={p ? p.elapsed.toFixed(1) : "—"} />
        <Row label="duration" value={p ? String(p.duration) : "—"} />
        <Row label="delivered" value={p ? String(p.delivered) : "—"} ok={p?.delivered} />

        <div className="text-white/40 uppercase tracking-wide mt-3 mb-1">
          Favorite ({diag.favoriteCalls})
        </div>
        <Row label="isFavorite" value={f ? String(f.isFavorite) : "—"} />
        <Row label="delivered" value={f ? String(f.delivered) : "—"} ok={f?.delivered} />
        <Row label="error" value={f?.error ? f.error : "none"} ok={!f?.error} />

        <div className="text-white/40 uppercase tracking-wide mt-3 mb-1">
          Remote commands ({diag.commandCount})
        </div>
        <Row label="last" value={c ? JSON.stringify(c.cmd) : "none"} />
        <Row label="at" value={fmt(c?.at)} />
      </div>
    </div>
  );
}
