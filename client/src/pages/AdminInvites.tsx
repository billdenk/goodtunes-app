import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { Link } from "wouter";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Copy, Check, X, ChevronDown, RefreshCw, Heart, Factory, HeartHandshake, Star, SlidersHorizontal, ArrowLeft } from "lucide-react";
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
  // Task #350 — `ambassador` is a Person row with can_invite_ambassadors=true
  // referred by some NPO. Picker reuses the people endpoint (the server
  // re-validates the verb at create time).
  ambassador: SCOPE_CONFIG.ambassador,
} as const;

// Task #256 — ScopePicker, ROLE_OPTIONS, ROLE_LABEL, SCOPE_CONFIG were
// hoisted to @/components/admin/RoleScopePicker so the "Make admin…"
// dialog on AdminCustomers can share the same widget.

// Task #933 — the three partner types Bill actually invites lead the
// flow. Each maps onto an existing server role; the scope picker +
// welcome note are all that type needs. Power options (any role,
// referrer attribution, team sub-roles) live behind "Advanced invite".
const PARTNER_TYPES: { value: string; label: string; Icon: typeof Factory; blurb: string }[] = [
  { value: "manufacturer", label: "Press", Icon: Factory, blurb: "A vinyl pressing plant or printer." },
  { value: "non_profit", label: "Non-profit", Icon: HeartHandshake, blurb: "A charity partner referring artists." },
  { value: "artist", label: "Artist", Icon: Star, blurb: "An artist running their own releases." },
];

export function AdminInvites() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  // Task #933 — "quick" leads with the three partner types and only
  // asks for what each needs; "advanced" reveals the full power form
  // (any role + referrer attribution + team sub-roles).
  const [inviteMode, setInviteMode] = useState<"quick" | "advanced">("quick");
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [referrerKind, setReferrerKind] = useState<"" | "artist" | "non_profit" | "manufacturer" | "ambassador">("");
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ name: string } | null>(null);
  const [referrerScopeId, setReferrerScopeId] = useState<string | null>(null);
  const [welcomeNote, setWelcomeNote] = useState("");
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Task #351 — Team-invite shape: optional Identity/Manager/Team role
  // + target Person (search the People catalog) + optional pre-flighted
  // album draft to attach so the invitee lands in the editor.
  const [inviteRole, setInviteRole] = useState<"" | "identity" | "manager" | "team">("");
  const [targetPersonId, setTargetPersonId] = useState<string | null>(null);
  const [targetPersonName, setTargetPersonName] = useState<string>("");
  const [preFlightedAlbumId, setPreFlightedAlbumId] = useState<string | null>(null);
  const [personSearch, setPersonSearch] = useState("");
  const personResults = useQuery<Array<{ id: string; name: string; photoUrl: string | null }>>({
    queryKey: ["/api/admin/people", { q: personSearch }],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/people?q=${encodeURIComponent(personSearch)}&limit=8`);
      return r.json();
    },
    enabled: !!inviteRole && personSearch.trim().length >= 2 && !targetPersonId,
  });
  const targetAlbums = useQuery<Array<{ id: string; title: string }>>({
    queryKey: ["/api/admin/albums", { artist: targetPersonId }],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/albums?artistId=${targetPersonId}`);
      return r.json();
    },
    enabled: !!targetPersonId,
  });

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
      confirmDuplicate?: boolean;
    }) => {
      const r = await apiRequest("POST", "/api/admin/invites", body);
      return r.json() as Promise<{
        id: string;
        email: string;
        role: string;
        acceptUrl: string;
        emailDelivered: boolean;
        reviewStatus?: string;
        claimedReason?: string | null;
      }>;
    },
    onSuccess: (data) => {
      setEmail("");
      setRole(inviteMode === "advanced" ? "super_admin" : "");
      setScopeId(null);
      setReferrerKind("");
      setReferrerScopeId(null);
      setWelcomeNote("");
      setInviteRole("");
      setTargetPersonId(null);
      setTargetPersonName("");
      setPreFlightedAlbumId(null);
      setPersonSearch("");
      setLastUrl(data.acceptUrl);
      setCopied(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites/review"] });
      toast({
        title: data.reviewStatus === "pending_review"
          ? "Held for review"
          : data.emailDelivered ? "Invite sent" : "Invite created (email failed)",
        description: data.reviewStatus === "pending_review"
          ? `${data.claimedReason || "Needs super-admin approval"} — the email won't go out until approved.`
          : data.emailDelivered
            ? `Emailed ${data.email}.`
            : `${data.email} — copy the link below and share it manually.`,
      });
    },
    onError: (e: Error) => {
      // Task #350 — duplicate-in-subtree (409). Body carries
      // {code:'duplicate_in_subtree', existing:{name}} which we use to
      // ask the operator to confirm before resubmitting with the
      // confirmDuplicate flag set.
      try {
        const m = e.message.match(/\{[\s\S]*\}/);
        const payload = m ? JSON.parse(m[0]) : null;
        if (payload?.code === "duplicate_in_subtree" && payload?.existing?.name) {
          setDuplicateConfirm({ name: payload.existing.name });
          return;
        }
      } catch { /* fall through */ }
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
    createMutation.isPending || !email.trim() || !role || (needsScope && !scopeId) ||
    (!!referrerKind && !referrerScopeId);

  return (
    <AdminFrame active="albums">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-1" data-testid="text-page-title">Invites</h1>
        <p className="text-sm text-slate-600 mb-6">
          Invite a partner to join GoodTunes. Pick the kind of partner, tell us who they are, and we'll email them a
          one-time link to set their password and land on their own dashboard.
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
              inviteRole: inviteRole || null,
              targetPersonId: inviteRole ? targetPersonId : null,
              preFlightedAlbumId: inviteRole ? preFlightedAlbumId : null,
            } as any);
          }}
          className="bg-white border border-slate-200 rounded-2xl p-5 mb-6"
          data-testid="form-create-invite"
        >
          {inviteMode === "quick" && (
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Who are you inviting?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" data-testid="partner-type-grid">
                {PARTNER_TYPES.map((t) => {
                  const selected = role === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setRole(t.value)}
                      aria-pressed={selected}
                      className={[
                        "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                        selected
                          ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/5 ring-1 ring-[var(--brand-blue)]/30"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                      ].join(" ")}
                      data-testid={`button-partner-type-${t.value}`}
                    >
                      <t.Icon className={selected ? "w-5 h-5 text-[var(--brand-blue)]" : "w-5 h-5 text-slate-400"} />
                      <span className="text-sm font-semibold text-slate-900">{t.label}</span>
                      <span className="text-xs text-slate-500 leading-snug">{t.blurb}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(inviteMode === "advanced" || !!role) && (
          <div className={`grid grid-cols-1 gap-3 items-end ${inviteMode === "advanced" ? "sm:grid-cols-[1fr,200px,auto]" : "sm:grid-cols-[1fr,auto]"}`}>
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
            {inviteMode === "advanced" && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
                  data-testid="select-invite-role"
                >
                  <option value="">— Choose a role —</option>
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="submit"
              disabled={submitDisabled}
              className="bg-[var(--brand-blue)] hover:bg-[#2789bd] disabled:bg-slate-300 text-white font-semibold rounded-lg px-4 py-2 transition-colors"
              data-testid="button-send-invite"
            >
              {createMutation.isPending ? "Sending…" : "Send invite"}
            </button>
          </div>
          )}

          {needsScope && (
            <ScopePicker
              cfg={SCOPE_CONFIG[role]}
              value={scopeId}
              onChange={(id) => setScopeId(id)}
            />
          )}

          {inviteMode === "advanced" && (
          <>
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
              {/* Task #350 — NPO partners promote contact people to
                  ambassadors; ambassador-attributed invites give the
                  ambassador the per-unit credit while still rolling up
                  to their NPO. */}
              <option value="ambassador">Ambassador (non-profit contact)</option>
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

          {/* Task #351 — Team invite (Identity / Manager / Team). When
              a role is picked, the invite is gated to a specific
              Person; super-admin can also pre-flight an album draft so
              the invitee lands in the editor on first sign-in. */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Team invite (optional)
            </label>
            <select
              value={inviteRole}
              onChange={(e) => { setInviteRole(e.target.value as any); setTargetPersonId(null); setTargetPersonName(""); setPreFlightedAlbumId(null); setPersonSearch(""); }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
              data-testid="select-invite-role-team"
            >
              <option value="">— Not a team invite —</option>
              <option value="identity">Identity (this person IS the artist)</option>
              <option value="manager">Manager (manages the artist)</option>
              <option value="team">Team (band/team member — credits + gear only)</option>
            </select>
            {inviteRole && (
              <div className="mt-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Target person</label>
                {targetPersonId ? (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
                    <span className="text-sm text-slate-800 flex-1 truncate" data-testid="text-target-person">{targetPersonName}</span>
                    <button type="button" onClick={() => { setTargetPersonId(null); setTargetPersonName(""); setPreFlightedAlbumId(null); }} className="text-slate-400 hover:text-rose-600" data-testid="button-clear-target-person">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={personSearch}
                      onChange={(e) => setPersonSearch(e.target.value)}
                      placeholder="Search People (local catalog) — 2+ chars"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
                      data-testid="input-target-person-search"
                    />
                    {personSearch.length >= 2 && personResults.data && personResults.data.length > 0 && (
                      <ul className="mt-2 bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto" data-testid="list-person-results">
                        {personResults.data.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => { setTargetPersonId(p.id); setTargetPersonName(p.name); setPersonSearch(""); }}
                              className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-slate-50"
                              data-testid={`button-pick-person-${p.id}`}
                            >
                              {p.photoUrl ? <img src={p.photoUrl} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-slate-200" />}
                              <span className="text-sm text-slate-800">{p.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {targetPersonId && targetAlbums.data && targetAlbums.data.length > 0 && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Pre-flight an album draft (optional)</label>
                    <select
                      value={preFlightedAlbumId || ""}
                      onChange={(e) => setPreFlightedAlbumId(e.target.value || null)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
                      data-testid="select-preflight-album"
                    >
                      <option value="">— None — invitee lands on welcome page —</option>
                      {targetAlbums.data.map((a) => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">The invitee lands straight in the album editor after sign-up.</p>
                  </div>
                )}
              </div>
            )}
          </div>
          </>
          )}

          {(inviteMode === "advanced" || !!role) && (
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
            <p className="mt-1 text-xs text-slate-500">
              They'll see this note on their first sign-in, above their dashboard.
            </p>
          </div>
          )}

          {/* Task #933 — power options live behind a disclosure so the
              everyday partner invite stays a three-field flow. */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            {inviteMode === "quick" ? (
              <button
                type="button"
                onClick={() => { setInviteMode("advanced"); if (!role) setRole("super_admin"); }}
                className="text-xs font-semibold text-[var(--brand-blue)] hover:underline inline-flex items-center gap-1.5"
                data-testid="button-advanced-invite"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" /> Advanced invite — other roles, referrer attribution, team
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setInviteMode("quick"); setRole(""); setReferrerKind(""); setReferrerScopeId(null); setInviteRole(""); setTargetPersonId(null); setTargetPersonName(""); setPreFlightedAlbumId(null); }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5"
                data-testid="button-quick-invite"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to quick partner invite
              </button>
            )}
          </div>

          {duplicateConfirm && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3" data-testid="banner-duplicate-confirm">
              <div className="text-sm text-amber-900">
                <strong>{duplicateConfirm.name}</strong> already appears under this
                referrer in the invite tree. Sending another invite here
                creates a parallel attribution.
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDuplicateConfirm(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-amber-100 rounded-md"
                  data-testid="button-duplicate-cancel"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDuplicateConfirm(null);
                    createMutation.mutate({
                      email: email.trim(),
                      role,
                      roleScopeId: needsScope ? scopeId : null,
                      referrerKind: referrerKind || null,
                      referrerScopeId: referrerKind ? referrerScopeId : null,
                      welcomeNote: welcomeNote.trim() || null,
                      confirmDuplicate: true,
                    });
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md"
                  data-testid="button-duplicate-confirm"
                >
                  Send anyway
                </button>
              </div>
            </div>
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

        {/* Task #350 — Super-admin only: $1.50 invitee-charity bonus
            flag. OFF by default. When ON, the splitter pays NPO
            referrers $1.50/unit instead of $1.00 — funded out of the
            platform's margin. Toggle is its own panel so it doesn't
            crowd the create form; the GET endpoint 403s for non-super
            admins which simply hides the panel. */}
        <ReviewQueuePanel />
        <ReferralFundingPanel />
      </div>
    </AdminFrame>
  );
}

// Task #351 — Claimed-Person + anti-solicitation review queue.
// Super-admin only; the GET endpoint 403s for non-super so this hides
// itself silently on lower-tier admin accounts.
function ReviewQueuePanel() {
  const { toast } = useToast();
  const q = useQuery<Array<{
    id: string; email: string; role: string; inviteRole: string | null;
    targetPersonName: string | null; targetPersonPhoto: string | null;
    targetIsGroup: boolean | null; targetSpotifyId: string | null;
    createdByName: string | null; createdAt: string;
  }>>({
    queryKey: ["/api/admin/invites/review"],
    retry: false,
  });
  const approve = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/admin/invites/${id}/approve`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites/review"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({ title: "Invite approved" });
    },
    onError: (e: Error) => toast({ title: "Couldn't approve", description: e.message, variant: "destructive" }),
  });
  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await apiRequest("POST", `/api/admin/invites/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites/review"] });
      toast({ title: "Invite rejected" });
    },
  });
  if (q.isError) return null;
  if (q.isLoading || !q.data || q.data.length === 0) return null;
  return (
    <div className="mt-8 bg-white border border-amber-200 rounded-2xl p-5" data-testid="panel-review-queue">
      <h2 className="text-sm font-semibold text-slate-900 mb-1">Held for review ({q.data.length})</h2>
      <p className="text-xs text-slate-500 mb-3">
        Identity invites for claimed People (linked login, Spotify artist, GoodTunes releases, or groups), and any team invite from a non-super-admin
        whose email isn't on file for the target Person, are held here until approved.
      </p>
      <ul className="divide-y divide-slate-100">
        {q.data.map((inv) => (
          <li key={inv.id} className="flex items-center gap-3 py-3" data-testid={`row-review-${inv.id}`}>
            {inv.targetPersonPhoto
              ? <img src={inv.targetPersonPhoto} alt="" className="w-9 h-9 rounded-full object-cover bg-slate-100 flex-shrink-0" />
              : <div className="w-9 h-9 rounded-full bg-slate-200 flex-shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900 truncate" data-testid={`text-review-email-${inv.id}`}>{inv.email}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {inv.inviteRole || inv.role}
                {inv.targetPersonName && <> · <span className="font-medium text-slate-700">{inv.targetPersonName}</span></>}
                {inv.targetSpotifyId && <> · <span className="text-amber-700">Spotify-claimed</span></>}
                {inv.targetIsGroup && <> · <span className="text-amber-700">group</span></>}
                {inv.createdByName && <> · invited by {inv.createdByName}</>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => approve.mutate(inv.id)}
              disabled={approve.isPending}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[var(--brand-blue)] hover:bg-[#2789bd] rounded-md"
              data-testid={`button-approve-${inv.id}`}
            >
              Approve & send
            </button>
            <button
              type="button"
              onClick={() => {
                const reason = prompt("Reason for rejecting this invite? (optional)") || "";
                reject.mutate({ id: inv.id, reason });
              }}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-md"
              data-testid={`button-reject-${inv.id}`}
            >
              Reject
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReferralFundingPanel() {
  const q = useQuery<{ inviteeCharityBonusEnabled: boolean; updatedAt: string | null }>({
    queryKey: ["/api/admin/referral-funding-config"],
    retry: false,
  });
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: async (enabled: boolean) => {
      const r = await apiRequest("PUT", "/api/admin/referral-funding-config", { inviteeCharityBonusEnabled: enabled });
      return (await r.json()) as { inviteeCharityBonusEnabled: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-funding-config"] });
      toast({ title: "Funding rate updated" });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't update", description: e.message, variant: "destructive" });
    },
  });
  // 403 for non-super admins — silently hide the whole panel.
  if (q.isError) return null;
  const enabled = !!q.data?.inviteeCharityBonusEnabled;
  return (
    <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-5" data-testid="panel-referral-funding">
      <h2 className="text-sm font-semibold text-slate-900 mb-1">Referral funding</h2>
      <p className="text-xs text-slate-500 mb-3">
        Lift the NPO referral rate from <strong>$1.00</strong> to <strong>$1.50</strong> per paid unit.
        Funded out of GoodTunes margin. Affects all future paid orders — past credits aren't backfilled.
      </p>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={q.isLoading || m.isPending}
          onChange={(e) => m.mutate(e.target.checked)}
          className="mt-1 w-4 h-4 accent-[var(--brand-blue)]"
          data-testid="toggle-invitee-charity-bonus"
        />
        <span className="text-sm text-slate-700">
          Pay non-profit referrers <strong>$1.50</strong> per paid unit (default $1.00)
        </span>
      </label>
      <div className="mt-4 pt-3 border-t border-slate-100">
        <Link href="/admin/invite-tree" className="text-xs font-semibold text-inherit hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2" data-testid="link-invite-tree">
          Open the invite tree →
        </Link>
      </div>
    </div>
  );
}
