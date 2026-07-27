import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { ArrowUpDown, ArrowDown, ArrowUp, Search } from "lucide-react";

// Team accounts — the ACCOUNT-centric answer to "someone accepted an
// invite, where are they now?". One row per partner sign-in (any
// non-operator admin account), with the scope(s) it represents, its
// sub-role, whether it came in via invite or was added directly, and its
// last sign-in. Complements /admin/invite-directory (invite-centric:
// accounts added via "Add Admin" never appear there). Super-admin-only —
// the backend 403s everyone else, which surfaces here as the error state.
interface TeamAttachment {
  scopeKind: string;
  scopeId: string | null;
  scopeName: string | null;
  thumbUrl: string | null;
  subRole: string | null;
}
interface TeamAccount {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  createdAt: string;
  lastSignInAt: string | null;
  invitedAt: string | null;
  joinedAt: string | null;
  attachments: TeamAttachment[];
}

type SortKey = "createdAt" | "lastSignInAt";
type SortDir = "asc" | "desc";

const KIND_LABEL: Record<string, string> = {
  artist: "Artist",
  label: "Label",
  manager: "Manager",
  manufacturer: "Press",
  non_profit: "Non-profit",
  vendor: "Vendor",
  fulfillment: "Fulfillment",
  publisher: "Publisher",
};

// sub_role null = the scope's owner (e.g. the artist themself); the rest
// are teammate hats granted by an invite or Add Admin.
function subRoleLabel(subRole: string | null): string {
  if (subRole === null || subRole === "identity") return "Owner";
  const known: Record<string, string> = { manager: "Manager", team: "Team", staff: "Staff" };
  return known[subRole] ?? subRole.charAt(0).toUpperCase() + subRole.slice(1);
}

// Deep-link a scope to its admin sheet with the generic smart-back origin
// (same pattern as the invite directory) so destinations show a
// "Team accounts" back-link. Kinds without a sheet stay plain text.
const BACK = "from=partner&backHref=%2Fadmin%2Fteam-accounts&backName=Team%20accounts";
function scopeHref(kind: string, id: string | null): string | null {
  if (!id) return null;
  let base: string | null = null;
  if (kind === "artist") base = `/admin/people/${id}`;
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

export function AdminTeamAccounts() {
  // Deep-link support: /admin/team-accounts?search=<email> — the global
  // ⌘K search's "Team accounts" rows land here with the email pre-filled
  // so the roster opens already filtered to that account.
  const urlSearch = useSearch();
  const [search, setSearch] = useState<string>(
    () => new URLSearchParams(urlSearch).get("search") ?? "",
  );
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Re-sync from the URL when it changes while already mounted (e.g.
  // picking a second search result from the ⌘K palette on this page).
  // A removed param clears the box — the ⌘K "Team accounts" page
  // shortcut navigates here without a query and must reset the filter.
  useEffect(() => {
    setSearch(new URLSearchParams(urlSearch).get("search") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch]);

  // Mirror the box back into the URL (replace, not push) so the current
  // view survives refresh and can be shared — same pattern as the admin
  // Albums list.
  useEffect(() => {
    const url = new URL(window.location.href);
    const cur = url.searchParams.get("search") ?? "";
    if (cur === search) return;
    if (search) url.searchParams.set("search", search);
    else url.searchParams.delete("search");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [search]);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<{ accounts: TeamAccount[] }>({
    queryKey: ["/api/admin/team-accounts"],
  });
  const accounts = data?.accounts ?? [];

  // Kinds present in the data drive the filter so we never show an
  // option that can't match anything.
  const kindOptions = useMemo(() => {
    return Array.from(
      new Set(accounts.flatMap((a) => a.attachments.map((t) => t.scopeKind)).filter(Boolean)),
    ).sort();
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = accounts.filter((a) => {
      if (kindFilter !== "all" && !a.attachments.some((t) => t.scopeKind === kindFilter)) return false;
      if (q) {
        const hay = [
          a.email,
          a.displayName,
          a.username,
          ...a.attachments.map((t) => t.scopeName),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ? new Date(a[sortKey] as string).getTime() : 0;
      const bv = b[sortKey] ? new Date(b[sortKey] as string).getTime() : 0;
      return (av - bv) * dir;
    });
  }, [accounts, search, kindFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={[
          "inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors",
          active ? "text-slate-900" : "text-slate-500 hover:text-slate-700",
        ].join(" ")}
        data-testid={`sort-${k}`}
      >
        {label}
        <Icon className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <AdminFrame active="team-accounts" contentWidth="wide">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-1" data-testid="text-page-title">
          Team accounts
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          Every partner account that can sign in — who they represent, their access, and how they
          got in. Accounts land here whether they joined from an invite or were added directly, so
          this is the one place to look after someone accepts. Click a name to open its page and
          manage access from the Permissions tab.
        </p>

        {/* Controls — search + scope-kind filter. */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account or artist…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20 text-sm"
              data-testid="input-search"
            />
          </div>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
            data-testid="select-scope-kind"
          >
            <option value="all">All partner types</option>
            {kindOptions.map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k] || k}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : isError ? (
          <ErrorState
            error={error}
            onRetry={() => refetch()}
            title="Couldn't load team accounts"
            testId="team-accounts-error"
          />
        ) : filtered.length === 0 ? (
          <div
            className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6 text-center"
            data-testid="empty-team-accounts"
          >
            {accounts.length === 0 ? "No partner accounts yet." : "No accounts match these filters."}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-team-accounts">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left font-semibold uppercase tracking-wide text-xs text-slate-500 px-4 py-3">Account</th>
                    <th className="text-left font-semibold uppercase tracking-wide text-xs text-slate-500 px-4 py-3">Represents</th>
                    <th className="text-left font-semibold uppercase tracking-wide text-xs text-slate-500 px-4 py-3">Access</th>
                    <th className="text-left px-4 py-3"><SortHeader label="Joined" k="createdAt" /></th>
                    <th className="text-left px-4 py-3"><SortHeader label="Last sign-in" k="lastSignInAt" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/60" data-testid={`row-account-${a.id}`}>
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate" data-testid={`text-account-name-${a.id}`}>
                            {a.displayName || a.username}
                          </div>
                          <div className="text-xs text-slate-500 truncate" data-testid={`text-account-email-${a.id}`}>
                            {a.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {a.attachments.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {a.attachments.map((t, i) => {
                              const href = scopeHref(t.scopeKind, t.scopeId);
                              const name = t.scopeName ?? (t.scopeId ? "Unknown" : "No scope yet");
                              return (
                                <div key={`${t.scopeKind}:${t.scopeId ?? i}`} className="flex items-center gap-2 min-w-0">
                                  {t.thumbUrl ? (
                                    <img
                                      src={t.thumbUrl}
                                      alt=""
                                      className="w-6 h-6 rounded-full object-cover bg-slate-100 flex-shrink-0"
                                    />
                                  ) : (
                                    <div className="w-6 h-6 rounded-full bg-slate-200 flex-shrink-0" />
                                  )}
                                  {href ? (
                                    <Link href={href} className="text-slate-900 font-medium truncate transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2" data-testid={`link-scope-${a.id}-${i}`}>
                                      {name}
                                    </Link>
                                  ) : (
                                    <span className={t.scopeId ? "text-slate-900 font-medium truncate" : "text-slate-400 truncate"}>
                                      {name}
                                    </span>
                                  )}
                                  <span className="text-xs text-slate-400 flex-shrink-0">
                                    {KIND_LABEL[t.scopeKind] || t.scopeKind}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700" data-testid={`text-access-${a.id}`}>
                        {Array.from(new Set(a.attachments.map((t) => subRoleLabel(t.subRole)))).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" data-testid={`text-joined-${a.id}`}>
                        <div className="text-slate-600">{fmtDate(a.createdAt)}</div>
                        <div className="text-xs text-slate-400">
                          {a.invitedAt ? "via invite" : "added directly"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap" data-testid={`text-last-signin-${a.id}`}>
                        {fmtDate(a.lastSignInAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500" data-testid="text-row-count">
              {filtered.length} {filtered.length === 1 ? "account" : "accounts"}
              {filtered.length !== accounts.length ? ` of ${accounts.length}` : ""}
            </div>
          </div>
        )}
      </div>
    </AdminFrame>
  );
}
