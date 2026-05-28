// Task #522 — Press portal (manufacturer admin shell).
//
// Four-tab dark partner shell for is_maker presses (Hellbender today,
// MRP / PMP next). Replaces the old vendor/services-only shell when
// the signed-in admin's role is `manufacturer`.
//
//   Dashboard   — reuses PartnerDashboard primitive scoped to the press.
//   Customers   — artists + labels homed to this press (defaultPressId),
//                 plus a grey-out queue for partners who just switched
//                 away (90-day window). "Invite an artist" launches a
//                 dialog that fires POST /api/press/:id/invite — the
//                 invitee's defaultPressId pins to this press on accept.
//   Pipeline    — Kanban-style columns derived from album state
//                 (invited → accepted → design → sunrise_set → selling →
//                 masters_triggered (post-approval) → locked →
//                 in_production → shipped). Each card carries the
//                 stage-specific CTA (upload invoice, mark masters
//                 triggered, send fulfillment heads-up).
//   Settings    — Profile / Staff / Catalog / Payouts / Notifications.
//                 Staff + Payouts re-mount the existing partner panels;
//                 Catalog deep-links into the existing manufacturer
//                 catalog editor under /admin/manufacturers/:id.

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Loader2, Factory, Users, GitBranch, Settings as Cog, Upload, ExternalLink, BellRing, Sparkles, ArrowRight, Send, X as XIcon, Link2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DashboardPanel } from "@/components/partner/dashboard-controls";
import { PartnerDashboard } from "@/components/partner/PartnerDashboard";
import { OperatorShell } from "@/components/operator/OperatorShell";
import { modulesForRole } from "@/components/operator/registry";
import { PartnerPermissionsPanel } from "@/components/admin/PartnerPermissionsPanel";
import { OrganizationPeople } from "@/components/admin/OrganizationPeople";
import { PressingOrderStepper } from "@/components/admin/PressingOrderFlow";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type TabId = "dashboard" | "customers" | "pipeline" | "settings";

interface MeRole { role: string; roleScopeId: string | null; }
interface PressMe {
  id: string;
  name: string;
  logoUrl: string | null;
  isMaker: boolean;
  websiteUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  location?: string | null;
  bio?: string | null;
}

const STAGE_DEFS: { id: string; label: string }[] = [
  { id: "invited",            label: "Invited" },
  { id: "accepted",           label: "Accepted" },
  { id: "design",             label: "Design" },
  { id: "sunrise_set",        label: "Sunrise set" },
  { id: "selling",            label: "Selling" },
  { id: "masters_triggered",  label: "Masters triggered" },
  { id: "locked",             label: "Locked" },
  { id: "in_production",      label: "In production" },
  { id: "shipped",            label: "Shipped" },
];

export function PressPortal({ pressId, isSuperAdminView }: { pressId: string; isSuperAdminView: boolean }) {
  const [tab, setTab] = useState<TabId>("dashboard");
  const { data: me, isLoading } = useQuery<PressMe>({
    queryKey: [`/api/press/${pressId}/me`],
  });

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[color:var(--brand-bg)] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[color:var(--brand-blue)] animate-spin" />
      </main>
    );
  }

  const tabs = modulesForRole("press") as ReadonlyArray<{ id: TabId; label: string }>;

  return (
    <OperatorShell
      testId="press-shell"
      roleLabel={isSuperAdminView ? "Press portal (super-admin view)" : "Press portal"}
      name={me?.name ?? "Your press"}
      logoUrl={me?.logoUrl ?? null}
      fallbackIcon={Factory}
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === "dashboard" && (
        <div className="space-y-4">
          <DashboardSummary pressId={pressId} />
          <PartnerDashboard
            scope="vendor"
            title="Jobs & turn-time"
            subtitle="The same operational dashboard the legacy vendor shell shows."
            scopeIdQs={isSuperAdminView ? pressId : null}
            scopeKindQs={isSuperAdminView ? "manufacturer" : null}
          />
        </div>
      )}
      {tab === "customers" && <CustomersTab pressId={pressId} />}
      {tab === "pipeline" && <PipelineTab pressId={pressId} />}
      {tab === "settings" && <SettingsTab pressId={pressId} pressName={me?.name ?? ""} />}
    </OperatorShell>
  );
}

// ─── Customers tab ──────────────────────────────────────────────────

interface CustomerRow {
  kind: "artist" | "label";
  id: string;
  name: string;
  photo: string | null;
  email?: string | null;
  joinedAt?: string | null;
  albumCount: number;
  lifetimeUnits: number;
  latestStage: string | null;
  state: "invited" | "accepted" | "active";
  // Only set on `state === "invited"` rows so the row can render
  // Resend / Revoke / Copy-link affordances.
  inviteId?: string;
  acceptUrl?: string;
  expiresAt?: string | null;
}
interface SwitchingRow { kind: "artist" | "label"; id: string; name: string; photo: string | null; switched_at: string; }

const STATE_PILL: Record<CustomerRow["state"], { label: string; cls: string }> = {
  invited:  { label: "Invited",  cls: "bg-white/10 text-white/70" },
  accepted: { label: "Accepted", cls: "bg-[color:var(--brand-blue)]/15 text-[color:var(--brand-blue)]" },
  active:   { label: "Active",   cls: "bg-[color:var(--brand-mint)]/20 text-[color:var(--brand-mint)]" },
};

const STAGE_LABEL: Record<string, string> = {
  design: "Design",
  sunrise_set: "Sunrise set",
  selling: "Selling",
  masters_triggered: "Masters triggered",
  locked: "Locked",
  in_production: "In production",
  shipped: "Shipped",
};

function CustomersTab({ pressId }: { pressId: string }) {
  const { data, isLoading } = useQuery<{ active: CustomerRow[]; switching: SwitchingRow[] }>({
    queryKey: [`/api/press/${pressId}/customers`],
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [drawerCust, setDrawerCust] = useState<CustomerRow | null>(null);
  if (isLoading) return <PanelLoading />;
  const active = data?.active ?? [];
  const switching = data?.switching ?? [];
  return (
    <div className="space-y-4">
      <DashboardPanel padding="md">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold">Customers</h2>
            <p className="text-white/55 text-sm mt-1">
              {active.length} artist{active.length === 1 ? "" : "s"} and labels —
              invited, accepted, and shipping.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="h-10 rounded-full bg-[color:var(--brand-mint)] text-[color:var(--brand-bg)] hover:brightness-95 font-semibold"
            data-testid="button-invite-artist"
          >
            <Sparkles className="w-4 h-4 mr-2" /> Invite an artist
          </Button>
        </div>
        {active.length === 0 ? (
          <EmptyHint text="No customers yet. Invite your first artist to get them onto GoodTunes." />
        ) : (
          <ul className="mt-4 divide-y divide-white/5" data-testid="list-customers-active">
            {active.map((c) => {
              const pill = STATE_PILL[c.state];
              return (
                <li
                  key={`${c.kind}-${c.id}-${c.state}`}
                  className="flex items-center gap-3 py-3 cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded-lg"
                  onClick={() => c.state !== "invited" && setDrawerCust(c)}
                  data-testid={`row-customer-${c.id}`}
                >
                  <Avatar src={c.photo} fallback={c.name} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate flex items-center gap-2" data-testid={`text-customer-${c.id}`}>
                      {c.name}
                      <span className={`text-xs uppercase tracking-wide rounded-full px-2 py-0.5 ${pill.cls}`} data-testid={`pill-state-${c.id}`}>
                        {pill.label}
                      </span>
                    </div>
                    <div className="text-white/55 text-xs">
                      {c.kind} · {c.albumCount} album{c.albumCount === 1 ? "" : "s"} · {c.lifetimeUnits} units lifetime
                      {c.latestStage && ` · ${STAGE_LABEL[c.latestStage] ?? c.latestStage}`}
                    </div>
                  </div>
                  {c.state === "invited" && c.inviteId && c.acceptUrl ? (
                    <InviteActions
                      pressId={pressId}
                      inviteId={c.inviteId}
                      acceptUrl={c.acceptUrl}
                    />
                  ) : (
                    <Link
                      href={c.kind === "artist" ? `/admin/people/${c.id}` : `/admin/labels/${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[color:var(--brand-blue)] text-xs font-semibold hover:underline"
                      data-testid={`link-customer-${c.id}`}
                    >
                      Open <ArrowRight className="inline w-3 h-3" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DashboardPanel>

      {switching.length > 0 && (
        <DashboardPanel padding="md">
          <h3 className="text-base font-semibold">Switching away</h3>
          <p className="text-white/55 text-sm mt-1">Recently re-homed to another press. Greyed out for 90 days, then they drop off.</p>
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="list-customers-switching">
            {switching.map((c) => (
              <li key={`${c.kind}-${c.id}-${c.switched_at}`} className="flex items-center gap-3 rounded-xl bg-white/[0.02] ring-1 ring-white/10 p-3 opacity-60">
                <Avatar src={c.photo} fallback={c.name} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="text-white/55 text-xs">Switched {new Date(c.switched_at).toLocaleDateString()}</div>
                </div>
              </li>
            ))}
          </ul>
        </DashboardPanel>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} pressId={pressId} />
      {drawerCust && (
        <CustomerDrawer
          pressId={pressId}
          cust={drawerCust}
          onClose={() => setDrawerCust(null)}
        />
      )}
    </div>
  );
}

function CustomerDrawer({ pressId, cust, onClose }: { pressId: string; cust: CustomerRow; onClose: () => void }) {
  const { data } = useQuery<{ albums: any[]; switchHistory: any[] }>({
    queryKey: [`/api/press/${pressId}/customers`, cust.kind, cust.id],
  });
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[color:var(--brand-bg)] text-white border border-white/10 max-w-lg" data-testid={`drawer-customer-${cust.id}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar src={cust.photo} fallback={cust.name} />
            <span className="truncate">{cust.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <h4 className="text-xs uppercase tracking-wider text-white/55 font-semibold mb-2">Albums on this press</h4>
            {(data?.albums ?? []).length === 0 ? (
              <p className="text-sm text-white/60">No albums yet.</p>
            ) : (
              <ul className="space-y-2" data-testid="list-drawer-albums">
                {(data?.albums ?? []).map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] ring-1 ring-white/10 p-2">
                    <div className="w-10 h-10 rounded bg-white/10 overflow-hidden flex-shrink-0">
                      {a.coverUrl && <img src={a.coverUrl} className="w-full h-full object-cover" alt="" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate text-sm">{a.title}</div>
                      <div className="text-xs text-white/55">{STAGE_LABEL[a.stage] ?? a.stage}</div>
                    </div>
                    <Link href={`/admin/albums/${a.id}`} className="text-[color:var(--brand-blue)] text-xs hover:underline">Open</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {(data?.switchHistory ?? []).length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-white/55 font-semibold mb-2">Press-switch history</h4>
              <ul className="space-y-1 text-sm">
                {(data?.switchHistory ?? []).map((h, i) => (
                  <li key={i} className="text-white/70">
                    {new Date(h.switched_at).toLocaleDateString()} — moved {h.from_press_id === pressId ? "away from us" : "to us"}
                    {h.reason ? ` · ${h.reason}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dashboard summary card (press-specific) ───────────────────────────

interface PressSummary {
  customerCount: number;
  pendingInvites: number;
  totalAlbums: number;
  unitsLast30d: number;
  unitsNext90d: number;
  byStage: Record<string, number>;
}

function DashboardSummary({ pressId }: { pressId: string }) {
  const { data, isLoading } = useQuery<PressSummary>({
    queryKey: [`/api/press/${pressId}/summary`],
  });
  if (isLoading) return <PanelLoading />;
  if (!data) return null;
  const kpis: Array<{ label: string; value: number; testId: string }> = [
    { label: "Customers", value: data.customerCount, testId: "kpi-customers" },
    { label: "Invites pending", value: data.pendingInvites, testId: "kpi-pending-invites" },
    { label: "Albums in pipeline", value: data.totalAlbums, testId: "kpi-total-albums" },
    { label: "Units · last 30 days", value: data.unitsLast30d, testId: "kpi-units-30d" },
    { label: "Units · next 90 days", value: data.unitsNext90d, testId: "kpi-units-90d" },
  ];
  const stageOrder = ["design","sunrise_set","selling","masters_triggered","locked","in_production","shipped"] as const;
  return (
    <div className="space-y-4">
      <DashboardPanel padding="md">
        <h2 className="text-lg font-semibold mb-3">Press at a glance</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {kpis.map((k) => (
            <div key={k.testId} className="rounded-xl bg-white/[0.03] ring-1 ring-white/10 p-3" data-testid={k.testId}>
              <div className="text-2xl font-bold">{k.value}</div>
              <div className="text-white/55 text-xs mt-1">{k.label}</div>
            </div>
          ))}
        </div>
      </DashboardPanel>
      <DashboardPanel padding="md">
        <h3 className="text-base font-semibold mb-3">By stage</h3>
        <div className="flex flex-wrap gap-2" data-testid="dashboard-by-stage">
          {stageOrder.map((s) => (
            <div key={s} className="rounded-lg bg-white/[0.04] ring-1 ring-white/10 px-3 py-2 text-sm" data-testid={`stage-count-${s}`}>
              <span className="font-semibold mr-2">{data.byStage[s] ?? 0}</span>
              <span className="text-white/55">{STAGE_LABEL[s]}</span>
            </div>
          ))}
        </div>
      </DashboardPanel>
    </div>
  );
}

function InviteDialog({ open, onOpenChange, pressId }: { open: boolean; onOpenChange: (o: boolean) => void; pressId: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"artist" | "label">("artist");
  const [welcomeNote, setWelcomeNote] = useState("");
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/press/${pressId}/invite`, {
        email, name, role, welcomeNote: welcomeNote || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Invite sent", description: `${email} will land in your Customers list when they accept.` });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/customers`] });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/pipeline`] });
      onOpenChange(false);
      setEmail(""); setName(""); setWelcomeNote("");
    },
    onError: (e: any) => {
      toast({ title: "Invite failed", description: e?.message ?? "Try again.", variant: "destructive" });
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white text-slate-900" data-testid="dialog-invite-artist">
        <DialogHeader>
          <DialogTitle>Invite an artist or label</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRole("artist")}
              className={`flex-1 h-9 rounded-md font-semibold text-sm ${role === "artist" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
              data-testid="button-role-artist"
            >Artist</button>
            <button
              type="button"
              onClick={() => setRole("label")}
              className={`flex-1 h-9 rounded-md font-semibold text-sm ${role === "label" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
              data-testid="button-role-label"
            >Label</button>
          </div>
          <Input
            placeholder={role === "artist" ? "Artist name" : "Label name"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="input-invite-name"
          />
          <Input
            placeholder="email@example.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="input-invite-email"
          />
          <Textarea
            placeholder="Optional welcome note"
            value={welcomeNote}
            onChange={(e) => setWelcomeNote(e.target.value)}
            rows={3}
            data-testid="input-invite-note"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9">Cancel</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || !email || !name}
            className="h-9 bg-slate-900 text-white hover:bg-slate-800"
            data-testid="button-send-invite"
          >
            {m.isPending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pipeline tab ──────────────────────────────────────────────────

interface PipelineAlbum {
  id: string; title: string; coverUrl: string | null; format: string;
  ownerName: string; ownerId: string; ownerKind: "artist" | "label";
  stage: string;
  stageEnteredAt: string | null;
  lockedAt: string | null;
  sunriseDate: string | null;
  windowOpensAt: string | null;
  windowClosesAt: string | null;
  mastersTriggeredAt: string | null;
  mastersApprovedByArtistAt: string | null;
  pressInvoiceUrl: string | null;
  pressInvoiceTotalCents: number | null;
  pressInvoiceUploadedAt: string | null;
  pressInvoiceOutsideSystem: boolean;
  pressInvoiceTransferId: string | null;
  pressInvoiceTransferredAt: string | null;
  pressInvoiceTransferAmountCents: number | null;
  pressInvoiceTransferError: string | null;
  invoiceVarianceCents: number | null;
  invoiceVariancePct: number | null;
  invoiceVarianceTier: "ok" | "warn" | "flag" | null;
  shippedAt: string | null;
  fulfillmentHeadsUpSentAt: string | null;
  fulfillmentHeadsUpQty: number | null;
  lockedQuantity: number | null;
  lockedTotalCents: number | null;
  unitsSoldToDate: number;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d >= 1) return `${d}d ago`;
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h}h ago`;
  return "just now";
}
interface PipelineInvited { id: string; email: string; role: string; createdAt: string; expiresAt: string; acceptUrl: string; }

// Shared Resend / Revoke / Copy-link controls. Used by both the
// Customers tab (inline on "Invited" rows) and the Pipeline tab
// (inside the Invited-column cards). All mutations invalidate the
// two press-scoped lists that surface invites.
function InviteActions({
  pressId,
  inviteId,
  acceptUrl,
}: { pressId: string; inviteId: string; acceptUrl: string }) {
  const { toast } = useToast();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/customers`] });
    queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/pipeline`] });
    queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/summary`] });
  };
  const resend = useMutation({
    mutationFn: () => apiRequest("POST", `/api/press/${pressId}/invites/${inviteId}/resend`),
    onSuccess: () => { toast({ title: "Invite resent" }); invalidate(); },
    onError: (e: any) => toast({ title: "Resend failed", description: e?.message ?? "Try again.", variant: "destructive" }),
  });
  const revoke = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/press/${pressId}/invites/${inviteId}`),
    onSuccess: () => { toast({ title: "Invite revoked" }); invalidate(); },
    onError: (e: any) => toast({ title: "Revoke failed", description: e?.message ?? "Try again.", variant: "destructive" }),
  });
  const onCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(acceptUrl);
      toast({ title: "Link copied", description: "Paste it anywhere you want." });
    } catch {
      toast({ title: "Couldn't copy", description: acceptUrl, variant: "destructive" });
    }
  };
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <IconButton
        variant="ghost"
        label="Copy invite link"
        title="Copy invite link"
        onClick={onCopy}
        data-testid={`button-copy-invite-${inviteId}`}
      >
        <Link2 />
      </IconButton>
      <IconButton
        variant="ghost"
        label="Resend invite email"
        title="Resend invite email"
        onClick={() => resend.mutate()}
        disabled={resend.isPending}
        data-testid={`button-resend-invite-${inviteId}`}
      >
        {resend.isPending ? <Loader2 className="animate-spin" /> : <Send />}
      </IconButton>
      <IconButton
        variant="ghost"
        label="Revoke invite"
        title="Revoke invite"
        onClick={() => {
          if (window.confirm("Revoke this invite? The link will stop working.")) revoke.mutate();
        }}
        disabled={revoke.isPending}
        className="text-[color:var(--brand-heart)]"
        data-testid={`button-revoke-invite-${inviteId}`}
      >
        {revoke.isPending ? <Loader2 className="animate-spin" /> : <XIcon />}
      </IconButton>
    </div>
  );
}
interface PipelineAccepted { kind: "artist" | "label"; id: string; name: string; email: string | null; createdAt: string; }

function PipelineTab({ pressId }: { pressId: string }) {
  const { data, isLoading } = useQuery<{ albums: PipelineAlbum[]; invited: PipelineInvited[]; accepted?: PipelineAccepted[] }>({
    queryKey: [`/api/press/${pressId}/pipeline`],
  });
  if (isLoading) return <PanelLoading />;
  const albums = data?.albums ?? [];
  const invited = data?.invited ?? [];
  const accepted = data?.accepted ?? [];
  const byStage: Record<string, PipelineAlbum[]> = {};
  STAGE_DEFS.forEach((s) => { byStage[s.id] = []; });
  albums.forEach((a) => {
    if (!byStage[a.stage]) byStage[a.stage] = [];
    byStage[a.stage].push(a);
  });
  return (
    <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
      <div className="flex gap-3 min-w-max pb-4">
        {STAGE_DEFS.map((s) => {
          const rows = byStage[s.id] ?? [];
          const extraCount =
            s.id === "invited" ? invited.length
            : s.id === "accepted" ? accepted.length
            : 0;
          return (
            <div key={s.id} className="w-72 flex-shrink-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-white/85 text-sm font-semibold uppercase tracking-wide">{s.label}</h3>
                <span className="text-white/45 text-xs font-mono" data-testid={`text-stage-count-${s.id}`}>
                  {rows.length + extraCount}
                </span>
              </div>
              <div className="space-y-2 min-h-[80px]">
                {s.id === "invited" && invited.map((iv) => (
                  <DashboardPanel key={iv.id} padding="sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate" data-testid={`card-invite-${iv.id}`}>{iv.email}</div>
                        <div className="text-white/55 text-xs mt-1">Pending {iv.role}</div>
                      </div>
                      <InviteActions pressId={pressId} inviteId={iv.id} acceptUrl={iv.acceptUrl} />
                    </div>
                  </DashboardPanel>
                ))}
                {s.id === "accepted" && accepted.map((c) => (
                  <DashboardPanel key={`${c.kind}-${c.id}`} padding="sm">
                    <div className="text-sm font-semibold truncate" data-testid={`card-accepted-${c.kind}-${c.id}`}>{c.name}</div>
                    <div className="text-white/55 text-xs mt-1 capitalize">{c.kind} · no album yet</div>
                  </DashboardPanel>
                ))}
                {rows.map((a) => (
                  <PipelineCard key={a.id} a={a} pressId={pressId} />
                ))}
                {rows.length + extraCount === 0 && (
                  <div className="text-white/30 text-xs italic px-2 py-4 text-center">No albums</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineCard({ a, pressId }: { a: PipelineAlbum; pressId: string }) {
  const { toast } = useToast();
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [headsUpQty, setHeadsUpQty] = useState<string>("");

  const triggerMasters = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/press/${pressId}/albums/${a.id}/masters/triggered`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        const earm = body?.earmarkedCents != null ? `$${(body.earmarkedCents / 100).toFixed(0)}` : "?";
        const thr = body?.thresholdCents != null ? `$${(body.thresholdCents / 100).toFixed(0)}` : "?";
        throw new Error(`${body?.message ?? "Not ready"} (${earm} / ${thr} earmarked)`);
      }
      return r;
    },
    onSuccess: () => {
      toast({ title: "Masters trigger sent", description: "The artist is notified to approve the early start." });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/pipeline`] });
    },
    onError: (e: any) => toast({ title: "Trigger failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const sendHeadsUp = useMutation({
    mutationFn: () => apiRequest("POST", `/api/press/${pressId}/albums/${a.id}/fulfillment-heads-up`, { quantity: parseInt(headsUpQty || "0", 10) }),
    onSuccess: () => {
      toast({ title: "Fulfillment heads-up sent" });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/pipeline`] });
      setHeadsUpQty("");
    },
    onError: (e: any) => toast({ title: "Heads-up failed", description: e?.message ?? "", variant: "destructive" }),
  });

  // Per-stage metrics the press operator needs to see on the card
  // without drilling in. Aligns with what the legacy AdminAlbum stepper
  // shows further upstream — sunrise date locks the selling window,
  // units-sold-to-date is the live signed-cert count during selling,
  // and locked qty is the press's commitment from Locked on.
  const showSunrise = ["sunrise_set","selling","masters_triggered"].includes(a.stage);
  const showSold = ["selling","masters_triggered","locked","in_production","shipped"].includes(a.stage);
  const showLockedQty = ["locked","in_production","shipped"].includes(a.stage);

  return (
    <DashboardPanel padding="sm" data-testid={`card-pipeline-${a.id}`}>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className="w-full text-left"
        data-testid={`button-open-pipeline-${a.id}`}
      >
        <div className="flex gap-2">
          <div className="w-10 h-10 rounded bg-white/5 ring-1 ring-white/10 overflow-hidden flex-shrink-0">
            {a.coverUrl && <img src={a.coverUrl} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate" title={a.title}>{a.title}</div>
            <div className="text-white/55 text-xs truncate">{a.ownerName} · {a.format}</div>
          </div>
        </div>
      </button>
      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-white/55">
        {a.stageEnteredAt && (
          <div data-testid={`text-stage-entered-${a.id}`}>Stage: {timeAgo(a.stageEnteredAt)}</div>
        )}
        {showSunrise && a.sunriseDate && (
          <div data-testid={`text-sunrise-${a.id}`}>Sunrise {new Date(a.sunriseDate).toLocaleDateString()}</div>
        )}
        {showSold && (
          <div data-testid={`text-units-sold-${a.id}`}>{a.unitsSoldToDate} sold</div>
        )}
        {showLockedQty && a.lockedQuantity != null && (
          <div data-testid={`text-locked-qty-${a.id}`}>{a.lockedQuantity} locked</div>
        )}
      </div>
      <div className="mt-2 space-y-1.5">
        {a.stage === "selling" && (
          <Button
            type="button"
            size="sm"
            onClick={() => triggerMasters.mutate()}
            disabled={triggerMasters.isPending}
            className="w-full h-8 bg-[color:var(--brand-blue)] text-white hover:brightness-110 text-xs"
            data-testid={`button-trigger-masters-${a.id}`}
          >Trigger masters</Button>
        )}
        {a.stage === "masters_triggered" && (
          <div className="text-xs text-[color:var(--brand-mint)] font-semibold">Artist approved — cut masters</div>
        )}
        {/* Invoice capture is Locked-only per spec: an invoice marks
            the transition INTO In production, so it can't be uploaded
            before the preorder window has closed. */}
        {(a.stage === "locked" || a.stage === "in_production") && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setInvoiceOpen(true)}
            className="w-full h-8 text-xs bg-transparent text-white ring-1 ring-white/15 hover:bg-white/5 border-0"
            data-testid={`button-upload-invoice-${a.id}`}
          >
            <Upload className="w-3 h-3 mr-1.5" />
            {a.pressInvoiceUploadedAt ? "Update invoice" : "Upload invoice"}
          </Button>
        )}
        {a.pressInvoiceUrl && (
          <div className="flex items-center gap-2">
            <a href={a.pressInvoiceUrl} target="_blank" rel="noreferrer" className="text-xs text-[color:var(--brand-blue)] truncate hover:underline" data-testid={`link-invoice-${a.id}`}>
              <ExternalLink className="inline w-3 h-3 mr-1" />
              {a.pressInvoiceTotalCents != null ? `$${(a.pressInvoiceTotalCents / 100).toFixed(2)}` : "Invoice"}
            </a>
            {a.invoiceVarianceTier && a.invoiceVariancePct != null && (
              <span
                className={
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold " +
                  (a.invoiceVarianceTier === "flag"
                    ? "bg-[color:var(--brand-pink)]/20 text-[color:var(--brand-pink)] ring-1 ring-[color:var(--brand-pink)]/40"
                    : a.invoiceVarianceTier === "warn"
                      ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/30"
                      : "bg-[color:var(--brand-mint)]/15 text-[color:var(--brand-mint)] ring-1 ring-[color:var(--brand-mint)]/30")
                }
                data-testid={`badge-variance-${a.id}`}
                title={`Variance vs locked quote: ${a.invoiceVarianceCents! >= 0 ? "+" : ""}$${(a.invoiceVarianceCents! / 100).toFixed(2)}`}
              >
                {(a.invoiceVarianceCents! >= 0 ? "+" : "−")}
                {(a.invoiceVariancePct * 100).toFixed(0)}%
              </span>
            )}
          </div>
        )}
        {a.pressInvoiceOutsideSystem && (
          <div className="text-xs text-white/55 italic">Billed outside the system</div>
        )}
        {/* Task #527 — Stripe transfer status. Mint happens on invoice
            POST; chip reflects last-known state from the pipeline read. */}
        {a.pressInvoiceTransferId && a.pressInvoiceTransferAmountCents != null && (
          <div className="text-xs text-[color:var(--brand-mint)]" data-testid={`text-transfer-status-${a.id}`}>
            ✓ Earmarked ${(a.pressInvoiceTransferAmountCents / 100).toFixed(2)} to your Stripe
          </div>
        )}
        {!a.pressInvoiceTransferId && a.pressInvoiceTransferError && !a.pressInvoiceOutsideSystem && (
          <div className="text-xs text-[color:var(--brand-pink)]" data-testid={`text-transfer-error-${a.id}`}>
            Transfer pending: {a.pressInvoiceTransferError}
          </div>
        )}
        {a.stage === "locked" && !a.fulfillmentHeadsUpSentAt && (
          <div className="flex gap-1">
            <Input
              type="number"
              placeholder="Qty"
              value={headsUpQty}
              onChange={(e) => setHeadsUpQty(e.target.value)}
              className="h-8 bg-white/5 border-white/10 text-white text-xs"
              data-testid={`input-heads-up-qty-${a.id}`}
            />
            <Button
              type="button"
              size="sm"
              onClick={() => sendHeadsUp.mutate()}
              disabled={!headsUpQty || sendHeadsUp.isPending}
              className="h-8 bg-white/10 text-white hover:bg-white/15 text-xs"
              data-testid={`button-heads-up-${a.id}`}
            ><BellRing className="w-3 h-3" /></Button>
          </div>
        )}
        {a.fulfillmentHeadsUpSentAt && (
          <div className="text-xs text-white/55">
            Heads-up sent · {a.fulfillmentHeadsUpQty ?? "?"} units
          </div>
        )}
      </div>
      <InvoiceDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} pressId={pressId} albumId={a.id} />
      {detailOpen && (
        <PipelineDetailDialog
          album={a}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </DashboardPanel>
  );
}

function PipelineDetailDialog({ album, onClose }: { album: PipelineAlbum; onClose: () => void }) {
  // Reuses the canonical PressingOrderStepper that AdminAlbum embeds
  // upstream — same component, same SKUs query — so the press operator
  // sees the exact stage/preflight UI the artist's own admin sees.
  const { data: albumSkus } = useQuery<{ skus: any[]; addons: any[] }>({
    queryKey: ["/api/admin/albums", album.id, "skus"],
  });
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white text-slate-900 max-w-2xl max-h-[85vh] overflow-y-auto" data-testid={`dialog-pipeline-detail-${album.id}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-slate-100 overflow-hidden">
              {album.coverUrl && <img src={album.coverUrl} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0">
              <div className="truncate">{album.title}</div>
              <div className="text-xs text-slate-500 font-normal truncate">{album.ownerName} · {album.format}</div>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500 font-semibold uppercase">Stage</div>
              <div className="font-semibold">{STAGE_LABEL[album.stage] ?? album.stage}</div>
              {album.stageEnteredAt && (
                <div className="text-xs text-slate-500 mt-0.5">Entered {timeAgo(album.stageEnteredAt)}</div>
              )}
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500 font-semibold uppercase">Sunrise</div>
              <div className="font-semibold">{album.sunriseDate ? new Date(album.sunriseDate).toLocaleDateString() : "—"}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500 font-semibold uppercase">Units sold</div>
              <div className="font-semibold">{album.unitsSoldToDate}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500 font-semibold uppercase">Locked qty</div>
              <div className="font-semibold">{album.lockedQuantity ?? "—"}</div>
            </div>
          </div>
          <PressingOrderStepper albumId={album.id} skus={(albumSkus?.skus ?? []) as any} />
          <div className="text-right">
            <Link
              href={`/admin/albums/${album.id}`}
              className="text-sm text-[color:var(--brand-blue)] font-semibold hover:underline"
              data-testid={`link-album-full-${album.id}`}
              onClick={onClose}
            >
              Open full album admin <ArrowRight className="inline w-3 h-3" />
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({ open, onOpenChange, pressId, albumId }: { open: boolean; onOpenChange: (o: boolean) => void; pressId: string; albumId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [totalDollars, setTotalDollars] = useState("");
  const [note, setNote] = useState("");
  const [outside, setOutside] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  // Two-step upload: (1) ask server for a signed PUT url under
  // /press-invoices/<albumId>-<uuid>.pdf, (2) stream the PDF to GCS,
  // (3) POST the resulting /objects/press-invoices/<id>.pdf URL +
  // totalCents to /invoice. Mirrors the standard upload pattern used
  // for album art and avatars — no separate codepath, just a different
  // namespace under PRIVATE_OBJECT_DIR.
  const submit = async () => {
    try {
      if (outside) {
        await apiRequest("POST", `/api/press/${pressId}/albums/${albumId}/invoice`, {
          note: note || undefined,
          outsideSystem: true,
        });
      } else {
        if (!file) {
          toast({ title: "Pick a PDF first", variant: "destructive" });
          return;
        }
        if (file.type && file.type !== "application/pdf") {
          toast({ title: "PDF only", description: "Invoice must be a PDF.", variant: "destructive" });
          return;
        }
        const cents = Math.round(parseFloat(totalDollars || "0") * 100);
        if (!cents || cents <= 0) {
          toast({ title: "Enter the invoice total", variant: "destructive" });
          return;
        }
        setUploading(true);
        const signRes = await apiRequest("POST", `/api/press/${pressId}/albums/${albumId}/invoice/upload-url`, {});
        const { uploadUrl, publicUrl } = await signRes.json();
        if (!uploadUrl || !publicUrl) throw new Error("No signed upload URL");
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: file,
        });
        if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
        await apiRequest("POST", `/api/press/${pressId}/albums/${albumId}/invoice`, {
          url: publicUrl,
          totalCents: cents,
          note: note || undefined,
        });
      }
      toast({ title: "Invoice captured" });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/pipeline`] });
      onOpenChange(false);
      setFile(null); setTotalDollars(""); setNote(""); setOutside(false);
    } catch (e: any) {
      toast({ title: "Capture failed", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white text-slate-900">
        <DialogHeader><DialogTitle>Capture press invoice</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={outside} onChange={(e) => setOutside(e.target.checked)} data-testid="checkbox-outside-system" />
            Billed outside GoodTunes (no PDF to upload)
          </label>
          {!outside && (
            <>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Invoice PDF</label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-900 file:text-white file:text-sm file:font-semibold"
                  data-testid="input-invoice-file"
                />
                {file && <p className="text-xs text-slate-500">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
              </div>
              <Input placeholder="Invoice total in dollars" type="number" step="0.01" value={totalDollars} onChange={(e) => setTotalDollars(e.target.value)} data-testid="input-invoice-total" />
            </>
          )}
          <Textarea placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9">Cancel</Button>
          <Button onClick={submit} disabled={uploading} className="h-9 bg-slate-900 text-white hover:bg-slate-800" data-testid="button-save-invoice">
            {uploading ? "Uploading…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Settings tab ─────────────────────────────────────────────────

function SettingsTab({ pressId, pressName }: { pressId: string; pressName: string }) {
  const [sub, setSub] = useState<"profile" | "staff" | "catalog" | "payouts" | "notifications">("profile");
  const subTabs = [
    { id: "profile" as const, label: "Profile" },
    { id: "staff" as const, label: "Staff" },
    { id: "catalog" as const, label: "Catalog" },
    { id: "payouts" as const, label: "Payouts" },
    { id: "notifications" as const, label: "Notifications" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-white/10">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            className={`h-10 px-3 text-sm font-semibold whitespace-nowrap border-b-2 ${sub === t.id ? "border-[color:var(--brand-mint)] text-white" : "border-transparent text-white/55 hover:text-white"}`}
            data-testid={`tab-settings-${t.id}`}
          >{t.label}</button>
        ))}
      </div>
      {sub === "profile" && <ProfileSubTab pressId={pressId} />}
      {sub === "staff" && (
        <div className="space-y-4">
          {/* Task #665 — same Contacts panel admins see on
              /admin/manufacturers/:id. Server gates POSTs by
              invite_subusers on the caller; super-admins always pass. */}
          <DashboardPanel padding="md">
            <PressContactsPanel pressId={pressId} pressName={pressName} />
          </DashboardPanel>
          <DashboardPanel padding="md">
            <PartnerPermissionsPanel scopeKind="manufacturer" scopeId={pressId} scopeName={pressName} />
          </DashboardPanel>
        </div>
      )}
      {sub === "catalog" && (
        <DashboardPanel padding="md">
          <p className="text-sm text-white/75">Edit your formats, color tiers, and per-quantity ladders — including the new <strong>masters-prep cost</strong> per tier.</p>
          <Link
            href={`/admin/manufacturers/${pressId}?tab=catalog`}
            className="mt-3 inline-flex items-center gap-1 h-9 px-4 rounded-full bg-white/10 text-white text-sm font-semibold hover:bg-white/15"
            data-testid="link-catalog-editor"
          >Open catalog editor <ExternalLink className="w-3 h-3" /></Link>
        </DashboardPanel>
      )}
      {sub === "payouts" && <PayoutsSubTab pressId={pressId} />}
      {sub === "notifications" && <NotificationsSubTab pressId={pressId} />}
    </div>
  );
}

function PressContactsPanel({ pressId, pressName }: { pressId: string; pressName: string }) {
  const probe = useQuery<{ ok: boolean }>({
    queryKey: ["/api/admin/partner-contacts/can-invite", { entityKind: "manufacturer", entityId: pressId }],
    queryFn: async () => {
      const r = await fetch(`/api/admin/partner-contacts/can-invite?entityKind=manufacturer&entityId=${encodeURIComponent(pressId)}`, { credentials: "include" });
      if (!r.ok) return { ok: false };
      return r.json();
    },
  });
  return (
    <OrganizationPeople
      apiPath={`/api/manufacturers/${pressId}/people`}
      testIdPrefix="press-shell"
      entityKind="manufacturer"
      entityId={pressId}
      entityName={pressName}
      title="Contacts"
      blurb="Invite teammates and partners to this press. We'll grant the role if they already have an admin account, otherwise we mint an invite link."
      canInviteSubusers={probe.data?.ok === true}
    />
  );
}

function ProfileSubTab({ pressId }: { pressId: string }) {
  const { data: me, isLoading } = useQuery<PressMe>({ queryKey: [`/api/press/${pressId}/me`] });
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  // Hydrate once when /me lands. Subsequent saves invalidate /me which
  // refires this effect — guarded by undefined check so user keystrokes
  // mid-edit aren't clobbered.
  useEffect(() => {
    if (!me) return;
    setName(me.name ?? "");
    setWebsiteUrl(me.websiteUrl ?? "");
    setContactEmail(me.contactEmail ?? "");
    setContactPhone(me.contactPhone ?? "");
    setLocation(me.location ?? "");
    setBio(me.bio ?? "");
    setLogoUrl(me.logoUrl ?? null);
  }, [me?.id]);

  const save = useMutation({
    mutationFn: (patch: Record<string, any>) => apiRequest("PATCH", `/api/press/${pressId}/profile`, patch),
    onSuccess: () => {
      toast({ title: "Profile saved" });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/me`] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? "", variant: "destructive" }),
  });

  async function pickLogo(file: File) {
    setUploadingLogo(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const r = await apiRequest("POST", `/api/press/${pressId}/profile/logo-url`, { ext });
      const { uploadUrl, publicUrl } = await r.json();
      await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "image/png" }, body: file });
      setLogoUrl(publicUrl);
      save.mutate({ logoUrl: publicUrl });
    } catch (e: any) {
      toast({ title: "Logo upload failed", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setUploadingLogo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (isLoading) return <PanelLoading />;
  return (
    <DashboardPanel padding="md">
      <h3 className="text-base font-semibold mb-3">Press profile</h3>
      <p className="text-xs text-white/55 mb-4">Public-facing details artists and labels see when picking a press, plus the contact info platform notifications route to.</p>
      <div className="space-y-4 max-w-xl">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-white/5 ring-1 ring-white/10 grid place-items-center">
            {logoUrl
              ? <img src={logoUrl} alt="" className="w-full h-full object-cover" data-testid="img-profile-logo" />
              : <span className="text-xs text-white/45">Logo</span>}
          </div>
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingLogo}
              className="h-9 bg-transparent text-white ring-1 ring-white/15 hover:bg-white/5 border-0 text-sm font-semibold"
              data-testid="button-upload-logo"
            >{uploadingLogo ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}</Button>
            {logoUrl && (
              <button
                type="button"
                onClick={() => { setLogoUrl(null); save.mutate({ logoUrl: null }); }}
                className="text-xs text-white/55 hover:text-[color:var(--brand-pink)] text-left"
                data-testid="button-remove-logo"
              >Remove logo</button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickLogo(f); }}
              data-testid="input-logo-file"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-white/55 uppercase tracking-wide">Press name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white/5 border-white/10 text-white mt-1" data-testid="input-profile-name" />
        </div>
        <div>
          <label className="text-xs text-white/55 uppercase tracking-wide">Public bio</label>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="What artists and labels should know about your plant…" className="bg-white/5 border-white/10 text-white mt-1" data-testid="input-profile-bio" />
        </div>
        <div>
          <label className="text-xs text-white/55 uppercase tracking-wide">Shipping address</label>
          <Textarea value={location} onChange={(e) => setLocation(e.target.value)} rows={2} placeholder="Street, city, state, ZIP — where masters & artwork get sent" className="bg-white/5 border-white/10 text-white mt-1" data-testid="input-profile-address" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-white/55 uppercase tracking-wide">Website</label>
            <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://…" className="bg-white/5 border-white/10 text-white mt-1" data-testid="input-profile-website" />
          </div>
          <div>
            <label className="text-xs text-white/55 uppercase tracking-wide">Contact email</label>
            <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" placeholder="orders@press.com" className="bg-white/5 border-white/10 text-white mt-1" data-testid="input-profile-email" />
          </div>
          <div>
            <label className="text-xs text-white/55 uppercase tracking-wide">Contact phone</label>
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="(555) 555-1234" className="bg-white/5 border-white/10 text-white mt-1" data-testid="input-profile-phone" />
          </div>
        </div>
        <Button
          onClick={() => save.mutate({ name, websiteUrl, contactEmail, contactPhone, location, bio })}
          disabled={save.isPending}
          className="h-9 bg-[color:var(--brand-mint)] text-[color:var(--brand-bg)] hover:brightness-95 font-semibold"
          data-testid="button-save-profile"
        >{save.isPending ? "Saving…" : "Save profile"}</Button>
      </div>
    </DashboardPanel>
  );
}

// Task #527 — Settings → Payouts subtab. Read-only roll-up of the
// press's Stripe Connect account state plus every captured invoice
// with its variance vs the locked quote and the Stripe transfer
// status. Connect onboarding stays on /admin/manufacturers/:id; this
// panel just surfaces the data so the press knows whether earmarks
// are landing.
type PayoutsResponse = {
  account: {
    id: string;
    stripeAccountId: string | null;
    payoutsEnabled: boolean;
    chargesEnabled: boolean;
    detailsSubmitted: boolean;
    lastSyncedAt: string | null;
  } | null;
  invoices: Array<{
    albumId: string;
    title: string;
    coverUrl: string | null;
    invoiceTotalCents: number | null;
    invoiceUploadedAt: string | null;
    outsideSystem: boolean;
    transferId: string | null;
    transferredAt: string | null;
    transferAmountCents: number | null;
    transferError: string | null;
    lockedTotalCents: number | null;
    varianceCents: number | null;
    variancePct: number | null;
    varianceTier: "ok" | "warn" | "flag" | null;
  }>;
};

function PayoutsSubTab({ pressId }: { pressId: string }) {
  const { data, isLoading } = useQuery<PayoutsResponse>({ queryKey: [`/api/press/${pressId}/payouts`] });
  if (isLoading) return <PanelLoading />;
  const acct = data?.account ?? null;
  const invoices = data?.invoices ?? [];
  return (
    <div className="space-y-4">
      <DashboardPanel padding="md">
        <h3 className="text-base font-semibold mb-2">Stripe payouts</h3>
        {acct?.stripeAccountId && acct.payoutsEnabled ? (
          <div className="text-sm text-[color:var(--brand-mint)]" data-testid="text-payouts-enabled">
            ✓ Connected — invoice captures earmark to your Stripe account automatically.
          </div>
        ) : acct?.stripeAccountId ? (
          <div className="text-sm text-amber-300" data-testid="text-payouts-pending">
            Stripe account connected but not yet payouts-enabled. Finish onboarding to receive earmarks.
          </div>
        ) : (
          <div className="text-sm text-white/75" data-testid="text-payouts-missing">
            No Stripe Connect account yet. Captured invoices won't be earmarked until you connect one.
          </div>
        )}
        <Link
          href={`/admin/manufacturers/${pressId}?tab=payouts`}
          className="mt-3 inline-flex items-center gap-1 h-9 px-4 rounded-full bg-white/10 text-white text-sm font-semibold hover:bg-white/15"
          data-testid="link-payouts-editor"
        >Open payouts <ExternalLink className="w-3 h-3" /></Link>
      </DashboardPanel>

      <DashboardPanel padding="md">
        <h3 className="text-base font-semibold mb-3">Recent invoice captures</h3>
        {invoices.length === 0 ? (
          <p className="text-sm text-white/55">No invoices captured yet.</p>
        ) : (
          <div className="divide-y divide-white/10">
            {invoices.map((inv) => (
              <div key={inv.albumId} className="py-2 flex items-start gap-3" data-testid={`row-payout-invoice-${inv.albumId}`}>
                {inv.coverUrl && <img src={inv.coverUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{inv.title}</div>
                  <div className="text-xs text-white/55 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {inv.outsideSystem ? (
                      <span className="italic">Billed outside the system</span>
                    ) : (
                      <>
                        {inv.invoiceTotalCents != null && (
                          <span>Invoice ${(inv.invoiceTotalCents / 100).toFixed(2)}</span>
                        )}
                        {inv.lockedTotalCents != null && (
                          <span>Quote ${(inv.lockedTotalCents / 100).toFixed(2)}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {inv.varianceTier && inv.variancePct != null && (
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold " +
                        (inv.varianceTier === "flag"
                          ? "bg-[color:var(--brand-pink)]/20 text-[color:var(--brand-pink)] ring-1 ring-[color:var(--brand-pink)]/40"
                          : inv.varianceTier === "warn"
                            ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/30"
                            : "bg-[color:var(--brand-mint)]/15 text-[color:var(--brand-mint)] ring-1 ring-[color:var(--brand-mint)]/30")
                      }
                      data-testid={`badge-payout-variance-${inv.albumId}`}
                      title={`Variance vs locked quote: ${(inv.varianceCents ?? 0) >= 0 ? "+" : ""}$${((inv.varianceCents ?? 0) / 100).toFixed(2)}`}
                    >
                      {(inv.varianceCents ?? 0) >= 0 ? "+" : "−"}{(inv.variancePct * 100).toFixed(0)}%
                    </span>
                  )}
                  {inv.transferId && inv.transferAmountCents != null ? (
                    <span className="text-xs text-[color:var(--brand-mint)]" data-testid={`text-payout-transferred-${inv.albumId}`}>
                      ✓ ${(inv.transferAmountCents / 100).toFixed(2)} earmarked
                    </span>
                  ) : inv.outsideSystem ? (
                    <span className="text-xs text-white/55">No transfer</span>
                  ) : inv.transferError ? (
                    <span className="text-xs text-[color:var(--brand-pink)]" data-testid={`text-payout-error-${inv.albumId}`}>{inv.transferError}</span>
                  ) : (
                    <span className="text-xs text-white/55">Pending</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardPanel>
    </div>
  );
}

function NotificationsSubTab({ pressId }: { pressId: string }) {
  const { data: me, isLoading } = useQuery<PressMe>({ queryKey: [`/api/press/${pressId}/me`] });
  const [recipient, setRecipient] = useState("");
  const { toast } = useToast();
  useEffect(() => { if (me) setRecipient(me.contactEmail ?? ""); }, [me?.id]);
  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/press/${pressId}/profile`, { contactEmail: recipient || null }),
    onSuccess: () => {
      toast({ title: "Recipient saved" });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/me`] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? "", variant: "destructive" }),
  });
  if (isLoading) return <PanelLoading />;
  return (
    <DashboardPanel padding="md">
      <h3 className="text-base font-semibold mb-3">Notifications</h3>
      <div className="space-y-4 max-w-md">
        <div>
          <label className="text-xs text-white/55 uppercase tracking-wide">Pipeline alerts recipient</label>
          <Input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            type="email"
            placeholder="ops@press.com"
            className="bg-white/5 border-white/10 text-white mt-1"
            data-testid="input-notifications-recipient"
          />
          <p className="text-xs text-white/55 mt-1.5">Used as the From-reply for masters-ready emails artists receive about your plant. Save here also updates the profile contact email.</p>
        </div>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="h-9 bg-[color:var(--brand-mint)] text-[color:var(--brand-bg)] hover:brightness-95 font-semibold"
          data-testid="button-save-notifications"
        >{save.isPending ? "Saving…" : "Save"}</Button>
        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-semibold mb-1">How automatic alerts fire</h4>
          <ul className="text-xs text-white/65 space-y-1 list-disc pl-4">
            <li>Masters-ready: emailed to the album's artist when earmarked preorders cross your masters-prep threshold.</li>
            <li>Fulfillment heads-up: sent to your platform fulfillment partner when an album enters Locked, and re-fires only on &gt;5% qty drift before In production.</li>
            <li>Invoice variance: variances over 10% vs the locked quote are flagged for admin review (logged with <code className="font-mono">[admin-alert]</code>).</li>
          </ul>
        </div>
      </div>
    </DashboardPanel>
  );
}

// ─── Shared bits ───────────────────────────────────────────────────

function PanelLoading() {
  return (
    <DashboardPanel padding="md" className="grid place-items-center min-h-[200px]">
      <Loader2 className="w-5 h-5 text-white/45 animate-spin" />
    </DashboardPanel>
  );
}
function EmptyHint({ text }: { text: string }) {
  return <div className="text-white/45 text-sm italic mt-4">{text}</div>;
}
function Avatar({ src, fallback }: { src: string | null; fallback: string }) {
  return (
    <div className="w-11 h-11 rounded-full bg-white/10 ring-1 ring-white/10 overflow-hidden flex items-center justify-center flex-shrink-0">
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : (
        <span className="text-white/55 text-sm font-semibold">{fallback.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}
// Keep Users/GitBranch/Cog imports referenced for future use (tab icons land in #523).
export const _iconRefs = { Users, GitBranch, Cog };

// Export so the InvoiceDialog is rendered when needed — but cards
// manage their own dialog state via local useState above, so this is
// a no-op re-export for clarity.
export { InvoiceDialog };
