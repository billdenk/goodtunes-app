import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminFrame } from "@/components/admin/AdminFrame";

// Task #230 — Lightweight NPO directory so the new "NPOs" sidebar entry
// has a meaningful landing page. The per-NPO detail surface
// (AdminNonProfit) already exists; this is just the index.
type NonProfit = {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
};

export function AdminNonProfits() {
  const { data: rows = [], isLoading } = useQuery<NonProfit[]>({
    queryKey: ["/api/non-profits"],
  });

  return (
    <AdminFrame active="nonprofits">
      <div className="space-y-5" data-testid="page-admin-nonprofits">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">NPOs</h1>
            <p className="text-[13px] text-slate-500">
              Non-profit partners. Each referrer earns $1 per paid unit
              attributed to them.
            </p>
          </div>
          <span className="text-[12px] text-slate-500 tabular-nums">
            {rows.length} {rows.length === 1 ? "partner" : "partners"}
          </span>
        </header>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm text-slate-600">No NPO partners yet.</p>
            <p className="text-[12px] text-slate-500 mt-1">
              Invite an NPO from the Invites page to get started.
            </p>
          </div>
        ) : (
          <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
            {rows.map((npo) => (
              <li key={npo.id}>
                <Link href={`/admin/non-profits/${npo.id}`} className="flex items-center gap-4 px-4 py-3 text-inherit hover:bg-slate-50 hover:text-[color:var(--brand-blue)] underline-offset-2 transition-colors" data-testid={`row-npo-${npo.id}`}>
                  {npo.logoUrl ? (
                    <img
                      src={npo.logoUrl}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover bg-slate-100 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-semibold text-slate-900 truncate"
                      data-testid={`text-npo-name-${npo.id}`}
                    >
                      {npo.name}
                    </p>
                    {npo.websiteUrl && (
                      <p className="text-[12px] text-slate-500 truncate">
                        {npo.websiteUrl.replace(/^https?:\/\//, "")}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminFrame>
  );
}
