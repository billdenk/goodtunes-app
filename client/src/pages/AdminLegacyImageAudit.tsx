// Task #434 — Read-only audit of imported rows still pointing at the
// off-platform tinifycdn.com CDN (or any other non-Object-Storage URL).
// Bill walks the list top-to-bottom, opens each row in the existing
// admin editor, and re-uploads the image by hand. The page never moves
// or rewrites anything.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminErrorBoundary, ErrorState } from "@/components/admin/AdminErrorBoundary";
import { getAuthToken } from "@/lib/queryClient";

type EntityType = "person" | "album" | "bonus_video";

type Row = {
  entityType: EntityType;
  entityId: string;
  adminHref: string;
  displayName: string;
  field: "photoUrl" | "coverUrl" | "posterUrl";
  currentUrl: string;
  host: string;
};

type Report = {
  generatedAt: string;
  total: number;
  byEntityType: Record<EntityType, Row[]>;
};

const GROUP_LABEL: Record<EntityType, string> = {
  person: "People",
  album: "Albums",
  bonus_video: "Bonus videos",
};

const FIELD_LABEL: Record<Row["field"], string> = {
  photoUrl: "Profile photo",
  coverUrl: "Cover",
  posterUrl: "Video thumbnail",
};

export function AdminLegacyImageAudit() {
  return (
    <AdminErrorBoundary title="Legacy image audit failed to render">
      <Inner />
    </AdminErrorBoundary>
  );
}

function Inner() {
  const { data, isLoading, isError, error, refetch } = useQuery<Report>({
    queryKey: ["/api/admin/legacy-image-audit"],
  });

  const hostsSummary = useMemo(() => {
    if (!data) return "";
    const counts = new Map<string, number>();
    for (const t of ["person", "album", "bonus_video"] as const) {
      for (const row of data.byEntityType[t]) {
        counts.set(row.host, (counts.get(row.host) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([host, n]) => `${host} (${n})`)
      .join(" · ");
  }, [data]);

  async function downloadCsv() {
    const token = getAuthToken();
    const r = await fetch("/api/admin/legacy-image-audit.csv", {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const cd = r.headers.get("Content-Disposition") ?? "";
    const m = /filename="([^"]+)"/.exec(cd);
    const filename = m?.[1] ?? "legacy-image-audit.csv";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminFrame active="none">
      <div className="space-y-5" data-testid="page-legacy-image-audit">
        <AdminPageHeader
          title="Legacy image audit"
          subtitle="Imported rows whose image is still hosted off-platform (typically tinifycdn.com). Open each row in its editor and re-upload the image — the count below ticks down as you go. No images are moved or rewritten by this page."
          testId="heading-legacy-image-audit"
          actions={
            <button
              type="button"
              onClick={downloadCsv}
              disabled={!data || data.total === 0}
              className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              data-testid="button-download-csv"
            >
              Download CSV
            </button>
          }
        />

        {isLoading && (
          <div className="text-sm text-muted-foreground" data-testid="loading">
            Scanning imported rows…
          </div>
        )}
        {isError && (
          <ErrorState
            error={error}
            onRetry={() => refetch()}
            title="Couldn't build the audit"
            testId="legacy-image-audit-error"
          />
        )}

        {data && (
          <>
            <div
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 flex items-center justify-between gap-4 flex-wrap"
              data-testid="summary"
            >
              <span data-testid="total-count">
                <span className="font-semibold">{data.total}</span> image{data.total === 1 ? "" : "s"} still off-platform.
              </span>
              {hostsSummary && (
                <span className="text-slate-500" data-testid="hosts-summary">{hostsSummary}</span>
              )}
            </div>

            {data.total === 0 && (
              <div
                className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500"
                data-testid="empty"
              >
                Everything's on Object Storage. Nothing left to fix.
              </div>
            )}

            {(["person", "album", "bonus_video"] as const).map((t) => {
              const rows = data.byEntityType[t];
              if (rows.length === 0) return null;
              return (
                <section key={t} data-testid={`group-${t}`}>
                  <h2 className="text-base font-semibold mb-2 flex items-baseline gap-2 text-slate-900">
                    <span>{GROUP_LABEL[t]}</span>
                    <span className="text-slate-400 text-xs font-normal">{rows.length}</span>
                  </h2>
                  <div className="rounded-lg border bg-white divide-y divide-slate-100">
                    {rows.map((row) => (
                      <div
                        key={`${row.entityType}-${row.entityId}-${row.field}`}
                        className="px-4 py-3 flex items-center gap-4"
                        data-testid={`row-legacy-${row.entityType}-${row.entityId}-${row.field}`}
                      >
                        <img
                          src={row.currentUrl}
                          alt=""
                          loading="lazy"
                          className="w-12 h-12 rounded-md object-cover bg-slate-100 flex-shrink-0 border border-slate-200"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <Link href={row.adminHref} className="text-sm font-medium text-slate-900 hover:text-[color:var(--brand-blue)] hover:underline truncate block" data-testid={`link-edit-${row.entityType}-${row.entityId}-${row.field}`}>
                            {row.displayName}
                          </Link>
                          <div className="text-xs text-slate-500 truncate">
                            <span className="text-slate-700">{FIELD_LABEL[row.field]}</span>
                            <span className="text-slate-300 mx-1.5">·</span>
                            <a
                              href={row.currentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-500 hover:text-[color:var(--brand-blue)] hover:underline"
                            >
                              {row.currentUrl}
                            </a>
                          </div>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex-shrink-0 font-medium">
                          {row.host}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </AdminFrame>
  );
}

export default AdminLegacyImageAudit;
