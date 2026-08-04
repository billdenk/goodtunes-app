import "./_group.css";
import { Search, Share, Heart, Star, Mic2, X, Play, ChevronLeft } from "lucide-react";

function Chip({ children, style, size = 44 }: { children: React.ReactNode; style?: React.CSSProperties; size?: number }) {
  return (
    <button
      className="rounded-full flex items-center justify-center active:scale-[0.94] transition-transform"
      style={{ width: size, height: size, ...style }}
    >
      {children}
    </button>
  );
}

const DIMMED = "rgba(255,255,255,0.55)";

export function FanSurface() {
  return (
    <div className="gt-ds min-h-screen p-8" style={{ background: "var(--brand-bg)" }}>
      <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--brand-mint)" }}>Fan surfaces · Apple Music, Apple Music, Apple Music</p>
      <h1 className="text-3xl font-bold mb-6" style={{ color: "var(--fan-text-primary)" }}>The navy player surface</h1>

      <div className="grid lg:grid-cols-2 gap-6 max-w-5xl">
        {/* IconButton */}
        <div className="rounded-2xl p-5" style={{ background: "var(--fan-surface)" }}>
          <h2 className="font-semibold mb-1" style={{ color: "var(--fan-text-primary)" }}>IconButton primitive</h2>
          <p className="text-sm mb-4" style={{ color: "var(--fan-text-secondary)" }}>
            Every circular control. md = 44×44 (HIG floor), lg = 48×48 (player primaries). No 40px buttons, ever.
            CSS press feedback on controls is always <code>active:scale-[0.94]</code>; framer-animated tappable surfaces use <code>whileTap</code> with <code>PRESS_SCALE</code> (0.96) instead — never both on one element.
          </p>
          <div className="flex items-end gap-4 flex-wrap">
            <div className="text-center">
              <Chip style={{ background: "rgba(255,255,255,0.14)" }}><Search size={19} color="rgba(255,255,255,0.9)" /></Chip>
              <div className="text-xs mt-1.5" style={{ color: "var(--fan-text-faint)" }}>glass</div>
            </div>
            <div className="text-center">
              <Chip style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}><Share size={19} color="rgba(255,255,255,0.9)" /></Chip>
              <div className="text-xs mt-1.5" style={{ color: "var(--fan-text-faint)" }}>dimmed</div>
            </div>
            <div className="text-center">
              <Chip style={{ background: "var(--brand-blue)" }} size={48}><Play size={22} color="#fff" fill="#fff" /></Chip>
              <div className="text-xs mt-1.5" style={{ color: "var(--fan-text-faint)" }}>solid · lg</div>
            </div>
            <div className="text-center">
              <Chip><Mic2 size={19} color="rgba(255,255,255,0.9)" /></Chip>
              <div className="text-xs mt-1.5" style={{ color: "var(--fan-text-faint)" }}>ghost</div>
            </div>
            <div className="text-center">
              <Chip style={{ background: "rgba(255,255,255,0.14)" }} size={48}><X size={26} color="rgba(255,255,255,0.9)" /></Chip>
              <div className="text-xs mt-1.5" style={{ color: "var(--fan-text-faint)" }}>SheetClose</div>
            </div>
            <div className="text-center">
              <Chip style={{ background: "rgba(255,255,255,0.14)" }} size={48}><ChevronLeft size={26} color="rgba(255,255,255,0.9)" /></Chip>
              <div className="text-xs mt-1.5" style={{ color: "var(--fan-text-faint)" }}>SheetBack</div>
            </div>
          </div>
        </div>

        {/* Favorites */}
        <div className="rounded-2xl p-5" style={{ background: "var(--fan-surface)" }}>
          <h2 className="font-semibold mb-1" style={{ color: "var(--fan-text-primary)" }}>Favorites — dimmed white, not pink</h2>
          <p className="text-sm mb-4" style={{ color: "var(--fan-text-secondary)" }}>
            Songs use hearts, artists use stars. Favorited = filled rgba(255,255,255,0.55); not-favorited = hollow outline.
            Pink #FF5470 keeps its other jobs (now-playing rose, badges).
          </p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2"><Heart size={20} color={DIMMED} fill={DIMMED} /><span className="text-sm" style={{ color: "var(--fan-text-secondary)" }}>favorited song</span></div>
            <div className="flex items-center gap-2"><Heart size={20} color={DIMMED} /><span className="text-sm" style={{ color: "var(--fan-text-secondary)" }}>not favorited</span></div>
            <div className="flex items-center gap-2"><Star size={20} color={DIMMED} fill={DIMMED} /><span className="text-sm" style={{ color: "var(--fan-text-secondary)" }}>favorited artist</span></div>
          </div>
        </div>

        {/* Track hairlines */}
        <div className="rounded-2xl p-5" style={{ background: "var(--fan-surface)" }}>
          <h2 className="font-semibold mb-1" style={{ color: "var(--fan-text-primary)" }}>Track-row hairline — white/20, always visible</h2>
          <p className="text-sm mb-4" style={{ color: "var(--fan-text-secondary)" }}>
            One light persistent divider between track rows. Never fades on hover or on the playing row. Don't drift to white/10 or white/[0.06].
          </p>
          <div className="flex flex-col">
            {["Storms", "Hope", "It's OK"].map((t, i) => (
              <div key={t}>
                {i > 0 && <div style={{ height: 1, background: "rgba(255,255,255,0.20)" }} />}
                <div className="flex items-center gap-3 py-3">
                  <span className="w-5 text-right text-sm" style={{ color: i === 1 ? "var(--brand-pink)" : "var(--fan-text-faint)" }}>{i + 1}</span>
                  <span className="text-[15px]" style={{ color: "var(--fan-text-primary)" }}>{t}</span>
                  {i === 1 && <span className="text-xs" style={{ color: "var(--brand-pink)" }}>● now playing</span>}
                  <span className="ml-auto text-sm" style={{ color: "var(--fan-text-secondary)" }}>3:4{i}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cards + inputs */}
        <div className="rounded-2xl p-5" style={{ background: "var(--fan-surface)" }}>
          <h2 className="font-semibold mb-1" style={{ color: "var(--fan-text-primary)" }}>Cards & inputs — fill defines the card</h2>
          <p className="text-sm mb-4" style={{ color: "var(--fan-text-secondary)" }}>
            No white outline on filled cards — the blue-tint fill separates them from navy. Inputs may keep one dim hairline (--fan-field-border), warming to brand blue on focus.
          </p>
          <div className="rounded-xl p-3 mb-3" style={{ background: "var(--fan-surface-strong)" }}>
            <div className="text-sm" style={{ color: "var(--fan-text-primary)" }}>Raised inner tile — --fan-surface-strong</div>
          </div>
          <input
            placeholder="Input with dim hairline"
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none bg-transparent"
            style={{ border: "1px solid var(--fan-field-border)", color: "var(--fan-text-primary)", background: "var(--fan-surface-strong)" }}
          />
          <div className="flex gap-2 mt-3">
            <button className="rounded-full px-4 py-2 text-sm text-white" style={{ background: "var(--brand-blue)" }}>Primary</button>
            <button className="rounded-full px-4 py-2 text-sm" style={{ background: "var(--brand-pink-soft)", color: "var(--brand-pink)" }}>Pink soft</button>
            <button className="rounded-full px-4 py-2 text-sm text-white" style={{ background: "var(--brand-purple-soft)" }}>Purple soft</button>
          </div>
        </div>
      </div>

      <ul className="mt-8 space-y-1.5 text-sm list-disc pl-5 max-w-3xl" style={{ color: "var(--fan-text-secondary)" }}>
        <li><b style={{ color: "var(--fan-text-primary)" }}>44×44pt minimum</b> touch targets everywhere on mobile.</li>
        <li><b style={{ color: "var(--fan-text-primary)" }}>One blur per region.</b> ChromeScrim owns the frosted band; stacked backdrop-filters crash iOS WebKit.</li>
        <li><b style={{ color: "var(--fan-text-primary)" }}>Top chrome</b> pins to FAN_TOP_CHROME_INSET (safe-area + 12px), never a hard top-14.</li>
        <li><b style={{ color: "var(--fan-text-primary)" }}>Sheets</b> dismiss with the glass X chip top-right; drill-downs add the back chevron top-left.</li>
        <li><b style={{ color: "var(--fan-text-primary)" }}>Lyrics glyph</b> is Lucide Mic2 — one icon per concept, everywhere.</li>
      </ul>
    </div>
  );
}
