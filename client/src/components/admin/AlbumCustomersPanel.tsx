import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  DollarSign,
  ShoppingBag,
  Search,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Check,
  Download,
  ChevronDown,
  Gift,
  Eye,
  Ban,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiRequest, apiErrorStatus } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Kpis = { totalOrders: number; distinctFans: number; totalCents: number };
type OrderRow = {
  orderId: string;
  createdAt: string;
  status: string;
  totalCents: number;
  buyerName: string | null;
  buyerEmail: string | null;
  customerId: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  goodDeed: boolean;
};
type Payload = { kpis: Kpis; orders: OrderRow[]; total: number };

// Server-side sort keys mirror the GET /api/admin/albums/:id/buyers `sort`
// param. Sorting + search run against the WHOLE roster on the server, not
// just the rows already loaded — that's the whole point of this tab.
type SortKey = "name" | "date" | "location" | "gooddeed" | "amount";
type SortDir = "asc" | "desc";

function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function locationStr(row: OrderRow) {
  return [row.city, row.state, row.country].filter(Boolean).join(", ") || null;
}

function StatCard({
  label,
  value,
  icon: Icon,
  testId,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  testId?: string;
}) {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-3"
      data-testid={testId}
    >
      <div className="w-9 h-9 rounded-lg bg-[var(--brand-blue)]/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-[var(--brand-blue)]" strokeWidth={1.8} />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
        <div className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">{value}</div>
      </div>
    </div>
  );
}

// Default sort direction the first time a column is picked. Date/amount lead
// with the most interesting end (newest, biggest); name/location read A→Z;
// GoodDeed floats the "yes" rows up.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  date: "desc",
  location: "asc",
  gooddeed: "desc",
  amount: "desc",
};

function SortHeader({
  label,
  col,
  activeKey,
  activeDir,
  onSort,
  className,
}: {
  label: string;
  col: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (col: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === col;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={[
          "inline-flex items-center gap-1 -mx-1 px-1 py-0.5 rounded hover:text-slate-700 transition-colors",
          active ? "text-slate-900" : "text-slate-500",
        ].join(" ")}
        data-testid={`sort-${col}`}
      >
        {label}
        {active ? (
          activeDir === "asc" ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

const PAGE_SIZE = 200;

// ── "Access without a purchase" ──────────────────────────────────────────────
// Everyone who can open this release without having paid: comped/free owners
// (a real user_albums copy, or an unexpired account-level preview grant) plus
// the reviewer preview LINKS. None of these count toward the revenue/units KPIs
// above — those only sum paid orders. Same visibility gate as the preview
// grants (operator + owning artist/label); a partner who can't manage previews
// gets a 403 on both reads and the whole section stays hidden.
type FreeOwner = {
  id: string;
  customerId: string;
  name: string | null;
  email: string | null;
  kind: "comp" | "preview";
  expiresAt: string | null;
  acquiredAt: string | null;
};

type PreviewGrant = {
  id: string;
  recipientName: string | null;
  recipientEmail: string | null;
  note: string | null;
  createdByLabel: string | null;
  expiresAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  createdAt: string;
  status: "active" | "expired" | "revoked";
};

function GrantStatusPill({ status }: { status: PreviewGrant["status"] }) {
  const map = {
    active: { cls: "bg-emerald-100 text-emerald-800", label: "Active" },
    expired: { cls: "bg-slate-100 text-slate-500", label: "Expired" },
    revoked: { cls: "bg-rose-100 text-rose-700", label: "Revoked" },
  } as const;
  const m = map[status];
  return (
    <span
      className={
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider " +
        m.cls
      }
      data-testid={`badge-access-grant-status-${status}`}
    >
      {m.label}
    </span>
  );
}

function PreviewGrantRevokeRow({
  grant,
  albumId,
}: {
  grant: PreviewGrant;
  albumId: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const revoke = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "POST",
        `/api/admin/albums/${albumId}/preview-grants/${grant.id}/revoke`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["/api/admin/albums", albumId, "preview-grants"],
      });
      toast({
        title: "Preview link revoked",
        description: "That link no longer opens this release.",
      });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't revoke",
        description: e?.message || "Please try again.",
        variant: "destructive",
      }),
  });

  const who =
    grant.recipientName || grant.recipientEmail || "Anyone with the link";
  const viewedLine =
    grant.viewCount > 0
      ? `Viewed ${grant.viewCount} ${grant.viewCount === 1 ? "time" : "times"}${grant.lastViewedAt ? ` · last ${formatDate(grant.lastViewedAt)}` : ""}`
      : "Not viewed yet";
  const expiryLine =
    grant.status === "revoked"
      ? "Revoked"
      : grant.status === "expired"
        ? `Expired ${formatDate(grant.expiresAt)}`
        : `Expires ${formatDate(grant.expiresAt)}`;

  return (
    <div
      className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5"
      data-testid={`row-access-grant-${grant.id}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="truncate text-sm font-medium text-slate-800"
            data-testid={`text-access-grant-recipient-${grant.id}`}
          >
            {who}
          </span>
          <GrantStatusPill status={grant.status} />
        </div>
        {grant.recipientName && grant.recipientEmail && (
          <p className="truncate text-xs text-slate-400">
            {grant.recipientEmail}
          </p>
        )}
        <p className="mt-0.5 text-xs leading-snug text-slate-500">
          {`Granted ${formatDate(grant.createdAt)}`} · {viewedLine} ·{" "}
          {expiryLine}
          {grant.createdByLabel ? ` · by ${grant.createdByLabel}` : ""}
        </p>
      </div>
      {grant.status === "active" && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="-m-1 shrink-0 p-1 text-slate-400 transition-colors hover:text-rose-600"
              title="Revoke this preview link"
              data-testid={`button-revoke-access-grant-${grant.id}`}
            >
              {revoke.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Ban className="h-4 w-4" />
              )}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent
            className="rounded-xl border-slate-200 bg-white"
            data-testid={`dialog-revoke-access-grant-${grant.id}`}
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="text-slate-900">
                Revoke this preview link?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-500">
                {who} will no longer be able to open this release with their
                link. This can't be undone — you can create a fresh link
                anytime.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid={`button-cancel-revoke-access-${grant.id}`}>
                Keep link
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={() => revoke.mutate()}
                data-testid={`button-confirm-revoke-access-${grant.id}`}
              >
                Revoke link
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// Task #2524 — operator-only Revoke for a comped/free (user_albums) copy.
// This is an operational verb: it removes non-paying access and bypasses the
// post-sale edit_metadata lock by design. It only ever renders on the operator
// Customers tab (full section), never in the partner preview-links-only view,
// so the comped fan identity is never exposed to a partner.
function FreeOwnerRevokeButton({
  owner,
  albumId,
}: {
  owner: FreeOwner;
  albumId: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const revoke = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "POST",
        `/api/admin/albums/${albumId}/free-access/${owner.id}/revoke`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["/api/admin/albums", albumId, "free-access"],
      });
      toast({
        title: "Access revoked",
        description: "That account can no longer open this release for free.",
      });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't revoke",
        description: e?.message || "Please try again.",
        variant: "destructive",
      }),
  });

  const who = owner.name || owner.email || "This account";

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="-m-1 shrink-0 p-1 text-slate-400 transition-colors hover:text-rose-600"
          title="Revoke this free access"
          data-testid={`button-revoke-access-owner-${owner.id}`}
        >
          {revoke.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Ban className="h-4 w-4" />
          )}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent
        className="rounded-xl border-slate-200 bg-white"
        data-testid={`dialog-revoke-access-owner-${owner.id}`}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-slate-900">
            Revoke free access?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-slate-500">
            {who} will lose their comped access to this release. This can't be
            undone — you can grant access again anytime.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid={`button-cancel-revoke-owner-${owner.id}`}>
            Keep access
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-rose-600 text-white hover:bg-rose-700"
            onClick={() => revoke.mutate()}
            data-testid={`button-confirm-revoke-owner-${owner.id}`}
          >
            Revoke access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Task #2524 — `previewLinksOnly` renders ONLY the "Preview & reviewer links"
// section (no comped/free fan roster) for partner portals, where exposing the
// comped fan identities would be a privacy leak. In that mode the free-access
// read is not even issued.
export function AccessWithoutPurchaseSection({
  albumId,
  onManagePreview,
  previewLinksOnly = false,
}: {
  albumId: string;
  onManagePreview?: () => void;
  previewLinksOnly?: boolean;
}) {
  const freeQuery = useQuery<{ owners: FreeOwner[] }>({
    queryKey: ["/api/admin/albums", albumId, "free-access"],
    enabled: !previewLinksOnly,
  });
  const grantsQuery = useQuery<{ grants: PreviewGrant[] }>({
    queryKey: ["/api/admin/albums", albumId, "preview-grants"],
  });

  // Hidden entirely if the viewer isn't allowed to manage previews for this
  // release (either read returns 403). Same gate as the Overview preview panel.
  if (
    (!previewLinksOnly && apiErrorStatus(freeQuery.error) === 403) ||
    apiErrorStatus(grantsQuery.error) === 403
  ) {
    return null;
  }

  // Don't flash an empty card before the data lands.
  if ((!previewLinksOnly && freeQuery.isLoading) || grantsQuery.isLoading)
    return null;

  const owners = previewLinksOnly ? [] : (freeQuery.data?.owners ?? []);
  const grants = grantsQuery.data?.grants ?? [];
  const count = owners.length + grants.length;

  // Only surfaces when at least one non-paying grantee exists.
  if (count === 0) return null;

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
      data-testid="panel-access-without-purchase"
    >
      <div className="flex items-start justify-between gap-4 px-5 py-3.5 border-b border-slate-100">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">
            {previewLinksOnly ? "Preview & reviewer links" : "Access without a purchase"}
            <span
              className="ml-2 text-slate-400 font-normal text-xs"
              data-testid="text-access-without-purchase-count"
            >
              ({count.toLocaleString()})
            </span>
          </h2>
          <p className="mt-0.5 text-xs leading-snug text-slate-500">
            {previewLinksOnly
              ? "Private reviewer links you've created for this release. Revoke any anytime — fans never see these."
              : "Comped copies and reviewer preview links. These don't count toward revenue or units above."}
          </p>
        </div>
        {onManagePreview && (
          <button
            type="button"
            onClick={onManagePreview}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand-blue)] hover:underline underline-offset-2"
            data-testid="button-manage-preview-links"
          >
            Create a preview link
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Comped / free owners */}
        {owners.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Gift className="h-3.5 w-3.5 text-[color:var(--brand-blue)]" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Comped &amp; free access
              </span>
            </div>
            <div className="space-y-2" data-testid="list-access-owners">
              {owners.map((o) => (
                <div
                  key={o.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5"
                  data-testid={`row-access-owner-${o.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-slate-800">
                        {o.name ? (
                          <Link href={`/admin/customers/${o.customerId}`} className="text-inherit hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors" data-testid={`link-access-owner-${o.customerId}`}>
                            {o.name}
                          </Link>
                        ) : (
                          "Unknown account"
                        )}
                      </span>
                      {o.kind === "comp" ? (
                        <span
                          className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"
                          data-testid={`badge-access-owner-comp-${o.id}`}
                        >
                          Comp
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600"
                          data-testid={`badge-access-owner-preview-${o.id}`}
                        >
                          Preview
                        </span>
                      )}
                    </div>
                    {o.name && o.email && (
                      <p className="truncate text-xs text-slate-400">{o.email}</p>
                    )}
                    <p className="mt-0.5 text-xs leading-snug text-slate-500">
                      {o.kind === "preview" && o.expiresAt
                        ? `Preview access · expires ${formatDate(o.expiresAt)}`
                        : `Comped${o.acquiredAt ? ` · ${formatDate(o.acquiredAt)}` : ""}`}
                    </p>
                  </div>
                  <FreeOwnerRevokeButton owner={o} albumId={albumId} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reviewer preview links */}
        {grants.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Eye className="h-3.5 w-3.5 text-[color:var(--brand-blue)]" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Preview &amp; reviewer links
              </span>
            </div>
            <div className="space-y-2" data-testid="list-access-grants">
              {grants.map((g) => (
                <PreviewGrantRevokeRow key={g.id} grant={g} albumId={albumId} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function AlbumCustomersPanel({
  albumId,
  onManagePreview,
}: {
  albumId: string;
  onManagePreview?: () => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState(false);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any change to the filter/sort restarts pagination from the top.
  useEffect(() => {
    setOffset(0);
  }, [search, sortKey, sortDir]);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (search) p.set("search", search);
    // Only send sort params when they diverge from the legacy default, so the
    // default request stays cache-shared with the standalone roster page.
    if (sortKey !== "date" || sortDir !== "desc") {
      p.set("sort", sortKey);
      p.set("dir", sortDir);
    }
    return p.toString();
  }, [offset, search, sortKey, sortDir]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<Payload>({
    queryKey: ["/api/admin/albums", albumId, "buyers", qs],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/albums/${albumId}/buyers?${qs}`);
      return (await res.json()) as Payload;
    },
  });

  // Accumulate pages for "Load more"; replace on a fresh page (offset 0).
  useEffect(() => {
    if (!data) return;
    setTotal(data.total);
    setRows((prev) => (offset === 0 ? data.orders : [...prev, ...data.orders]));
  }, [data, offset]);

  const kpis = data?.kpis;

  // Build the same search/sort params as the table, minus pagination, and
  // tack on format=csv. The server exports the WHOLE filtered roster.
  // `variant="fulfillment"` adds the full mailing address captured at
  // checkout so operators can ship straight off the export.
  async function handleExport(variant?: "fulfillment") {
    if (exporting) return;
    setExporting(true);
    try {
      const p = new URLSearchParams({ format: "csv" });
      if (variant) p.set("variant", variant);
      if (search) p.set("search", search);
      if (sortKey !== "date" || sortDir !== "desc") {
        p.set("sort", sortKey);
        p.set("dir", sortDir);
      }
      const res = await apiRequest(
        "GET",
        `/api/admin/albums/${albumId}/buyers?${p.toString()}`,
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `album-${albumId}-${variant === "fulfillment" ? "fulfillment" : "customers"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  function handleSort(col: SortKey) {
    if (col === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir(DEFAULT_DIR[col]);
    }
  }

  if (isLoading && offset === 0) {
    return <div className="py-10 text-slate-500 text-sm" data-testid="customers-loading">Loading…</div>;
  }
  if (isError && offset === 0) {
    return (
      <ErrorState
        error={error}
        onRetry={() => refetch()}
        title="Couldn't load customers"
        testId="album-customers-error"
      />
    );
  }

  return (
    <div className="space-y-5" data-testid="panel-customers">
      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="kpi-grid-customers">
          <StatCard
            label="Total orders"
            value={kpis.totalOrders.toLocaleString()}
            icon={ShoppingBag}
            testId="kpi-orders"
          />
          <StatCard
            label="Distinct fans"
            value={kpis.distinctFans.toLocaleString()}
            icon={Users}
            testId="kpi-fans"
          />
          <StatCard
            label="Gross revenue"
            value={formatMoney(kpis.totalCents)}
            icon={DollarSign}
            testId="kpi-revenue"
          />
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">
            Customers
            {total > 0 && (
              <span className="ml-2 text-slate-400 font-normal text-xs">
                ({total.toLocaleString()}
                {search ? " matching" : " total"})
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2.5 h-8">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, email, city…"
                className="w-48 text-sm bg-transparent outline-none placeholder:text-slate-400"
                data-testid="input-search-customers"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="text-slate-400 hover:text-slate-700"
                  data-testid="button-clear-search-customers"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={exporting || total === 0}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  data-testid="button-export-customers"
                >
                  <Download className="w-3.5 h-3.5" />
                  {exporting ? "Exporting…" : "Export CSV"}
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  onClick={() => handleExport()}
                  data-testid="button-export-summary"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">Summary</span>
                    <span className="text-xs text-slate-500">
                      Fan, email, location, GoodDeed, amount
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExport("fulfillment")}
                  data-testid="button-export-fulfillment"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">Fulfillment</span>
                    <span className="text-xs text-slate-500">
                      Adds full shipping address for mailing
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wide font-semibold">
                <SortHeader
                  label="Fan"
                  col="name"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={handleSort}
                  className="text-left px-5 py-2.5"
                />
                <SortHeader
                  label="Location"
                  col="location"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={handleSort}
                  className="text-left px-4 py-2.5 hidden md:table-cell"
                />
                <SortHeader
                  label="Date"
                  col="date"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={handleSort}
                  className="text-left px-4 py-2.5 hidden md:table-cell"
                />
                <SortHeader
                  label="GoodDeed"
                  col="gooddeed"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={handleSort}
                  className="text-left px-4 py-2.5"
                />
                <th className="text-right px-5 py-2.5">
                  <button
                    type="button"
                    onClick={() => handleSort("amount")}
                    className={[
                      "inline-flex items-center gap-1 -mx-1 px-1 py-0.5 rounded hover:text-slate-700 transition-colors",
                      sortKey === "amount" ? "text-slate-900" : "text-slate-500",
                    ].join(" ")}
                    data-testid="sort-amount"
                  >
                    Amount
                    {sortKey === "amount" ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (
                        <ArrowDown className="w-3 h-3" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-40" />
                    )}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400" data-testid="customers-empty">
                    {search ? "No customers match your search." : "No customers yet."}
                  </td>
                </tr>
              )}
              {rows.map((o) => (
                <tr
                  key={o.orderId}
                  className="hover:bg-slate-50 transition-colors"
                  data-testid={`row-customer-${o.orderId}`}
                >
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900 truncate max-w-[200px]">
                      {o.customerId ? (
                        <Link href={`/admin/customers/${o.customerId}`} className="text-inherit hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors" data-testid={`link-customer-${o.customerId}`}>
                          {o.buyerName ?? o.buyerEmail ?? "Anonymous"}
                        </Link>
                      ) : (
                        o.buyerName ?? o.buyerEmail ?? "Anonymous"
                      )}
                    </div>
                    {o.buyerEmail && (
                      <div className="text-xs text-slate-500 truncate max-w-[200px]">{o.buyerEmail}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-500">
                    {locationStr(o) ?? "—"}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-500 whitespace-nowrap">
                    {formatDate(o.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {o.goodDeed ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-blue)]/10 text-[var(--brand-blue)] text-xs font-semibold px-2 py-0.5"
                        data-testid={`gooddeed-yes-${o.orderId}`}
                      >
                        <Check className="w-3 h-3" strokeWidth={2.5} />
                        Yes
                      </span>
                    ) : (
                      <span className="text-slate-300" data-testid={`gooddeed-no-${o.orderId}`}>
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-900">
                    {formatMoney(o.totalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length < total && (
          <div className="px-5 py-3 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => setOffset(rows.length)}
              disabled={isFetching}
              className="text-sm font-medium text-[var(--brand-blue)] hover:underline disabled:text-slate-400"
              data-testid="button-load-more-customers"
            >
              {isFetching
                ? "Loading…"
                : `Load more (${rows.length} of ${total.toLocaleString()} loaded)`}
            </button>
          </div>
        )}
      </div>

      <AccessWithoutPurchaseSection
        albumId={albumId}
        onManagePreview={onManagePreview}
      />
    </div>
  );
}
