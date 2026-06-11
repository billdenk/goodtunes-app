import {
  FAN,
  RIGS,
  IMG,
  IconButton,
  RigCard,
  MakerBadge,
  Avatar,
  PopularityCue,
  Chevron,
} from "./_shared";
import {
  DesktopGearStage,
  GearSheet,
  SheetTopBar,
  SheetBody,
  eyebrow,
  ShareIcon,
} from "./_desktop";

// DESKTOP SCREEN 4 — Gear → "Artists who've used it" → rig. Desktop version of
// GearArtists: the gear identity spans the top, then the featured rigs (which
// tie back to Rig detail) sit in the left rail and every artist whose rig
// includes this gear stacks down the right rail.

type ArtistRow = {
  name: string;
  rig: string;
  label: string; // monthly listeners
  score: number; // 0–100 popularity
  photo?: string;
  mono?: string;
};

const ARTISTS: ArtistRow[] = [
  { name: "Fernando Perdomo", rig: "’66 Telecaster Rig", label: "1.2M", score: 92, photo: IMG("artist-fernando-live.jpg") },
  { name: "June Avila", rig: "Neon Strat Rig", label: "540K", score: 64, mono: "JA" },
  { name: "The Wilder Sons", rig: "Front Porch Rig", label: "410K", score: 57, mono: "WS" },
  { name: "Marco Reyes", rig: "Desert Tele Rig", label: "260K", score: 41, mono: "MR" },
  { name: "Sam Okafor", rig: "Lo-Fi Loop Rig", label: "120K", score: 28, mono: "SO" },
];

const stringsIcon = (
  <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden>
    <path d="M5 3 V21 M10 3 V21 M15 3 V21 M20 3 V21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export function DesktopGearArtists() {
  return (
    <DesktopGearStage maxW={1080}>
      <GearSheet>
        <SheetTopBar
          context={<span style={{ fontSize: 14, color: FAN.textSecondary }}>Gear</span>}
          trailing={
            <IconButton>
              <ShareIcon />
            </IconButton>
          }
        />
        <SheetBody>
          {/* Gear identity — spans the sheet */}
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: 18,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, rgba(49,158,216,0.18), rgba(127,16,167,0.18))",
                border: `1px solid ${FAN.hairline}`,
                color: FAN.mint,
              }}
            >
              {stringsIcon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={eyebrow}>Strings</div>
              <h1 style={{ margin: "6px 0 0", fontSize: 30, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.06 }}>
                Ernie Ball Regular Slinky
              </h1>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <MakerBadge maker="Ernie Ball" mono="EB" />
                <span style={{ fontSize: 13, color: FAN.textSecondary }}>
                  Used by <span style={{ color: "#fff", fontWeight: 600 }}>312 artists</span> on GoodTunes
                </span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 30, display: "grid", gridTemplateColumns: "auto 1fr", gap: 40, alignItems: "start" }}>
            {/* LEFT — featured rigs (ties back to Rig detail) */}
            <div>
              <h3 style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Featured rigs</h3>
              <div style={{ display: "flex", gap: 16 }}>
                {RIGS.map((rig) => (
                  <RigCard key={rig.id} rig={rig} width={196} height={262} />
                ))}
              </div>
            </div>

            {/* RIGHT — artists who use these */}
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Artists who use these</h3>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {ARTISTS.map((a, i) => (
                  <div
                    key={a.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 13,
                      padding: "12px 0",
                      borderTop: i === 0 ? "none" : `1px solid ${FAN.hairline}`,
                      cursor: "pointer",
                    }}
                  >
                    <Avatar src={a.photo} mono={a.mono} size={48} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {a.name}
                      </div>
                      <div style={{ fontSize: 13, color: FAN.textSecondary, marginTop: 1 }}>{a.rig}</div>
                    </div>
                    <PopularityCue score={a.score} label={a.label} />
                    <div style={{ marginLeft: 6, flexShrink: 0 }}>
                      <Chevron color={FAN.textSecondary} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SheetBody>
      </GearSheet>
    </DesktopGearStage>
  );
}
