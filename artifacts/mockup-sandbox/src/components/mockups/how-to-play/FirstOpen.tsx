import type { CSSProperties } from "react";
import {
  SheetShell,
  AlbumHero,
  SectionLabel,
  ServiceIcon,
  STREAMING_SERVICES,
  pressFx,
} from "./_shared";

// Frame 1 — First open. The fan taps "How to Play" for the first time and
// has no saved service yet, so we show the full 6-service picker grid. Every
// service is an equal, tappable tile (icon + name). A quiet caption tells
// them the choice can become their default.
export function FirstOpen() {
  const tile: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "18px 8px",
    borderRadius: 20,
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "#fff",
    cursor: "pointer",
    ...pressFx(),
  };

  return (
    <SheetShell bg="#0E1334" textColor="#fff">
      <AlbumHero textPrimary="#fff" textSecondary="rgba(255,255,255,0.55)" />
      <div style={{ paddingLeft: 20, paddingRight: 20 }}>
        <SectionLabel color="rgba(255,255,255,0.55)">Choose where to listen</SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          {STREAMING_SERVICES.map((s) => (
            <button key={s.name} type="button" style={tile} aria-label={`Listen on ${s.name}`}>
              <ServiceIcon src={s.src} name={s.name} size={50} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
            </button>
          ))}
        </div>
        <p
          style={{
            marginTop: 18,
            textAlign: "center",
            fontSize: 12.5,
            fontWeight: 400,
            color: "rgba(255,255,255,0.5)",
            lineHeight: 1.4,
          }}
        >
          Pick once and we can make it your default — you can change it anytime.
        </p>
      </div>
    </SheetShell>
  );
}
