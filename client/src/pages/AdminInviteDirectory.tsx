import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { ROLE_LABEL } from "@/components/admin/RoleScopePicker";
import { ArrowUpDown, ArrowDown, ArrowUp, Heart, Search } from "lucide-react";

// Task #1198 — read-only directory of every invite ever sent (pending +
// joined + revoked + expired). Additive to /admin/invites (pending-only)
// and /admin/invite-tree (per-scope visualiser). Super-admin-only — the
// backend gate 403s everyone else, which surfaces here as the error state.
interface DirectoryInvite {
  id: string;
  email: string;
  inviteeName: string | null;
  inviteeThumbUrl: string | null;
  // When the invitee resolves to a real admin entity these point at it so
  // the cell deep-links to its sheet; null for plain free-text rows.
  inviteeKind: string | null;
  inviteeId: string | null;
  role: string;
  inviteRole: string | null;
  referrerKind: string | null;
  referrerName: string | null;
  referrerThumbUrl: string | null;
  // Set only when the referrer resolved to a real entity row.
  referrerId: string | null;
  status: "invited" | "joined" | "revoked" | "expired";
  invitedAt: string;
  joinedAt: string | null;
  unitsSold: number;
}

type StatusFilter = "all" | "invited" | "joined" | "revoked" | "expired";
type SortKey = "invitedAt" | "joinedAt" | "unitsSold";
type SortDir = "asc" | "desc";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "invited", label: "Invited" },
  { value: "joined", label: "Joined" },
  { value: "revoked", label: "Revoked" },
  { value: "expired", label: "Expired" },
];

const STATUS_BADGE: Record<DirectoryInvite["status"], string> = {
  invited: "bg-sky-50 text-sky-700 border-sky-200",
  joined: "bg-emerald-50 text-emerald-700 border-emerald-200",
  revoked: "bg-rose-50 text-rose-700 border-rose-200",
  expired: "bg-slate-100 text-slate-500 border-slate-200",
};

// Pretty label for the referrer's kind. `ambassador` is a Person promoted
// by an NPO; everything else maps onto the existing role vocabulary.
const REFERRER_KIND_LABEL: Record<string, string> = {
  artist: "Artist",
  label: "Label",
  non_profit: "Non-profit",
  manufacturer: "Press",
  ambassador: "Ambassador",
};

// Map an entity kind onto its admin sheet route. We deep-link with the
// generic `partner` smart-back origin (backHref + backName carried on the
// URL) so destinations that render useSmartBackCrumb show a "Invite
// directory" back-link, and the rest simply ignore it. Returns null for
// kinds without an admin sheet so those cells stay plain text.
const BACK = "from=partner&backHref=%2Fadmin%2Finvite-directory&backName=Invite%20directory";
function adminHrefFor(kind: string | null, id: string | null): string | null {
  if (!kind || !id) return null;
  let base: string | null = null;
  if (kind === "person" || kind === "artist" || kind === "ambassador") base = `/admin/people/${id}`;
  else if (kind === "label") base = `/admin/labels/${id}`;
  else if (kind === "manufacturer") base = `/admin/manufacturers/${id}`;
  else if (kind === "non_profit") base = `/admin/non-profits/${id}`;
  if (!base) return null;
  return `${base}?${BACK}`;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export function AdminInviteDirectory() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [refKindFilter, setRefKindFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("invitedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const {
    data: invites = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<DirectoryInvite[]>({
    queryKey: ["/api/admin/invite-directory"],
  });

  // Roles present in the data drive the role filter so we never show an
  // option that can't match anything.
  const roleOptions = useMemo(() => {
    return Array.from(new Set(invites.map((i) => i.role).filter(Boolean))).sort();
  }, [invites]);

  // Referrer kinds present in the data drive the required referrer-kind
  // filter so we never show an option that can't match anything.
  const refKindOptions = useMemo(() => {
    return Array.from(new Set(invites.map((i) => i.referrerKind).filter((k): k is string => !!k))).sort();
  }, [invites]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = invites.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (refKindFilter !== "all" && i.referrerKind !== refKindFilter) return false;
      if (roleFilter !== "all" && i.role !== roleFilter) return false;
      if (q) {
        const hay = [i.email, i.inviteeName, i.referrerName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "unitsSold") return (a.unitsSold - b.unitsSold) * dir;
      const av = a[sortKey] ? new Date(a[sortKey] as string).getTime() : 0;
      const bv = b[sortKey] ? new Date(b[sortKey] as string).getTime() : 0;
      return (av - bv) * dir;
    });
  }, [invites, search, statusFilter, refKindFilter, roleFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "unitsSold" ? "desc" : "desc");
    }
  }

  function SortHeader({ label, k, className }: { label: string; k: SortKey; className?: string }) {
    const active = sortKey === k;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={[
          "inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors",
          active ? "text-slate-900" : "text-slate-500 hover:text-slate-700",
          className || "",
        ].join(" ")}
        data-testid={`sort-${k}`}
      >
        {label}
        <Icon className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <AdminFrame active="invite-directory" contentWidth="wide">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-1" data-testid="text-page-title">
          Invite directory
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          Every invite ever sent — pending, joined, revoked, and expired — in one read-only list. Search by
          invitee or referrer, filter by status, referrer, or role, and sort by date or units sold (the units
          credited to each referral). To send a new invite use{" "}
          <span className="font-medium text-slate-700">Invites</span>; for the referral hierarchy use{" "}
          <span className="font-medium text-slate-700">Invite tree</span>.
        </p>

        {/* Controls — search, status tabs, role filter. */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invitee or referrer…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20 text-sm"
              data-testid="input-search"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" data-testid="tabs-status">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setStatusFilter(t.value)}
                  className={[
                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                    statusFilter === t.value
                      ? "bg-[var(--brand-blue)] text-white"
                      : "text-slate-600 hover:bg-slate-100",
                  ].join(" ")}
                  data-testid={`tab-status-${t.value}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <select
              value={refKindFilter}
              onChange={(e) => setRefKindFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
              data-testid="select-referrer-kind"
            >
              <option value="all">All referrers</option>
              {refKindOptions.map((k) => (
                <option key={k} value={k}>{REFERRER_KIND_LABEL[k] || k}</option>
              ))}
            </select>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
              data-testid="select-role"
            >
              <option value="all">All roles</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : isError ? (
          <ErrorState
            error={error}
            onRetry={() => refetch()}
            title="Couldn't load the invite directory"
            testId="invite-directory-error"
          />
        ) : filtered.length === 0 ? (
          <div
            className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6 text-center"
            data-testid="empty-directory"
          >
            {invites.length === 0 ? "No invites yet." : "No invites match these filters."}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-invite-directory">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left font-semibold uppercase tracking-wide text-xs text-slate-500 px-4 py-3">Invitee</th>
                    <th className="text-left font-semibold uppercase tracking-wide text-xs text-slate-500 px-4 py-3">Referred by</th>
                    <th className="text-left font-semibold uppercase tracking-wide text-xs text-slate-500 px-4 py-3">Role</th>
                    <th className="text-left font-semibold uppercase tracking-wide text-xs text-slate-500 px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3"><SortHeader label="Invited" k="invitedAt" /></th>
                    <th className="text-left px-4 py-3"><SortHeader label="Joined" k="joinedAt" /></th>
                    <th className="text-right px-4 py-3"><SortHeader label="Units sold" k="unitsSold" className="justify-end" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/60" data-testid={`row-invite-${inv.id}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {inv.inviteeThumbUrl ? (
                            <img
                              src={inv.inviteeThumbUrl}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover bg-slate-100 flex-shrink-0"
                              data-testid={`img-invitee-${inv.id}`}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            {inv.inviteeName && (() => {
                              const href = adminHrefFor(inv.inviteeKind, inv.inviteeId);
                              return href ? (
                                <Link href={href} className="font-medium text-slate-900 truncate block transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2" data-testid={`link-invitee-name-${inv.id}`}>
                                  {inv.inviteeName}
                                </Link>
                              ) : (
                                <div className="font-medium text-slate-900 truncate" data-testid={`text-invitee-name-${inv.id}`}>
                                  {inv.inviteeName}
                                </div>
                              );
                            })()}
                            <div
                              className={inv.inviteeName ? "text-xs text-slate-500 truncate" : "font-medium text-slate-900 truncate"}
                              data-testid={`text-invitee-email-${inv.id}`}
                            >
                              {inv.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {inv.referrerName ? (
                          <div className="flex items-center gap-2 min-w-0" data-testid={`text-referrer-${inv.id}`}>
                            <Heart className="w-3.5 h-3.5 text-[color:var(--brand-pink)] flex-shrink-0" />
                            {(() => {
                              const href = adminHrefFor(inv.referrerKind, inv.referrerId);
                              return href ? (
                                <Link href={href} className="text-slate-700 truncate transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2" data-testid={`link-referrer-${inv.id}`}>
                                  {inv.referrerName}
                                </Link>
                              ) : (
                                <span className="text-slate-700 truncate">{inv.referrerName}</span>
                              );
                            })()}
                            {inv.referrerKind && (
                              <span className="text-xs text-slate-400 flex-shrink-0">
                                {REFERRER_KIND_LABEL[inv.referrerKind] || inv.referrerKind}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700" data-testid={`text-role-${inv.id}`}>
                        {ROLE_LABEL[inv.role] || inv.role}
                        {inv.inviteRole && (
                          <span className="text-xs text-slate-400"> · {inv.inviteRole}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            "inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold capitalize",
                            STATUS_BADGE[inv.status],
                          ].join(" ")}
                          data-testid={`badge-status-${inv.id}`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap" data-testid={`text-invited-${inv.id}`}>
                        {fmtDate(inv.invitedAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap" data-testid={`text-joined-${inv.id}`}>
                        {fmtDate(inv.joinedAt)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700" data-testid={`text-units-${inv.id}`}>
                        {inv.unitsSold.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500" data-testid="text-row-count">
              {filtered.length} {filtered.length === 1 ? "invite" : "invites"}
              {filtered.length !== invites.length ? ` of ${invites.length}` : ""}
            </div>
          </div>
        )}
      </div>
    </AdminFrame>
  );
}
