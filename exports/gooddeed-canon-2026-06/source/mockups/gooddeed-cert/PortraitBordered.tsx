// ORANGE-BORDER variant of the 4:5 portrait feed card (1080×1350) — the format
// Instagram and Facebook now DEFAULT to for feed posts (taller than the square,
// so it fills more of the scroll). Same approved GoodDeed signature as the
// Story (StoriesBordered), texting (OgBordered), and square (SquareBordered):
// the whole card is FRAMED edge-to-edge in GoodTunes orange (#FF7C06).
//
// Layout mirrors the approved Story: album-art band at the top with a long fade
// into navy, the owner avatar pulled UP so it straddles the seam, then
// "certifies" → owner name → [GoodTunes | #NN] pill, with the album caption
// pinned to the bottom. 4:5 is taller than the square, so the art band gets more
// height and the ownership block breathes.
//
// Sizing follows the SHIPPED Square.tsx pattern: a fixed w with u = w/1080 scale
// math (definite pixel heights resolve cleanly; % heights under aspect-ratio do
// not). Exports as 1080x1350. Optional ?r=NN overrides the corner radius
// (default 22, the approved Story curve) for A/B on the canvas.
import "./_group.css";
import type { ReactNode } from "react";
import type { StoryData } from "./Stories";

const LOGO = "/__mockup/images/goodtunes-logo-white.png";
const GOODTUNES_ORANGE = "var(--brand-orange)";

// Named album art so canvas A/B tiles can swap the image via ?art=NAME and we can
// preview the background treatment against real-feeling covers (faces, busy art).
const ART: Record<string, string> = {
  california: "/__mockup/images/album-california-way.png",
  guitar: "/__mockup/images/album-guitar-as-a-voice.png",
  nick: "/__mockup/images/album-nick-love-life-tragedy.jpg",
  sample: "/__mockup/images/sample-album-art.png",
};

const data: StoryData = {
  art: "/__mockup/images/album-california-way.png",
  ownerPhoto: "/__mockup/images/sample-owner-photo.png",
  album: { title: "California Way", artist: "TOMMYGUNN" },
  ownerName: "Jordan Ellis",
  certNumStr: "12",
};

// Auto-shrink the owner name so it stays on ONE line (matches the Story card).
function nameFontSize(name: string, u: number): number {
  const n = name.trim().length;
  const base = n <= 12 ? 88 : n <= 15 ? 76 : n <= 18 ? 66 : n <= 22 ? 57 : n <= 26 ? 50 : 44;
  return base * u;
}

export function BorderedPortraitCard({
  overlay,
  radius = 22,
  art: artProp,
  bg = "slab",
  blur = 0,
  gblur = 0,
}: {
  overlay?: ReactNode;
  radius?: number;
  art?: string;
  // "slab" = shipped look (art band fades into a solid navy lower half).
  // "bleed" = album art fills the whole card behind a lighter navy scrim, so the
  //           cover stays visible the whole way down (more transparent feel).
  // "bleed-dark" = same full-bleed SHARP art as "bleed", but a deeper navy scrim
  //           so the whole card reads richer/darker and blends down into navy
  //           like the slab — the album stays clearly visible, just dimmed.
  bg?: "slab" | "bleed" | "bleed-dark";
  // Background blur in preview px (only meaningful for bg="bleed"). 0 = crisp.
  blur?: number;
  // Graduated background blur in preview px: a blurred copy of the cover is
  // layered over the sharp one and masked so the blur is strongest at the BOTTOM
  // and clears to fully sharp by the midway line. 0 = off. Pairs with bg="bleed*".
  gblur?: number;
}) {
  const { ownerPhoto, album, ownerName, certNumStr } = data;
  const art = artProp ?? data.art;
  const bleed = bg === "bleed" || bg === "bleed-dark";
  const darkBleed = bg === "bleed-dark";

  // Preview at w = 360 with the same u = w/1080 scale the exporter uses. 4:5 →
  // height = w * 1350/1080.
  const w = 360;
  const u = w / 1080;
  const h = w * (1350 / 1080);

  const captionOneLine = `${album.title} by ${album.artist} #${certNumStr}`;
  const captionWraps = captionOneLine.length > 34;

  // Lower, lighter scrim for the full-bleed treatment: the cover stays visible up
  // top and only deepens toward the bottom enough to keep the caption legible —
  // noticeably more transparent than the slab, which goes fully solid below 92%.
  const bleedScrim = darkBleed
    ? "linear-gradient(180deg, rgba(0,6,43,0.18) 0%, rgba(0,6,43,0.40) 40%, rgba(0,6,43,0.86) 72%, rgba(0,6,43,1) 100%)"
    : "linear-gradient(180deg, rgba(0,6,43,0.10) 0%, rgba(0,6,43,0.30) 42%, rgba(0,6,43,0.68) 78%, rgba(0,6,43,0.90) 100%)";

  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{
        width: w,
        height: h,
        boxSizing: "border-box",
        border: `${45 * u}px solid ${GOODTUNES_ORANGE}`,
        borderRadius: radius,
        backgroundColor: "var(--brand-bg)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
      }}
    >
      {/* FULL-BLEED treatment: album art fills the whole card behind a navy
          scrim. The avatar/text below sit on their own layer and stay crisp. */}
      {bleed && (
        <>
          {/* Album is square — show it FULL WIDTH at its natural height anchored to
              the top (no object-cover crop / zoom), so the whole cover is visible.
              The taller 4:5 card leaves navy below, which the scrim blends into. */}
          <img
            src={art}
            alt={album.title}
            className="absolute top-0 left-0 w-full block"
            style={{
              zIndex: 0,
              height: "auto",
              filter: blur > 0 ? `blur(${blur}px)` : undefined,
              // Dissolve the album's OWN bottom edge into transparent over a long
              // ramp so there is no hard pixel cut where the square ends — it melts
              // into the navy below instead of stopping abruptly.
              WebkitMaskImage:
                "linear-gradient(180deg, #000 0%, #000 55%, rgba(0,0,0,0) 100%)",
              maskImage:
                "linear-gradient(180deg, #000 0%, #000 55%, rgba(0,0,0,0) 100%)",
            }}
          />
          {/* Graduated blur: a blurred copy of the cover, shown as a soft BAND in
              the lower-middle of the album — fades in from sharp above and fades
              back out to transparent before the album's bottom, so it reinforces
              the melt-into-navy instead of re-introducing a hard edge. */}
          {gblur > 0 && (
            <img
              src={art}
              alt=""
              aria-hidden
              className="absolute top-0 left-0 w-full block"
              style={{
                zIndex: 0,
                height: "auto",
                filter: `blur(${gblur}px)`,
                WebkitMaskImage:
                  "linear-gradient(180deg, rgba(0,0,0,0) 42%, rgba(0,0,0,1) 64%, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)",
                maskImage:
                  "linear-gradient(180deg, rgba(0,0,0,0) 42%, rgba(0,0,0,1) 64%, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)",
              }}
            />
          )}
          <div className="absolute inset-0" style={{ zIndex: 0, background: bleedScrim }} />
        </>
      )}

      {/* Album-art band at the top, with a long soft fade into navy (matches the
          approved Story blend so the seam is seamless). 4:5 affords a taller,
          near-square art window. In bleed mode this becomes a transparent spacer
          so the avatar/text keep the exact same positions. */}
      <div className="relative w-full shrink-0" style={{ height: 690 * u, zIndex: 1 }}>
        {!bleed && (
          <>
            <img src={art} alt={album.title} className="w-full h-full object-cover object-top block" />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,6,43,0) 48%, rgba(0,6,43,0.6) 76%, rgba(0,6,43,0.95) 93%, var(--brand-bg) 100%)",
              }}
            />
          </>
        )}
      </div>

      {/* Lower section — relative+z so the avatar paints ON TOP of the album art */}
      <div
        className="relative z-10 flex-1 flex flex-col items-center text-center"
        style={{ paddingLeft: 56 * u, paddingRight: 56 * u, paddingBottom: 64 * u }}
      >
        <div
          className="rounded-full overflow-hidden shrink-0"
          style={{
            width: 210 * u,
            height: 210 * u,
            marginTop: -170 * u, // straddle the seam between art and navy
            border: `${Math.max(1, 6 * u)}px solid rgba(255,255,255,0.18)`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <img src={ownerPhoto} alt={ownerName} className="w-full h-full object-cover block" />
        </div>

        <p className="text-white/55 leading-snug" style={{ fontSize: 33 * u, marginTop: 34 * u }}>
          This GoodDeed® certifies
        </p>
        <p
          className="text-white font-bold leading-tight max-w-full whitespace-nowrap"
          style={{ fontSize: nameFontSize(ownerName, u), marginTop: 10 * u }}
        >
          {ownerName}
        </p>

        {/* [GoodTunes | #NN] number pill — directly under the name */}
        <div
          className="flex items-center"
          style={{
            marginTop: 26 * u,
            gap: 22 * u,
            padding: `${24 * u}px ${44 * u}px`,
            borderRadius: 999,
            background: "rgba(0,6,43,0.62)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
          }}
        >
          <img src={LOGO} alt="GoodTunes" style={{ height: 64 * u, width: "auto", display: "block" }} />
          <span style={{ width: 1, height: 50 * u, background: "rgba(255,255,255,0.3)" }} />
          <span className="font-bold text-white" style={{ fontSize: 42 * u, letterSpacing: 0.2 }}>
            #{certNumStr}
          </span>
        </div>

        {/* secondary caption sits directly under the pill as part of the block */}
        {captionWraps ? (
          <div className="text-white/60 leading-snug" style={{ fontSize: 30 * u, marginTop: 30 * u }}>
            <p className="whitespace-nowrap">{album.title} #{certNumStr}</p>
            <p className="whitespace-nowrap">by {album.artist}</p>
          </div>
        ) : (
          <p className="text-white/60 leading-snug whitespace-nowrap" style={{ fontSize: 30 * u, marginTop: 30 * u }}>
            {captionOneLine}
          </p>
        )}
      </div>

      {overlay}
    </div>
  );
}

export function PortraitBordered() {
  const params = new URLSearchParams(window.location.search);
  // Approved/locked card radius is 22 (matches the Story). Optional ?r=NN A/B.
  const raw = Number(params.get("r") ?? "22");
  const r = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 22;
  // Canvas A/B knobs: ?art=guitar|california|sample, ?bg=slab|bleed|bleed-dark,
  // ?blur=NN(px), ?gblur=NN(px) — mirrors SquareBordered.
  const artName = params.get("art");
  const art = artName ? ART[artName] ?? undefined : undefined;
  const bgParam = params.get("bg");
  const bg = bgParam === "bleed" ? "bleed" : bgParam === "bleed-dark" ? "bleed-dark" : "slab";
  const blurRaw = Number(params.get("blur") ?? "0");
  const blur = Number.isFinite(blurRaw) ? Math.max(0, blurRaw) : 0;
  const gblurRaw = Number(params.get("gblur") ?? "0");
  const gblur = Number.isFinite(gblurRaw) ? Math.max(0, gblurRaw) : 0;
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
      <BorderedPortraitCard radius={r} art={art} bg={bg} blur={blur} gblur={gblur} />
    </div>
  );
}
