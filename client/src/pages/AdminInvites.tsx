import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { Link } from "wouter";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Copy, Check, X, ChevronDown, RefreshCw, Heart, Factory, HeartHandshake, Star, SlidersHorizontal, ArrowLeft, Plus, Building2, Truck, Wrench, UserCog, Lock } from "lucide-react";
import {
  ROLE_OPTIONS,
  ROLE_LABEL,
  SCOPE_CONFIG,
  ScopePicker,
} from "@/components/admin/RoleScopePicker";
import { NewAlbumArtistDialog } from "@/components/admin/NewAlbumArtistDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  inviteRole: string | null;
  reviewStatus: string | null;
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
type PartnerType = { value: string; label: string; Icon: typeof Factory; blurb: string };
const PARTNER_TYPES: PartnerType[] = [
  { value: "manufacturer", label: "Press", Icon: Factory, blurb: "A vinyl pressing plant or printer." },
  { value: "non_profit", label: "Non-profit", Icon: HeartHandshake, blurb: "A charity partner referring artists." },
  { value: "artist", label: "Artist", Icon: Star, blurb: "An artist running their own releases." },
];

// Task #1791 — a scoped partner sees quick cards derived from the roles
// the backend says they may invite (`allowedInviteRoles` off /api/me/role).
// This meta covers every role a partner carveout can expose; super-admins
// keep the three curated lead cards above instead.
const PARTNER_TYPE_META: Record<string, Omit<PartnerType, "value">> = {
  manufacturer: { label: "Press", Icon: Factory, blurb: "A vinyl pressing plant or printer." },
  non_profit: { label: "Non-profit", Icon: HeartHandshake, blurb: "A charity partner referring artists." },
  artist: { label: "Artist", Icon: Star, blurb: "An artist running their own releases." },
  label: { label: "Label", Icon: Building2, blurb: "A record label running its roster." },
  fulfillment: { label: "Fulfillment", Icon: Truck, blurb: "A fulfillment teammate on your team." },
  vendor: { label: "Vendor", Icon: Wrench, blurb: "A gear vendor teammate on your team." },
  manager: { label: "Manager", Icon: UserCog, blurb: "A manager teammate on your team." },
};

export function AdminInvites() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  // Task #933 — "quick" leads with the three partner types and only
  // asks for what each needs; "advanced" reveals the full power form
  // (any role + referrer attribution + team sub-roles).
  const [inviteMode, setInviteMode] = useState<"quick" | "advanced">("quick");
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [scopeName, setScopeName] = useState<string>("");
  const [referrerKind, setReferrerKind] = useState<"" | "artist" | "non_profit" | "manufacturer" | "ambassador">("");
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ name: string } | null>(null);
  const [referrerScopeId, setReferrerScopeId] = useState<string | null>(null);
  const [welcomeNote, setWelcomeNote] = useState("");
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Task #351 — Team-invite shape: optional Identity/Manager/Team role
  // + target Person (search the People catalog) + optional pre-flighted
  // album draft to attach so the invitee lands in the editor.
  const [inviteRole, setInviteRole] = useState<"" | "identity" | "manager" | "team" | "label">("");
  const [targetPersonId, setTargetPersonId] = useState<string | null>(null);
  const [targetPersonName, setTargetPersonName] = useState<string>("");
  const [preFlightedAlbumId, setPreFlightedAlbumId] = useState<string | null>(null);
  const [personSearch, setPersonSearch] = useState("");
  // Task #1792 — Artist scope opens the SAME dialog the album "add artist"
  // flow uses (NewAlbumArtistDialog, mode="person"): type a name → live DB
  // match, streaming search-by-name (Spotify/Apple candidate grid), or
  // paste-a-URL import — all without leaving the invite page.
  const [composerOpen, setComposerOpen] = useState(false);
  const personResults = useQuery<Array<{ id: string; name: string; photoUrl: string | null }>>({
    queryKey: ["/api/admin/people", { q: personSearch }],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/people?q=${encodeURIComponent(personSearch)}&limit=8`);
      return r.json();
    },
    enabled: !!inviteRole && personSearch.trim().length >= 2 && !targetPersonId,
  });
  // Task #351 — for an Artist-role team invite the target Person IS the
  // artist already picked in the role-scope field above, so reuse it
  // instead of demanding a redundant second People search. Other roles
  // still resolve the target from the explicit Target Person picker.
  const effectiveTargetPersonId = inviteRole ? (role === "artist" ? scopeId : targetPersonId) : null;
  const effectiveTargetPersonName = inviteRole ? (role === "artist" ? scopeName : targetPersonName) : "";
  const targetAlbums = useQuery<Array<{ id: string; title: string }>>({
    queryKey: ["/api/admin/albums", { artist: effectiveTargetPersonId }],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/albums?artistId=${effectiveTargetPersonId}`);
      return r.json();
    },
    enabled: !!effectiveTargetPersonId,
  });

  const needsScope = !!SCOPE_CONFIG[role];

  useEffect(() => {
    setScopeId(null);
    setScopeName("");
  }, [role]);
  useEffect(() => {
    setReferrerScopeId(null);
  }, [referrerKind]);
  // Drop a pre-flighted album draft whenever the resolved target Person
  // changes (e.g. operator swaps the artist scope) so a draft picked for
  // a prior target can't ride along to a different one.
  useEffect(() => {
    setPreFlightedAlbumId(null);
  }, [effectiveTargetPersonId]);

  // Task #1791 — invite capability is surfaced by the backend off
  // /api/me/role (the same endpoint the rest of the admin shell reads),
  // so the UI shows only the partner types / roles the POST
  // /api/admin/invites gate will actually accept — no client-side
  // re-implementation of the carveouts that could drift from the server.
  const { data: adminMe } = useQuery<{
    role: string;
    roleScopeId: string | null;
    canInvite?: boolean;
    allowedInviteRoles?: string[];
    allowAdvancedInvite?: boolean;
  }>({
    queryKey: ["/api/me/role"],
  });
  const roleLoaded = adminMe !== undefined;
  // Default permissive while the role is still loading (the common caller
  // is a super-admin); the friendly "can't invite" state only renders
  // once we've confirmed the backend says so.
  const canInvite = !roleLoaded || adminMe.canInvite !== false;
  const allowAdvanced = adminMe?.allowAdvancedInvite ?? !roleLoaded;
  // null = unrestricted (super-admin / still loading). Otherwise the
  // explicit set of roles the caller may target.
  const allowedRoles: string[] | null = allowAdvanced
    ? null
    : adminMe?.allowedInviteRoles ?? null;

  // Quick-mode partner-type cards. Super-admins keep the three curated
  // lead cards; a scoped partner gets cards derived from their allowed
  // roles so they never see a type the server would reject.
  const visiblePartnerTypes: PartnerType[] = allowedRoles
    ? allowedRoles
        .filter((r) => PARTNER_TYPE_META[r])
        .map((r) => ({ value: r, ...PARTNER_TYPE_META[r] }))
    : PARTNER_TYPES;
  const visibleRoleOptions = allowedRoles
    ? ROLE_OPTIONS.filter((o) => allowedRoles.includes(o.value))
    : ROLE_OPTIONS;

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
        // Task #1038 — when the email already has a GoodTunes login the
        // role is granted to that account directly (no invite/email).
        added?: boolean;
        userId?: string;
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      // Task #1038 — the email already had a GoodTunes login, so the role
      // was granted to that account directly. No invite, no email — say so
      // plainly instead of falling through to the "email failed" branch.
      if (data.added) {
        toast({
          title: "Role added to existing account",
          description: `${data.email} already has a GoodTunes login, so the ${ROLE_LABEL[data.role] || data.role} role was added to it directly — no invite email needed.`,
        });
        return;
      }
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
    (!!referrerKind && !referrerScopeId) ||
    (!!inviteRole && !effectiveTargetPersonId);

  // Task #1791 — a partner whose team can't invite (e.g. an NPO caller,
  // or any partner missing invite_subusers) gets a friendly explainer
  // instead of a form they can't submit. The backend (/api/me/role,
  // canInvite=false) is the source of truth, so this matches the POST
  // gate exactly. Render nothing role-specific until the role resolves.
  if (roleLoaded && !canInvite) {
    return (
      <AdminFrame active="invites" contentWidth="narrow">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 mb-1" data-testid="text-page-title">Invites</h1>
          <div
            className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 text-center"
            data-testid="state-cannot-invite"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Lock className="h-6 w-6 text-slate-400" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 mb-1">Inviting isn't enabled for your team</h2>
            <p className="text-sm text-slate-600 max-w-sm mx-auto">
              Your account doesn't have permission to send invites yet. If you need to add a partner or teammate, just
              ask GoodTunes and we'll set it up for you.
            </p>
          </div>
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="invites" contentWidth="narrow">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-1" data-testid="text-page-title">Invites</h1>
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
              targetPersonId: effectiveTargetPersonId,
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
                {visiblePartnerTypes.map((t) => {
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

          {/* Email — its own full-width row. */}
          {(inviteMode === "advanced" || !!role) && (
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
          )}

          {/* Role · Referrer · Team invite — the three dropdowns share one row. */}
          {inviteMode === "advanced" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Role</label>
                <Select
                  value={role || undefined}
                  onValueChange={(v) => setRole(v)}
                >
                  <SelectTrigger data-testid="select-invite-role">
                    <SelectValue placeholder="— Choose a role —" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleRoleOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Optional referrer attribution. */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5 text-[color:var(--brand-pink)]" /> Referrer (optional)
                  </span>
                </label>
                <Select
                  value={referrerKind || undefined}
                  onValueChange={(v) => setReferrerKind(v === "__none__" ? "" : v as any)}
                >
                  <SelectTrigger data-testid="select-referrer-kind">
                    <SelectValue placeholder="— none —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— none —</SelectItem>
                    <SelectItem value="artist">Artist</SelectItem>
                    <SelectItem value="non_profit">Non-profit</SelectItem>
                    <SelectItem value="manufacturer">Press (manufacturer)</SelectItem>
                    <SelectItem value="ambassador">Ambassador (non-profit contact)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Task #351 — Team invite (Identity / Manager / Team). When a
                  role is picked, the invite is gated to a specific Person;
                  super-admin can also pre-flight an album draft. */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Team invite (optional)
                </label>
                <Select
                  value={inviteRole || undefined}
                  onValueChange={(v) => {
                    const val = v === "__none__" ? "" : v as any;
                    setInviteRole(val);
                    setTargetPersonId(null);
                    setTargetPersonName("");
                    setPreFlightedAlbumId(null);
                    setPersonSearch("");
                  }}
                >
                  <SelectTrigger data-testid="select-invite-role-team">
                    <SelectValue placeholder="— Not a team invite —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Not a team invite —</SelectItem>
                    <SelectItem value="identity">Identity (this person IS the artist)</SelectItem>
                    <SelectItem value="manager">Manager (manages the artist)</SelectItem>
                    <SelectItem value="team">Team (band/team member — credits + gear only)</SelectItem>
                    <SelectItem value="label">Label (the artist's record label — recognition only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Role scope picker — applies to both quick and advanced modes.
              Task #1792 — the Artist scope mirrors the album "add artist"
              experience by mounting the same NewAlbumArtistDialog (streaming
              search-by-name + paste-a-URL + create-by-name) so an artist who
              isn't in the DB yet can be created and selected without leaving
              the page. */}
          {needsScope && (
            role === "artist" ? (
              <div className="mt-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Artist
                </label>
                {scopeId ? (
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-300 bg-white">
                    <div className="w-8 h-8 rounded-full bg-slate-200" />
                    <div className="flex-1 min-w-0 font-medium text-slate-900 truncate">{scopeName}</div>
                    <button
                      type="button"
                      onClick={() => { setScopeId(null); setScopeName(""); }}
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      aria-label="Clear selection"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setComposerOpen(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-left text-sm text-slate-600 hover:border-[var(--brand-blue)] hover:text-slate-900"
                  >
                    <Plus className="w-4 h-4 text-[var(--brand-blue)] flex-shrink-0" />
                    Search or add an artist…
                  </button>
                )}
              </div>
            ) : (
              <ScopePicker
                cfg={SCOPE_CONFIG[role]}
                value={scopeId}
                onChange={(id, name) => { setScopeId(id); setScopeName(name || ""); }}
              />
            )
          )}

          {role === "artist" && (
            <NewAlbumArtistDialog
              open={composerOpen}
              onOpenChange={setComposerOpen}
              mode="person"
              onSelect={({ name, id }) => { setScopeId(id || null); setScopeName(name); setComposerOpen(false); }}
              onSkip={() => setComposerOpen(false)}
            />
          )}

          {/* Referrer detail — full-width beneath the dropdown row once a kind is chosen. */}
          {inviteMode === "advanced" && referrerKind && (
            <ScopePicker
              cfg={REFERRER_CONFIG[referrerKind]}
              value={referrerScopeId}
              onChange={(id) => setReferrerScopeId(id)}
              label={`Referring ${REFERRER_CONFIG[referrerKind].noun}`}
              testId="referrer-scope"
            />
          )}

          {/* Team invite detail — gate to a specific Person + optional pre-flight. */}
          {inviteMode === "advanced" && inviteRole && (
            <div className="mt-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Target person</label>
              {role === "artist" ? (
                // Artist-role invites already name the Person in the Artist
                // field above — reuse it as the target instead of a second
                // redundant search that left the invite stuck on a 400.
                scopeId ? (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2" data-testid="text-target-person">
                    <span className="text-sm text-slate-800 flex-1 truncate">{effectiveTargetPersonName || "Selected artist"}</span>
                    <span className="text-xs text-slate-400">from Artist above</span>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500" data-testid="text-target-person-hint">Pick the artist above first — they'll be the target.</p>
                )
              ) : targetPersonId ? (
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
              {effectiveTargetPersonId && targetAlbums.data && targetAlbums.data.length > 0 && (
                <div className="mt-3">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Pre-flight an album draft (optional)</label>
                  <Select
                    value={preFlightedAlbumId || undefined}
                    onValueChange={(v) => setPreFlightedAlbumId(v === "__none__" ? null : v)}
                  >
                    <SelectTrigger data-testid="select-preflight-album">
                      <SelectValue placeholder="— None — invitee lands on welcome page —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None — invitee lands on welcome page —</SelectItem>
                      {targetAlbums.data.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-slate-500">The invitee lands straight in the album editor after sign-up.</p>
                </div>
              )}
            </div>
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
              everyday partner invite stays a three-field flow. The Send
              invite button anchors the bottom of the form. */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            {inviteMode === "quick" ? (
              // Task #1791 — the Advanced power form (any role, referrer
              // attribution, team invites) is super-admin only; scoped
              // partners never see it. The empty span keeps Send invite
              // right-aligned when the toggle is hidden.
              allowAdvanced ? (
                <button
                  type="button"
                  onClick={() => { setInviteMode("advanced"); if (!role) setRole("super_admin"); }}
                  className="text-xs font-semibold text-[var(--brand-blue)] hover:underline inline-flex items-center gap-1.5"
                  data-testid="button-advanced-invite"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Advanced invite — other roles, referrer attribution, team
                </button>
              ) : (
                <span />
              )
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
            {(inviteMode === "advanced" || !!role) && (
              <button
                type="submit"
                disabled={submitDisabled}
                className="bg-[var(--brand-blue)] hover:bg-[#2789bd] disabled:bg-slate-300 text-white font-semibold rounded-lg px-4 py-2 transition-colors shrink-0"
                data-testid="button-send-invite"
              >
                {createMutation.isPending ? "Sending…" : "Send invite"}
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
                      inviteRole: inviteRole || null,
                      targetPersonId: effectiveTargetPersonId,
                      preFlightedAlbumId: inviteRole ? preFlightedAlbumId : null,
                      confirmDuplicate: true,
                    } as any);
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
        <MailFailuresPanel />
        <ReferralFundingPanel />
      </div>
    </AdminFrame>
  );
}

// Normalizes raw invite_role column values to human-readable labels for
// every invite list surface in this file. Add new roles here to keep
// display consistent across the review queue and any future invite lists.
const INVITE_ROLE_DISPLAY: Record<string, string> = {
  identity: "Identity",
  manager: "Manager",
  team: "Team",
  label: "Label",
  npo_ambassador: "Ambassador",
  npo_staff: "Non-profit staff",
  press_staff: "Press staff",
};

// Task #351 — Claimed-Person + anti-solicitation review queue.
// Super-admin only; the GET endpoint 403s for non-super so this hides
// itself silently on lower-tier admin accounts.
function ReviewQueuePanel() {
  const { toast } = useToast();
  // Task #1570 — when an approve sends the invite email but the send
  // fails, keep the accept link visible so the operator can copy it and
  // share it manually (recovery path) instead of re-creating the invite.
  const [failedApprove, setFailedApprove] = useState<{ email: string; acceptUrl: string; reason: string | null } | null>(null);
  const [copiedApprove, setCopiedApprove] = useState(false);
  const q = useQuery<Array<{
    id: string; email: string; role: string; inviteRole: string | null;
    targetPersonName: string | null; targetPersonPhoto: string | null;
    targetIsGroup: boolean | null; targetSpotifyId: string | null;
    createdByName: string | null; createdAt: string;
    referrerKind: string | null; invitingPressName: string | null; draftAlbumTitle: string | null;
  }>>({
    queryKey: ["/api/admin/invites/review"],
    retry: false,
  });
  const approve = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/admin/invites/${id}/approve`);
      return r.json() as Promise<{ ok: boolean; acceptUrl: string; emailDelivered: boolean; reason: string | null }>;
    },
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites/review"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      // Mirror the create-invite / resend-invite toasts: an honest result
      // — emailed when it actually went out, "copy link" when it didn't.
      if (data.emailDelivered) {
        setFailedApprove(null);
        toast({ title: "Invite approved — emailed" });
        return;
      }
      const inv = q.data?.find((r) => r.id === id);
      setFailedApprove({ email: inv?.email ?? "the invitee", acceptUrl: data.acceptUrl, reason: data.reason ?? null });
      setCopiedApprove(false);
      toast({
        title: "Approved — email failed, copy link",
        description: data.reason
          ? `Couldn't email it (${data.reason}). Copy the link below and share it manually.`
          : "Couldn't email it. Copy the link below and share it manually.",
        variant: "destructive",
      });
    },
    onError: (e: Error) => toast({ title: "Couldn't approve", description: e.message, variant: "destructive" }),
  });
  async function copyApproveUrl() {
    if (!failedApprove) return;
    try {
      await navigator.clipboard.writeText(failedApprove.acceptUrl);
      setCopiedApprove(true);
      setTimeout(() => setCopiedApprove(false), 1500);
    } catch {}
  }
  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await apiRequest("POST", `/api/admin/invites/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites/review"] });
      toast({ title: "Invite rejected" });
    },
  });
  // Non-super (403) hides the whole panel — they can't approve anyway.
  if (q.isError) return null;
  const failedBanner = failedApprove ? (
    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3" data-testid="banner-approve-failed">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-rose-800">
          Approved {failedApprove.email} — but the email failed to send
        </div>
        <button
          type="button"
          onClick={copyApproveUrl}
          className="text-xs font-semibold text-[var(--brand-blue)] hover:underline flex items-center gap-1 flex-shrink-0"
          data-testid="button-copy-approve-url"
        >
          {copiedApprove ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copiedApprove ? "Copied" : "Copy link"}
        </button>
      </div>
      {failedApprove.reason && (
        <div className="mt-1 text-xs text-rose-700">{failedApprove.reason}</div>
      )}
      <div className="mt-1 text-xs text-slate-700 break-all font-mono">{failedApprove.acceptUrl}</div>
      <div className="mt-1 text-xs text-slate-500">
        Share this link manually, or use the Resend button in the Pending list above. See "Recent email failures" below for why it didn't send.
      </div>
    </div>
  ) : null;
  // Keep the recovery banner visible even after the held queue empties
  // (approving the last held invite invalidates the review query → empty).
  if (q.isLoading || !q.data || q.data.length === 0) {
    return failedBanner ? <div className="mt-8" data-testid="panel-review-queue">{failedBanner}</div> : null;
  }
  return (
    <div className="mt-8 bg-white border border-amber-200 rounded-2xl p-5" data-testid="panel-review-queue">
      <h2 className="text-sm font-semibold text-slate-900 mb-1">Held for review ({q.data.length})</h2>
      <p className="text-xs text-slate-500 mb-3">
        Identity invites for claimed People (linked login, Spotify artist, GoodTunes releases, or groups), and any team invite from a non-super-admin
        whose email isn't on file for the target Person, are held here until approved.
      </p>
      {failedBanner && <div className="mb-3">{failedBanner}</div>}
      <ul className="divide-y divide-slate-100">
        {q.data.map((inv) => (
          <li key={inv.id} className="flex items-center gap-3 py-3" data-testid={`row-review-${inv.id}`}>
            {inv.targetPersonPhoto
              ? <img src={inv.targetPersonPhoto} alt="" className="w-9 h-9 rounded-full object-cover bg-slate-100 flex-shrink-0" />
              : <div className="w-9 h-9 rounded-full bg-slate-200 flex-shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900 truncate" data-testid={`text-review-email-${inv.id}`}>{inv.email}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {inv.inviteRole ? (INVITE_ROLE_DISPLAY[inv.inviteRole] ?? inv.inviteRole) : inv.role}
                {inv.targetPersonName && <> · <span className="font-medium text-slate-700">{inv.targetPersonName}</span></>}
                {inv.targetSpotifyId && <> · <span className="text-amber-700">Spotify-claimed</span></>}
                {inv.targetIsGroup && <> · <span className="text-amber-700">group</span></>}
                {inv.createdByName && <> · invited by {inv.createdByName}</>}
                {inv.referrerKind === "manufacturer" && inv.invitingPressName && (
                  <> · <span className="text-[var(--brand-blue)] font-medium">via {inv.invitingPressName}</span></>
                )}
              </div>
              {inv.referrerKind === "manufacturer" && inv.draftAlbumTitle && (
                <div className="text-xs text-slate-500 mt-0.5" data-testid={`text-review-draft-album-${inv.id}`}>
                  Draft album: <span className="font-medium text-slate-700">{inv.draftAlbumTitle}</span>
                </div>
              )}
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

// Task #1570 — Recent transactional-email send failures, read from the
// in-memory ring buffer in server/mail.ts. Super-admin only (the GET 403s
// for non-super, so this hides itself). Per-instance + per-environment:
// dev and prod keep separate Resend records, so this reflects only what
// THIS running process tried to send. Read-only; no mutation.
type MailFailureRow = { ts: string; template: string; recipientDomain: string; reason: string };
type MailHealthData = {
  status: "ok" | "degraded" | "down" | "unconfigured";
  resendConfigured: boolean;
  totalAttempts: number;
  totalFailures: number;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  recentFailureCount: number;
  windowMinutes: number;
  recentFailures: MailFailureRow[];
};

const MAIL_STATUS_BANNER: Record<MailHealthData["status"], { label: string; cls: string }> = {
  ok: { label: "Email delivery healthy", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  degraded: { label: "Email delivery degraded", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  down: { label: "Email delivery is DOWN", cls: "bg-rose-50 text-rose-800 border-rose-200" },
  unconfigured: { label: "Email not configured (dev)", cls: "bg-slate-50 text-slate-600 border-slate-200" },
};

function MailFailuresPanel() {
  const q = useQuery<MailHealthData>({
    queryKey: ["/api/admin/mail-health"],
    retry: false,
    refetchInterval: 30_000,
  });
  if (q.isError || q.isLoading || !q.data) return null;
  const h = q.data;
  const failures = h.recentFailures;
  const banner = MAIL_STATUS_BANNER[h.status];
  return (
    <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-5" data-testid="panel-mail-failures">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-slate-900">Email delivery</h2>
        <button
          type="button"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="p-2 rounded-md text-slate-400 hover:text-[var(--brand-blue)] hover:bg-slate-100 transition-colors"
          title="Refresh"
          aria-label="Refresh email health"
          data-testid="button-refresh-mail-failures"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <div
        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 mb-3 ${banner.cls}`}
        data-testid="banner-mail-health"
        data-status={h.status}
      >
        <span className="text-sm font-semibold">{banner.label}</span>
        <span className="text-xs opacity-80">
          {h.lastSuccessAt
            ? `Last sent ${new Date(h.lastSuccessAt).toLocaleString()}`
            : "No successful send this session"}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Transactional emails (invites, sign-in codes, receipts) this server tried and failed to send, newest first. Use the reason to fix the
        cause (e.g. verify the from-address / domain in Resend, or check that RESEND_API_KEY is set on the live host). A sustained outage also
        logs a <code className="text-slate-600">[mail-health]</code> line you can alert on. This data lives in memory for this environment only
        and clears on restart.
      </p>
      {h.consecutiveFailures > 0 && (
        <p className="text-xs text-rose-700 mb-3" data-testid="text-mail-consecutive-failures">
          {h.consecutiveFailures} send{h.consecutiveFailures === 1 ? "" : "s"} failed in a row · {h.recentFailureCount} in the last{" "}
          {h.windowMinutes} min.
        </p>
      )}
      {failures.length === 0 ? (
        <div className="text-sm text-slate-500" data-testid="empty-mail-failures">No send failures recorded.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {failures.slice().reverse().map((f, i) => (
            <li key={`${f.ts}-${i}`} className="py-2.5" data-testid={`row-mail-failure-${i}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-slate-900 text-sm truncate">
                  {f.template} <span className="text-slate-400 font-normal">→ @{f.recipientDomain}</span>
                </div>
                <div className="text-xs text-slate-400 flex-shrink-0">{new Date(f.ts).toLocaleString()}</div>
              </div>
              <div className="text-xs text-rose-700 break-words mt-0.5" data-testid={`text-mail-failure-reason-${i}`}>{f.reason}</div>
            </li>
          ))}
        </ul>
      )}
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
