import { useMemo, useState } from "react";
import { formatUsdCents } from "@shared/money";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Heart, Music as MusicIcon, Mail, Clock, UserPlus, Users, Trash2, Send, Copy, Check, ChevronDown } from "lucide-react";
import { DashboardPanel } from "@/components/partner/dashboard-controls";
import { OrganizationPeople } from "@/components/admin/OrganizationPeople";
import { PartnerDashboard } from "@/components/partner/PartnerDashboard";
import { NpoAlbumLedger } from "@/components/NpoAlbumLedger";
import { BuyerReport } from "@/components/partner/BuyerReport";
import { OperatorShell } from "@/components/operator/OperatorShell";
import { modulesForRole } from "@/components/operator/registry";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Task #78 — Non-profit partner shell. Task #545 extends it with the
// ambassador / staff / artist invite tree: NPO admins can mint
// ambassador & staff sub-role users plus invite artists directly, and
// sub-role users (`npo_ambassador`/`npo_staff`) see an "Invite an
// artist" CTA. The Tree tab (admin-only) visualises who invited whom.
type CallerCaps = {
  ok: boolean;
  isAdmin: boolean;
  subRole: "npo_ambassador" | "npo_staff" | null;
  canInviteAmbassadors: boolean;
  canInviteStaff: boolean;
  canInviteArtists: boolean;
  canViewTree: boolean;
};
type Me = {
  id: string; name: string; logoUrl: string | null; websiteUrl: string | null;
  caller: CallerCaps | null;
};
type Dashboard = {
  pendingCents: number;
  pendingCount: number;
  paidCents: number;
  artists: {
    id: string;
    name: string;
    photoUrl: string | null;
    status: "active" | "pending_invite";
    canInviteAmbassadors: boolean;
    albums: { id: string; title: string; coverUrl: string | null; paidUnits: number }[];
  }[];
  pendingInvites: { id: string; email: string; role: string; createdAt: string; expiresAt: string }[];
};
type TreeArtist = {
  id: string;
  personId: string | null;
  name: string;
  email: string;
  photoUrl: string | null;
  status: "accepted" | "pending";
  createdAt: string;
  expiresAt: string;
};
type TreeTeamNode =
  | {
      nodeKind: "user";
      id: string;
      name: string;
      email: string;
      subRole: "admin" | "ambassador" | "staff";
      joinedAt: string | null;
      artists: TreeArtist[];
    }
  | {
      nodeKind: "pending";
      id: string;
      inviteId: string;
      name: string;
      email: string;
      subRole: "ambassador" | "staff";
      createdAt: string;
      expiresAt: string;
      artists: TreeArtist[];
    };
type Tree = {
  npo: { id: string; name: string; logoUrl: string | null };
  team: TreeTeamNode[];
  orphanArtists: TreeArtist[];
};

const fmt = (c: number) => formatUsdCents(c);

const BASE_NPO_TABS = modulesForRole("non_profit") as ReadonlyArray<{ id: "dashboard" | "artists" | "buyers" | "invites"; label: string }>;
type NpoTabId = "dashboard" | "artists" | "buyers" | "invites" | "ledger" | "tree";


export function NonProfitDashboard() {
  const me = useQuery<Me>({ queryKey: ["/api/non-profit/me"] });
  const caps = me.data?.caller;
  const npoId = me.data?.id;
  const tabs = useMemo<ReadonlyArray<{ id: NpoTabId; label: string }>>(() => {
    const base: { id: NpoTabId; label: string }[] = BASE_NPO_TABS.map((t) => ({ id: t.id, label: t.label }));
    base.push({ id: "ledger", label: "Album ledger" });
    if (caps?.canViewTree) base.push({ id: "tree", label: "Team tree" });
    return base;
  }, [caps?.canViewTree]);
  const [tab, setTab] = useState<NpoTabId>("dashboard");

  if (me.error) {
    const msg = (me.error as any)?.message || "We couldn't load your non-profit scope.";
    return (
      <main className="min-h-screen bg-[color:var(--brand-bg)] text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center" data-testid="non-profit-gate">
          <h1 className="text-2xl font-bold mb-2">Non-profit dashboard</h1>
          <p className="text-white/60 text-sm">{msg}</p>
        </div>
      </main>
    );
  }

  const subRoleLabel =
    caps?.subRole === "npo_ambassador" ? "Ambassador" :
    caps?.subRole === "npo_staff" ? "Staff" : null;

  return (
    <OperatorShell
      testId="npo-shell"
      roleLabel={subRoleLabel ? `Non-profit dashboard · ${subRoleLabel}` : "Non-profit dashboard"}
      name={me.data?.name ?? "Loading…"}
      logoUrl={me.data?.logoUrl ?? null}
      fallbackIcon={Heart}
      maxWidth="5xl"
      subtitle={
        me.data?.websiteUrl ? (
          <a
            href={me.data.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
          >
            {me.data.websiteUrl.replace(/^https?:\/\//, "")}
          </a>
        ) : null
      }
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab as (id: string) => void}
    >
      {tab === "dashboard" && (
        <PartnerDashboard
          scope="npo"
          title={me.data?.name ?? "Your dashboard"}
          subtitle="Referred-artist activity and payout accrual"
        />
      )}
      {tab === "artists" && <ArtistsTab />}
      {tab === "buyers" && npoId && (
        <BuyerReport
          buyersUrl={`/api/non-profit/${npoId}/buyers`}
          mapUrl={`/api/non-profit/${npoId}/buyer-map`}
          emptyHint="No buyers have credited your foundation yet."
        />
      )}
      {tab === "invites" && <InvitesTab npoId={npoId} caps={caps ?? null} />}
      {tab === "ledger" && npoId && <NpoAlbumLedger npoId={npoId} />}
      {tab === "tree" && npoId && caps?.canViewTree && <TreeTab npoId={npoId} />}
    </OperatorShell>
  );
}

function ArtistsTab() {
  const dash = useQuery<Dashboard>({ queryKey: ["/api/non-profit/dashboard"] });
  return (
    <>
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="npo-kpis">
        <Kpi label="Pending payout" value={fmt(dash.data?.pendingCents ?? 0)} sub={`${dash.data?.pendingCount ?? 0} unit${(dash.data?.pendingCount ?? 0) === 1 ? "" : "s"}`} testId="kpi-npo-pending" />
        <Kpi label="Paid out" value={fmt(dash.data?.paidCents ?? 0)} testId="kpi-npo-paid" />
        <Kpi label="Referred artists" value={String(dash.data?.artists.length ?? 0)} testId="kpi-npo-artists" />
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-white/85 mb-3">Your artists</h2>
        {dash.isLoading ? (
          <p className="py-8 text-center text-white/45 text-sm">Loading…</p>
        ) : (dash.data?.artists.length ?? 0) === 0 ? (
          <DashboardPanel className="p-8 text-center" padding="none" data-testid="empty-npo-artists">
            <Heart className="w-8 h-8 text-[color:var(--brand-pink)] mx-auto mb-3" />
            <p className="text-sm text-white/65">
              You haven't referred any artists yet. Use the Invites tab to send your first artist invite —
              you'll earn $1 on every paid unit they ship.
            </p>
          </DashboardPanel>
        ) : (
          <ul className="space-y-3" data-testid="list-npo-artists">
            {dash.data!.artists.map((a) => (
              <li key={a.id} data-testid={`row-npo-artist-${a.id}`}>
              <DashboardPanel>
                <div className="group/artist flex items-center gap-3 mb-3">
                  {a.photoUrl ? (
                    <img src={a.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-white/5" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{a.name}</p>
                    <p className="text-xs text-white/55">{a.albums.length} album{a.albums.length === 1 ? "" : "s"} listed</p>
                  </div>
                  {a.status === "active" && (
                    <AmbassadorChip personId={a.id} canInviteAmbassadors={a.canInviteAmbassadors} />
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs uppercase tracking-wider font-semibold ${
                      a.status === "active"
                        ? "bg-[color:var(--brand-mint)]/15 text-[color:var(--brand-mint)] ring-1 ring-[color:var(--brand-mint)]/30"
                        : "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30"
                    }`}
                    data-testid={`status-npo-artist-${a.id}`}
                  >
                    {a.status === "active" ? "Active" : "Pending invite"}
                  </span>
                  <Link href={`/artist/${a.id}`} className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors">View →</Link>
                </div>
                {a.albums.length > 0 && (
                  <ul className="divide-y divide-white/5">
                    {a.albums.map((al) => (
                      <li key={al.id} className="flex items-center gap-3 py-2" data-testid={`row-npo-album-${al.id}`}>
                        {al.coverUrl ? (
                          <img src={al.coverUrl} alt="" className="w-9 h-9 rounded object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded bg-white/5 flex items-center justify-center"><MusicIcon className="w-4 h-4 text-white/30" /></div>
                        )}
                        <p className="flex-1 min-w-0 text-sm truncate">{al.title}</p>
                        <span className="text-xs text-white/55 tabular-nums">
                          {al.paidUnits} paid · <span className="text-[color:var(--brand-mint)]">{fmt(al.paidUnits * 100)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </DashboardPanel>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function InvitesTab({ npoId, caps }: { npoId: string | undefined; caps: CallerCaps | null }) {
  const { toast } = useToast();
  const dash = useQuery<Dashboard>({ queryKey: ["/api/non-profit/dashboard"] });
  const items = dash.data?.pendingInvites ?? [];
  const [openKind, setOpenKind] = useState<null | "ambassador" | "staff" | "artist">(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const revoke = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!npoId) throw new Error("No NPO scope");
      await apiRequest("DELETE", `/api/non-profit/${npoId}/invites/${inviteId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-profit/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/non-profit", npoId, "tree"] });
      toast({ title: "Invite revoked" });
    },
    onError: (e: Error) => toast({ title: "Couldn't revoke", description: e.message, variant: "destructive" }),
  });
  const resend = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!npoId) throw new Error("No NPO scope");
      const r = await apiRequest("POST", `/api/non-profit/${npoId}/invites/${inviteId}/resend`, {});
      return r.json() as Promise<{ acceptUrl: string; emailDelivered: boolean }>;
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-profit/dashboard"] });
      setLastUrl(r.acceptUrl);
      toast({
        title: r.emailDelivered ? "Invite re-sent" : "Link refreshed",
        description: r.emailDelivered ? "Fresh link is in their inbox." : "Email didn't go through — copy the link below.",
      });
    },
    onError: (e: Error) => toast({ title: "Couldn't resend", description: e.message, variant: "destructive" }),
  });

  if (!caps?.ok) {
    return <p className="py-8 text-center text-white/45 text-sm">Loading…</p>;
  }

  const ctas: { id: "ambassador" | "staff" | "artist"; label: string; enabled: boolean; testId: string }[] = [
    { id: "ambassador", label: "Invite ambassador", enabled: !!caps.canInviteAmbassadors, testId: "button-invite-ambassador" },
    { id: "staff", label: "Invite staff", enabled: !!caps.canInviteStaff, testId: "button-invite-staff" },
    { id: "artist", label: "Invite artist", enabled: !!caps.canInviteArtists, testId: "button-invite-artist" },
  ].filter((c) => c.enabled);

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {ctas.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { setOpenKind(c.id); setLastUrl(null); }}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand-blue)] hover:bg-[color:var(--brand-blue)]/85 px-3 py-2 text-sm font-semibold text-white transition-colors"
            data-testid={c.testId}
          >
            <UserPlus className="w-4 h-4" /> {c.label}
          </button>
        ))}
        {ctas.length === 0 && (
          <p className="text-xs text-white/55">Ask your NPO admin to grant invite permissions.</p>
        )}
      </div>

      {lastUrl && (
        <DashboardPanel className="mb-4 flex flex-wrap items-center gap-2 px-4 py-3 text-xs" padding="none" data-testid="invite-link-banner">
          <span className="text-white/55">Accept link:</span>
          <code className="flex-1 min-w-0 truncate font-mono text-white/85">{lastUrl}</code>
          <button
            type="button"
            onClick={async () => { await navigator.clipboard.writeText(lastUrl); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
            className="inline-flex items-center gap-1 rounded-md bg-white/10 hover:bg-white/15 px-2 py-1 font-semibold"
            data-testid="button-copy-invite-link"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </DashboardPanel>
      )}

      <h2 className="text-sm font-semibold text-white/85 mb-3">Outstanding invites</h2>
      {dash.isLoading ? (
        <p className="py-8 text-center text-white/45 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <DashboardPanel className="p-8 text-center" padding="none" data-testid="empty-npo-invites">
          <Mail className="w-8 h-8 text-white/30 mx-auto mb-3" />
          <p className="text-sm text-white/65">No outstanding ambassador / staff invites.</p>
        </DashboardPanel>
      ) : (
        <DashboardPanel as="ul" padding="none" className="divide-y divide-white/5" data-testid="list-npo-invites">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3 text-sm" data-testid={`row-npo-invite-${i.id}`}>
              <Mail className="w-4 h-4 text-white/45" />
              <span className="flex-1 min-w-0 truncate">
                {i.email}{" "}
                <span className="ml-2 text-xs uppercase tracking-wider text-white/55">{labelForRole(i.role)}</span>
              </span>
              <span className="text-xs text-white/55 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> expires {new Date(i.expiresAt).toLocaleDateString()}
              </span>
              {caps.isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => resend.mutate(i.id)}
                    disabled={resend.isPending}
                    className="inline-flex items-center gap-1 rounded-md bg-white/10 hover:bg-white/15 px-2 py-1 text-xs font-semibold disabled:opacity-50"
                    data-testid={`button-resend-invite-${i.id}`}
                  >
                    <Send className="w-3.5 h-3.5" /> Resend
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Revoke invite for ${i.email}?`)) revoke.mutate(i.id); }}
                    disabled={revoke.isPending}
                    className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 px-2 py-1 text-xs font-semibold disabled:opacity-50"
                    data-testid={`button-revoke-invite-${i.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Revoke
                  </button>
                </>
              )}
            </li>
          ))}
        </DashboardPanel>
      )}

      {openKind && npoId && (
        <InviteDialog
          npoId={npoId}
          kind={openKind}
          onClose={() => setOpenKind(null)}
          onSent={(url) => { setLastUrl(url); setOpenKind(null); }}
        />
      )}

      {/* Task #665 — Contacts parity with /admin/non-profits/:id. Same
          Add Admin / Ambassador dialog; server gates POSTs by
          invite_subusers on the caller, super-admins always pass.
          UI also hides "+ Add ▾" for staff/ambassador sub-roles via
          the can-invite probe so they don't see a button that 403s. */}
      {npoId && <NpoContactsPanel npoId={npoId} />}
    </section>
  );
}

function NpoContactsPanel({ npoId }: { npoId: string }) {
  const probe = useQuery<{ ok: boolean }>({
    queryKey: ["/api/admin/partner-contacts/can-invite", { entityKind: "non_profit", entityId: npoId }],
    queryFn: async () => {
      const r = await fetch(`/api/admin/partner-contacts/can-invite?entityKind=non_profit&entityId=${encodeURIComponent(npoId)}`, { credentials: "include" });
      if (!r.ok) return { ok: false };
      return r.json();
    },
  });
  return (
    <section className="mt-6 rounded-2xl bg-white/[0.04] p-1">
      <div className="bg-white rounded-2xl">
        <OrganizationPeople
          apiPath={`/api/non-profits/${npoId}/people`}
          testIdPrefix="npo-shell"
          entityKind="non_profit"
          entityId={npoId}
          entityName="this non-profit"
          title="Contacts"
          blurb="People who represent this non-profit. Add as many as you need."
          canInviteSubusers={probe.data?.ok === true}
        />
      </div>
    </section>
  );
}

function labelForRole(role: string): string {
  if (role === "non_profit") return "Ambassador / staff";
  if (role === "artist") return "Artist";
  return role;
}

function InviteDialog({
  npoId, kind, onClose, onSent,
}: {
  npoId: string;
  kind: "ambassador" | "staff" | "artist";
  onClose: () => void;
  onSent: (acceptUrl: string) => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/non-profit/${npoId}/invites`, {
        email: email.trim(),
        kind,
        name: name.trim() || null,
        welcomeNote: note.trim() || null,
      });
      return r.json() as Promise<{ acceptUrl: string; emailDelivered: boolean }>;
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-profit/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/non-profit", npoId, "tree"] });
      toast({
        title: r.emailDelivered ? "Invite sent" : "Invite created — email didn't deliver",
        description: r.emailDelivered ? "We emailed them the accept link." : "Copy the link and send it manually.",
      });
      onSent(r.acceptUrl);
    },
    onError: (e: Error) => toast({ title: "Couldn't send invite", description: e.message, variant: "destructive" }),
  });

  const title =
    kind === "ambassador" ? "Invite an ambassador"
      : kind === "staff" ? "Invite a staff member"
      : "Invite an artist";
  const blurb =
    kind === "ambassador"
      ? "Ambassadors can invite artists into your NPO's scope. They land on this dashboard and earn $1/unit credits stay with the NPO."
      : kind === "staff"
      ? "Staff can invite artists into your NPO's scope but don't take credits themselves."
      : "Send the artist an invite link. Once they accept, they show up in 'Your artists' and start earning your NPO $1 per paid unit.";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="dialog-npo-invite"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
        className="w-full max-w-md rounded-2xl bg-[color:var(--brand-bg)] border border-white/15 p-6 text-white"
      >
        <h3 className="text-lg font-bold mb-1">{title}</h3>
        <p className="text-xs text-white/60 mb-4">{blurb}</p>
        <label className="block text-xs uppercase tracking-wider text-white/55 mb-1 font-semibold">Email</label>
        <input
          type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className="w-full px-3 py-2 mb-3 rounded-lg bg-white/5 ring-1 ring-white/15 focus:ring-[color:var(--brand-blue)] focus:outline-none text-sm"
          data-testid="input-invite-email"
        />
        {kind === "artist" && (
          <>
            <label className="block text-xs uppercase tracking-wider text-white/55 mb-1 font-semibold">Artist name</label>
            <input
              type="text" value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Stage or band name (optional)"
              className="w-full px-3 py-2 mb-3 rounded-lg bg-white/5 ring-1 ring-white/15 focus:ring-[color:var(--brand-blue)] focus:outline-none text-sm"
              data-testid="input-invite-name"
            />
          </>
        )}
        {(kind === "ambassador" || kind === "staff") && (
          <>
            <label className="block text-xs uppercase tracking-wider text-white/55 mb-1 font-semibold">Name (optional)</label>
            <input
              type="text" value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Their name"
              className="w-full px-3 py-2 mb-3 rounded-lg bg-white/5 ring-1 ring-white/15 focus:ring-[color:var(--brand-blue)] focus:outline-none text-sm"
              data-testid="input-invite-name"
            />
          </>
        )}
        <label className="block text-xs uppercase tracking-wider text-white/55 mb-1 font-semibold">Welcome note (optional)</label>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)} rows={3}
          placeholder="A short note that ships in the invite email."
          className="w-full px-3 py-2 mb-4 rounded-lg bg-white/5 ring-1 ring-white/15 focus:ring-[color:var(--brand-blue)] focus:outline-none text-sm"
          data-testid="textarea-invite-note"
        />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-white/70 hover:text-white" data-testid="button-cancel-invite">
            Cancel
          </button>
          <button
            type="submit"
            disabled={m.isPending || !email.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand-blue)] hover:bg-[color:var(--brand-blue)]/85 disabled:opacity-50 px-3 py-2 text-sm font-semibold"
            data-testid="button-submit-invite"
          >
            <Send className="w-4 h-4" /> {m.isPending ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TreeTab({ npoId }: { npoId: string }) {
  const tree = useQuery<Tree>({ queryKey: ["/api/non-profit", npoId, "tree"] });
  if (tree.isLoading) {
    return <p className="py-8 text-center text-white/45 text-sm">Loading tree…</p>;
  }
  const data = tree.data;
  if (!data) return null;
  return (
    <section data-testid="npo-tree">
      <h2 className="text-sm font-semibold text-white/85 mb-3">Who invited whom</h2>
      <DashboardPanel className="p-5">
        <div className="flex items-center gap-3 mb-4">
          {data.npo.logoUrl ? (
            <img src={data.npo.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-white/10" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-[color:var(--brand-purple)]/30 flex items-center justify-center">
              <Heart className="w-5 h-5 text-[color:var(--brand-pink)]" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-white/55 font-semibold">Non-profit</p>
            <p className="font-semibold truncate">{data.npo.name}</p>
          </div>
        </div>
        {data.team.length === 0 ? (
          <p className="text-sm text-white/55">No teammates yet. Invite an ambassador or staff to grow the tree.</p>
        ) : (
          <ul className="space-y-3 border-l border-white/10 pl-4">
            {data.team.map((n) => (
              <TreeTeamNodeRow key={n.id} node={n} />
            ))}
          </ul>
        )}
        {data.orphanArtists.length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/10">
            <p className="text-xs uppercase tracking-wider text-white/55 font-semibold mb-2">Other referred artists</p>
            <ul className="space-y-1">
              {data.orphanArtists.map((a) => (
                <TreeArtistRow key={a.id} artist={a} />
              ))}
            </ul>
          </div>
        )}
      </DashboardPanel>
    </section>
  );
}

function TreeTeamNodeRow({ node }: { node: TreeTeamNode }) {
  const [open, setOpen] = useState(true);
  const badge =
    node.subRole === "admin" ? { bg: "bg-white/10", text: "text-white/85", label: "Admin" }
      : node.subRole === "ambassador" ? { bg: "bg-[color:var(--brand-mint)]/15", text: "text-[color:var(--brand-mint)]", label: "Ambassador" }
      : { bg: "bg-[color:var(--brand-blue)]/15", text: "text-[color:var(--brand-blue)]", label: "Staff" };
  return (
    <li data-testid={`tree-node-${node.id}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left hover:text-white/100 transition-colors"
      >
        <ChevronDown className={`w-4 h-4 text-white/45 transition-transform ${open ? "" : "-rotate-90"}`} />
        <Users className="w-4 h-4 text-white/55" />
        <span className="text-sm font-semibold truncate">{node.name}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs uppercase tracking-wider font-semibold ${badge.bg} ${badge.text}`}>
          {badge.label}
        </span>
        {node.nodeKind === "pending" && (
          <span className="text-xs uppercase tracking-wider text-amber-300/90">Pending</span>
        )}
        <span className="ml-auto text-xs text-white/55">
          {node.artists.length} artist{node.artists.length === 1 ? "" : "s"}
        </span>
      </button>
      {open && node.artists.length > 0 && (
        <ul className="mt-2 ml-6 space-y-1 border-l border-white/10 pl-3">
          {node.artists.map((a) => (
            <TreeArtistRow key={a.id} artist={a} />
          ))}
        </ul>
      )}
    </li>
  );
}

function TreeArtistRow({ artist }: { artist: TreeArtist }) {
  return (
    <li className="flex items-center gap-2 text-xs" data-testid={`tree-artist-${artist.id}`}>
      {artist.photoUrl ? (
        <img src={artist.photoUrl} alt="" className="w-6 h-6 rounded-md object-cover bg-white/5" />
      ) : (
        <div className="w-6 h-6 rounded-md bg-white/5" />
      )}
      <span className="truncate">{artist.name}</span>
      <span
        className={`px-1.5 py-0.5 rounded text-xs uppercase tracking-wider font-semibold ${
          artist.status === "accepted"
            ? "bg-[color:var(--brand-mint)]/15 text-[color:var(--brand-mint)]"
            : "bg-amber-500/15 text-amber-300"
        }`}
      >
        {artist.status === "accepted" ? "Active" : "Pending"}
      </span>
      {artist.status === "accepted" && artist.personId && (
        <Link href={`/artist/${artist.personId}`} className="ml-auto text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2">
          View →
        </Link>
      )}
    </li>
  );
}

// Task #355 — At-a-glance ambassador chip on the NPO artist row.
function AmbassadorChip({ personId, canInviteAmbassadors }: { personId: string; canInviteAmbassadors: boolean }) {
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: async (next: boolean) => {
      await apiRequest("PATCH", `/api/admin/people/${personId}/can-invite-ambassadors`, { enabled: next });
      return next;
    },
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-profit/dashboard"] });
      toast({ title: next ? "Promoted to ambassador" : "Ambassador verb removed" });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't update", description: e.message, variant: "destructive" });
    },
  });
  const on = canInviteAmbassadors;
  return (
    <button
      type="button"
      onClick={() => m.mutate(!on)}
      disabled={m.isPending}
      aria-pressed={on}
      title={on ? "Ambassador — can invite other artists. Click to revoke." : "Make ambassador — allow this artist to invite other artists."}
      className={[
        "inline-flex w-[20px] h-[20px] items-center justify-center rounded-[5px]",
        "font-mono text-xs font-bold leading-none transition-opacity",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)]/60 focus-visible:opacity-100",
        on
          ? "bg-[color:var(--brand-blue)] text-white"
          : "bg-white/10 text-white/55 ring-1 ring-inset ring-white/15 opacity-0 group-hover/artist:opacity-100",
        m.isPending && "opacity-60 cursor-wait",
      ].filter(Boolean).join(" ")}
      data-testid={`chip-npo-ambassador-${personId}`}
      data-state={on ? "on" : "off"}
      aria-label={on ? "Ambassador (click to revoke)" : "Make ambassador"}
    >
      A
    </button>
  );
}

function Kpi({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId: string }) {
  return (
    <DashboardPanel data-testid={testId}>
      <p className="text-xs uppercase tracking-wider text-white/55 font-semibold">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" data-testid={`${testId}-value`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-white/55">{sub}</p>}
    </DashboardPanel>
  );
}
