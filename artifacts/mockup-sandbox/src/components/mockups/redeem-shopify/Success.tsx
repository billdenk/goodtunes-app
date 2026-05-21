/**
 * Redeem page — success state.
 *
 * Shown immediately after the fan signs in / sets a password and the
 * claim succeeds. Surfaces the album cover, the assigned GoodDeed
 * number, and a single Play-now CTA. Read-only mockup; the production
 * version lives in client/src/pages/Redeem.tsx.
 */

const BRAND_BG = "#00062B";
const BRAND_BLUE = "#319ED8";
const BRAND_BLUE_DEEP = "#1D5E8F";
const BRAND_MINT = "#4AFFCA";
const BRAND_PURPLE = "#7F10A7";

const DEMO = {
  storeName: "Compass Records",
  buyerName: "Sarah",
  goodDeedNumber: 142,
  album: {
    title: "Wildflower",
    artist: "The Steel Wheels",
    artwork:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80&auto=format&fit=crop",
  },
};

export default function RedeemSuccess() {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center"
      style={{
        background: BRAND_BG,
        fontFamily:
          "system-ui, -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif",
        color: "white",
      }}
      data-testid="redeem-shopify-success"
    >
      <header className="w-full flex items-center justify-center pt-7 pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="rounded-xl flex items-center justify-center"
            style={{
              width: 30,
              height: 30,
              background: `linear-gradient(135deg, ${BRAND_PURPLE}, ${BRAND_BLUE})`,
              boxShadow: `0 6px 18px -6px ${BRAND_BLUE}aa`,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"
                fill="#FF5470"
              />
            </svg>
          </div>
          <span
            className="text-[18px] font-bold tracking-tight"
            style={{
              background: "linear-gradient(90deg, #fff 0%, #cdeaff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            GoodTunes
          </span>
        </div>
      </header>

      <main className="w-full max-w-md px-6 pt-4 pb-10 text-center">
        {/* Unlocked pill */}
        <div className="flex justify-center mb-5">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider"
            style={{
              background: `${BRAND_MINT}1A`,
              color: BRAND_MINT,
              border: `1px solid ${BRAND_MINT}55`,
            }}
          >
            <CheckGlyph /> Unlocked
          </span>
        </div>

        {/* Album cover */}
        <div
          className="mx-auto rounded-2xl overflow-hidden mb-6"
          style={{
            width: 216,
            height: 216,
            boxShadow:
              "0 30px 60px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06) inset",
          }}
        >
          <img
            src={DEMO.album.artwork}
            alt={DEMO.album.title}
            className="w-full h-full object-cover"
          />
        </div>

        <h1 className="text-[28px] leading-tight font-bold tracking-tight">
          {DEMO.album.title}
        </h1>
        <p className="text-[15px] text-white/70 mt-1 mb-5">{DEMO.album.artist}</p>

        {/* GoodDeed number — the keepsake */}
        <div
          className="mx-auto mb-7 inline-block px-5 py-3 rounded-2xl text-left"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <div className="text-[10.5px] uppercase tracking-wider text-white/55 font-semibold">
            Your GoodDeed
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-white/70 text-[20px] font-semibold">#</span>
            <span
              className="font-mono font-bold text-[34px] leading-none"
              style={{ color: BRAND_MINT, letterSpacing: "0.04em" }}
            >
              {DEMO.goodDeedNumber}
            </span>
          </div>
          <div className="text-[11px] text-white/45 mt-1">
            of fans who own this album on GoodTunes
          </div>
        </div>

        {/* Play CTA */}
        <button
          type="button"
          onClick={() => console.log("[mockup] play now")}
          className="w-full h-13 rounded-full font-semibold text-[15px] transition active:scale-[0.99] mb-3"
          style={{
            height: 52,
            background: `linear-gradient(135deg, ${BRAND_BLUE_DEEP}, ${BRAND_BLUE})`,
            color: "white",
            boxShadow: `0 12px 32px -10px ${BRAND_BLUE}aa`,
          }}
          data-testid="button-play-now"
        >
          ▶ Play now
        </button>

        <button
          type="button"
          onClick={() => console.log("[mockup] open collection")}
          className="text-[13px] text-white/55 hover:text-white transition"
          data-testid="button-open-collection"
        >
          Open your collection →
        </button>

        <div className="mt-9 text-center text-[11.5px] text-white/45 leading-relaxed">
          A receipt for your {DEMO.storeName} order is in your email.
          <br />
          Your physical copy ships separately.
        </div>
      </main>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
