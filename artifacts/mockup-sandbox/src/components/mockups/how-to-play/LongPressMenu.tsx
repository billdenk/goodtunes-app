import type { CSSProperties } from "react";
import {
  SheetShell,
  SectionLabel,
  ServiceIcon,
  DefaultChip,
  STREAMING_SERVICES,
  pressFx,
} from "./_shared";

// Frame 4 — Long-press menu. When a returning fan presses & holds the
// tap-and-go button, this "Listen on another service" sheet lists every
// service. The fan's saved service carries a DEFAULT chip and a mint accent
// ring so it's clear which one tap-and-go currently uses.
export function LongPressMenu() {
  const DEFAULT = "Spotify";

  const row: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    padding: "11px 14px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#fff",
    textAlign: "left",
    cursor: "pointer",
    ...pressFx(),
  };

  return (
    <SheetShell bg="#0E1334" textColor="#fff">
      <div style={{ paddingTop: 36, paddingLeft: 20, paddingRight: 20 }}>
        <SectionLabel color="rgba(255,255,255,0.55)">Listen on another service</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {STREAMING_SERVICES.map((s) => {
            const isDefault = s.name === DEFAULT;
            return (
              <button
                key={s.name}
                type="button"
                aria-label={`Listen on ${s.name}`}
                style={{
                  ...row,
                  background: isDefault ? "rgba(74,255,202,0.08)" : row.background,
                  border: isDefault
                    ? "1px solid rgba(74,255,202,0.35)"
                    : row.border,
                }}
              >
                <ServiceIcon src={s.src} name={s.name} size={40} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600 }}>
                  {s.name}
                </span>
                {isDefault && <DefaultChip />}
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 20, lineHeight: 1 }}>›</span>
              </button>
            );
          })}
        </div>
      </div>
    </SheetShell>
  );
}
