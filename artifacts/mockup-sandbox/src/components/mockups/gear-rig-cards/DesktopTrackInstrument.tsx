import type { ReactNode } from "react";
import { FAN, INSTRUMENT, IMG, IconButton, MakerBadge, Chevron } from "./_shared";
import {
  DesktopGearStage,
  GearSheet,
  SheetTopBar,
  SheetBody,
  eyebrow,
  ShareIcon,
  BookmarkIcon,
} from "./_desktop";

// DESKTOP SCREEN 1 — Track → Instrument. Desktop version of TrackInstrument:
// the whole story on one sheet, split into an image/identity rail (hero photo,
// maker nod, the artist's own shots) and a detail rail (name + About, the full
// kit inline, and the door through to every song this guitar played on).

type KitPiece = { type: string; brand: string; hero?: boolean; icon: ReactNode };

const KIT: KitPiece[] = [
  {
    type: "Electric Guitar",
    brand: "1966 Fender Telecaster",
    hero: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M14 4 l6 6 -8 8 a3 3 0 1 1 -4 -4 z M4 20 l4 -4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    type: "Strings",
    brand: "Ernie Ball Regular Slinky",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M5 3 V21 M10 3 V21 M15 3 V21 M20 3 V21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: "Picks",
    brand: "Dunlop Tortex .73",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 3 C18 3 21 7 21 11 C21 17 15 21 12 21 C9 21 3 17 3 11 C3 7 6 3 12 3 Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    type: "Amp",
    brand: "1965 Fender Deluxe Reverb",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6 7 h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

const PHOTOS = [
  IMG("artist-fernando-live.jpg"),
  IMG("instrument-telecaster.png"),
  IMG("artist-fernando-perdomo.png"),
];

export function DesktopTrackInstrument() {
  return (
    <DesktopGearStage maxW={1060}>
      <GearSheet>
        <SheetTopBar
          context={
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                padding: "6px 13px 6px 6px",
                borderRadius: 999,
                background: FAN.card,
                border: `1px solid ${FAN.hairline}`,
              }}
            >
              <div style={{ width: 26, height: 26, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "#070b22" }}>
                <img src={IMG("album-guitar-as-a-voice.png")} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <span style={{ fontSize: 13, color: FAN.textSecondary }}>
                Heard on <span style={{ color: "#fff", fontWeight: 600 }}>&ldquo;What a Time&rdquo;</span>
              </span>
            </div>
          }
          trailing={
            <>
              <IconButton>
                <ShareIcon />
              </IconButton>
              <IconButton>
                <BookmarkIcon />
              </IconButton>
            </>
          }
        />
        <SheetBody>
          <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 34, alignItems: "start" }}>
            {/* LEFT — image / identity rail */}
            <div>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "4 / 3",
                  borderRadius: 20,
                  overflow: "hidden",
                  boxShadow: "0 20px 48px rgba(0,0,0,0.5)",
                  background: "#070b22",
                }}
              >
                <img src={INSTRUMENT.photo} alt={INSTRUMENT.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>

              <div style={{ marginTop: 16 }}>
                <MakerBadge maker="Fender" mono="F" />
              </div>

              <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {PHOTOS.map((src, i) => (
                  <div
                    key={i}
                    style={{
                      aspectRatio: "1 / 1",
                      borderRadius: 12,
                      overflow: "hidden",
                      background: "#070b22",
                      boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
                    }}
                  >
                    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                ))}
              </div>
              <p style={{ margin: "12px 0 0", fontSize: 12.5, color: FAN.textSecondary, lineHeight: 1.45 }}>
                Shots Fernando uploaded of this exact guitar &mdash; the real thing, not a catalog stock photo.
              </p>
            </div>

            {/* RIGHT — detail rail */}
            <div>
              <div style={eyebrow}>{INSTRUMENT.category}</div>
              <h1 style={{ margin: "8px 0 3px", fontSize: 34, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.05 }}>
                {INSTRUMENT.name}
              </h1>
              <div style={{ fontSize: 16, color: FAN.textSecondary, fontWeight: 500 }}>{INSTRUMENT.maker}</div>

              <p style={{ margin: "18px 0 0", fontSize: 15.5, lineHeight: 1.55, color: "rgba(235,235,245,0.80)" }}>
                {INSTRUMENT.blurb}
              </p>

              <h3 style={{ margin: "28px 0 14px", fontSize: 19, fontWeight: 800, letterSpacing: -0.3 }}>The full kit</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {KIT.map((p) => (
                  <div
                    key={p.type}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      background: p.hero
                        ? "linear-gradient(135deg, rgba(49,158,216,0.16), rgba(127,16,167,0.16))"
                        : FAN.card,
                      border: `1px solid ${FAN.hairline}`,
                      borderRadius: 16,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(255,255,255,0.06)",
                        color: p.hero ? FAN.mint : FAN.blue,
                      }}
                    >
                      {p.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: -0.2 }}>{p.type}</div>
                      <div style={{ fontSize: 13, color: FAN.textSecondary, marginTop: 1 }}>{p.brand}</div>
                    </div>
                    {p.hero ? (
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: FAN.mint }}>
                        This guitar
                      </span>
                    ) : (
                      <Chevron color={FAN.textSecondary} />
                    )}
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: FAN.card,
                  border: `1px solid ${FAN.hairline}`,
                  borderRadius: 16,
                  padding: 16,
                  cursor: "pointer",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: -0.2 }}>Songs played on this guitar</div>
                  <div style={{ fontSize: 13, color: FAN.textSecondary, marginTop: 1 }}>14 tracks · ranked by what fans stream most</div>
                </div>
                <Chevron color={FAN.textSecondary} />
              </div>
            </div>
          </div>
        </SheetBody>
      </GearSheet>
    </DesktopGearStage>
  );
}
