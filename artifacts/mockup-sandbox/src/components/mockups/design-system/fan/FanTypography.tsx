import "./_group.css";

export function FanTypography() {
  return (
    <div className="gt-ds min-h-screen p-8" style={{ background: "var(--brand-bg)" }}>
      <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--brand-mint)" }}>Fan styles · typography</p>
      <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--fan-text-primary)" }}>Text tones on navy</h1>
      <p className="mb-6 text-sm max-w-md" style={{ color: "var(--fan-text-secondary)" }}>
        Exactly three tones, Apple-Music quiet. Titles are never pure white. Reach them via
        <code> text-fan-primary / -secondary / -faint</code> — never ad-hoc <code>text-white/NN</code>.
      </p>

      <div className="max-w-xl">
        {[
          { label: "Primary — rgba(255,255,255,0.90)", cls: "text-fan-primary", v: "var(--fan-text-primary)", sample: "Album, song & artist titles, headers, totals", size: "text-xl font-semibold" },
          { label: "Secondary — rgba(255,255,255,0.55)", cls: "text-fan-secondary", v: "var(--fan-text-secondary)", sample: "Metadata: year, subtitles, runtimes, body copy", size: "text-base" },
          { label: "Faint — rgba(255,255,255,0.40)", cls: "text-fan-faint", v: "var(--fan-text-faint)", sample: "Counts, separators ›, disabled, fine print", size: "text-sm" },
        ].map((t) => (
          <div key={t.cls} className="rounded-xl p-4 mb-3" style={{ background: "var(--fan-surface)" }}>
            <div className={t.size} style={{ color: t.v }}>{t.sample}</div>
            <div className="font-mono text-xs mt-1" style={{ color: "var(--brand-blue)" }}>{t.cls} · {t.label}</div>
          </div>
        ))}

        <div className="rounded-xl p-4 mt-6" style={{ background: "var(--fan-surface)" }}>
          <div className="text-sm font-semibold mb-2" style={{ color: "var(--fan-text-primary)" }}>Apple HIG type scale (SF / system stack)</div>
          <div style={{ color: "var(--fan-text-primary)" }} className="text-[17px]">Body — 17pt</div>
          <div style={{ color: "var(--fan-text-secondary)" }} className="text-[15px]">Secondary — 15pt</div>
          <div style={{ color: "var(--fan-text-secondary)" }} className="text-[13px]">Footnote — 13pt</div>
          <div style={{ color: "var(--fan-text-faint)" }} className="text-[11px]">Caption — 11pt</div>
        </div>

        <ul className="mt-6 space-y-1.5 text-sm list-disc pl-5" style={{ color: "var(--fan-text-secondary)" }}>
          <li>Set the page root to <code>text-fan-primary</code> so descendants inherit softened primary.</li>
          <li>Accents (brand-blue links, rose now-playing, mint) are a separate axis — never fold onto the tone scale.</li>
          <li>On-accent text on a filled brand button stays pure <code>text-white</code>.</li>
          <li>Long display titles use <code>text-balance</code> for Apple-style even wrapping.</li>
        </ul>
      </div>
    </div>
  );
}
