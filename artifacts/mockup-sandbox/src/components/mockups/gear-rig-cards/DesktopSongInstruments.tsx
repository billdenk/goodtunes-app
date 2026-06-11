import type { ReactNode } from "react";
import { FAN, IMG, Chevron } from "./_shared";
import {
  DesktopGearStage,
  GearSheet,
  SheetTopBar,
  SheetBody,
  PlayGlyph,
} from "./_desktop";

// DESKTOP SCREEN 3 — Song → "What was used to make this." Desktop version of
// SongInstruments: the song hero + Preview + production credits sit in the left
// rail, while the performers (each a door through to their full rig) stack down
// the right rail.

type Perf = {
  name: string;
  part: string;
  gear: string;
  rig?: boolean;
  icon: ReactNode;
};

const guitarIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
    <path d="M14 4 l6 6 -8 8 a3 3 0 1 1 -4 -4 z M4 20 l4 -4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const bassIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
    <path d="M9 17 V6 l9 -2 V15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="6.5" cy="17.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="15.5" cy="15.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const drumIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
    <ellipse cx="12" cy="7" rx="8" ry="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M4 7 V15 a8 3 0 0 0 16 0 V7" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const keysIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 5 V19 M13 5 V19 M18 5 V19" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const PERFORMERS: Perf[] = [
  { name: "Fernando Perdomo", part: "Electric Guitar", gear: "1966 Fender Telecaster", rig: true, icon: guitarIcon },
  { name: "Fernando Perdomo", part: "Bass", gear: "Höfner 500/1", rig: true, icon: bassIcon },
  { name: "Matt Tecu", part: "Drums", gear: "Ludwig Classic Maple", rig: true, icon: drumIcon },
  { name: "Will Ferri", part: "Keys", gear: "Wurlitzer 200A", rig: false, icon: keysIcon },
];

const PRODUCTION = [
  { role: "Produced by", who: "Fernando Perdomo" },
  { role: "Mixed by", who: "Chris Price" },
  { role: "Mastered by", who: "Dave McNair" },
];

export function DesktopSongInstruments() {
  return (
    <DesktopGearStage maxW={1020}>
      <GearSheet>
        <SheetTopBar context={<span style={{ fontSize: 14, color: FAN.textSecondary }}>Song</span>} />
        <SheetBody>
          <div style={{ display: "grid", gridTemplateColumns: "0.85fr 1.15fr", gap: 36, alignItems: "start" }}>
            {/* LEFT — song hero + production */}
            <div>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  borderRadius: 18,
                  overflow: "hidden",
                  boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
                  background: "#070b22",
                }}
              >
                <img src={IMG("album-guitar-as-a-voice.png")} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>

              <h1 style={{ margin: "18px 0 0", fontSize: 28, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.08 }}>What a Time</h1>
              <div style={{ fontSize: 15, color: FAN.textSecondary, marginTop: 4 }}>Fernando Perdomo</div>
              <div style={{ fontSize: 13, color: FAN.textTertiary, marginTop: 1 }}>Out to Sea · 2024</div>

              <button
                type="button"
                style={{
                  marginTop: 16,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  height: 40,
                  padding: "0 20px 0 16px",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  background: FAN.blue,
                  color: "#001020",
                  fontSize: 14.5,
                  fontWeight: 700,
                }}
              >
                <PlayGlyph />
                Preview
              </button>

              <h3 style={{ margin: "30px 0 4px", fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>Production</h3>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {PRODUCTION.map((c, i) => (
                  <div
                    key={c.role}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 0",
                      borderTop: i === 0 ? "none" : `1px solid ${FAN.hairline}`,
                    }}
                  >
                    <span style={{ fontSize: 13.5, color: FAN.textSecondary }}>{c.role}</span>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>{c.who}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT — performers, each a door to their rig */}
            <div>
              <h3 style={{ margin: "4px 0 6px", fontSize: 19, fontWeight: 800, letterSpacing: -0.3 }}>On this track</h3>
              <p style={{ margin: "0 0 16px", fontSize: 13.5, color: FAN.textSecondary, lineHeight: 1.45 }}>
                Click a player to open their full rig &mdash; every instrument, amp and pedal, shoppable from one place.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {PERFORMERS.map((p, i) => (
                  <div
                    key={`${p.name}-${p.part}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      background: i === 0
                        ? "linear-gradient(135deg, rgba(49,158,216,0.16), rgba(127,16,167,0.16))"
                        : FAN.card,
                      border: `1px solid ${FAN.hairline}`,
                      borderRadius: 16,
                      padding: 14,
                      cursor: p.rig ? "pointer" : "default",
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
                        color: i === 0 ? FAN.mint : FAN.blue,
                      }}
                    >
                      {p.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: -0.2 }}>{p.name}</div>
                      <div style={{ fontSize: 13, color: FAN.textSecondary, marginTop: 1 }}>
                        {p.part} · {p.gear}
                      </div>
                    </div>
                    {p.rig ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 13, fontWeight: 600, color: FAN.blue }}>
                        Rig
                        <Chevron size={14} color={FAN.blue} />
                      </span>
                    ) : null}
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
