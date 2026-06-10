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

// ── Navy fan page shell (max-width column), no header. ─────────────────────
export function Page({
  children,
  relative = false,
}: {
  children: ReactNode;
  relative?: boolean;
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
          position: relative ? "relative" : undefined,
          maxWidth: 440,
          margin: "0 auto",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  );
}

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
    <Page>
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
    </Page>
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

// ===========================================================================
// Direction 2 — "stack of copies" + reveal-on-open
// ---------------------------------------------------------------------------
// The old web app signalled multi-copy ownership with a STACK of artwork, not
// a number badge: one copy straight behind, the front cover tilted slightly
// left with a shadow. We keep the number off the cover entirely and reveal the
// real GoodDeed numbers cleanly when the album is opened — tapping a number
// offers "Download PDF / View Social", echoing the Player's Go-to-Album menu.
// ===========================================================================

// ── Stacked artwork for multi-copy albums. ─────────────────────────────────
// Back copy: straight, peeking up and to the right. Front cover: tilted
// slightly to the left with its own drop shadow. Single-copy albums stay flat.
export function StackArt({
  rec,
  radius = 12,
}: {
  rec: AlbumRec;
  radius?: number;
}) {
  const multi = rec.numbers.length > 1;
  if (!multi) return <Art rec={rec} radius={radius} />;
  return (
    <div style={{ position: "relative" }}>
      {/* back copy — straight, slightly darker, offset up + right */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          background: rec.gradient,
          transform: "translate(8px,-8px)",
          filter: "brightness(0.78)",
          boxShadow: "0 6px 16px rgba(0,0,0,0.40)",
          zIndex: 0,
        }}
      />
      {/* front cover — tilted left with a soft shadow */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          transform: "rotate(-3.5deg)",
          transformOrigin: "55% 60%",
          filter: "drop-shadow(0 12px 22px rgba(0,0,0,0.5))",
        }}
      >
        <Art rec={rec} radius={radius} />
      </div>
    </div>
  );
}

// ── Library grid using the stacked treatment — no number on the cover. ──────
export function StackLibraryGrid() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 24,
        padding: "16px 22px 0",
      }}
    >
      {ALBUMS.map((rec) => (
        <div key={rec.id}>
          <StackArt rec={rec} />
          <div style={{ marginTop: 13, padding: "0 2px" }}>
            <p
              style={{
                margin: 0,
                fontSize: 15,
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
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tiny line icons for the action menu. ───────────────────────────────────
function IconDownload() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 3v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}
function IconShare() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 13v6a1 1 0 001 1h12a1 1 0 001-1v-6" />
    </svg>
  );
}
function ChevronLeft() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

// ── The "tap a number" action menu (echoes the Player Go-to-Album popover). ─
export function NumberMenu({ n }: { n: number }) {
  const item: CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "13px 16px",
    textAlign: "left",
    background: "transparent",
    border: "none",
    cursor: "pointer",
  };
  return (
    <div
      role="menu"
      style={{
        marginTop: 14,
        width: 268,
        borderRadius: 18,
        overflow: "hidden",
        background: "rgba(28,30,38,0.97)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
      }}
    >
      <button type="button" style={item}>
        <IconDownload />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", color: "#fff", fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>
            Download #{n} PDF
          </span>
          <span style={{ display: "block", color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 }}>
            Certificate · print-ready
          </span>
        </span>
      </button>
      <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "0 16px" }} />
      <button type="button" style={item}>
        <IconShare />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", color: "#fff", fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>
            View #{n} Social
          </span>
          <span style={{ display: "block", color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 }}>
            Story card to share
          </span>
        </span>
      </button>
    </div>
  );
}

// ── Album detail with the GoodDeed numbers revealed cleanly. ───────────────
// `openMenuFor` opens the tap-a-number action menu for that number.
export function AlbumNumbersScreen({ openMenuFor }: { openMenuFor?: number }) {
  const rec = ALBUMS[0]; // Hope · Nightbirde · owns #310 #311 #312
  const menuOpen = openMenuFor != null;
  return (
    <Page relative>
      {menuOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 40,
          }}
        />
      )}

      <div style={{ height: 14 }} />
      {/* back row */}
      <div style={{ padding: "6px 14px 0", display: "flex", alignItems: "center" }}>
        <ChevronLeft />
        <span style={{ marginLeft: 4, fontSize: 16, color: T.primary }}>Library</span>
      </div>

      {/* hero art */}
      <div style={{ padding: "18px 0 0", display: "flex", justifyContent: "center" }}>
        <div style={{ width: 232 }}>
          <StackArt rec={rec} radius={16} />
        </div>
      </div>

      {/* title block */}
      <div style={{ textAlign: "center", padding: "26px 24px 0" }}>
        <p style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: -0.4, color: T.primary }}>
          {rec.title}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 16, color: BLUE, fontWeight: 500 }}>
          {rec.artist}
        </p>
      </div>

      {/* play / shuffle (faint, for realism) */}
      <div style={{ display: "flex", gap: 12, justifyContent: "center", padding: "20px 24px 0" }}>
        {["► Play", "⤨ Shuffle"].map((t) => (
          <div
            key={t}
            style={{
              flex: 1,
              maxWidth: 150,
              textAlign: "center",
              padding: "11px 0",
              borderRadius: 12,
              background: "rgba(255,255,255,0.08)",
              color: T.primary,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {t}
          </div>
        ))}
      </div>

      {/* clean GoodDeed-number reveal */}
      <div
        style={{
          position: "relative",
          zIndex: menuOpen ? 50 : 1,
          margin: "26px 22px 0",
          padding: "16px 18px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.2,
            color: T.secondary,
            textTransform: "uppercase",
          }}
        >
          Your GoodDeeds®
        </p>
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: -0.3,
          }}
        >
          {rec.numbers.map((n, i) => (
            <span key={n} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {i > 0 && <span style={{ color: T.faint, fontSize: 16, fontWeight: 400 }}>•</span>}
              <span
                style={{
                  color: MINT,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: openMenuFor === n ? "rgba(74,255,202,0.16)" : "transparent",
                  boxShadow: openMenuFor === n ? "0 0 0 1px rgba(74,255,202,0.45)" : "none",
                }}
              >
                #{n}
              </span>
            </span>
          ))}
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: T.faint, textAlign: "center" }}>
          {menuOpen ? "Tap a number for its certificate." : "Tap a number for its certificate — PDF or social card."}
        </p>
        {menuOpen && <NumberMenu n={openMenuFor!} />}
      </div>
    </Page>
  );
}

// ===========================================================================
// Order confirmation — the "You're in." page (matches Bill's Figma update).
// ---------------------------------------------------------------------------
// Bill's note: style it like the rest of the flow — NO border outlines, just
// filled color boxes, larger font, wider boxes. The buyer's GoodDeed number is
// the hero of the page; every owned copy's number is also surfaced in the
// order breakdown so a multi-copy buyer sees each one.
// ===========================================================================

// Filled "color box" panel — no outline, generous padding (Bill's direction).
export function FilledPanel({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: "rgba(17,29,78,0.85)",
        borderRadius: 20,
        padding: "20px 22px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Album cover with a vinyl disc peeking out to the right (Figma order card).
export function VinylPeekArt({ rec }: { rec: AlbumRec }) {
  return (
    <div style={{ position: "relative", width: 104, height: 88, flexShrink: 0 }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: 0,
          top: 8,
          width: 72,
          height: 72,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 50% 50%, #3a3d46 0 26%, #14161b 27% 58%, #2a2d36 59% 100%)",
          boxShadow: "0 4px 14px rgba(0,0,0,0.55)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 16,
            height: 16,
            transform: "translate(-50%,-50%)",
            borderRadius: "50%",
            background: "#0a0b0f",
            boxShadow: "0 0 0 3px rgba(255,255,255,0.06)",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 84,
          height: 84,
          borderRadius: 10,
          background: rec.gradient,
          boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 40%)",
          }}
        />
      </div>
    </div>
  );
}

export function IconGift() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="8" width="18" height="13" rx="1.5" />
      <path d="M12 8v13M3 12h18" />
      <path d="M12 8S10 3 7.5 3 5 6 5 6s1.5 2 7 2zM12 8s2-5 4.5-5S19 6 19 6s-1.5 2-7 2z" />
    </svg>
  );
}
export function IconLink() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.secondary} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1" />
      <path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" />
    </svg>
  );
}

export type OrderCopy = { number: number; signed?: boolean; priceCents: number };

export function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── The "You're in." order-confirmation page. ──────────────────────────────
export function ConfirmationScreen({
  copies,
  handle = "bill",
  isGift = true,
}: {
  copies: OrderCopy[];
  handle?: string;
  isGift?: boolean;
}) {
  const rec = ALBUMS[0]; // Hope · Nightbirde
  const multi = copies.length > 1;
  const subtotal = copies.reduce((s, c) => s + c.priceCents, 0);
  const shipping = 1200;
  const tax = Math.round(0.075 * (subtotal + shipping));
  const total = subtotal + shipping + tax;

  const rowLabel: CSSProperties = { fontSize: 15.5, color: T.primary };
  const rowMuted: CSSProperties = { fontSize: 15, color: T.secondary };
  const rowVal: CSSProperties = { fontSize: 15.5, color: T.primary, fontVariantNumeric: "tabular-nums" };
  const rowValMuted: CSSProperties = { fontSize: 15, color: T.secondary, fontVariantNumeric: "tabular-nums" };
  const row: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "baseline" };

  return (
    <Page>
      <div style={{ height: 18 }} />
      {/* header */}
      <div style={{ textAlign: "center", padding: "16px 24px 4px" }}>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: -0.6, color: T.primary }}>
          You&rsquo;re in.
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 15.5, color: T.secondary, lineHeight: 1.35 }}>
          Your album is unlocked and your record is on its way.
        </p>
      </div>

      <div style={{ padding: "20px 16px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* GoodDeed hero */}
        <FilledPanel style={{ textAlign: "center", padding: "26px 22px" }}>
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: 1.6,
              color: MINT,
              textTransform: "uppercase",
            }}
          >
            {multi ? "Your GoodDeeds®" : "Your GoodDeed®"}
          </p>
          {multi ? (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "center",
                gap: 12,
                fontSize: 42,
                fontWeight: 800,
                letterSpacing: -0.5,
                color: MINT,
              }}
            >
              {copies.map((c, i) => (
                <span key={c.number} style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
                  {i > 0 && <span style={{ color: T.faint, fontSize: 24, fontWeight: 400 }}>·</span>}
                  #{c.number}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 64, fontWeight: 800, letterSpacing: -1, color: MINT, lineHeight: 1 }}>
              #{copies[0].number}
            </div>
          )}
          <p style={{ margin: "14px 0 0", fontSize: 13.5, color: T.faint }}>
            Numbered for life. Refundable up until shipping.
          </p>
        </FilledPanel>

        {/* Order */}
        <FilledPanel>
          <p style={{ margin: "0 0 14px", fontSize: 12, fontWeight: 700, letterSpacing: 1.4, color: T.faint, textTransform: "uppercase" }}>
            Order
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <VinylPeekArt rec={rec} />
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.primary }}>Metallic Marble</p>
              <p style={{ margin: "3px 0 0", fontSize: 14, color: T.secondary }}>Hope — 7&Prime; Single</p>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 11 }}>
            {copies.map((c, i) => (
              <div key={c.number} style={row}>
                <span style={rowLabel}>
                  Copy {i + 1}
                  {c.signed && (
                    <span style={{ color: PINK, fontWeight: 600 }}> · Signed</span>
                  )}
                  <span style={{ color: MINT, fontWeight: 700 }}> · #{c.number}</span>
                </span>
                <span style={rowVal}>{money(c.priceCents)}</span>
              </div>
            ))}
            <div style={row}>
              <span style={rowMuted}>Shipping</span>
              <span style={rowValMuted}>{money(shipping)}</span>
            </div>
            <div style={row}>
              <span style={rowMuted}>Sales tax</span>
              <span style={rowValMuted}>{money(tax)}</span>
            </div>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.12)", margin: "16px 0" }} />
          <div style={row}>
            <span style={{ fontSize: 16, color: T.primary, fontWeight: 600 }}>Total</span>
            <span style={{ fontSize: 19, color: T.primary, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {money(total)}
            </span>
          </div>
        </FilledPanel>

        {/* Gift row */}
        {isGift && (
          <FilledPanel style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <IconGift />
              <span style={{ flex: 1, fontSize: 15.5, color: T.primary, fontWeight: 600 }}>This is a gift</span>
              <IconLink />
            </div>
          </FilledPanel>
        )}

        {/* Pick your handle */}
        <FilledPanel>
          <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, letterSpacing: 1.4, color: T.faint, textTransform: "uppercase" }}>
            Pick your handle
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 16px",
              borderRadius: 14,
              background: "rgba(0,0,0,0.28)",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "linear-gradient(135deg,#319ED8,#7F10A7)",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 17, color: T.primary, fontWeight: 600 }}>@{handle}</span>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 13, color: T.faint }}>
            We picked this from your email — change it any time.
          </p>
        </FilledPanel>

        {/* CTA */}
        <button
          type="button"
          style={{
            marginTop: 4,
            width: "100%",
            padding: "17px 0",
            border: "none",
            borderRadius: 16,
            background: "linear-gradient(180deg,#4fb0e6 0%,#2b86c4 100%)",
            color: "#fff",
            fontSize: 17,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 10px 26px rgba(43,134,196,0.4)",
          }}
        >
          Open my player
        </button>
        <div style={{ height: 24 }} />
      </div>
    </Page>
  );
}
