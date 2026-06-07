import { useState } from "react";
import {
  FAN,
  INSTRUMENT,
  RIGS,
  FanScreen,
  StatusBar,
  IconButton,
  SectionHeader,
  RigCard,
  Chevron,
} from "./_shared";

// SCREEN 1 — The gear sheet as it works today (instrument hero + maker +
// expandable "About"), now with a Rig-cards rail underneath: the Apple Music
// "Top Picks for You" tall-card format applied to the artists & tracks that
// played this guitar.
export function GearSheet() {
  const [expanded, setExpanded] = useState(false);

  return (
    <FanScreen>
      <StatusBar />

      {/* Top chrome bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "2px 18px 14px",
        }}
      >
        <IconButton>
          <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
            <path
              d="M10 3 L5 8 L10 13"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
        <div style={{ display: "flex", gap: 10 }}>
          <IconButton>
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
              <path
                d="M12 3 V15 M12 3 L8 7 M12 3 L16 7 M5 12 V20 H19 V12"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </IconButton>
          <IconButton>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path
                d="M6 3 H18 V21 L12 16 L6 21 Z"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </IconButton>
        </div>
      </div>

      {/* Instrument hero */}
      <div style={{ padding: "0 20px" }}>
        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 10",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 20px 48px rgba(0,0,0,0.5)",
            background: "#070b22",
          }}
        >
          <img
            src={INSTRUMENT.photo}
            alt={INSTRUMENT.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>

        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: FAN.textSecondary,
            }}
          >
            {INSTRUMENT.category}
          </div>
          <h1
            style={{
              margin: "6px 0 2px",
              fontSize: 27,
              fontWeight: 800,
              letterSpacing: -0.6,
              lineHeight: 1.1,
            }}
          >
            {INSTRUMENT.name}
          </h1>
          <div style={{ fontSize: 15, color: FAN.textSecondary, fontWeight: 500 }}>
            {INSTRUMENT.maker}
          </div>
        </div>

        {/* About + More */}
        <div style={{ marginTop: 18 }}>
          <p
            style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.5,
              color: "rgba(235,235,245,0.78)",
              display: "-webkit-box",
              WebkitLineClamp: expanded ? "unset" : 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {INSTRUMENT.blurb}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{
              marginTop: 6,
              padding: 0,
              border: "none",
              background: "none",
              color: FAN.blue,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {expanded ? "Less" : "More"}
          </button>
        </div>
      </div>

      {/* Rig cards rail */}
      <div style={{ marginTop: 30, paddingBottom: 40 }}>
        <SectionHeader title="Played on this guitar" inlineChevron />
        <div style={{ paddingLeft: 4, marginTop: -2, marginBottom: 12 }}>
          <p
            style={{
              margin: "0 0 16px",
              padding: "0 20px",
              fontSize: 13.5,
              color: FAN.textSecondary,
              lineHeight: 1.4,
            }}
          >
            Tap a rig to see the full setup — and grab the whole kit from one shop.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            overflowX: "auto",
            padding: "0 20px 4px",
          }}
        >
          {RIGS.map((rig) => (
            <RigCard key={rig.id} rig={rig} />
          ))}
          {/* peek of an "all rigs" affordance */}
          <div
            style={{
              width: 96,
              height: 330,
              flexShrink: 0,
              borderRadius: 16,
              border: `1px solid ${FAN.hairline}`,
              background: FAN.card,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              color: FAN.textSecondary,
            }}
          >
            <Chevron size={20} color={FAN.textSecondary} />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>See all</span>
          </div>
        </div>
      </div>
    </FanScreen>
  );
}
