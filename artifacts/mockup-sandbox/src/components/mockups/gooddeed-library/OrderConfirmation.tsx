import { ALBUMS, Art, BG, MINT, PAGE_BG, FONT, PINK, T } from "./_shared";

// Faithful recreation of the /welcome order-confirmation screen
// (client/src/pages/Welcome.tsx): the "You're in." hero, the mint GoodDeed
// number hero card, and the per-copy order summary. This is the buyer's first
// touchpoint — the GoodDeed number is ALREADY the hero here in production.

const ALBUM = ALBUMS[0]; // Hope — owned 3 copies in this example

function CheckBurst() {
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: 999,
        margin: "0 auto 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(74,255,202,0.15)",
        border: "1px solid rgba(74,255,202,0.35)",
      }}
    >
      <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={MINT} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}

export default function OrderConfirmation() {
  const copies = ALBUM.numbers;
  const isMulti = copies.length > 1;

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
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "56px 20px 90px" }}>
        <CheckBurst />
        <h1 style={{ margin: 0, textAlign: "center", fontSize: 30, fontWeight: 800, letterSpacing: -0.6 }}>
          You're in.
        </h1>
        <p style={{ margin: "8px auto 24px", textAlign: "center", fontSize: 15, color: T.secondary, maxWidth: 320, lineHeight: 1.45 }}>
          Your album is unlocked and waiting in your library. Your vinyl is on its way.
        </p>

        {/* ── GoodDeed number hero ──────────────────────────────── */}
        {!isMulti ? (
          <div style={{ borderRadius: 18, background: "rgba(255,255,255,0.07)", padding: 20, marginBottom: 20, textAlign: "center" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: 700, color: T.faint }}>
              Your GoodDeed®
            </div>
            <div style={{ fontSize: 40, fontWeight: 800, marginTop: 4, color: MINT }}>#{copies[0]}</div>
            <div style={{ fontSize: 12, color: T.secondary, marginTop: 4 }}>Numbered for life.</div>
          </div>
        ) : (
          <div style={{ borderRadius: 18, background: "rgba(255,255,255,0.07)", padding: 20, marginBottom: 20, textAlign: "center" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: 700, color: T.faint }}>
              Your GoodDeeds®
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 16px", marginTop: 8, fontSize: 28, fontWeight: 800, color: MINT }}>
              {copies.map((n) => (
                <span key={n}>#{n}</span>
              ))}
            </div>
            <div style={{ fontSize: 12, color: T.secondary, marginTop: 8 }}>
              Numbered for life. Each copy is its own entitlement.
            </div>
          </div>
        )}

        {/* ── Order summary ─────────────────────────────────────── */}
        <div style={{ borderRadius: 18, background: "rgba(255,255,255,0.07)", padding: 20 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: 700, color: T.faint, marginBottom: 14 }}>
            Order
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
            <div style={{ width: 56, height: 56, flexShrink: 0 }}>
              <Art rec={ALBUM} radius={10} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.primary }}>{ALBUM.title}</div>
              <div style={{ fontSize: 13, color: T.secondary }}>{ALBUM.artist}</div>
            </div>
          </div>

          {/* per-copy breakdown (Task #1899 / #549) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {copies.map((n, i) => (
              <div key={n} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 14 }}>
                <span style={{ color: T.primary }}>
                  Copy {i + 1}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: T.faint }}>#{n}</span>
                  {i === 0 && (
                    <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: PINK }}>· Signed</span>
                  )}
                </span>
                <span style={{ color: T.secondary, whiteSpace: "nowrap" }}>${i === 0 ? "45.00" : "39.00"}</span>
              </div>
            ))}
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "14px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.secondary, marginBottom: 6 }}>
            <span>Shipping</span>
            <span>$6.00</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.secondary, marginBottom: 12 }}>
            <span>Sales tax</span>
            <span>$10.91</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700 }}>
            <span>Total</span>
            <span>$139.91</span>
          </div>
        </div>

        <button
          type="button"
          style={{
            width: "100%",
            marginTop: 22,
            minHeight: 52,
            borderRadius: 16,
            border: "none",
            background: "#ffffff",
            color: BG,
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Go to your library
        </button>
      </div>
    </div>
  );
}
