import "./_group.css";

const PILLS = [
  { label: "Paid", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", note: "success / live / shipped" },
  { label: "Pending", cls: "bg-amber-50 text-amber-700 ring-amber-200", note: "pending / warning" },
  { label: "Failed", cls: "bg-rose-50 text-rose-700 ring-rose-200", note: "error / destructive" },
  { label: "12 items", cls: "bg-blue-50 text-blue-700 ring-blue-200", note: "info / count" },
  { label: "Draft", cls: "bg-slate-100 text-slate-700 ring-slate-200", note: "neutral" },
];

export function AdminSurface() {
  return (
    <div className="gt-ds gt-ds-admin min-h-screen bg-slate-50 p-8">
      <p className="text-xs uppercase tracking-widest mb-1 text-slate-400">Admin CMS + all partner portals · light-only</p>
      <h1 className="text-3xl font-bold mb-1 text-slate-900">The operator surface</h1>
      <p className="mb-8 max-w-2xl text-sm text-slate-600">
        Stripe-leaning light slate, Apple-Mac-app density. Partner dashboards (artist / label / press / vendor / NPO / manager / publisher)
        mirror the super-admin surface identically — only voice/copy and permission-removed affordances may differ.
      </p>

      <div className="grid lg:grid-cols-2 gap-6 max-w-5xl">
        {/* Buttons */}
        <div className="bg-white ring-1 ring-slate-200 rounded-xl p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Buttons — h-8/h-9, ~6px corners, press-flat</h2>
          <p className="text-sm text-slate-600 mb-4">
            One filled primary per section, max. Secondary actions are ghost/outline. No scale-bounce (that's fan-only). Never fan purple/blue chips here.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="h-9 px-4 rounded-md text-sm font-medium text-white" style={{ background: "var(--brand-blue)" }}>Save changes</button>
            <button className="h-9 px-4 rounded-md text-sm font-medium text-slate-700 ring-1 ring-slate-200 bg-white hover:bg-slate-50">Cancel</button>
            <button className="h-9 px-3 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100">Ghost</button>
            <button className="h-9 px-4 rounded-md text-sm font-medium text-white bg-rose-600">Delete…</button>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="text-sm text-slate-600 mb-2">Per-row <b>SaveLink</b> — invisible until dirty, then quiet brand-blue ghost pill:</div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-700">12" Black Vinyl — $34.00</span>
              <button className="text-sm font-medium rounded-md px-2.5 py-1" style={{ color: "var(--brand-blue)", background: "var(--brand-blue-soft)" }}>Save</button>
            </div>
          </div>
        </div>

        {/* Status pills */}
        <div className="bg-white ring-1 ring-slate-200 rounded-xl p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Status pills — tinted, ringed</h2>
          <p className="text-sm text-slate-600 mb-4">
            Mint and pink are illegible on white — use the tinted pill vocabulary instead. Same colors across all three dashboards that show order status.
          </p>
          <div className="flex flex-col gap-2.5">
            {PILLS.map((p) => (
              <div key={p.label} className="flex items-center gap-3">
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ${p.cls}`}>{p.label}</span>
                <span className="text-sm text-slate-500">{p.note}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Save semantics */}
        <div className="bg-white ring-1 ring-slate-200 rounded-xl p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Save semantics — auto-save by default</h2>
          <p className="text-sm text-slate-600 mb-3">Fields save on blur/change; a quiet "Saved" toast confirms. Explicit Save is reserved for exactly four cases:</p>
          <ol className="text-sm text-slate-600 space-y-1.5 list-decimal pl-5">
            <li>Destructive or expensive submits — inside a confirm dialog.</li>
            <li>Multi-field atomic forms — one primary Save at the bottom.</li>
            <li>Post-sale-locked edits — the operator must see the lock first.</li>
            <li>Per-row Save in long lists — the SaveLink ghost primitive.</li>
          </ol>
        </div>

        {/* Destructive + disclosure */}
        <div className="bg-white ring-1 ring-slate-200 rounded-xl p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Destructive actions & row lists</h2>
          <div className="rounded-lg ring-1 ring-rose-200 bg-rose-50 p-3 mb-3">
            <div className="text-sm font-medium text-rose-800">Delete <i>Storms</i>?</div>
            <div className="text-xs text-rose-700 mt-0.5 mb-2">This removes the master, snippet, lyrics, and credits.</div>
            <div className="flex gap-2">
              <button className="h-8 px-3 rounded-md text-xs font-medium text-white bg-rose-600">Delete track</button>
              <button className="h-8 px-3 rounded-md text-xs font-medium text-slate-700 bg-white ring-1 ring-slate-200">Cancel</button>
            </div>
          </div>
          <ul className="text-sm text-slate-600 space-y-1.5 list-disc pl-5">
            <li>Every delete confirms, naming the thing destroyed, rose primary.</li>
            <li>Hide / Park / Archive are reversible — toast "Hidden — undo," no confirm.</li>
            <li>Scannable sibling-row lists use <b>exclusive disclosure</b> — one row open at a time (useExclusiveDisclosure).</li>
            <li>Modals for Add / Invite / Edit — never inline forms, never duplicated CTAs.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
