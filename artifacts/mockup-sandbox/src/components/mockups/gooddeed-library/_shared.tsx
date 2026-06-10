import type { CSSProperties, ReactNode } from "react";

// ---------------------------------------------------------------------------
// GoodDeed-number surfacing mockups — shared brand tokens + data.
//
// Faithful to the real fan surfaces (Welcome.tsx order confirmation +
// Collection.tsx / AlbumCard.tsx library grid). Values mirror the main app's
// brand tokens from client/src/index.css. Self-contained gradient art keeps
// the canvas iframes from reaching main-app /objects asset paths.
// ---------------------------------------------------------------------------

export const BG = "#00062B"; // --brand-bg
export const MINT = "#4AFFCA"; // --brand-mint (GoodDeed number / success)
export const BLUE = "#319ED8"; // --brand-blue
export const PURPLE = "#7F10A7"; // --brand-purple
export const PINK = "#FF5470"; // --brand-pink / heart
export const ORANGE = "#FF7C06"; // --brand-orange

// Apple-style fan text-tone scale (--fan-text-*).
export const T = {
  primary: "rgba(255,255,255,0.90)",
  secondary: "rgba(255,255,255,0.55)",
  faint: "rgba(255,255,255,0.40)",
};

export const PAGE_BG =
  "radial-gradient(circle at 50% -12%, rgba(49,158,216,0.14), transparent 58%), radial-gradient(circle at 85% 8%, rgba(127,16,167,0.16), transparent 60%), #00062B";

export const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export type AlbumRec = {
  id: string;
  title: string;
  artist: string;
  gradient: string;
  numbers: number[]; // one GoodDeed number per owned copy
};

// Realistic owned-library dataset — a mix of single- and multi-copy owners.
export const ALBUMS: AlbumRec[] = [
  {
    id: "hope",
    title: "Hope",
    artist: "Nightbirde",
    gradient: "linear-gradient(150deg,#FF7C06 0%,#FF5470 48%,#7F10A7 100%)",
    numbers: [310, 311, 312],
  },
  {
    id: "midnight",
    title: "Midnight Signals",
    artist: "Aurora Lane",
    gradient: "linear-gradient(160deg,#319ED8 0%,#7F10A7 60%,#050926 100%)",
    numbers: [58],
  },
  {
    id: "paper",
    title: "Paper Houses",
    artist: "The Lantern Club",
    gradient: "linear-gradient(135deg,#4AFFCA 0%,#319ED8 55%,#0B1457 100%)",
    numbers: [1042],
  },
  {
    id: "golden",
    title: "Golden Hour",
    artist: "Maya Reyes",
    gradient: "linear-gradient(140deg,#FFD36E 0%,#FF7C06 52%,#FF5470 100%)",
    numbers: [7],
  },
  {
    id: "concrete",
    title: "Concrete Garden",
    artist: "Vela",
    gradient: "linear-gradient(160deg,#7F10A7 0%,#319ED8 70%,#050926 100%)",
    numbers: [221, 222],
  },
  {
    id: "tide",
    title: "Slow Tide",
    artist: "Coast & Cabin",
    gradient: "linear-gradient(135deg,#4AFFCA 0%,#1f7fb8 58%,#0B1457 100%)",
    numbers: [16],
  },
];

// ── Phone shell — navy fan page with a large Apple-Music header. ───────────
export function Phone({
  title,
  children,
  scroll = true,
}: {
  title: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: PAGE_BG,
        color: T.primary,
        fontFamily: FONT,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div
        style={{
          maxWidth: 440,
          margin: "0 auto",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* status bar spacer */}
        <div style={{ height: 14 }} />
        <header style={{ padding: "10px 20px 4px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: -0.6,
              color: T.primary,
            }}
          >
            {title}
          </h1>
        </header>
        <main
          style={{
            flex: 1,
            overflowY: scroll ? "auto" : "visible",
            paddingBottom: 110,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

// ── Gradient album art square. ─────────────────────────────────────────────
export function Art({
  rec,
  radius = 12,
  children,
}: {
  rec: AlbumRec;
  radius?: number;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: radius,
        overflow: "hidden",
        background: rec.gradient,
        boxShadow: "0 6px 22px rgba(0,0,0,0.42)",
      }}
    >
      {/* subtle top sheen so flat gradients read as glossy vinyl sleeves */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 38%)",
        }}
      />
      {children}
    </div>
  );
}

export const NUMBER_TREATMENTS = ["none", "badge", "meta"] as const;
export type NumberTreatment = (typeof NUMBER_TREATMENTS)[number];

// Mint GoodDeed pill used on the artwork (Option A).
function NumberPill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: -0.1,
        padding: "3px 8px",
        borderRadius: 999,
        color: MINT,
        background: "rgba(74,255,202,0.20)",
        border: "1px solid rgba(74,255,202,0.38)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      {label}
    </span>
  );
}

// Mint ×N owned badge (the current production treatment for multi-owned).
function OwnedBadge({ count }: { count: number }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        color: MINT,
        background: "rgba(74,255,202,0.20)",
        border: "1px solid rgba(74,255,202,0.35)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      ×{count}
    </span>
  );
}

// ── One library card. `treatment` controls how the GoodDeed number shows. ──
export function LibraryCard({
  rec,
  treatment,
}: {
  rec: AlbumRec;
  treatment: NumberTreatment;
}) {
  const count = rec.numbers.length;
  const isMulti = count > 1;
  const first = rec.numbers[0];

  // Option A pill copy: single -> "#310"; multi -> "#310 +2".
  const pillLabel = isMulti ? `#${first} +${count - 1}` : `#${first}`;

  // Option B meta line: list up to 3 numbers, else summarise.
  const metaNumbers =
    count === 1
      ? `GoodDeed #${first}`
      : count <= 3
        ? `GoodDeeds ${rec.numbers.map((n) => `#${n}`).join(" · ")}`
        : `${count} GoodDeeds`;

  return (
    <div style={{ position: "relative" }}>
      {/* stacked-cards peek for multi-owned (matches AlbumCard.tsx) */}
      {isMulti && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 12,
            background: rec.gradient,
            transform: "rotate(-5deg) translate(-5px,-3px) scale(0.94)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.45)",
            opacity: 0.85,
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        <Art rec={rec}>
          {/* current production badge — only for multi, top-right */}
          {treatment === "none" && isMulti && (
            <div style={{ position: "absolute", top: 8, right: 8 }}>
              <OwnedBadge count={count} />
            </div>
          )}
          {/* Option A: GoodDeed number pill on the artwork, bottom-left */}
          {treatment === "badge" && (
            <div style={{ position: "absolute", bottom: 8, left: 8 }}>
              <NumberPill label={pillLabel} />
            </div>
          )}
          {/* Option B keeps the art clean; number lives in the meta line. */}
        </Art>

        {/* meta */}
        <div style={{ marginTop: 8, padding: "0 2px" }}>
          <p
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 400,
              lineHeight: 1.2,
              color: T.primary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {rec.title}
          </p>
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 13,
              color: T.secondary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {rec.artist}
          </p>
          {treatment === "meta" && (
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 12,
                fontWeight: 600,
                color: MINT,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {metaNumbers}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── The owned-albums grid (2-up, matches the phone Home grid). ─────────────
export function LibraryGrid({ treatment }: { treatment: NumberTreatment }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        padding: "12px 20px 0",
      }}
    >
      {ALBUMS.map((rec) => (
        <LibraryCard key={rec.id} rec={rec} treatment={treatment} />
      ))}
    </div>
  );
}

export function caption(style?: CSSProperties): CSSProperties {
  return { fontSize: 12, color: T.faint, ...style };
}
