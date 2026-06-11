import { FAN, INSTRUMENT, IMG, PopularityCue } from "./_shared";
import {
  DesktopGearStage,
  GearSheet,
  SheetTopBar,
  SheetBody,
  eyebrow,
} from "./_desktop";

// DESKTOP SCREEN 2 — Instrument → "Songs played on this guitar," ranked by
// streaming popularity. Desktop version of SongsOnInstrument: the instrument
// identity + the popularity-floor control sit in the left rail, the ranked song
// list runs down the right rail (above the floor, then dimmed deep cuts below).

type SongRow = {
  rank: number;
  title: string;
  artist: string;
  album: string;
  art: string;
  label: string; // streams
  score: number; // 0–100 popularity
};

const ABOVE: SongRow[] = [
  { rank: 1, title: "What a Time", artist: "Fernando Perdomo", album: "Out to Sea", art: IMG("album-guitar-as-a-voice.png"), label: "1.4M", score: 96 },
  { rank: 2, title: "Wings to Fly", artist: "Fernando Perdomo", album: "The Golden Hour", art: IMG("album-california-way.png"), label: "980K", score: 82 },
  { rank: 3, title: "Cosmos", artist: "Fernando Perdomo", album: "Out to Sea", art: IMG("sample-album-art.png"), label: "610K", score: 68 },
  { rank: 4, title: "California Way", artist: "Fernando Perdomo", album: "California Way", art: IMG("album-california-way.png"), label: "430K", score: 55 },
  { rank: 5, title: "Golden Hour", artist: "Fernando Perdomo", album: "The Golden Hour", art: IMG("album-guitar-as-a-voice.png"), label: "280K", score: 44 },
];

const BELOW: SongRow[] = [
  { rank: 6, title: "Tidepool", artist: "Fernando Perdomo", album: "B-Sides", art: IMG("sample-album-art.png"), label: "18K", score: 12 },
  { rank: 7, title: "Backmask", artist: "Fernando Perdomo", album: "B-Sides", art: IMG("album-california-way.png"), label: "7K", score: 6 },
];

function Row({ s, dim = false }: { s: SongRow; dim?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "11px 12px",
        borderRadius: 14,
        background: dim ? "transparent" : FAN.card,
        border: `1px solid ${dim ? "transparent" : FAN.hairline}`,
        opacity: dim ? 0.5 : 1,
      }}
    >
      <span style={{ width: 18, textAlign: "center", fontSize: 14, fontWeight: 700, color: FAN.textTertiary, flexShrink: 0 }}>
        {s.rank}
      </span>
      <div style={{ width: 52, height: 52, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: "#070b22" }}>
        <img src={s.art} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.title}
        </div>
        <div style={{ fontSize: 13, color: FAN.textSecondary, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.artist} · {s.album}
        </div>
      </div>
      <PopularityCue score={s.score} label={s.label} />
    </div>
  );
}

export function DesktopSongsOnInstrument() {
  return (
    <DesktopGearStage maxW={1060}>
      <GearSheet>
        <SheetTopBar context={<span style={{ fontSize: 14, color: FAN.textSecondary }}>Instrument</span>} />
        <SheetBody>
          <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 36, alignItems: "start" }}>
            {/* LEFT — instrument identity + floor control */}
            <div>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  borderRadius: 20,
                  overflow: "hidden",
                  boxShadow: "0 20px 48px rgba(0,0,0,0.5)",
                  background: "#070b22",
                }}
              >
                <img src={INSTRUMENT.photo} alt={INSTRUMENT.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>

              <div style={{ ...eyebrow, marginTop: 18 }}>{INSTRUMENT.name}</div>
              <h1 style={{ margin: "8px 0 0", fontSize: 30, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.06 }}>
                Played on this guitar
              </h1>
              <p style={{ margin: "12px 0 0", fontSize: 14, color: FAN.textSecondary, lineHeight: 1.45 }}>
                Ranked by what fans are streaming most &mdash; popularity pulled from the catalogs, then sharpened by GoodTunes plays.
              </p>

              {/* Popularity floor control */}
              <div style={{ marginTop: 20, padding: 16, background: FAN.card, border: `1px solid ${FAN.hairline}`, borderRadius: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.1 }}>Popularity floor</span>
                  <span style={{ fontSize: 12.5, color: FAN.mint, fontWeight: 600 }}>~50K streams</span>
                </div>
                <div style={{ position: "relative", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.12)", marginTop: 12 }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "62%", borderRadius: 2, background: FAN.mint }} />
                  <div
                    style={{
                      position: "absolute",
                      left: "62%",
                      top: "50%",
                      width: 16,
                      height: 16,
                      marginLeft: -8,
                      marginTop: -8,
                      borderRadius: 999,
                      background: "#fff",
                      boxShadow: "0 1px 6px rgba(0,0,0,0.5)",
                    }}
                  />
                </div>
                <p style={{ margin: "12px 0 0", fontSize: 12.5, color: FAN.textTertiary, lineHeight: 1.4 }}>
                  Keeps the list to songs people are actually streaming. Slide down to surface deep cuts.
                </p>
              </div>
            </div>

            {/* RIGHT — ranked song list */}
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {ABOVE.map((s) => (
                  <Row key={s.rank} s={s} />
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 4px" }}>
                <div style={{ flex: 1, height: 1, background: FAN.hairline }} />
                <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: FAN.textTertiary }}>
                  Below the floor
                </span>
                <div style={{ flex: 1, height: 1, background: FAN.hairline }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                {BELOW.map((s) => (
                  <Row key={s.rank} s={s} dim />
                ))}
              </div>
            </div>
          </div>
        </SheetBody>
      </GearSheet>
    </DesktopGearStage>
  );
}
