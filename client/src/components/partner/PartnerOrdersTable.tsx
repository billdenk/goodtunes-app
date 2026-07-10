// Task #2643 — shared partner-portal Orders table (Artist / Label / Manager).
//
// Replaces the three duplicated OrdersTab copies with one component matching
// the album Customers panel treatment: sortable column headers, an album
// filter dropdown (partner's own releases), and a real "Export CSV" button
// that downloads via an authenticated blob fetch (bearer + X-View-As-Token)
// instead of a bare <a href> — fixing CSV export under super-admin view-as.
//
// Sorting and album filtering are SERVER-side (`sort`/`dir`/`albumId` on
// /api/{artist|label|manager}/orders) so the CSV export honors the exact
// same filter + order as the visible table.
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchBlob } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatUsdCents } from "@shared/money";
import { ArrowUp, ArrowDown, ArrowUpDown, Download } from "lucide-react";

type PortalBase = "artist" | "label" | "manager";

type OrderRow = {
  id: string;
  createdAt: string;
  status: string;
  totalCents: number;
  country: string | null;
  albumId?: string;
  albumTitle: string;
  albumArtist?: string;
  primaryArtistId?: string | null;
  // Artist portal extras
  artistShareCents?: number | null;
  skuKind?: string | null;
  origin?: string | null;
  // Label / manager share fields
  labelShareCents?: number | null;
  managerShareCents?: number | null;
};

type ReleaseLite = { albumId: string; title: string; artist: string | null };

type SortKey = "date" | "album" | "artist" | "total" | "share";
type SortDir = "asc" | "desc";
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  date: "desc",
  album: "asc",
  artist: "asc",
  total: "desc",
  share: "desc",
};

const dollarsCents = (c: number) => formatUsdCents(c);

function shareCentsOf(o: OrderRow): number | null {
  return o.artistShareCents ?? o.labelShareCents ?? o.managerShareCents ?? null;
}

function SortHeader({
  label,
  col,
  activeKey,
  activeDir,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  col: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (c: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = activeKey === col;
  return (
    <th className={`${align === "right" ? "text-right" : "text-left"} font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={[
          "inline-flex items-center gap-1 -mx-1 px-1 py-0.5 rounded hover:text-slate-700 transition-colors uppercase tracking-wider",
          active ? "text-slate-700" : "text-slate-400",
        ].join(" ")}
        data-testid={`sort-orders-${col}`}
      >
        {label}
        {active ? (
          activeDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

// Same status→color map the three dashboards used before the tables were
// unified, so the pill treatment stays identical portal-wide.
function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    shipped: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    refunded: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? "bg-slate-100 text-slate-700"}`}>{status}</span>;
}

export function PartnerOrdersTable({
  base,
  qs,
  subtitle,
  showArtist = false,
  artistDrillHref,
}: {
  base: PortalBase;
  qs: string;
  subtitle: string;
  /** Label/Manager portals show an Artist column with roster drill-down. */
  showArtist?: boolean;
  artistDrillHref?: (personId: string) => string;
}) {
  const { toast } = useToast();
  const [albumId, setAlbumId] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [exporting, setExporting] = useState(false);

  // Only send sort params when they diverge from the legacy default so the
  // default request stays cache-shared with the pre-#2643 key shape.
  const fullQs = useMemo(() => {
    const p = new URLSearchParams(qs);
    if (albumId) p.set("albumId", albumId);
    if (sortKey !== "date" || sortDir !== "desc") {
      p.set("sort", sortKey);
      p.set("dir", sortDir);
    }
    return p.toString();
  }, [qs, albumId, sortKey, sortDir]);

  const orders = useQuery<{ orders: OrderRow[] }>({
    queryKey: [`/api/${base}/orders?${fullQs}`],
  });
  const releasesQ = useQuery<{ releases: ReleaseLite[] }>({
    queryKey: [`/api/${base}/releases?${qs}`],
  });
  const releases = releasesQ.data?.releases ?? [];
  const rows = orders.data?.orders ?? [];

  function handleSort(col: SortKey) {
    if (col === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir(DEFAULT_DIR[col]);
    }
  }

  // Authenticated blob download — a bare <a href> drops the Bearer token and
  // the X-View-As-Token header, breaking exports in super-admin view-as mode.
  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await fetchBlob(`/api/${base}/orders?${fullQs}&format=csv`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const albumSlug = albumId
        ? `-${(releases.find((r) => r.albumId === albumId)?.title ?? "album").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
        : "";
      a.download = `orders${albumSlug}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message ?? "Couldn't download the CSV. Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }

  const isArtist = base === "artist";
  const colCount = isArtist ? 8 : showArtist ? 7 : 6;

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden" data-testid="table-orders">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold">Recent orders</h2>
          <p className="text-slate-400 text-xs mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={albumId}
            onChange={(e) => setAlbumId(e.target.value)}
            className="h-8 max-w-[220px] truncate rounded-md border border-slate-200 bg-slate-50 px-2 text-sm text-slate-700 outline-none focus:border-slate-300"
            data-testid="select-orders-album"
          >
            <option value="">All albums</option>
            {releases.map((r) => (
              <option key={r.albumId} value={r.albumId}>
                {r.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || rows.length === 0}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            data-testid="button-export-orders"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto px-4 pb-4">
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-xs">
            <tr>
              <SortHeader label="Date" col="date" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} className="py-2 pr-3" />
              <SortHeader label="Album" col="album" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} className="px-2" />
              {showArtist && (
                <SortHeader label="Artist" col="artist" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} className="px-2" />
              )}
              {isArtist && <th className="text-left font-medium px-2 uppercase tracking-wider">SKU</th>}
              {isArtist && <th className="text-left font-medium px-2 uppercase tracking-wider">Origin</th>}
              <th className="text-left font-medium px-2 uppercase tracking-wider">Country</th>
              <th className="text-left font-medium px-2 uppercase tracking-wider">Status</th>
              <SortHeader label="Total" col="total" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" className="px-2" />
              <SortHeader label="Your share" col="share" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" className="pl-2" />
            </tr>
          </thead>
          <tbody>
            {orders.isLoading && (
              <tr><td colSpan={colCount} className="py-6 text-center text-slate-400">Loading…</td></tr>
            )}
            {!orders.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-6 text-center text-slate-400" data-testid="orders-empty">
                  {albumId ? "No orders for this album in this window." : "No orders in this window."}
                </td>
              </tr>
            )}
            {rows.map((o) => {
              const share = shareCentsOf(o);
              return (
                <tr key={o.id} className="border-t border-slate-100" data-testid={`row-order-${o.id}`}>
                  <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td className="px-2 truncate max-w-[200px]">
                    {o.albumId ? (
                      <Link href={`/album/${o.albumId}`} className="transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2">
                        {o.albumTitle}
                      </Link>
                    ) : (
                      o.albumTitle
                    )}
                  </td>
                  {showArtist && (
                    <td className="px-2 truncate max-w-[160px] text-slate-600">
                      {o.primaryArtistId && artistDrillHref ? (
                        <Link href={artistDrillHref(o.primaryArtistId)} className="transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2">
                          {o.albumArtist}
                        </Link>
                      ) : (
                        o.albumArtist
                      )}
                    </td>
                  )}
                  {isArtist && <td className="px-2 text-slate-600">{o.skuKind ?? "—"}</td>}
                  {isArtist && <td className="px-2 text-slate-600">{o.origin?.startsWith("shopify:") ? "Shopify" : "Direct"}</td>}
                  <td className="px-2 text-slate-600">{o.country ?? "—"}</td>
                  <td className="px-2"><StatusPill status={o.status} /></td>
                  <td className="px-2 text-right tabular-nums font-semibold">{dollarsCents(o.totalCents)}</td>
                  <td className="pl-2 text-right tabular-nums text-emerald-600">{share != null ? dollarsCents(share) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
