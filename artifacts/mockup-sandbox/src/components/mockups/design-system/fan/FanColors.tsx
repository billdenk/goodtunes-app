import "./_group.css";

const BRAND = [
  { name: "Navy background", varName: "--brand-bg", hex: "#00062B", note: "The fan shell. Every fan surface reads on this navy — never test against white.", dark: false },
  { name: "Brand blue", varName: "--brand-blue", hex: "#319ED8", note: "Primary actions, links, artist deep-links.", dark: true },
  { name: "Brand purple", varName: "--brand-purple", hex: "#7F10A7", note: "Fan chips + gradient partner. Fan-only — never on admin surfaces.", dark: true },
  { name: "Mint", varName: "--brand-mint", hex: "#4AFFCA", note: "Accent / success on dark navy. Illegible on white — stays on fan surfaces.", dark: false },
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

export function FanColors() {
  return (
    <div className="gt-ds min-h-screen p-8" style={{ background: "var(--brand-bg)" }}>
      <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--brand-mint)" }}>Fan styles · colors</p>
      <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--fan-text-primary)" }}>The fan palette</h1>
      <p className="mb-8 max-w-2xl" style={{ color: "var(--fan-text-secondary)" }}>
        Five brand colors + navy, always on the navy shell. Neutrals come from white-alpha tones, never Tailwind slate.
        Always reach colors via <code>var(--brand-*)</code> — raw hex literals are lint-flagged. New colors require a discussion, not a one-off.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mb-10">
        {BRAND.map((c) => (
          <div key={c.varName} className="rounded-xl overflow-hidden" style={{ background: "var(--fan-surface)" }}>
            <div className="h-24 flex items-end p-3" style={{ background: c.hex, border: c.hex === "#00062B" ? "1px solid rgba(255,255,255,0.14)" : "none" }}>
              <span className={`font-mono text-sm ${c.dark || c.hex === "#4AFFCA" ? "text-black/70" : "text-white/80"}`} style={c.hex === "#00062B" ? { color: "rgba(255,255,255,0.8)" } : {}}>{c.hex}</span>
            </div>
            <div className="p-3">
              <div className="font-semibold text-sm" style={{ color: "var(--fan-text-primary)" }}>{c.name} <code className="font-mono text-xs" style={{ color: "var(--brand-blue)" }}>{c.varName}</code></div>
              <div className="text-xs mt-1" style={{ color: "var(--fan-text-secondary)" }}>{c.note}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-semibold mb-3" style={{ color: "var(--fan-text-primary)" }}>Soft fills — pre-mixed rgba tokens</h2>
      <div className="max-w-3xl rounded-2xl p-5 mb-8" style={{ background: "var(--fan-surface)" }}>
        {SOFTS.map((s) => (
          <div key={s.name} className="flex items-center gap-4 py-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
            <span className="w-10 h-10 rounded-lg shrink-0" style={{ background: s.value, border: "1px solid rgba(255,255,255,0.10)" }} />
            <code className="text-sm w-52 shrink-0" style={{ color: "var(--brand-mint)" }}>{s.name}</code>
            <span className="text-sm" style={{ color: "var(--fan-text-secondary)" }}>{s.note}</span>
          </div>
        ))}
      </div>

      <ul className="space-y-1.5 text-sm list-disc pl-5 max-w-3xl" style={{ color: "var(--fan-text-secondary)" }}>
        <li><b style={{ color: "var(--fan-text-primary)" }}>Never inline a brand hex.</b> <code>bg-[color:var(--brand-blue)]</code>, not a raw hex class. design:lint enforces this.</li>
        <li><b style={{ color: "var(--fan-text-primary)" }}>Tailwind can't alpha a var.</b> <code>bg-[var(--brand-x)]/NN</code> silently renders nothing — use the pre-mixed <code>--*-soft</code> tokens.</li>
        <li><b style={{ color: "var(--fan-text-primary)" }}>Fan cards are blue-tint fills</b>, never gray <code>white/5</code> washes and never outlined boxes.</li>
      </ul>
    </div>
  );
}
