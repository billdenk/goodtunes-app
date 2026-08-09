import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { ROLE_LABEL } from "@/components/admin/RoleScopePicker";
import { ArrowUpDown, ArrowDown, ArrowUp, Check, Heart, Link2, Search, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  // Present only for super-admins on live "invited" rows that aren't held
  // for review — powers the Copy-invite-link last-resort resend.
  acceptUrl: string | null;
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
  revoked: "bg-[var(--apple-critical)]/10 text-[var(--apple-critical)] border-[var(--apple-critical)]/20",
  expired: "bg-[var(--apple-chip)] text-[var(--apple-subink)] border-[var(--apple-hairline)]",
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
  else if (kind === "vendor") base = `/admin/vendors/${id}`;
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
  // Row id whose invite link was just copied — drives the transient ✓
  // confirmation on the copy affordance.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  async function copyInviteLink(inv: DirectoryInvite) {
    if (!inv.acceptUrl) return;
    try {
      await navigator.clipboard.writeText(inv.acceptUrl);
      setCopiedId(inv.id);
      toast({
        title: "Invite link copied",
        description: `Send it to ${inv.email} directly — same one-time link as the email.`,
      });
      window.setTimeout(() => setCopiedId((c) => (c === inv.id ? null : c)), 2000);
    } catch {
      toast({
        title: "Couldn't copy the link",
        description: "Your browser blocked clipboard access. Try again.",
        variant: "destructive",
      });
    }
  }

  const { data: roleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
  });
  const isArtist = roleInfo?.role === "artist";

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
          active ? "text-[var(--apple-ink)]" : "text-[var(--apple-subink)] hover:text-[var(--apple-ink)]",
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
      <div className="space-y-5">
        <AdminPageHeader
          title={isArtist ? "Invites." : "Invite directory."}
          subtitle={
            isArtist ? (
              "Invites you've sent — pending, joined, revoked, and expired. Use + Add Invite to refer an artist or NPO partner."
            ) : (
              <>
                Every invite ever sent — pending, joined, revoked, and expired — in one read-only list. Search by invitee or referrer, filter by status, referrer, or role, and sort by date or units sold (the units credited to each referral). To send a new invite use{"\u00a0"}
                <span className="font-medium text-[var(--apple-ink)]">Invites</span>; for the referral hierarchy use{" "}
                <span className="font-medium text-[var(--apple-ink)]">Invite tree</span>.
              </>
            )
          }
          actions={
            isArtist ? (
              <Link
                href="/admin/invites"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[var(--brand-blue)] text-white text-sm font-semibold hover:opacity-90 transition-opacity flex-shrink-0"
                data-testid="link-new-invite"
              >
                <UserPlus className="w-4 h-4" />
                + Add Invite
              </Link>
            ) : undefined
          }
        />

        {/* Controls — search, status tabs, role filter. */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-[var(--apple-faint)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invitee or referrer…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--apple-hairline)] focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20 text-sm"
              data-testid="input-search"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-[var(--apple-hairline)] bg-white p-0.5" data-testid="tabs-status">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setStatusFilter(t.value)}
                  className={[
                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                    statusFilter === t.value
                      ? "bg-[var(--brand-blue)] text-white"
                      : "text-[var(--apple-subink)] hover:bg-[var(--apple-track)]",
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
              className="px-3 py-2 rounded-lg border border-[var(--apple-hairline)] bg-white text-sm focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
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
              className="px-3 py-2 rounded-lg border border-[var(--apple-hairline)] bg-white text-sm focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
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
          <div className="text-sm text-[var(--apple-subink)]">Loading…</div>
        ) : isError ? (
          <ErrorState
            error={error}
            onRetry={() => refetch()}
            title="Couldn't load the invite directory"
            testId="invite-directory-error"
          />
        ) : filtered.length === 0 ? (
          <div
            className="bg-white border border-[var(--apple-hairline)] rounded-2xl"
            data-testid="empty-directory"
          >
            <AdminEmptyState>
              {invites.length === 0 ? "No invites yet." : "No invites match these filters."}
            </AdminEmptyState>
          </div>
        ) : (
          <div className="bg-white border border-[var(--apple-hairline)] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-invite-directory">
                <thead>
                  <tr className="border-b border-[var(--apple-hairline)] bg-[var(--apple-track)]/60">
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)] px-4 py-3">Invitee</th>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)] px-4 py-3">Referred by</th>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)] px-4 py-3">Role</th>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)] px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3"><SortHeader label="Invited" k="invitedAt" /></th>
                    <th className="text-left px-4 py-3"><SortHeader label="Joined" k="joinedAt" /></th>
                    <th className="text-right px-4 py-3"><SortHeader label="Units sold" k="unitsSold" className="justify-end" /></th>
                    {/* Trailing actions (copy invite link) — no header label. */}
                    <th className="w-10 px-2 py-3" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--apple-hairline)]">
                  {filtered.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[var(--apple-track)]/60" data-testid={`row-invite-${inv.id}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {inv.inviteeThumbUrl ? (
                            <img
                              src={inv.inviteeThumbUrl}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover bg-[var(--apple-chip)] flex-shrink-0"
                              data-testid={`img-invitee-${inv.id}`}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[var(--apple-chip)] flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            {inv.inviteeName && (() => {
                              const href = adminHrefFor(inv.inviteeKind, inv.inviteeId);
                              return href ? (
                                <Link href={href} className="font-medium text-[var(--apple-ink)] truncate block transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2" data-testid={`link-invitee-name-${inv.id}`}>
                                  {inv.inviteeName}
                                </Link>
                              ) : (
                                <div className="font-medium text-[var(--apple-ink)] truncate" data-testid={`text-invitee-name-${inv.id}`}>
                                  {inv.inviteeName}
                                </div>
                              );
                            })()}
                            <div
                              className={inv.inviteeName ? "text-xs text-[var(--apple-subink)] truncate" : "font-medium text-[var(--apple-ink)] truncate"}
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
                                <Link href={href} className="text-[var(--apple-ink)] truncate transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2" data-testid={`link-referrer-${inv.id}`}>
                                  {inv.referrerName}
                                </Link>
                              ) : (
                                <span className="text-[var(--apple-ink)] truncate">{inv.referrerName}</span>
                              );
                            })()}
                            {inv.referrerKind && (
                              <span className="text-xs text-[var(--apple-faint)] flex-shrink-0">
                                {REFERRER_KIND_LABEL[inv.referrerKind] || inv.referrerKind}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--apple-faint)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--apple-ink)]" data-testid={`text-role-${inv.id}`}>
                        {ROLE_LABEL[inv.role] || inv.role}
                        {inv.inviteRole && (
                          <span className="text-xs text-[var(--apple-faint)]"> · {inv.inviteRole}</span>
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
                      <td className="px-4 py-3 text-[var(--apple-subink)] whitespace-nowrap" data-testid={`text-invited-${inv.id}`}>
                        {fmtDate(inv.invitedAt)}
                      </td>
                      <td className="px-4 py-3 text-[var(--apple-subink)] whitespace-nowrap" data-testid={`text-joined-${inv.id}`}>
                        {fmtDate(inv.joinedAt)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--apple-ink)]" data-testid={`text-units-${inv.id}`}>
                        {inv.unitsSold.toLocaleString()}
                      </td>
                      <td className="px-2 py-3 text-right">
                        {inv.acceptUrl && (
                          <button
                            type="button"
                            onClick={() => copyInviteLink(inv)}
                            className={[
                              "p-2 rounded-md transition-colors",
                              copiedId === inv.id
                                ? "text-emerald-600 bg-emerald-50"
                                : "text-[var(--apple-faint)] hover:text-[var(--brand-blue)] hover:bg-[var(--apple-chip)]",
                            ].join(" ")}
                            title="Copy invite link — send it directly if the email was lost or went to spam"
                            aria-label="Copy invite link"
                            data-testid={`button-copy-link-${inv.id}`}
                          >
                            {copiedId === inv.id ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-[var(--apple-hairline)] text-xs text-[var(--apple-subink)]" data-testid="text-row-count">
              {filtered.length} {filtered.length === 1 ? "invite" : "invites"}
              {filtered.length !== invites.length ? ` of ${invites.length}` : ""}
            </div>
          </div>
        )}
      </div>
    </AdminFrame>
  );
}
