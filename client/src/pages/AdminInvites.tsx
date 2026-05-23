import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Copy, Check, X, ChevronDown, RefreshCw, Heart } from "lucide-react";
import {
  ROLE_OPTIONS,
  ROLE_LABEL,
  SCOPE_CONFIG,
  ScopePicker,
} from "@/components/admin/RoleScopePicker";

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  roleScopeId: string | null;
  scopeName: string | null;
  scopeThumbUrl: string | null;
  referrerKind: string | null;
  referrerScopeId: string | null;
  referrerName: string | null;
  welcomeNote: string | null;
  expiresAt: string;
  createdAt: string;
  resentAt: string | null;
}

// Referrer picker — artist, non-profit, or press (manufacturer).
// Task #199 added "manufacturer" so super-admins can attribute an
// invite to a specific pressing plant; the accept flow stamps
// `people.invited_by_press_id` / `labels.invited_by_press_id` from
// this so the partner's Sell-panel Presses surface is hard-locked
// to that press until their first run ships.
const REFERRER_CONFIG = {
  artist: SCOPE_CONFIG.artist,
  non_profit: SCOPE_CONFIG.non_profit,
  manufacturer: SCOPE_CONFIG.manufacturer,
} as const;

// Task #256 — ScopePicker, ROLE_OPTIONS, ROLE_LABEL, SCOPE_CONFIG were
// hoisted to @/components/admin/RoleScopePicker so the "Make admin…"
// dialog on AdminCustomers can share the same widget.

export function AdminInvites() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("super_admin");
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [referrerKind, setReferrerKind] = useState<"" | "artist" | "non_profit" | "manufacturer">("");
  const [referrerScopeId, setReferrerScopeId] = useState<string | null>(null);
  const [welcomeNote, setWelcomeNote] = useState("");
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const needsScope = !!SCOPE_CONFIG[role];

  useEffect(() => {
    setScopeId(null);
  }, [role]);
  useEffect(() => {
    setReferrerScopeId(null);
  }, [referrerKind]);

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
    mutationFn: async (body: {
      email: string;
      role: string;
      roleScopeId: string | null;
      referrerKind: string | null;
      referrerScopeId: string | null;
      welcomeNote: string | null;
    }) => {
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
      setReferrerKind("");
      setReferrerScopeId(null);
      setWelcomeNote("");
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

  const resendMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/admin/invites/${id}/resend`);
      return r.json() as Promise<{ acceptUrl: string; emailDelivered: boolean }>;
    },
    onSuccess: (data) => {
      setLastUrl(data.acceptUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({
        title: data.emailDelivered ? "Invite re-sent" : "Re-sent (email failed — copy link)",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Resend failed", description: e.message, variant: "destructive" });
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
    createMutation.isPending || !email.trim() || (needsScope && !scopeId) ||
    (!!referrerKind && !referrerScopeId);

  return (
    <AdminFrame active="albums">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-1" data-testid="text-page-title">Invites</h1>
        <p className="text-sm text-slate-600 mb-6">
          Invite a teammate or partner to the admin. They'll get a one-time link to set their username + password.
          Optionally attribute the invite to a referring artist or non-profit — referrers earn $1 per paid unit on
          the artists they refer.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return;
            if (needsScope && !scopeId) return;
            if (!!referrerKind && !referrerScopeId) return;
            createMutation.mutate({
              email: email.trim(),
              role,
              roleScopeId: needsScope ? scopeId : null,
              referrerKind: referrerKind || null,
              referrerScopeId: referrerKind ? referrerScopeId : null,
              welcomeNote: welcomeNote.trim() || null,
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
              cfg={SCOPE_CONFIG[role]}
              value={scopeId}
              onChange={(id) => setScopeId(id)}
            />
          )}

          {/* Optional referrer attribution — collapsed unless a kind is chosen. */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              <span className="inline-flex items-center gap-1">
                <Heart className="w-3.5 h-3.5 text-[#FF5470]" /> Referrer (optional)
              </span>
            </label>
            <select
              value={referrerKind}
              onChange={(e) => setReferrerKind(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
              data-testid="select-referrer-kind"
            >
              <option value="">— none —</option>
              <option value="artist">Artist</option>
              <option value="non_profit">Non-profit</option>
              <option value="manufacturer">Press (manufacturer)</option>
            </select>
            {referrerKind && (
              <ScopePicker
                cfg={REFERRER_CONFIG[referrerKind]}
                value={referrerScopeId}
                onChange={(id) => setReferrerScopeId(id)}
                label={`Referring ${REFERRER_CONFIG[referrerKind].noun}`}
                testId="referrer-scope"
              />
            )}
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Welcome note (optional)
            </label>
            <textarea
              value={welcomeNote}
              onChange={(e) => setWelcomeNote(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Hi Jenny — really excited to have you on board. — Nick"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20 text-sm"
              data-testid="textarea-welcome-note"
            />
          </div>

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
                      {inv.referrerName && (
                        <>
                          <span className="mx-2">·</span>
                          <span className="inline-flex items-center gap-1" data-testid={`text-referrer-${inv.id}`}>
                            <Heart className="w-3 h-3 text-[#FF5470]" /> {inv.referrerName}
                          </span>
                        </>
                      )}
                      {inv.resentAt && (
                        <>
                          <span className="mx-2">·</span>
                          <span className="text-slate-400">re-sent {new Date(inv.resentAt).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => resendMutation.mutate(inv.id)}
                    disabled={resendMutation.isPending}
                    className="p-2 rounded-md text-slate-400 hover:text-[var(--brand-blue)] hover:bg-slate-100 transition-colors"
                    title="Resend invite"
                    aria-label="Resend invite"
                    data-testid={`button-resend-${inv.id}`}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
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
