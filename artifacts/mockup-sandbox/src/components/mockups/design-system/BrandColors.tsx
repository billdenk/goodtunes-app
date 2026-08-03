import "./_group.css";

const BRAND = [
  { name: "Navy background", varName: "--brand-bg", hex: "#00062B", note: "The fan shell. Every fan surface reads on this navy — never test against white.", dark: false },
  { name: "Brand blue", varName: "--brand-blue", hex: "#319ED8", note: "Primary actions, links, artist deep-links. Admin retunes it to #1f7fb8 (Stripe-calm).", dark: true },
  { name: "Brand purple", varName: "--brand-purple", hex: "#7F10A7", note: "Fan chips + gradient partner. Never on admin surfaces.", dark: true },
  { name: "Mint", varName: "--brand-mint", hex: "#4AFFCA", note: "Accent / success on dark. Illegible on white — admin uses emerald-50/700 pills instead.", dark: false },
  { name: "Heart pink", varName: "--brand-pink", hex: "#FF5470", note: "Now-playing rose accent, unread badges, preview tags. NOT the favorite-heart color.", dark: true },
  { name: "GoodTunes orange", varName: "--brand-orange", hex: "#FF7C06", note: "Reserved: GoodDeed® share-card frame only. Never a general-purpose accent.", dark: true },
];

const SOFTS = [
  { name: "--fan-surface", value: "rgba(49,158,216,0.08)", note: "Default fan card/panel fill — blue tint, never gray white-alpha" },
  { name: "--fan-surface-strong", value: "rgba(49,158,216,0.14)", note: "Input fills + raised inner tiles" },
  { name: "--brand-blue-soft", value: "rgba(49,158,216,0.10)", note: "Soft pill fills (full rgba — Tailwind can't alpha a bare var)" },
  { name: "--brand-pink-soft", value: "rgba(255,84,112,0.18)", note: "Pink soft action fill" },
  { name: "--brand-purple-soft", value: "rgba(127,16,167,0.32)", note: "Purple soft action fill" },
];

export function BrandColors() {
  return (
    <div className="gt-ds min-h-screen p-8" style={{ background: "var(--brand-bg)" }}>
      <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--brand-mint)" }}>GoodTunes Design System</p>
      <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--fan-text-primary)" }}>Brand Colors</h1>
      <p className="mb-8 max-w-2xl" style={{ color: "var(--fan-text-secondary)" }}>
        Five brand colors + navy. Neutrals come from Tailwind slate. New colors require a discussion, not a one-off.
        Always reach colors via <code>var(--brand-*)</code> — raw hex literals are lint-flagged.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {BRAND.map((c) => (
          <div key={c.hex} className="rounded-2xl overflow-hidden" style={{ background: "var(--fan-surface)" }}>
            <div className="h-24 flex items-end p-3" style={{ background: c.hex, border: c.hex === "#00062B" ? "1px solid rgba(255,255,255,0.14)" : "none" }}>
              <span className={`font-mono text-sm ${c.dark || c.hex === "#4AFFCA" ? "text-black/70" : "text-white/80"}`} style={c.hex === "#00062B" ? { color: "rgba(255,255,255,0.8)" } : {}}>{c.hex}</span>
            </div>
            <div className="p-4">
              <div className="font-semibold" style={{ color: "var(--fan-text-primary)" }}>{c.name}</div>
              <div className="font-mono text-xs mb-2" style={{ color: "var(--brand-blue)" }}>{c.varName}</div>
              <div className="text-sm leading-snug" style={{ color: "var(--fan-text-secondary)" }}>{c.note}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-semibold mb-3" style={{ color: "var(--fan-text-primary)" }}>Soft fills — the fan-surface family</h2>
      <p className="mb-4 max-w-2xl text-sm" style={{ color: "var(--fan-text-secondary)" }}>
        Fan cards are defined by fill alone — a blue tint, never a gray <code>white/[0.06]</code> wash, and never a white outline border.
      </p>
      <div className="space-y-2 max-w-2xl mb-10">
        {SOFTS.map((s) => (
          <div key={s.name} className="flex items-center gap-4 rounded-xl px-4 py-3" style={{ background: s.value }}>
            <code className="text-sm w-56 shrink-0" style={{ color: "var(--fan-text-primary)" }}>{s.name}</code>
            <span className="text-sm" style={{ color: "var(--fan-text-secondary)" }}>{s.note}</span>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-semibold mb-3" style={{ color: "var(--fan-text-primary)" }}>Rules</h2>
      <ul className="space-y-2 max-w-2xl text-sm list-disc pl-5" style={{ color: "var(--fan-text-secondary)" }}>
        <li><b style={{ color: "var(--fan-text-primary)" }}>Never inline a brand hex.</b> <code>bg-[color:var(--brand-blue)]</code>, not <code>bg-[#319ED8]</code>. design:lint enforces this.</li>
        <li><b style={{ color: "var(--fan-text-primary)" }}>Never <code>bg-[var(--x)]/NN</code>.</b> Tailwind can't alpha a var — it silently renders nothing. Use the pre-mixed <code>--brand-*-soft</code> rgba vars.</li>
        <li><b style={{ color: "var(--fan-text-primary)" }}>Orange is sacred.</b> #FF7C06 belongs to the GoodDeed® orange frame only.</li>
        <li><b style={{ color: "var(--fan-text-primary)" }}>Favorites are dimmed-white, not pink.</b> Favorited hearts/stars render in rgba(255,255,255,0.55) — filled when favorited, hollow when not.</li>
      </ul>
    </div>
  );
}
