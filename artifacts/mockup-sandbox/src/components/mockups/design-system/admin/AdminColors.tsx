import "./_group.css";

const PILLS = [
  { label: "Paid", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", note: "success / live / shipped" },
  { label: "Pending", cls: "bg-amber-50 text-amber-700 ring-amber-200", note: "pending / warning" },
  { label: "Failed", cls: "bg-rose-50 text-rose-700 ring-rose-200", note: "error / destructive" },
  { label: "12 items", cls: "bg-blue-50 text-blue-700 ring-blue-200", note: "info / count" },
  { label: "Draft", cls: "bg-slate-100 text-slate-700 ring-slate-200", note: "neutral" },
];

const SLATE = [
  { cls: "bg-slate-50", label: "slate-50 — page background" },
  { cls: "bg-slate-100", label: "slate-100 — dividers, hover fills" },
  { cls: "bg-slate-200", label: "slate-200 — card rings (ring-1)" },
  { cls: "bg-slate-400", label: "slate-400 — faint text / placeholders" },
  { cls: "bg-slate-600", label: "slate-600 — body text" },
  { cls: "bg-slate-900", label: "slate-900 — titles" },
];

export function AdminColors() {
  return (
    <div className="gt-ds gt-ds-admin min-h-screen bg-slate-50 p-8">
      <p className="text-xs uppercase tracking-widest mb-1 text-slate-400">Admin styles · colors</p>
      <h1 className="text-3xl font-bold mb-1 text-slate-900">The operator palette</h1>
      <p className="mb-8 max-w-2xl text-sm text-slate-600">
        Light-only, Stripe-leaning slate. The one brand color that crosses over is blue — retuned to the calmer
        <code> #1f7fb8</code> via the <code>body.gt-admin</code> scope. Fan purple, mint, pink and the navy shell
        never appear on an operator surface.
      </p>

      <div className="grid lg:grid-cols-2 gap-6 max-w-5xl">
        <div className="bg-white ring-1 ring-slate-200 rounded-xl p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Admin brand blue — the only accent</h2>
          <p className="text-sm text-slate-600 mb-4">
            <code>var(--brand-blue)</code> resolves to <code>#1f7fb8</code> inside the admin scope. Links, primary
            buttons, focus rings. Same token as fan — the scope does the retune, never a hardcoded hex.
          </p>
          <div className="flex items-center gap-3">
            <span className="w-14 h-14 rounded-lg" style={{ background: "var(--brand-blue)" }} />
            <button className="h-9 px-4 rounded-md text-sm font-medium text-white" style={{ background: "var(--brand-blue)" }}>Primary</button>
            <a href="#" className="text-sm underline underline-offset-2" style={{ color: "var(--brand-blue)" }}>Inline link</a>
          </div>
        </div>

        <div className="bg-white ring-1 ring-slate-200 rounded-xl p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Status pills — tinted, ringed, light</h2>
          <p className="text-sm text-slate-600 mb-4">
            Mint/pink on white is illegible, so admin status uses Tailwind tinted pills. Keep these in lockstep across
            all dashboards that show the same status.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {PILLS.map((p) => (
              <span key={p.label} className={`inline-flex items-center h-6 px-2.5 rounded-full text-xs font-medium ring-1 ${p.cls}`} title={p.note}>{p.label}</span>
            ))}
          </div>
          <ul className="mt-4 text-sm text-slate-500 space-y-1">
            {PILLS.map((p) => <li key={p.label}><b className="text-slate-700">{p.label}</b> — {p.note}</li>)}
          </ul>
        </div>

        <div className="bg-white ring-1 ring-slate-200 rounded-xl p-5 lg:col-span-2">
          <h2 className="font-semibold text-slate-900 mb-1">Slate neutrals</h2>
          <p className="text-sm text-slate-600 mb-4">Page <code>bg-slate-50</code>; cards <code>bg-white ring-1 ring-slate-200</code>; dividers <code>divide-slate-100</code>.</p>
          <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {SLATE.map((s) => (
              <div key={s.cls}>
                <div className={`h-14 rounded-lg ring-1 ring-slate-200 ${s.cls}`} />
                <div className="text-xs text-slate-500 mt-1.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul className="mt-8 space-y-1.5 text-sm list-disc pl-5 max-w-3xl text-slate-600">
        <li><b className="text-slate-900">Never fan colors here.</b> No purple chips, no mint accents, no navy chrome on any portal.</li>
        <li><b className="text-slate-900">Partner portals mirror super-admin identically</b> — same palette, same pills; only voice/copy and permission-removed affordances differ.</li>
        <li><b className="text-slate-900">Reach blue via <code>var(--brand-blue)</code></b> — the admin scope retunes it; a raw hex freezes the wrong shade.</li>
      </ul>
    </div>
  );
}
