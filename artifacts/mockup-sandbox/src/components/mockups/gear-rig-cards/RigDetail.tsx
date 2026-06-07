import type { CSSProperties, ReactNode } from "react";
import {
  FAN,
  INSTRUMENT,
  RIGS,
  IMG,
  FanScreen,
  StatusBar,
  IconButton,
  SectionHeader,
  ResellerLogo,
  Chevron,
} from "./_shared";

const RIG = RIGS[0];

// Which availability state to render. Demo-only: drive it from the URL so each
// state can be screenshotted directly — ?stock=full | partial | none.
type Stock = "full" | "partial" | "none";
const stockParam =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("stock")
    : null;
const STOCK: Stock =
  stockParam === "partial" || stockParam === "none" ? stockParam : "full";

// Verify-only: ?focus=cta renders just the shop CTA on a short page so each
// availability state can be screenshotted without the full page below the fold.
const FOCUS_CTA =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("focus") === "cta";

// Apple HIG "See All": a section header only gets a chevron when there's a
// dedicated list page worth opening (5+ items). ?view=accessories renders that
// two-up grid — the page the Accessories header would push to.
const VIEW =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("view")
    : null;

// Apple HIG threshold: 1 item → no chevron; a section only earns a "See All"
// chevron (and its own page) once it has this many.
const SEE_ALL_MIN = 5;

type Acc = { type: string; brand: string; icon: ReactNode };

const ACCESSORIES: Acc[] = [
  {
    type: "Strings",
    brand: "Ernie Ball Slinky",
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
    type: "Strap",
    brand: "Levy's Suede",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M6 4 L18 20 M5 5 a2 2 0 1 0 0.1 0 M19 19 a2 2 0 1 0 0.1 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: "Cable",
    brand: "Mogami Gold 18ft",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M5 19 C5 12 19 12 19 5 M5 19 h3 M19 5 h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: "Capo",
    brand: "Shubb C1",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M7 4 V20 M11 6 H17 a2 2 0 0 1 0 4 H11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

// Tracks Fernando cut on THIS rig — a rig can back more than one song, so we
// surface them above the shop CTA. Pushes the "Request" down so the page leads
// with the music, not the sale.
const RIG_TRACKS = [
  { title: "What a Time", album: "Out to Sea", art: IMG("album-guitar-as-a-voice.png") },
  { title: "Wings to Fly", album: "The Golden Hour", art: IMG("album-california-way.png") },
  { title: "Cosmos", album: "Out to Sea", art: IMG("sample-album-art.png") },
];

function Heart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 20 C12 20 3.5 14.5 3.5 8.8 C3.5 5.9 5.8 4 8.1 4 C9.9 4 11.3 5 12 6.3 C12.7 5 14.1 4 15.9 4 C18.2 4 20.5 5.9 20.5 8.8 C20.5 14.5 12 20 12 20 Z"
        fill={FAN.pink}
      />
    </svg>
  );
}

// --- Availability CTA -------------------------------------------------------

const CTA_CARD: CSSProperties = {
  borderRadius: 20,
  padding: 20,
  background: "linear-gradient(135deg, rgba(49,158,216,0.18), rgba(127,16,167,0.20))",
  border: `1px solid ${FAN.hairline}`,
};

const KICKER: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: FAN.mint,
};

function PrimaryButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      style={{
        marginTop: 16,
        width: "100%",
        height: 52,
        borderRadius: 26,
        border: "none",
        cursor: "pointer",
        background: FAN.blue,
        color: "#001020",
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: -0.2,
      }}
    >
      {label}
    </button>
  );
}

function Footnote({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: "12px 2px 0",
        fontSize: 12.5,
        color: FAN.textTertiary,
        lineHeight: 1.45,
        textAlign: "center",
      }}
    >
      {children}
    </p>
  );
}

// State A — one shop has the whole rig.
function FullRigCTA() {
  return (
    <div style={CTA_CARD}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <ResellerLogo mono="N" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={KICKER}>Available as a complete rig</div>
          <div style={{ fontSize: 19, fontWeight: 800, marginTop: 4, letterSpacing: -0.3 }}>
            Norman’s Rare Guitars
          </div>
          <div style={{ fontSize: 13.5, color: FAN.textSecondary, marginTop: 1 }}>
            Los Angeles, CA · stocks every piece
          </div>
        </div>
      </div>
      <PrimaryButton label="Request this rig" />
      <Footnote>
        Your details — name, email &amp; phone, already on file — go straight to Norman’s,
        and they reach out with a quote.
      </Footnote>
    </div>
  );
}

// State B — no single shop has it all; pieces split across resellers.
const PARTIAL_SHOPS = [
  { mono: "N", name: "Norman’s Rare Guitars", covers: "Guitar · Strings · Strap" },
  { mono: "SW", name: "Sweetwater", covers: "Picks · Capo" },
  { mono: "CV", name: "Carter’s Vintage", covers: "Cable" },
];

function PartialRigCTA() {
  return (
    <div style={CTA_CARD}>
      <div style={KICKER}>Pieced together from 3 shops</div>
      <div style={{ fontSize: 19, fontWeight: 800, marginTop: 8, letterSpacing: -0.3 }}>
        No one shop has the whole rig
      </div>
      <div style={{ fontSize: 13.5, color: FAN.textSecondary, marginTop: 2, lineHeight: 1.4 }}>
        Here’s who carries each part of this setup today.
      </div>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {PARTIAL_SHOPS.map((s) => (
          <div
            key={s.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${FAN.hairline}`,
              borderRadius: 14,
              padding: 12,
            }}
          >
            <ResellerLogo mono={s.mono} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>{s.name}</div>
              <div style={{ fontSize: 12.5, color: FAN.textSecondary, marginTop: 1 }}>
                {s.covers}
              </div>
            </div>
          </div>
        ))}
      </div>

      <PrimaryButton label="Request the full rig" />
      <Footnote>
        Your request reaches each shop that carries a piece, so you can complete the rig —
        every one replies with a quote on what they stock.
      </Footnote>
    </div>
  );
}

// State C — a 1966 Fender; not in stock anywhere. Let the fan ask the
// specialists to track one down.
const HUNT_SHOPS = [
  { mono: "N", name: "Norman’s Rare Guitars", city: "Los Angeles, CA" },
  { mono: "CV", name: "Carter’s Vintage", city: "Nashville, TN" },
  { mono: "CME", name: "Chicago Music Exchange", city: "Chicago, IL" },
];

function HuntCTA() {
  return (
    <div
      style={{
        ...CTA_CARD,
        background: "linear-gradient(135deg, rgba(127,16,167,0.22), rgba(255,84,112,0.14))",
      }}
    >
      <div style={{ ...KICKER, color: FAN.orange }}>Not in stock right now</div>
      <div style={{ fontSize: 19, fontWeight: 800, marginTop: 8, letterSpacing: -0.3 }}>
        Track down this guitar
      </div>
      <div style={{ fontSize: 13.5, color: FAN.textSecondary, marginTop: 2, lineHeight: 1.4 }}>
        A real ’66 Tele is rare — none are listed right now. Send a request and these vintage
        specialists can keep an eye out:
      </div>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {HUNT_SHOPS.map((s) => (
          <div
            key={s.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${FAN.hairline}`,
              borderRadius: 14,
              padding: 12,
            }}
          >
            <ResellerLogo mono={s.mono} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>{s.name}</div>
              <div style={{ fontSize: 12.5, color: FAN.textSecondary, marginTop: 1 }}>
                {s.city}
              </div>
            </div>
          </div>
        ))}
      </div>

      <PrimaryButton label="Request a hunt" />
      <Footnote>
        Your request reaches all three. If one turns up a match, they reach out with a quote —
        no obligation.
      </Footnote>
    </div>
  );
}

// Back chevron over a glass button — reused on the "See All" page.
function BackButton() {
  return (
    <div style={{ padding: "2px 18px" }}>
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
    </div>
  );
}

// SCREEN 3 — the "See All" page the Accessories header pushes to once a section
// has 5+ items (Apple HIG). Items are laid out two-up; each card taps through
// for more info, with a "Shop" link straight to the reseller.
function AccessoriesAllScreen() {
  return (
    <FanScreen>
      <StatusBar />
      <BackButton />
      <div style={{ padding: "8px 20px 4px" }}>
        <div style={{ fontSize: 13.5, color: FAN.mint, fontWeight: 600 }}>{RIG.rigName}</div>
        <h1 style={{ margin: "3px 0 0", fontSize: 30, fontWeight: 800, letterSpacing: -0.6 }}>
          Accessories
        </h1>
        <div style={{ fontSize: 13.5, color: FAN.textSecondary, marginTop: 3 }}>
          Every piece that rounds out {RIG.artist}’s rig.
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: "0 20px 44px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        {ACCESSORIES.map((a) => (
          <div
            key={a.type}
            style={{
              background: FAN.card,
              border: `1px solid ${FAN.hairline}`,
              borderRadius: 16,
              padding: 16,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ color: FAN.blue, marginBottom: 14 }}>{a.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>{a.type}</div>
            <div
              style={{
                fontSize: 13,
                color: FAN.textSecondary,
                marginTop: 2,
                lineHeight: 1.3,
                minHeight: 34,
              }}
            >
              {a.brand}
            </div>
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: `1px solid ${FAN.hairline}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 600, color: FAN.blue }}>Shop</span>
              <Chevron size={15} color={FAN.blue} />
            </div>
          </div>
        ))}
      </div>
    </FanScreen>
  );
}

// SCREEN 2 — Tapped a Rig card. The artist photo becomes the header, the
// three lines rise to the top, then the rig breaks down into "Instrument" and
// "Accessories", the tracks it played on, and a shop CTA at the bottom.
export function RigDetail() {
  if (VIEW === "accessories") {
    return <AccessoriesAllScreen />;
  }

  if (FOCUS_CTA) {
    return (
      <FanScreen>
        <StatusBar />
        <div style={{ marginTop: 24, padding: "0 20px 44px" }}>
          {STOCK === "full" && <FullRigCTA />}
          {STOCK === "partial" && <PartialRigCTA />}
          {STOCK === "none" && <HuntCTA />}
        </div>
      </FanScreen>
    );
  }

  return (
    <FanScreen>
      {/* Full-bleed artist header */}
      <div style={{ position: "relative", height: 420 }}>
        <img
          src={RIG.photo}
          alt={RIG.artist}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center 18%",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, var(--brand-bg) 2%, rgba(0,6,43,0.55) 26%, rgba(0,6,43,0) 52%)",
          }}
        />
        {/* status bar + back over photo */}
        <div style={{ position: "relative", zIndex: 2 }}>
          <StatusBar />
          <div style={{ padding: "2px 18px" }}>
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
          </div>
        </div>
        {/* three lines, risen to the header */}
        <div
          style={{
            position: "absolute",
            left: 20,
            right: 20,
            bottom: 18,
            zIndex: 2,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "rgba(255,255,255,0.85)",
              textShadow: "0 1px 8px rgba(0,0,0,0.6)",
            }}
          >
            {RIG.track}
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: -0.6,
              lineHeight: 1.08,
              textShadow: "0 2px 12px rgba(0,0,0,0.55)",
            }}
          >
            {RIG.artist}
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              marginTop: 2,
              color: FAN.mint,
              textShadow: "0 1px 8px rgba(0,0,0,0.6)",
            }}
          >
            {RIG.rigName}
          </div>
        </div>
      </div>

      {/* Instrument — single item, so no "See All" chevron (Apple HIG) */}
      <div style={{ marginTop: 22 }}>
        <SectionHeader title="Instrument" chevron={false} />
        <div style={{ padding: "0 20px" }}>
          <div
            style={{
              display: "flex",
              gap: 14,
              alignItems: "center",
              background: FAN.card,
              border: `1px solid ${FAN.hairline}`,
              borderRadius: 16,
              padding: 12,
            }}
          >
            <div
              style={{
                width: 78,
                height: 78,
                borderRadius: 12,
                overflow: "hidden",
                flexShrink: 0,
                background: "#070b22",
              }}
            >
              <img
                src={INSTRUMENT.photo}
                alt={INSTRUMENT.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>
                {INSTRUMENT.name}
              </div>
              <div style={{ fontSize: 13.5, color: FAN.textSecondary, marginTop: 1 }}>
                {INSTRUMENT.maker} · {INSTRUMENT.category}
              </div>
            </div>
            <Chevron color={FAN.textSecondary} />
          </div>
        </div>
      </div>

      {/* Accessories — 5+ items, so the header earns a "See All" chevron that
          opens the two-up grid page (Apple HIG). */}
      <div style={{ marginTop: 28 }}>
        <SectionHeader title="Accessories" inlineChevron chevron={ACCESSORIES.length >= SEE_ALL_MIN} />
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            padding: "0 20px 4px",
          }}
        >
          {ACCESSORIES.map((a) => (
            <div
              key={a.type}
              style={{
                width: 124,
                flexShrink: 0,
                background: FAN.card,
                border: `1px solid ${FAN.hairline}`,
                borderRadius: 14,
                padding: "14px 14px 16px",
              }}
            >
              <div style={{ color: FAN.blue, marginBottom: 12 }}>{a.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{a.type}</div>
              <div
                style={{
                  fontSize: 12.5,
                  color: FAN.textSecondary,
                  marginTop: 2,
                  lineHeight: 1.3,
                }}
              >
                {a.brand}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tracks using this Rig — leads with the music, softens the CTA below.
          All three rows are shown, so no "See All" chevron (Apple HIG). */}
      <div style={{ marginTop: 30 }}>
        <SectionHeader title="Tracks using this Rig" chevron={false} />
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column" }}>
          {RIG_TRACKS.map((t, i) => (
            <div
              key={t.title}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                padding: "10px 0",
                borderTop: i === 0 ? "none" : `1px solid ${FAN.hairline}`,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  overflow: "hidden",
                  flexShrink: 0,
                  background: "#070b22",
                }}
              >
                <img
                  src={t.art}
                  alt={t.album}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: -0.2 }}>
                  {t.title}
                </div>
                <div style={{ fontSize: 13, color: FAN.textSecondary, marginTop: 1 }}>
                  {RIG.artist} · {t.album}
                </div>
              </div>
              <Heart />
            </div>
          ))}
        </div>
      </div>

      {/* Get the rig — shop CTA varies with availability */}
      <div style={{ marginTop: 30, padding: "0 20px 44px" }}>
        {STOCK === "full" && <FullRigCTA />}
        {STOCK === "partial" && <PartialRigCTA />}
        {STOCK === "none" && <HuntCTA />}
      </div>
    </FanScreen>
  );
}
