import "./_group.css";

export function Typography() {
  return (
    <div className="gt-ds min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Fan side */}
      <div className="p-8" style={{ background: "var(--brand-bg)" }}>
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--brand-mint)" }}>Fan surfaces · navy</p>
        <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--fan-text-primary)" }}>Text tones</h1>
        <p className="mb-6 text-sm max-w-md" style={{ color: "var(--fan-text-secondary)" }}>
          Exactly three tones, Apple-Music quiet. Titles are never pure white. Reach them via
          <code> text-fan-primary / -secondary / -faint</code> — never ad-hoc <code>text-white/NN</code>.
        </p>

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

      {/* Admin side */}
      <div className="gt-ds-admin p-8 bg-slate-50">
        <p className="text-xs uppercase tracking-widest mb-1 text-slate-400">Admin / partner portals · light slate</p>
        <h1 className="text-3xl font-bold mb-1 text-slate-900">Slate scale</h1>
        <p className="mb-6 text-sm max-w-md text-slate-600">
          Operator surfaces (admin CMS + every invited-partner portal) are light-only, Stripe-leaning slate.
          Never navy chrome on a portal, never slate chrome on the player.
        </p>

        <div className="bg-white ring-1 ring-slate-200 rounded-xl p-4 mb-3">
          <div className="text-xl font-semibold text-slate-900">slate-900 — titles</div>
          <div className="text-base text-slate-700">slate-700 — strong body</div>
          <div className="text-base text-slate-600">slate-600 — body</div>
          <div className="text-sm text-slate-500">slate-500 — secondary / labels</div>
          <div className="text-sm text-slate-400">slate-400 — faint / placeholders</div>
        </div>

        <div className="bg-white ring-1 ring-slate-200 rounded-xl p-4 mb-6">
          <div className="text-sm font-semibold text-slate-900 mb-2">Inline links</div>
          <p className="text-sm text-slate-600">
            Metadata deep-links inherit the surrounding color at rest, then{" "}
            <a href="#" className="underline underline-offset-2" style={{ color: "var(--brand-blue)" }}>brand blue + underline on hover</a>.
            Never render a link to <code>/admin/.../undefined</code> — gate on the FK.
          </p>
        </div>

        <ul className="space-y-1.5 text-sm list-disc pl-5 text-slate-600">
          <li>Page <code>bg-slate-50</code>; cards <code>bg-white ring-1 ring-slate-200</code>.</li>
          <li>Dividers <code>divide-slate-100</code> / <code>border-slate-100</code>.</li>
          <li>US English on all user-facing copy: "color", "favorite", "organize".</li>
          <li>No <code>text-[Npx]</code> literals — use the shadcn / HIG scale.</li>
        </ul>
      </div>
    </div>
  );
}
