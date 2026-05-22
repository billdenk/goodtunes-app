import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Copy, Check, X, ChevronDown } from "lucide-react";

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  roleScopeId: string | null;
  scopeName: string | null;
  scopeThumbUrl: string | null;
  expiresAt: string;
  createdAt: string;
}

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "super_admin", label: "Super Admin (full access)" },
  { value: "label", label: "Label" },
  { value: "artist", label: "Artist" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "fulfillment", label: "Fulfillment Partner" },
];

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((o) => [o.value, o.label.replace(/ \(.*\)$/, "")]),
);

// Roles that must be bound to a specific entity before the invite
// can be sent. The endpoint behind each scope drives the picker;
// `noun` is the singular label shown in the picker placeholder.
const SCOPE_CONFIG: Record<
  string,
  { endpoint: string; noun: string; thumbField: "photoUrl" | "logoUrl" }
> = {
  artist: { endpoint: "/api/people", noun: "artist", thumbField: "photoUrl" },
  label: { endpoint: "/api/labels", noun: "label", thumbField: "logoUrl" },
  manufacturer: { endpoint: "/api/manufacturers", noun: "manufacturer", thumbField: "logoUrl" },
  fulfillment: { endpoint: "/api/fulfillment-partners", noun: "fulfillment partner", thumbField: "logoUrl" },
};

type ScopeEntity = { id: string; name: string; photoUrl?: string | null; logoUrl?: string | null };

function ScopePicker({
  role,
  value,
  onChange,
}: {
  role: string;
  value: string | null;
  onChange: (id: string | null, name: string | null) => void;
}) {
  const cfg = SCOPE_CONFIG[role];
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data: rows = [], isLoading } = useQuery<ScopeEntity[]>({
    queryKey: [cfg.endpoint],
    enabled: !!cfg,
  });

  const selected = useMemo(() => rows.find((r) => r.id === value) ?? null, [rows, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted.slice(0, 50);
    return sorted.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 50);
  }, [rows, query]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const thumb = (r: ScopeEntity) => (cfg.thumbField === "photoUrl" ? r.photoUrl : r.logoUrl) || null;

  return (
    <div className="mt-3" ref={wrapRef}>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
        {cfg.noun.charAt(0).toUpperCase() + cfg.noun.slice(1)}
      </label>
      {selected ? (
        <div
          className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-300 bg-white"
          data-testid="invite-scope-selected"
        >
          {thumb(selected) ? (
            <img src={thumb(selected)!} alt="" className="w-8 h-8 rounded-full object-cover bg-slate-100" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-200" />
          )}
          <div className="flex-1 min-w-0 font-medium text-slate-900 truncate">{selected.name}</div>
          <button
            type="button"
            onClick={() => {
              onChange(null, null);
              setQuery("");
              setOpen(true);
            }}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Clear selection"
            data-testid="button-clear-scope"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-[var(--brand-blue)] focus-within:ring-2 focus-within:ring-[var(--brand-blue)]/20">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder={`Search ${cfg.noun}s…`}
              className="flex-1 px-3 py-2 bg-transparent focus:outline-none"
              data-testid="input-scope-search"
            />
            <ChevronDown className="w-4 h-4 text-slate-400 mr-3" />
          </div>
          {open && (
            <div
              className="absolute z-20 mt-1 w-full max-h-72 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg"
              data-testid="list-scope-options"
            >
              {isLoading ? (
                <div className="px-3 py-2 text-sm text-slate-500">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500">
                  No {cfg.noun}s match "{query}".
                </div>
              ) : (
                filtered.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      onChange(r.id, r.name);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                    data-testid={`option-scope-${r.id}`}
                  >
                    {thumb(r) ? (
                      <img src={thumb(r)!} alt="" className="w-7 h-7 rounded-full object-cover bg-slate-100" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-200" />
                    )}
                    <span className="text-sm text-slate-900 truncate">{r.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminInvites() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("super_admin");
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const needsScope = !!SCOPE_CONFIG[role];

  // Reset the scope picker whenever the role changes so we never
  // ship a stale id from a previous role selection.
  useEffect(() => {
    setScopeId(null);
  }, [role]);

  const {
    data: invites = [],
    isLoading,
    isError: invitesError,
    error: invitesErrorObj,
    refetch: refetchInvites,
  } = useQuery<PendingInvite[]>({
    queryKey: ["/api/admin/invites"],
  });

  const createMutation = useMutation({
    mutationFn: async (body: { email: string; role: string; roleScopeId: string | null }) => {
      const r = await apiRequest("POST", "/api/admin/invites", body);
      return r.json() as Promise<{
        id: string;
        email: string;
        role: string;
        acceptUrl: string;
        emailDelivered: boolean;
      }>;
    },
    onSuccess: (data) => {
      setEmail("");
      setRole("super_admin");
      setScopeId(null);
      setLastUrl(data.acceptUrl);
      setCopied(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({
        title: data.emailDelivered ? "Invite sent" : "Invite created (email failed)",
        description: data.emailDelivered
          ? `Emailed ${data.email}.`
          : `${data.email} — copy the link below and share it manually.`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Could not send invite", description: e.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/invites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({ title: "Invite revoked" });
    },
  });

  async function copyUrl() {
    if (!lastUrl) return;
    try {
      await navigator.clipboard.writeText(lastUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const submitDisabled =
    createMutation.isPending || !email.trim() || (needsScope && !scopeId);

  return (
    <AdminFrame active="albums">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-1" data-testid="text-page-title">Invites</h1>
        <p className="text-sm text-slate-600 mb-6">
          Invite a teammate to the admin. They'll receive an email with a one-time link to set their username + password.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return;
            if (needsScope && !scopeId) return;
            createMutation.mutate({
              email: email.trim(),
              role,
              roleScopeId: needsScope ? scopeId : null,
            });
          }}
          className="bg-white border border-slate-200 rounded-2xl p-5 mb-6"
          data-testid="form-create-invite"
        >
          <div className="grid grid-cols-1 sm:grid-cols-[1fr,200px,auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@example.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
                data-testid="input-invite-email"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
                data-testid="select-invite-role"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={submitDisabled}
              className="bg-[var(--brand-blue)] hover:bg-[#2789bd] disabled:bg-slate-300 text-white font-semibold rounded-lg px-4 py-2 transition-colors"
              data-testid="button-send-invite"
            >
              {createMutation.isPending ? "Sending…" : "Send invite"}
            </button>
          </div>

          {needsScope && (
            <ScopePicker
              role={role}
              value={scopeId}
              onChange={(id) => setScopeId(id)}
            />
          )}

          {lastUrl && (
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3" data-testid="last-invite-url">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Invite link</div>
                <button
                  type="button"
                  onClick={copyUrl}
                  className="text-xs font-semibold text-[var(--brand-blue)] hover:underline flex items-center gap-1"
                  data-testid="button-copy-url"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="mt-1 text-xs text-slate-700 break-all font-mono">{lastUrl}</div>
            </div>
          )}
        </form>

        <h2 className="text-sm font-semibold text-slate-900 mb-3">Pending</h2>
        {isLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : invitesError ? (
          <ErrorState
            error={invitesErrorObj}
            onRetry={() => refetchInvites()}
            title="Couldn't load invites"
            testId="admin-invites-error"
          />
        ) : invites.length === 0 ? (
          <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6 text-center" data-testid="empty-invites">
            No pending invites.
          </div>
        ) : (
          <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100" data-testid="list-invites">
            {invites.map((inv) => {
              const expires = new Date(inv.expiresAt);
              const expired = expires < new Date();
              const scopeLabel = inv.scopeName
                ? `${ROLE_LABEL[inv.role] || inv.role} · ${inv.scopeName}`
                : inv.roleScopeId
                ? `${ROLE_LABEL[inv.role] || inv.role} · (deleted)`
                : ROLE_LABEL[inv.role] || inv.role;
              return (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-3" data-testid={`row-invite-${inv.id}`}>
                  {inv.scopeThumbUrl ? (
                    <img
                      src={inv.scopeThumbUrl}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover bg-slate-100 flex-shrink-0"
                      data-testid={`img-scope-${inv.id}`}
                    />
                  ) : inv.roleScopeId ? (
                    <div className="w-9 h-9 rounded-full bg-slate-200 flex-shrink-0" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900 truncate">{inv.email}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      <span data-testid={`text-scope-${inv.id}`}>{scopeLabel}</span>
                      <span className="mx-2">·</span>
                      <span className={expired ? "text-rose-600" : ""}>
                        {expired ? "expired" : `expires ${expires.toLocaleDateString()}`}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => revokeMutation.mutate(inv.id)}
                    className="p-2 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Revoke invite"
                    aria-label="Revoke invite"
                    data-testid={`button-revoke-${inv.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminFrame>
  );
}
