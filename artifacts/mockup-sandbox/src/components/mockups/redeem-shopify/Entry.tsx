import { useState } from "react";

/**
 * Redeem page — entry state.
 *
 * Fan clicked "Get your music now" in the Shopify order confirmation
 * email (or order-status page). The album was already unlocked at
 * webhook time against the email on the order; this page just needs
 * them to set a password so they can sign in.
 *
 * Read-only mockup at /__mockup/preview/redeem-shopify/Entry. All
 * controls are inert — wired to console.log so we can iterate on copy
 * and layout without touching the live page.
 *
 * Production version lives at client/src/pages/Redeem.tsx.
 */

const BRAND_BG = "#00062B";
const BRAND_BLUE = "#319ED8";
const BRAND_BLUE_DEEP = "#1D5E8F";
const BRAND_MINT = "#4AFFCA";
const BRAND_PURPLE = "#7F10A7";

// Demo data — replace nothing here; this whole file is mock copy.
const DEMO = {
  storeName: "Compass Records",
  buyerName: "Sarah",
  buyerEmail: "sarah@example.com",
  album: {
    title: "Wildflower",
    artist: "The Steel Wheels",
    artwork:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80&auto=format&fit=crop",
  },
};

export default function RedeemEntry() {
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"create" | "signin">("create");

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center"
      style={{
        background: BRAND_BG,
        fontFamily:
          "system-ui, -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif",
        color: "white",
      }}
      data-testid="redeem-shopify-entry"
    >
      <GoodTunesHeader />

      <main className="w-full max-w-md px-6 pt-2 pb-10">
        {/* Origin pill */}
        <div className="flex justify-center mb-5">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
            style={{
              background: "rgba(74, 255, 202, 0.10)",
              color: BRAND_MINT,
              border: `1px solid ${BRAND_MINT}33`,
            }}
          >
            <Sparkle /> From {DEMO.storeName}
          </span>
        </div>

        {/* Album hero */}
        <div className="text-center">
          <div
            className="mx-auto rounded-2xl overflow-hidden mb-5"
            style={{
              width: 192,
              height: 192,
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
            Welcome, {DEMO.buyerName}.
          </h1>
          <p className="text-[15px] text-white/70 mt-1">
            Your copy of <span className="text-white font-semibold">{DEMO.album.title}</span>{" "}
            by <span className="text-white font-semibold">{DEMO.album.artist}</span> is ready.
          </p>
        </div>

        {/* Form card */}
        <div
          className="mt-7 rounded-2xl p-5"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-[13px] text-white/65 mb-4 leading-relaxed">
            {mode === "create" ? (
              <>
                Pick a password to finish setting up your free GoodTunes account. We&rsquo;ll
                use the email from your {DEMO.storeName} order.
              </>
            ) : (
              <>Sign in to add this album to your GoodTunes collection.</>
            )}
          </p>

          <Field label="Email">
            <input
              type="email"
              value={DEMO.buyerEmail}
              readOnly
              className="w-full h-11 rounded-lg px-3 text-[14px] outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.85)",
              }}
            />
          </Field>

          <Field label={mode === "create" ? "Pick a password" : "Your password"}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-11 rounded-lg px-3 text-[14px] outline-none text-white"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            />
          </Field>

          <button
            type="button"
            onClick={() => console.log("[mockup] unlock")}
            className="mt-4 w-full h-12 rounded-full font-semibold text-[15px] transition active:scale-[0.99]"
            style={{
              background: `linear-gradient(135deg, ${BRAND_BLUE_DEEP}, ${BRAND_BLUE})`,
              color: "white",
              boxShadow: `0 10px 30px -10px ${BRAND_BLUE}99`,
            }}
            data-testid="button-unlock"
          >
            {mode === "create" ? "Create account & unlock" : "Sign in & unlock"}
          </button>

          {/* OAuth row — not wired in current production page, mocked here so we can decide */}
          <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-white/40">
            <div className="flex-1 h-px bg-white/10" />
            or
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <OAuthButton label="Continue with Google" provider="google" />
            <OAuthButton label="Continue with Apple" provider="apple" />
          </div>

          <button
            type="button"
            onClick={() => setMode(mode === "create" ? "signin" : "create")}
            className="block w-full text-center mt-5 text-[13px] text-white/60 hover:text-white transition"
            data-testid="button-toggle-mode"
          >
            {mode === "create"
              ? "Already have a GoodTunes account? Sign in"
              : "New to GoodTunes? Create an account"}
          </button>
        </div>

        {/* Trust footer */}
        <div className="mt-6 text-center text-[11.5px] text-white/45 leading-relaxed">
          Your music plays instantly inside GoodTunes — nothing to download,{" "}
          <br className="hidden sm:block" />
          available on any device you sign in on.
        </div>
      </main>
    </div>
  );
}

/* ---------- bits ---------- */

function GoodTunesHeader() {
  return (
    <header className="w-full flex items-center justify-center pt-7 pb-3">
      <div className="flex items-center gap-2.5">
        <LogoMark />
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
  );
}

function LogoMark() {
  // Stylized GT — heart over a music-note swirl in the brand palette.
  return (
    <div
      className="rounded-xl flex items-center justify-center"
      style={{
        width: 30,
        height: 30,
        background: `linear-gradient(135deg, ${BRAND_PURPLE}, ${BRAND_BLUE})`,
        boxShadow: `0 6px 18px -6px ${BRAND_BLUE}aa`,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"
          fill="#FF5470"
        />
      </svg>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <label className="block mb-1.5 text-[11px] uppercase tracking-wider font-semibold text-white/55">
        {label}
      </label>
      {children}
    </div>
  );
}

function OAuthButton({ label, provider }: { label: string; provider: "google" | "apple" }) {
  return (
    <button
      type="button"
      onClick={() => console.log(`[mockup] ${provider} oauth`)}
      className="h-11 rounded-full flex items-center justify-center gap-2 text-[13px] font-semibold transition active:scale-[0.99]"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.10)",
        color: "white",
      }}
    >
      {provider === "google" ? <GoogleGlyph /> : <AppleGlyph />}
      <span className="truncate">{label.replace("Continue with ", "")}</span>
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.45.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <path d="M17.05 12.04c-.03-2.92 2.39-4.33 2.5-4.4-1.36-2-3.49-2.27-4.24-2.3-1.8-.18-3.52 1.07-4.43 1.07-.93 0-2.32-1.05-3.83-1.02-1.97.03-3.79 1.16-4.8 2.94-2.06 3.58-.53 8.87 1.48 11.78.98 1.42 2.14 3.02 3.66 2.96 1.48-.06 2.04-.95 3.83-.95 1.79 0 2.29.95 3.85.92 1.59-.03 2.59-1.44 3.55-2.87 1.13-1.65 1.59-3.26 1.61-3.34-.03-.01-3.09-1.19-3.12-4.72zM14.34 3.91c.81-1 1.36-2.37 1.21-3.74-1.18.05-2.6.78-3.44 1.77-.75.88-1.41 2.29-1.23 3.63 1.32.1 2.66-.67 3.46-1.66z" />
    </svg>
  );
}

function Sparkle() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0l2.4 7.6L22 10l-7.6 2.4L12 20l-2.4-7.6L2 10l7.6-2.4z" />
    </svg>
  );
}
