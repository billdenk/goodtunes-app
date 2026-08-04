import "./_group.css";

export function AdminTypography() {
  return (
    <div className="gt-ds gt-ds-admin min-h-screen bg-slate-50 p-8">
      <p className="text-xs uppercase tracking-widest mb-1 text-slate-400">Admin styles · typography</p>
      <h1 className="text-3xl font-bold mb-1 text-slate-900">Slate scale</h1>
      <p className="mb-6 text-sm max-w-md text-slate-600">
        Operator surfaces (admin CMS + every invited-partner portal) are light-only, Stripe-leaning slate.
        Never navy chrome on a portal, never slate chrome on the player.
      </p>

      <div className="max-w-xl">
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
          <li>Admin buttons stay h-8/h-9 — no h-10/11/12; press-flat, no scale-bounce.</li>
          <li>No native <code>&lt;select&gt;</code> or hand-rolled menus — shadcn Select / DropdownMenu.</li>
        </ul>
      </div>
    </div>
  );
}
