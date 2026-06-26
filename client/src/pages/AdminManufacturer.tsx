import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatUsdCents } from "@shared/money";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Award,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  Disc,
  Disc3,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Factory,
  FileText,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  Truck,
  Upload,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { VinylPreview } from "@/components/VinylPreview";
import { resolveVinylColor, DEFAULT_JACKET_UPGRADE, type VinylColorOption } from "@shared/pressing";
import hellbenderPlaceholder from "@assets/Hellbender_1782351633843.svg";
import memphisPlaceholder from "@assets/Memphis_Record_Pressing_1782406023011.svg";
import virylPlaceholder from "@assets/Viryl_1782351633843.svg";
import pmpPlaceholder from "@assets/Pressing_Music_Business_1782351633843.svg";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { postAdminImage } from "@/lib/adminUpload";
import { invalidateAdminEntity } from "@/lib/adminEntityInvalidation";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AddressAutocompleteField } from "@/components/admin/AddressAutocompleteField";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { NotificationsCard, NotificationsBadge } from "@/components/admin/NotificationsCard";
import { PartnerPermissionsPanel } from "@/components/admin/PartnerPermissionsPanel";
import { AdminPartnerDashboard } from "@/components/admin/AdminPartnerDashboard";
import { PressLogoEditorDialog } from "@/components/admin/PressLogoEditorDialog";
import { OrganizationPeople } from "@/components/admin/OrganizationPeople";
import { PartnerCapabilitiesCard, PRESS_CAPABILITIES } from "@/components/admin/PartnerCapabilitiesCard";
import { Switch } from "@/components/ui/switch";
import { EntityAlbumsTab } from "@/components/admin/EntityAlbumsTab";
import { NewAlbumArtistDialog } from "@/components/admin/NewAlbumArtistDialog";
import { NewAlbumTitleDialog } from "@/components/admin/NewAlbumTitleDialog";
import { EntityAnalyticsTab } from "@/components/admin/EntityAnalyticsTab";
import { SaveLink, CardHeader, EditPencil } from "@/components/admin/EditCardChrome";
import { IconButton } from "@/components/ui/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { uploadAdminDoc, DOC_UPLOAD_ACCEPT } from "@/lib/adminUpload";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ALBUM_FORMATS, ALBUM_FORMAT_LABEL, type AlbumFormat, type Manufacturer, type FulfillmentPartner } from "@shared/schema";

// Virtual catalog tab type — physical AlbumFormat or the GoodDeeds printing editor.
type CatalogTab = AlbumFormat | "gooddeeds";

/**
 * Admin · Single manufacturer. Editable profile + specialties chips +
 * default fulfillment partner picker. The RFQ inbox surface lives here
 * once that UI ships in a follow-up; today the link to RFQs is implicit
 * via the route layer.
 */
// Task #533 — Gate #1. Super-admin-only standing consent that pool-funded
// early masters cuts may be auto-staged for albums homed to this press,
// plus a readout of how many of the press's albums currently have a pool
// building. GoodTunes fronts no capital — the toggle only authorizes the
// flow; the pool still has to cover each album's floor before anything
// reaches the review queue.
type EarlyCutPoolRow = {
  albumId: string;
  albumTitle: string;
  coverUrl: string | null;
  accruedCents: number;
  releasedCents: number;
  availableCents: number;
  artistConsentAt: string | null;
  mastersTriggeredAt: string | null;
};

function PressAutoTriggerConsentPanel({ m }: { m: Manufacturer }) {
  const { toast } = useToast();
  const consented = !!(m as any).autoTriggerConsentAt;
  // Per-album pool ledger across this press's albums (accrued > 0 only).
  const { data: pools = [], isLoading: poolsLoading } = useQuery<EarlyCutPoolRow[]>({
    queryKey: ["/api/admin/manufacturers", m.id, "early-cut-pools"],
    enabled: !!m.id,
  });
  const usd = (c: number) =>
    formatUsdCents(c, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const toggle = useMutation({
    mutationFn: async (consent: boolean) => {
      const r = await apiRequest("PATCH", `/api/admin/manufacturers/${m.id}/auto-trigger-consent`, { consent });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.message ?? "Couldn't update");
      }
    },
    onSuccess: () => {
      void invalidateAdminEntity(queryClient, "manufacturer", m.id);
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers", m.id] });
      toast({ title: "Auto-trigger consent updated" });
    },
    onError: (e: Error) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4" data-testid="panel-auto-trigger-consent">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Zap className={`w-4 h-4 ${consented ? "text-[var(--brand-blue)]" : "text-slate-400"}`} />
            Pool-funded early cut
          </div>
          <p className="text-slate-500 text-sm mt-1 max-w-xl">
            Allow GoodTunes to stage masters cuts early for this press's
            albums once their per-sale funding pool covers the minimum-run
            floor. Each cut still needs the artist's opt-in and your approval
            in the Early Cut Review queue — and no GoodTunes capital is ever
            fronted.
          </p>
          <div className="text-xs mt-2" data-testid="text-consent-state">
            {consented ? (
              <span className="text-emerald-700 font-medium">Consent on — early cuts can be staged.</span>
            ) : (
              <span className="text-slate-500">Consent off — pools still build, but no cut is ever staged.</span>
            )}
          </div>
        </div>
        <Switch
          checked={consented}
          disabled={toggle.isPending}
          onCheckedChange={(next) => toggle.mutate(next)}
          className="shrink-0 mt-0.5"
          data-testid="button-toggle-auto-trigger"
        />
      </div>

      {/* Per-album pool ledger: accrued / released / available across this
          press's albums that have a funding pool building. */}
      <div className="border-t border-slate-100 pt-3" data-testid="section-early-cut-pools">
        <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">Funding pools</div>
        {poolsLoading ? (
          <div className="text-xs text-slate-500" data-testid="text-pools-loading">Loading pools…</div>
        ) : pools.length === 0 ? (
          <div className="text-xs text-slate-500" data-testid="text-pools-empty">
            No albums are building a funding pool for this press yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {pools.map((p) => (
              <div
                key={p.albumId}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                data-testid={`row-pool-${p.albumId}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-900 truncate" data-testid={`text-pool-title-${p.albumId}`}>
                    {p.albumTitle}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    {p.mastersTriggeredAt ? (
                      <span className="text-emerald-700 font-medium">Cut staged</span>
                    ) : p.artistConsentAt ? (
                      <span>Artist opted in</span>
                    ) : (
                      <span>Awaiting artist opt-in</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-slate-900" data-testid={`text-pool-available-${p.albumId}`}>
                    {usd(p.availableCents)}
                  </div>
                  <div className="text-xs text-slate-400">
                    {usd(p.accruedCents)} in · {usd(p.releasedCents)} out
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminManufacturer() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { user, isLoading: authLoading } = useAuth();
  // Task #533 — Gate #1 toggle is super-admin only. Role lives server-side
  // (not on AuthUser), so resolve it via /api/me/role like other admin
  // surfaces that gate on super_admin.
  const { data: meRole } = useQuery<{ role: string }>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });
  const isSuperAdmin = meRole?.role === "super_admin";
  // Task #2044 — only real operators (super_admin/admin) can add an album
  // straight onto a press (auto-homed, no approval). Partner admins viewing
  // a press they belong to don't get the button (the server also gates it).
  const isOperator = meRole?.role === "super_admin" || meRole?.role === "admin";
  const [, params] = useRoute<{ id: string }>("/admin/manufacturers/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id ?? "";
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logoEditorOpen, setLogoEditorOpen] = useState(false);
  // Task #2044 — operator "Add album" two-step flow, mirroring AdminAlbums.
  const [artistDialogOpen, setArtistDialogOpen] = useState(false);
  const [titleDialogOpen, setTitleDialogOpen] = useState(false);
  const [pendingArtist, setPendingArtist] = useState<{ name: string; id: string } | null>(null);
  // Task #295 — Overview / People / Albums / Analytics parity with
  // the Maker template. Overview keeps the editable profile + press
  // catalog + permissions cards; the other three tabs are shared
  // components driven by `/api/admin/manufacturers/:id/...` endpoints.
  // Task #590 — Dashboard leads, Overview demoted to second. `?tab=` deep
  // links keep working; default lands on Dashboard.
  type ManufacturerTab = "dashboard" | "overview" | "people" | "albums" | "catalog" | "analytics";
  const MFR_TAB_KEYS: readonly ManufacturerTab[] = ["dashboard", "overview", "people", "albums", "catalog", "analytics"];
  const [tab, setTabState] = useState<ManufacturerTab>(() => {
    if (typeof window === "undefined") return "dashboard";
    const q = new URLSearchParams(window.location.search).get("tab");
    return (MFR_TAB_KEYS as readonly string[]).includes(q ?? "") ? (q as ManufacturerTab) : "dashboard";
  });
  const setTab = (next: ManufacturerTab) => {
    setTabState(next);
    try {
      const u = new URL(window.location.href);
      if (next === "dashboard") u.searchParams.delete("tab");
      else u.searchParams.set("tab", next);
      window.history.replaceState({}, "", u.toString());
    } catch {}
  };

  const { data: m, isLoading } = useQuery<Manufacturer>({
    queryKey: ["/api/manufacturers", id],
    enabled: !!user?.isAdmin && !!id,
  });
  const { data: partners = [] } = useQuery<FulfillmentPartner[]>({
    queryKey: ["/api/fulfillment-partners"],
    enabled: !!user?.isAdmin,
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<Manufacturer>) => {
      const r = await apiRequest("PUT", `/api/admin/manufacturers/${id}`, patch);
      return (await r.json()) as Manufacturer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers", id] });
      toast({ title: "Saved" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  // Task #2044 — operator "Add album" homed to this press. Reuses the
  // shared POST /api/admin/albums with an optional `pressId`, which the
  // server homes via a pressing_order_request (no approval — an operator
  // is trusted). Lands on the new draft's onboarding flow, same as the
  // global AdminAlbums create.
  const createAlbum = useMutation({
    mutationFn: async (args: { title: string; artist?: { name: string; id: string } }) => {
      const r = await apiRequest("POST", "/api/admin/albums", {
        title: args.title,
        artist: args.artist?.name || "Unknown artist",
        artwork: "/album-placeholder.svg",
        type: "LP",
        isGoodTunesRelease: true,
        isPrepping: true,
        primaryArtistId: args.artist?.id || null,
        pressId: id,
      });
      return (await r.json()) as { id: string };
    },
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/manufacturers/${id}/albums`] });
      navigate(`/admin/albums/${a.id}?onboarding=1`);
    },
    onError: (e: any) =>
      toast({ title: "Couldn't create album", description: e?.message || "Please try again.", variant: "destructive" }),
  });

  const rescrape = useMutation({
    mutationFn: async () => {
      if (!m?.websiteUrl) throw new Error("No website saved");
      const r = await apiRequest("POST", `/api/admin/manufacturers/scrape`, { url: m.websiteUrl });
      const scraped = (await r.json()) as {
        name: string | null;
        logoUrl: string | null;
        coverUrl: string | null;
        bio: string | null;
        location: string | null;
      };
      const patch: Partial<Manufacturer> = {};
      if (scraped.name) patch.name = scraped.name;
      if (scraped.logoUrl) patch.logoUrl = scraped.logoUrl;
      if (scraped.coverUrl) patch.coverUrl = scraped.coverUrl;
      if (scraped.bio) patch.bio = scraped.bio;
      if (scraped.location) patch.location = scraped.location;
      if (Object.keys(patch).length === 0) return null;
      const r2 = await apiRequest("PUT", `/api/admin/manufacturers/${id}`, patch);
      return (await r2.json()) as Manufacturer;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers", id] });
      toast({
        title: row ? "Refreshed from website" : "Nothing new to update",
      });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't re-scrape", description: e?.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      toast({ title: "Press deleted" });
      navigate("/admin/manufacturers");
    },
  });

  if (authLoading || isLoading) {
    return (
      <AdminFrame active="manufacturers">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }
  if (!user?.isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <p className="text-slate-500 text-sm">Admin only.</p>
      </main>
    );
  }
  if (!m) {
    return (
      <AdminFrame active="manufacturers">
        <div className="py-20 text-center">
          <h1 className="text-slate-900 text-lg font-semibold">Press not found</h1>
          <Link href="/admin/manufacturers" className="text-[var(--brand-blue)] text-sm hover:underline">
            Back to presses
          </Link>
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="manufacturers" contentWidth="narrow">
      <div className="space-y-6">
        {/* BREADCRUMB */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium">
          <Link href="/admin/manufacturers" className="hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors" data-testid="link-breadcrumb-presses">
            Presses
          </Link>
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">{m.name}</span>
        </div>

        {/* HEADER — logo tile + domain eyebrow + name + Visit link */}
        <div className="flex items-start gap-4 sm:gap-5">
          <button
            type="button"
            onClick={() => setLogoEditorOpen(true)}
            className={[
              "group relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden shadow-sm flex-shrink-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2",
              m.logoUrl ? "" : "bg-white ring-1 ring-slate-200",
            ].join(" ")}
            aria-label="Edit press logo"
            data-testid="button-edit-press-logo"
          >
            {m.logoUrl ? (
              <img
                src={m.logoUrl}
                alt={m.name}
                className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]"
                data-testid="img-press-logo"
              />
            ) : (
              <Factory className="w-10 h-10 text-slate-300" strokeWidth={1.5} />
            )}
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 group-focus-visible:bg-black/40 transition-colors" />
            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
              <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 inline-flex items-center justify-center shadow-lg ring-1 ring-black/5">
                <Pencil className="w-4 h-4" />
              </span>
            </span>
          </button>
          <PressLogoEditorDialog
            name={m.name}
            logoUrl={m.logoUrl}
            apiPath={`/api/admin/manufacturers/${m.id}`}
            open={logoEditorOpen}
            onOpenChange={setLogoEditorOpen}
            onInvalidate={() => {
              void invalidateAdminEntity(queryClient, "manufacturer", m.id);
            }}
            FallbackIcon={Factory}
            testIdPrefix="press"
          />
          <div className="flex-1 min-w-0">
            <h1
              className="text-slate-900 text-[26px] font-bold tracking-tight truncate"
              data-testid="heading-manufacturer-name"
            >
              {m.name}
            </h1>
            <div className="mt-1.5">
              <NotificationsBadge partnerKind="manufacturer" partnerId={m.id} onActivate={() => setTab("overview")} />
            </div>
            {(m.websiteUrl || m.domain) && (
              <a
                href={m.websiteUrl || `https://${m.domain}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--brand-blue)] hover:underline underline-offset-2"
                data-testid="link-press-website"
              >
                {(m.domain || m.websiteUrl).replace(/^https?:\/\//, "")}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* TAB BAR — Overview / People / Albums / Analytics; Refresh + Delete sit on the right. */}
        <div
          className="flex items-end justify-between gap-5 border-b border-slate-200"
          data-testid="tabs-admin-press"
        >
          <div className="flex items-center gap-5 overflow-x-auto min-w-0 scrollbar-hide">
            {([
              { key: "dashboard", label: "Dashboard" },
              { key: "overview", label: "Overview" },
              { key: "people", label: "People" },
              { key: "albums", label: "Albums" },
              { key: "catalog", label: "Catalog" },
              { key: "analytics", label: "Analytics" },
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={[
                  "relative pb-2.5 text-sm font-semibold whitespace-nowrap transition-colors",
                  tab === t.key
                    ? "text-slate-900"
                    : "text-slate-400 hover:text-slate-700",
                ].join(" ")}
                data-testid={`tab-${t.key}`}
              >
                {t.label}
                {tab === t.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--brand-blue)] rounded-full" />
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => rescrape.mutate()}
              disabled={!m.websiteUrl || rescrape.isPending}
              aria-label="Refresh from website"
              title={m.websiteUrl ? "Re-fetch logo, cover, and bio from the website" : "Add a website URL first"}
              className="group inline-flex items-center gap-1.5 h-7 px-1.5 mb-1 rounded-md text-slate-400 hover:text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/10 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40"
              data-testid="button-rescrape-manufacturer"
            >
              <span className="text-[12px] font-medium opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                {rescrape.isPending ? "Refreshing…" : "Refresh from website"}
              </span>
              <RefreshCw className={`w-3.5 h-3.5 ${rescrape.isPending ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={remove.isPending}
              aria-label="Delete press"
              className="group inline-flex items-center gap-1.5 h-7 px-1.5 mb-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              data-testid="button-delete-manufacturer"
            >
              <span className="text-[12px] font-medium opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                Delete
              </span>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {tab === "dashboard" && (
          <AdminPartnerDashboard
            scope="vendor"
            scopeKindQs="manufacturer"
            scopeIdQs={m.id}
            title={m.name}
            subtitle="Press dashboard"
          />
        )}

        {tab === "overview" && (
          <>
            <PressCapabilitiesCard
              m={m}
              onSave={(patch) => save.mutate(patch)}
              saving={save.isPending}
            />

            <PartnerProfileForm
              initial={m}
              partners={partners}
              onSave={(patch) => save.mutate(patch)}
              saving={save.isPending}
            />

            <PartnerPermissionsPanel
              scopeKind="manufacturer"
              scopeId={m.id}
              scopeName={m.name}
            />

            {isSuperAdmin && <PressAutoTriggerConsentPanel m={m} />}

            <NotificationsCard partnerKind="manufacturer" partnerId={m.id} partnerName={m.name} />

            <ReferralsPanel pressId={m.id} />
          </>
        )}
        {tab === "people" && (
          <OrganizationPeople
            apiPath={`/api/manufacturers/${m.id}/people`}
            testIdPrefix="press"
            entityKind="manufacturer"
            entityId={m.id}
            entityName={m.name}
            entityWebsiteUrl={m.websiteUrl ?? null}
            blurb="People at this plant — production manager, account rep, whoever you need to reach."
          />
        )}
        {tab === "albums" && (
          <div className="space-y-4">
            {isOperator && (
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  disabled={createAlbum.isPending}
                  onClick={() => { if (!createAlbum.isPending) setArtistDialogOpen(true); }}
                  className="px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="button-press-add-album"
                >
                  <Plus className="w-3 h-3" />
                  Add album
                </button>
              </div>
            )}
            <EntityAlbumsTab
              apiPath={`/api/admin/manufacturers/${m.id}/albums`}
              testIdPrefix="press"
              emptyHint="No pressing-order requests have resolved to this press yet."
            />
            <NewAlbumArtistDialog
              open={artistDialogOpen}
              onOpenChange={(next) => { if (createAlbum.isPending && !next) return; setArtistDialogOpen(next); }}
              busy={createAlbum.isPending}
              mode="album"
              onSelect={({ name, id: artistId }) => {
                if (createAlbum.isPending) return;
                setPendingArtist({ name, id: artistId });
                setArtistDialogOpen(false);
                setTitleDialogOpen(true);
              }}
              onSkip={() => {
                if (createAlbum.isPending) return;
                setPendingArtist(null);
                setArtistDialogOpen(false);
                setTitleDialogOpen(true);
              }}
            />
            <NewAlbumTitleDialog
              open={titleDialogOpen}
              onOpenChange={(next) => { if (createAlbum.isPending && !next) return; setTitleDialogOpen(next); }}
              artistName={pendingArtist?.name ?? null}
              busy={createAlbum.isPending}
              onSubmit={(title) => {
                if (createAlbum.isPending) return;
                createAlbum.mutate({ title, artist: pendingArtist ?? undefined });
              }}
            />
          </div>
        )}
        {tab === "catalog" && (
          <>
            {/* Task #631 — bio + turnaround surfaced above the catalog
                matrix so the operator can see at a glance what this
                press is for + how long it takes, before diving into
                the per-format ladders. */}
            {(m.bio || m.turnaroundWeeksMin != null || m.turnaroundWeeksMax != null) && (
              <div
                className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-4"
                data-testid="press-catalog-summary"
              >
                {m.bio && (
                  <p className="text-sm text-white/80" data-testid="text-press-bio">
                    {m.bio}
                  </p>
                )}
                {(m.turnaroundWeeksMin != null || m.turnaroundWeeksMax != null) && (
                  <p
                    className="mt-2 text-xs uppercase tracking-wide text-white/50"
                    data-testid="text-press-turnaround"
                  >
                    Turnaround:{" "}
                    {m.turnaroundWeeksMin != null && m.turnaroundWeeksMax != null
                      ? `${m.turnaroundWeeksMin}–${m.turnaroundWeeksMax} weeks`
                      : m.turnaroundWeeksMin != null
                      ? `${m.turnaroundWeeksMin}+ weeks`
                      : `up to ${m.turnaroundWeeksMax} weeks`}
                  </p>
                )}
              </div>
            )}
            <PressCatalogPanel
              pressId={id}
              pressDomain={m?.domain ?? null}
              placeholderUrl={m?.vinylPlaceholderUrl ?? null}
              pressLogoUrl={m?.logoUrl ?? null}
            />
          </>
        )}
        {tab === "analytics" && (
          <EntityAnalyticsTab
            apiPath={`/api/admin/manufacturers/${m.id}/analytics`}
            testIdPrefix="press"
          />
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this press?</AlertDialogTitle>
            <AlertDialogDescription>
              Open RFQs that invited this plant will keep their reply rows, but the plant won't
              appear in new RFQs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()} className="bg-rose-600 hover:bg-rose-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminFrame>
  );
}

// Task #916 / #2129 — capability selector. A single press can serve up to
// three capabilities (Vinyl / GoodDeeds / Fulfillment) and shows up in every
// matching list automatically. Each toggle AUTO-SAVES on flip (admin
// auto-save convention) via the same PUT used by the profile form; the last
// remaining capability can't be turned off (mirrors the DB CHECK + API guard).
// Renders the shared PartnerCapabilitiesCard in operator voice — the same
// card the press sees in its own portal, just third-person.
function PressCapabilitiesCard({
  m,
  onSave,
  saving,
}: {
  m: Manufacturer;
  onSave: (patch: Partial<Manufacturer>) => void;
  saving: boolean;
}) {
  return (
    <PartnerCapabilitiesCard
      viewer="operator"
      capabilities={PRESS_CAPABILITIES}
      values={m as unknown as Record<string, boolean>}
      saving={saving}
      guardNoun="capability"
      onToggle={(key, next) => onSave({ [key]: next } as Partial<Manufacturer>)}
    />
  );
}

function PartnerProfileForm({
  initial,
  partners,
  onSave,
  saving,
}: {
  initial: Manufacturer;
  partners: FulfillmentPartner[];
  onSave: (patch: Partial<Manufacturer>) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [domain, setDomain] = useState(initial.domain ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl ?? "");
  const [contactEmail, setContactEmail] = useState(initial.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(initial.contactPhone ?? "");
  const [location, setLocation] = useState(initial.location ?? "");
  // Task #489 — structured snapshot of the Location, written when the
  // admin accepts a Places suggestion. Left untouched on plain typing
  // so a tiny edit doesn't null out a previously-saved struct.
  const [locationAddress, setLocationAddress] = useState<any>(
    (initial as any).locationAddress ?? null,
  );
  const [bio, setBio] = useState(initial.bio ?? "");
  // Task #625 — short operational note for the press: quote
  // conditions, overrun tolerance, pricing rules. Free text. Lives
  // alongside Bio so a re-scrape can't clobber operator-entered
  // quote conditions.
  const [operationalNote, setOperationalNote] = useState(
    (initial as any).operationalNote ?? "",
  );
  // Task #363 — turnaround is captured as a week range. Pre-fill from
  // the legacy `turnaroundDays` (rounded to ±1 week) when min/max
  // weren't set, so legacy rows aren't blanked out on first edit.
  const derivedWeeks = (() => {
    if (initial.turnaroundWeeksMin != null || initial.turnaroundWeeksMax != null) {
      return {
        min: initial.turnaroundWeeksMin != null ? String(initial.turnaroundWeeksMin) : "",
        max: initial.turnaroundWeeksMax != null ? String(initial.turnaroundWeeksMax) : "",
      };
    }
    if (initial.turnaroundDays != null) {
      const w = Math.max(1, Math.round(initial.turnaroundDays / 7));
      return { min: String(Math.max(1, w - 1)), max: String(w + 1) };
    }
    return { min: "", max: "" };
  })();
  const [turnaroundWeeksMin, setTurnaroundWeeksMin] = useState(derivedWeeks.min);
  const [turnaroundWeeksMax, setTurnaroundWeeksMax] = useState(derivedWeeks.max);
  const [specialties, setSpecialties] = useState<string[]>(initial.specialties ?? []);
  const [specInput, setSpecInput] = useState("");
  const [defaultFp, setDefaultFp] = useState<string>(initial.defaultFulfillmentPartnerId ?? "");
  // Task #624 — broker / wholesale discount we've negotiated with this
  // press. Stored as a whole-number percentage 0–100. Internal only;
  // the artist-facing catalog price never changes — the discount
  // becomes GoodTunes platform margin at payout time.
  const [brokerDiscountPct, setBrokerDiscountPct] = useState<string>(
    String((initial as any).brokerDiscountPct ?? 0),
  );

  function addSpec() {
    const v = specInput.trim();
    if (!v || specialties.includes(v)) return;
    setSpecialties([...specialties, v]);
    setSpecInput("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name: name.trim(),
      domain: domain.trim() || null,
      websiteUrl: websiteUrl.trim() || null,
      contactEmail: contactEmail.trim() || null,
      contactPhone: contactPhone.trim() || null,
      location: location.trim() || null,
      // Task #489 — null the struct when the text is blanked; otherwise
      // pass whatever we have (a freshly-picked snapshot or the existing
      // one). The PUT route also re-nulls when text is empty.
      locationAddress: location.trim() === "" ? null : locationAddress,
      bio: bio.trim() || null,
      // Task #625 — null when blanked so the column doesn't carry
      // empty strings.
      operationalNote: operationalNote.trim() || null,
      turnaroundWeeksMin: turnaroundWeeksMin === "" ? null : Number(turnaroundWeeksMin),
      turnaroundWeeksMax: turnaroundWeeksMax === "" ? null : Number(turnaroundWeeksMax),
      specialties,
      defaultFulfillmentPartnerId: defaultFp || null,
      // Task #624 — clamp to 0–100; blank treated as 0.
      brokerDiscountPct: Math.max(0, Math.min(100, Number(brokerDiscountPct) || 0)),
    } as Partial<Manufacturer>);
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} data-testid="input-mfr-name" />
        </Field>
        <Field label="Location">
          <AddressAutocompleteField
            value={location}
            onChange={setLocation}
            onAddress={(snap) => {
              setLocation(snap.formatted || location);
              setLocationAddress({
                line1: snap.line1 || null,
                line2: snap.line2 || null,
                city: snap.city || null,
                state: snap.region || null,
                postalCode: snap.postalCode || null,
                country: snap.country || null,
              });
            }}
            placeholder="Berkeley, CA"
            testId="input-mfr-location"
          />
        </Field>
        <Field label="Website">
          <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className={INPUT} placeholder="https://example.com" data-testid="input-mfr-website" />
        </Field>
        <Field label="Domain">
          <input value={domain} onChange={(e) => setDomain(e.target.value)} className={INPUT} placeholder="example.com" data-testid="input-mfr-domain" />
        </Field>
        <Field label="Contact email">
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={INPUT} data-testid="input-mfr-contact-email" />
        </Field>
        <Field label="Contact phone">
          <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={INPUT} data-testid="input-mfr-contact-phone" />
        </Field>
        <Field label="Standard turnaround (weeks)">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={turnaroundWeeksMin}
              onChange={(e) => setTurnaroundWeeksMin(e.target.value)}
              className={INPUT + " w-20"}
              placeholder="12"
              aria-label="Min weeks"
              data-testid="input-mfr-turnaround-min"
            />
            <span className="text-slate-400 text-sm">to</span>
            <input
              type="number"
              min={0}
              value={turnaroundWeeksMax}
              onChange={(e) => setTurnaroundWeeksMax(e.target.value)}
              className={INPUT + " w-20"}
              placeholder="14"
              aria-label="Max weeks"
              data-testid="input-mfr-turnaround-max"
            />
            <span className="text-slate-500 text-sm">wks</span>
          </div>
        </Field>
      </div>

      <Field label="Bio">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className={INPUT + " min-h-[80px] py-2"}
          placeholder="What they're known for, capacity notes, MOQs…"
          data-testid="input-mfr-bio"
        />
      </Field>

      {/* Task #625 — operational / quote-conditions note. Free text,
          no enforcement; displayed on the press admin page so the
          operator sees overrun tolerance, retail-vs-cost rules, and
          quote expiry at a glance. */}
      <Field label="Operational note">
        <textarea
          value={operationalNote}
          onChange={(e) => setOperationalNote(e.target.value)}
          rows={3}
          className={INPUT + " min-h-[80px] py-2"}
          placeholder="Quote conditions, overrun tolerance, retail/cost rules, quote expiry…"
          data-testid="input-mfr-operational-note"
        />
      </Field>

      <Field label="Specialties">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {specialties.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-[var(--brand-blue)]/10 text-[#266a93] text-[11.5px] font-medium"
                data-testid={`chip-spec-${s}`}
              >
                {s}
                <button
                  type="button"
                  onClick={() => setSpecialties(specialties.filter((x) => x !== s))}
                  className="w-4 h-4 inline-flex items-center justify-center hover:bg-[var(--brand-blue)]/20 rounded"
                  aria-label={`Remove ${s}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={specInput}
              onChange={(e) => setSpecInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSpec();
                }
              }}
              className={INPUT}
              placeholder='e.g. "180g black", "splatter", "Direct Metal Mastering"'
              data-testid="input-mfr-spec-add"
            />
            <Button type="button" variant="ghost" onClick={addSpec}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Field>

      <Field label="Default fulfillment partner">
        <select
          value={defaultFp}
          onChange={(e) => setDefaultFp(e.target.value)}
          className={INPUT}
          data-testid="select-mfr-default-fp"
        >
          <option value="">— None —</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      {/* Task #624 — vendor-level broker discount. The artist-facing
          catalog price never shifts; this discount becomes GoodTunes
          margin at payout time. Snapshotted onto each SKU so a rate
          tweak doesn't retroactively rewrite finalised rows. */}
      <Field label="GoodTunes broker discount (%)">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={brokerDiscountPct}
              onChange={(e) => setBrokerDiscountPct(e.target.value)}
              className={INPUT + " w-24"}
              placeholder="0"
              aria-label="Broker discount percent"
              data-testid="input-mfr-broker-discount-pct"
            />
            <span className="text-slate-500 text-sm">%</span>
          </div>
          <p className="text-xs text-slate-500">
            GoodTunes' wholesale cut from this press. Never shown to the artist —
            their price ladder always displays the retail catalog number, and the
            discount becomes platform margin at payout.
          </p>
        </div>
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving} data-testid="button-save-manufacturer">
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

const INPUT =
  "w-full h-9 px-3 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:border-[var(--brand-blue)] bg-white";

// Task #218 + Task #467 — press catalog
// (formats → tiers → colors → (tier×jacket) quantity ladders).
type CatalogColor = {
  id: string;
  name: string;
  swatchHex: string | null;
  swatchImageUrl: string | null;
  position: number;
  // Task #668 — set when the row was created by the MRP color-library
  // importer. Used to flag "already imported" on subsequent runs.
  importSourceUrl: string | null;
};
type CatalogTier = {
  id: string;
  name: string;
  position: number;
  priceLadder: { qty: number; unitCents: number; confirmed?: boolean }[];
  laddersByJacket: Record<string, { qty: number; unitCents: number; confirmed?: boolean }[]>;
  colors: CatalogColor[];
};
type CatalogFormat = {
  format: AlbumFormat;
  position: number;
  tiers: CatalogTier[];
  // Task #1998 — format-specific default jacket resolved by the server.
  defaultJacketId: string | null;
};
type CatalogJacket = {
  id: string;
  name: string;
  position: number;
  isDefault: boolean;
  // Task #1998 — null = applies to all formats (back-compat).
  applicableFormats: string[] | null;
};
type Catalog = {
  formats: CatalogFormat[];
  jackets: CatalogJacket[];
  defaultJacketId: string | null;
};

const parseDollars = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};
const formatDollars = (c: number) => (c / 100).toFixed(2);

type InvitedArtist = {
  id: string;
  name: string;
  photoUrl: string | null;
  albumCount: number;
  paidUnits: number;
  albums: { id: string; title: string; artwork: string | null; paidUnits: number }[];
};

function ReferralsPanel({ pressId }: { pressId: string }) {
  // Same role gate as PressCatalogPanel — only super-admins or the press
  // itself ever pass the server check, so hide the card for org-admins
  // who would just see a 403.
  const { data: roleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
  });
  const canView =
    roleInfo?.role === "super_admin" ||
    roleInfo?.role === "admin" ||
    (roleInfo?.role === "manufacturer" && roleInfo?.roleScopeId === pressId);
  const isSuper = roleInfo?.role === "super_admin" || roleInfo?.role === "admin";

  const { data, isLoading } = useQuery<{ pressId: string; artists: InvitedArtist[] }>({
    queryKey: ["/api/press/invited-artists", { pressId }],
    queryFn: async () => {
      const qs = isSuper ? `?pressId=${encodeURIComponent(pressId)}` : "";
      const r = await fetch(`/api/press/invited-artists${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load referrals");
      return r.json();
    },
    enabled: !!pressId && !!canView,
  });

  if (roleInfo && !canView) return null;

  const artists = data?.artists ?? [];
  const totalPaidUnits = artists.reduce((acc, a) => acc + (a.paidUnits ?? 0), 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4" data-testid="panel-press-referrals">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Referrals</h2>
          <p className="text-sm text-slate-500 mt-1">
            Artists you've brought onto GoodTunes and the projects they've shipped. Paid units count
            every format unit sold on those projects — your pending referral credit accrues as those
            numbers grow.
          </p>
        </div>
        {!isLoading && artists.length > 0 && (
          <div className="flex-shrink-0 text-right" data-testid="text-referrals-total">
            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Paid units</div>
            <div className="text-slate-900 text-xl font-bold tabular-nums">{totalPaidUnits.toLocaleString()}</div>
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="text-slate-500 text-sm py-4">Loading…</div>
      ) : artists.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center" data-testid="empty-referrals">
          <UserPlus className="w-5 h-5 text-slate-300 mx-auto mb-2" strokeWidth={1.5} />
          <p className="text-sm text-slate-500">No artists invited yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {artists.map((a) => (
            <li key={a.id} className="py-3 first:pt-0 last:pb-0" data-testid={`row-referral-${a.id}`}>
              <div className="flex items-center gap-3">
                <Link href={`/admin/people/${a.id}`} className="w-9 h-9 rounded-full overflow-hidden bg-slate-100 ring-1 ring-slate-200 flex-shrink-0 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2" data-testid={`link-referral-artist-photo-${a.id}`}>
                  {a.photoUrl ? (
                    <img src={a.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full" />
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/people/${a.id}`} className="text-sm font-semibold text-slate-900 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors truncate block" data-testid={`link-referral-artist-${a.id}`}>
                    {a.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {a.albumCount} {a.albumCount === 1 ? "project" : "projects"} ·{" "}
                    <span className="tabular-nums">{a.paidUnits.toLocaleString()}</span>{" "}
                    paid {a.paidUnits === 1 ? "unit" : "units"}
                  </div>
                </div>
              </div>
              {a.albums.length > 0 && (
                <ul className="mt-2 ml-12 space-y-1">
                  {a.albums.map((al) => (
                    <li key={al.id} className="flex items-center justify-between gap-3 text-sm">
                      <Link href={`/admin/albums/${al.id}`} className="text-slate-700 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors truncate" data-testid={`link-referral-album-${al.id}`}>
                        {al.title}
                      </Link>
                      <span className="text-slate-500 tabular-nums flex-shrink-0" data-testid={`text-referral-album-units-${al.id}`}>
                        {al.paidUnits.toLocaleString()} {al.paidUnits === 1 ? "unit" : "units"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Press catalog (Task #467 rebuild) ──────────────────────────────
//
// Format toggles → per-format Tier dropdown (swatch chips with
// hover-edit) → per-press Jacket dropdown → (tier × jacket) quantity
// ladder table. Switching tiers or jackets inside a format swaps the
// ladder to that combo's saved values without losing local drafts for
// other combos. SellPanel still reads `tier.priceLadder` (default
// jacket's combo), so the public shape is unchanged.

// Task #686 — standard "gap" columns surfaced on every press's catalog
// so the operator gets prompted to quote the common run sizes. The real
// column list (see `columns` below) is this set ∪ every saved rung ∪ any
// "+ Add quantity" extras, so each press's *offered* quantities still
// derive from its confirmed rungs.
//
// Task #2114 — canonical run-quantity columns per Bill's redesign:
// 50 / 100 / 200 / 300 / 500 / 1000 / 2000 / 3000. The real column list
// (see `columns` below) is still this set ∪ every saved rung ∪ any
// "+ Add quantity" extras, so a press that priced an off-grid run keeps
// it. Whether a press actually OFFERS each column is the per-cell eye
// toggle (offered = a saved rung exists; not-offered = no rung).
const DEFAULT_QTY_COLUMNS = [50, 100, 200, 300, 500, 1000, 2000, 3000];

async function uploadSwatchImage(
  file: File,
  opts?: { cropToDisc?: boolean },
): Promise<{ url: string; maskApplied?: boolean }> {
  // Shared admin uploader handles the Bearer token, client-side downscaling,
  // and friendly error copy; the `mask: "disc"` flag triggers the server-side
  // vinyl-disc crop for color swatches.
  return postAdminImage(file, {
    mask: opts?.cropToDisc ? "disc" : undefined,
  });
}

// Task #669 — Hellbender color-library importer UI. Only mounted on
// the Hellbender press detail page. Opens a modal that previews every
// color tile on https://hellbendervinyl.com/pages/custom-vinyl, lets
// the admin remap the suggested target tier per row, deselect rows
// they don't want, and commit the curated set in one batch.
type ImportPreviewRow = {
  sourceUrl: string;
  name: string;
  imageUrl: string | null;
  targetTierId: string | null;
  action: "create" | "update_photo" | "already_imported" | "skip" | "error";
  existingColorId: string | null;
  error: string | null;
};
type ImportPreviewResponse = {
  indexUrl: string;
  tiers: Array<{ id: string; name: string; format: string }>;
  rows: ImportPreviewRow[];
};
type ImportCommitResult = {
  created: number;
  updated: number;
  failed: number;
  results: Array<{
    sourceUrl: string;
    name: string;
    ok: boolean;
    action: "created" | "updated" | "skipped";
    colorId: string | null;
    error: string | null;
  }>;
};

const ACTION_LABEL: Record<ImportPreviewRow["action"], string> = {
  create: "Create",
  update_photo: "Update photo",
  already_imported: "Already imported",
  skip: "Skip",
  error: "Error",
};

function HellbenderImportButton({
  pressId,
  catalog,
  onImported,
}: {
  pressId: string;
  catalog: Catalog | null;
  onImported: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [editedRows, setEditedRows] = useState<ImportPreviewRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);

  const previewMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/admin/manufacturers/${pressId}/catalog/import-hellbender/preview`,
        {},
      );
      return (await r.json()) as ImportPreviewResponse;
    },
    onSuccess: (d) => {
      setPreview(d);
      setEditedRows(d.rows);
      // Default selection: every "create" / "update_photo" row that has
      // an image. Skip "already_imported" and "error" rows so the admin
      // can re-import them deliberately by checking the box.
      const initial = new Set<string>();
      for (const r of d.rows) {
        if ((r.action === "create" || r.action === "update_photo") && r.imageUrl) {
          initial.add(r.sourceUrl);
        }
      }
      setSelected(initial);
    },
    onError: (e: any) => {
      toast({ title: "Preview failed", description: e?.message || "Unknown error", variant: "destructive" });
    },
  });

  const commitMut = useMutation({
    mutationFn: async () => {
      const rows = editedRows
        .filter((r) => selected.has(r.sourceUrl) && r.imageUrl && r.targetTierId)
        .map((r) => ({
          sourceUrl: r.sourceUrl,
          name: r.name,
          imageUrl: r.imageUrl!,
          targetTierId: r.targetTierId!,
        }));
      const r = await apiRequest(
        "POST",
        `/api/admin/manufacturers/${pressId}/catalog/import-hellbender/commit`,
        { rows },
      );
      return (await r.json()) as ImportCommitResult;
    },
    onSuccess: (d) => {
      setCommitResult(d);
      onImported();
      toast({
        title: "Import complete",
        description: `${d.created} created, ${d.updated} updated${d.failed ? `, ${d.failed} failed` : ""}.`,
      });
    },
    onError: (e: any) => {
      toast({ title: "Import failed", description: e?.message || "Unknown error", variant: "destructive" });
    },
  });

  const close = () => {
    setOpen(false);
    setPreview(null);
    setEditedRows([]);
    setSelected(new Set());
    setCommitResult(null);
  };

  const onOpen = () => {
    setOpen(true);
    setPreview(null);
    setEditedRows([]);
    setSelected(new Set());
    setCommitResult(null);
    previewMut.mutate();
  };

  const allTiers = preview?.tiers ?? [];
  const selectedCount = editedRows.filter(
    (r) => selected.has(r.sourceUrl) && r.imageUrl && r.targetTierId,
  ).length;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onOpen}
        className="shrink-0"
        data-testid="button-import-hellbender"
      >
        Import from Hellbender
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import colors from Hellbender</DialogTitle>
            <DialogDescription>
              Scrapes <span className="font-mono text-xs">hellbendervinyl.com/pages/custom-vinyl</span>{" "}
              for every color tile, runs each photo through the same disc mask used by the manual
              swatch uploader, and rehosts the result in our object storage. Re-runs update existing
              rows with a matching name instead of duplicating them.
            </DialogDescription>
          </DialogHeader>
          {previewMut.isPending && (
            <div className="py-8 text-center text-slate-500 text-sm" data-testid="text-import-preview-loading">
              Fetching Hellbender's catalog…
            </div>
          )}
          {commitResult && (
            <div className="space-y-2 py-4">
              <div className="text-sm" data-testid="text-import-result-summary">
                Created {commitResult.created} · Updated {commitResult.updated} · Failed{" "}
                {commitResult.failed}
              </div>
              {commitResult.results.some((r) => !r.ok) && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                  <div className="font-semibold mb-1">Failures</div>
                  <ul className="space-y-1">
                    {commitResult.results
                      .filter((r) => !r.ok)
                      .map((r) => (
                        <li key={r.sourceUrl} data-testid={`text-import-error-${r.sourceUrl}`}>
                          <span className="font-medium">{r.name}</span> — {r.error}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" onClick={close} data-testid="button-import-close">
                  Done
                </Button>
              </div>
            </div>
          )}
          {!previewMut.isPending && !commitResult && preview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-slate-500" data-testid="text-import-row-count">
                  Found {preview.rows.length} color tiles. {selectedCount} selected for import.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set<string>();
                      for (const r of editedRows) {
                        if (r.imageUrl && r.targetTierId) next.add(r.sourceUrl);
                      }
                      setSelected(next);
                    }}
                    className="text-xs text-[var(--brand-blue)] hover:underline underline-offset-2"
                    data-testid="button-import-select-all"
                  >
                    Select all eligible
                  </button>
                  <span className="text-xs text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="text-xs text-slate-500 hover:underline underline-offset-2"
                    data-testid="button-import-deselect-all"
                  >
                    Deselect all
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {editedRows.map((row, idx) => {
                  const isSelected = selected.has(row.sourceUrl);
                  const disabled = !row.imageUrl;
                  return (
                    <div
                      key={row.sourceUrl}
                      className="flex items-center gap-3 rounded-md border border-slate-200 p-2"
                      data-testid={`row-import-${row.sourceUrl}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={disabled}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(row.sourceUrl);
                          else next.delete(row.sourceUrl);
                          setSelected(next);
                        }}
                        data-testid={`checkbox-import-${row.sourceUrl}`}
                      />
                      <div className="h-12 w-12 shrink-0 rounded bg-slate-100 overflow-hidden">
                        {row.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.imageUrl}
                            alt={row.name}
                            className="h-full w-full object-cover"
                            data-testid={`img-import-${row.sourceUrl}`}
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">
                            no img
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => {
                            const next = [...editedRows];
                            next[idx] = { ...row, name: e.target.value };
                            setEditedRows(next);
                          }}
                          className="w-full h-7 px-2 text-sm font-medium text-slate-900 rounded border border-transparent hover:border-slate-200 focus:border-[var(--brand-blue)] focus:outline-none bg-transparent"
                          data-testid={`input-import-name-${row.sourceUrl}`}
                        />
                        <a
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-slate-500 hover:text-[var(--brand-blue)] truncate block px-2"
                        >
                          {row.sourceUrl.replace(/^https?:\/\//, "")}
                        </a>
                        {row.error && (
                          <div className="text-xs text-rose-600 mt-0.5">{row.error}</div>
                        )}
                      </div>
                      <select
                        value={row.targetTierId ?? ""}
                        onChange={(e) => {
                          const next = [...editedRows];
                          next[idx] = { ...row, targetTierId: e.target.value || null };
                          setEditedRows(next);
                        }}
                        className="h-8 text-xs rounded border border-slate-200 px-1 max-w-[160px]"
                        data-testid={`select-import-tier-${row.sourceUrl}`}
                      >
                        <option value="">— pick tier —</option>
                        {allTiers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.format} / {t.name}
                          </option>
                        ))}
                      </select>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                          row.action === "already_imported"
                            ? "bg-slate-100 text-slate-600"
                            : row.action === "error"
                            ? "bg-rose-100 text-rose-700"
                            : row.action === "update_photo"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                        data-testid={`badge-import-action-${row.sourceUrl}`}
                      >
                        {ACTION_LABEL[row.action]}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white">
                <Button
                  type="button"
                  variant="outline"
                  onClick={close}
                  data-testid="button-import-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => commitMut.mutate()}
                  disabled={commitMut.isPending || selectedCount === 0}
                  data-testid="button-import-commit"
                >
                  {commitMut.isPending ? "Importing…" : `Import ${selectedCount} color${selectedCount === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Task #668 — MRP color-library importer. Lives in PressCatalogPanel
// header so the operator (or a manufacturer-scoped admin) can pull the
// canonical MRP catalog from memphisrecordpressing.com/all-vinyl-colors/
// without hand-uploading every swatch. Server-side fetch is SSRF-
// guarded; commit runs the disc-mask pipeline + Object Storage upload.
const MRP_DOMAIN_CLIENT = "memphisrecordpressing.com";

// Task #2114 — per-press album-cover placeholder used as the live
// preview jacket art in the Catalog editor's Color Options. Keyed by
// the press's primary domain; falls back to null (VinylPreview's own
// gray jacket) for presses without a supplied placeholder.
const PRESS_PLACEHOLDER_BY_DOMAIN: Record<string, string> = {
  "hellbendervinyl.com": hellbenderPlaceholder,
  "memphisrecordpressing.com": memphisPlaceholder,
  "viryl.ca": virylPlaceholder,
  "physicalmusicproducts.com": pmpPlaceholder,
};
function pressPlaceholderArt(domain: string | null): string | null {
  if (!domain) return null;
  return PRESS_PLACEHOLDER_BY_DOMAIN[domain.toLowerCase().replace(/^www\./, "")] ?? null;
}

// Task #2114 — vinyl formats carry the Color Options section; CD and
// cassette do not (their print/sticker customization is a future add).
const VINYL_FORMATS: AlbumFormat[] = ["7_inch", "12_lp", "12_double"];
function isVinylFormat(f: AlbumFormat): boolean {
  return VINYL_FORMATS.includes(f);
}
function CassetteIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="16" cy="12" r="2" />
      <path d="M8 14h8" />
      <path d="M2 10h3M19 10h3" />
    </svg>
  );
}
// Disc size of a format (12" LP and 12" Double LP are both "12"; 7" is "7").
// Each vinyl format owns its OWN swatch set — we do NOT read 12" Double LP
// through 12" LP (see Task #2114 note in CatalogEditor). canonicalSwatchFormat
// is used ONLY by the additive per-swatch "Color applies to" toggle to pick the
// OTHER disc size's representative format when copying a color by name.
type DiscSize = "12" | "7";
function discSizeOf(f: AlbumFormat): DiscSize {
  return f === "7_inch" ? "7" : "12";
}
function canonicalSwatchFormat(size: DiscSize): AlbumFormat {
  return size === "7" ? "7_inch" : "12_lp";
}
type MrpPreviewItem = {
  code: string;
  prefix: string;
  name: string;
  sourceUrl: string;
  family: string;
  action: "create" | "update" | "imported";
  existingColorId: string | null;
};
type MrpPreviewGroup = {
  family: string;
  suggestedTierName: string | null;
  suggestedTierId: string | null;
  items: MrpPreviewItem[];
};
type MrpPreview = {
  sourceUrl: string;
  tiers: { id: string; name: string }[];
  groups: MrpPreviewGroup[];
};
type MrpCommitResult = {
  totals: { created: number; updated: number; skipped: number; failed: number };
  results: { code: string; status: "created" | "updated" | "skipped" | "failed"; colorId?: string; message?: string }[];
};

function MrpImportDialog({
  pressId,
  open,
  onOpenChange,
  onImported,
}: {
  pressId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<MrpPreview | null>(null);
  // Per-family tier picker. Keyed by family heading (e.g. "Translucent")
  // so MRP's own section labels — not our hardcoded code prefixes —
  // drive the layout.
  const [tierByFamily, setTierByFamily] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  // Per-row name override. Admins can rename a swatch before commit so
  // the catalog reads how they want it (e.g. trim "Pearl" off the
  // front of every Cream Blend) without having to revisit the row
  // afterwards. Empty/whitespace falls back to the parsed page name.
  const [nameByCode, setNameByCode] = useState<Record<string, string>>({});
  const [result, setResult] = useState<MrpCommitResult | null>(null);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setTierByFamily({});
      setSelected({});
      setNameByCode({});
      setResult(null);
    }
  }, [open]);

  const previewMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/manufacturers/${pressId}/catalog/mrp-import/preview`, {});
      return (await r.json()) as MrpPreview;
    },
    onSuccess: (p) => {
      setPreview(p);
      const tiers: Record<string, string> = {};
      const sel: Record<string, boolean> = {};
      const names: Record<string, string> = {};
      for (const g of p.groups) {
        if (g.suggestedTierId) tiers[g.family] = g.suggestedTierId;
        for (const it of g.items) {
          sel[it.code] = it.action !== "imported";
          names[it.code] = it.name;
        }
      }
      setTierByFamily(tiers);
      setSelected(sel);
      setNameByCode(names);
    },
    onError: (e: any) =>
      toast({ title: "Couldn't read MRP color page", description: e?.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (open && !preview && !previewMut.isPending) previewMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commitMut = useMutation({
    mutationFn: async () => {
      const items: { code: string; name: string; sourceUrl: string; tierId: string }[] = [];
      for (const g of preview?.groups ?? []) {
        const tierId = tierByFamily[g.family];
        if (!tierId) continue;
        for (const it of g.items) {
          if (!selected[it.code]) continue;
          if (it.action === "imported") continue;
          const editedName = (nameByCode[it.code] ?? it.name).trim() || it.name;
          items.push({ code: it.code, name: editedName, sourceUrl: it.sourceUrl, tierId });
        }
      }
      if (items.length === 0) throw new Error("Nothing selected to import");
      const r = await apiRequest("POST", `/api/admin/manufacturers/${pressId}/catalog/mrp-import/commit`, { items });
      return (await r.json()) as MrpCommitResult;
    },
    onSuccess: (res) => {
      setResult(res);
      onImported();
      const { created, updated, skipped, failed } = res.totals;
      toast({
        title: "MRP import complete",
        description: `${created} new · ${updated} updated · ${skipped} skipped · ${failed} failed`,
        variant: failed > 0 ? "destructive" : "default",
      });
    },
    onError: (e: any) =>
      toast({ title: "Import failed", description: e?.message, variant: "destructive" }),
  });

  const selectableCount = (preview?.groups ?? []).reduce(
    (acc, g) => acc + g.items.filter((it) => it.action !== "imported" && tierByFamily[g.family] && selected[it.code]).length,
    0,
  );
  const familySlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "family";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="dialog-mrp-import">
        <DialogHeader>
          <DialogTitle>Import colors from memphisrecordpressing.com</DialogTitle>
          <DialogDescription>
            Pulls the published <a href="https://memphisrecordpressing.com/all-vinyl-colors/" target="_blank" rel="noreferrer" className="text-[var(--brand-blue)] hover:underline underline-offset-2">all-vinyl-colors</a> page,
            groups tiles by MRP's own section headings (Translucent, Smoke Blends, …), and saves each
            swatch into the matching Vinyl tier. Rename any swatch in place before committing. Re-runs
            are safe — rows already imported show as "Already imported" and aren't touched (and
            existing names, hand-picked hex colors, and ladders are preserved on photo refreshes).
          </DialogDescription>
        </DialogHeader>

        {previewMut.isPending && (
          <div className="py-10 text-center text-sm text-slate-500">Reading MRP color page…</div>
        )}

        {preview && !result && (
          <div className="space-y-4">
            {preview.tiers.length === 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                This press has no Vinyl tiers yet. Add at least one tier (e.g. Translucent, Opaque) on
                the catalog editor below, then re-open this dialog.
              </div>
            )}
            {preview.groups.map((g) => {
              const slug = familySlug(g.family);
              const tierId = tierByFamily[g.family] ?? "";
              const groupItems = g.items;
              const selectableItems = groupItems.filter((it) => it.action !== "imported");
              const allSelected = selectableItems.length > 0 && selectableItems.every((it) => selected[it.code]);
              return (
                <div key={g.family} className="rounded-md border border-slate-200 p-3" data-testid={`mrp-group-${slug}`}>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {g.family} <span className="text-slate-400 font-normal">· {groupItems.length} colors</span>
                      </div>
                      {g.suggestedTierName && (
                        <div className="text-xs text-slate-500">Suggested tier: {g.suggestedTierName}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setSelected((s) => {
                              const next = { ...s };
                              for (const it of selectableItems) next[it.code] = v;
                              return next;
                            });
                          }}
                          data-testid={`mrp-group-toggle-${slug}`}
                        />
                        Select all
                      </label>
                      <select
                        value={tierId}
                        onChange={(e) => setTierByFamily((t) => ({ ...t, [g.family]: e.target.value }))}
                        className={INPUT + " w-auto min-w-[10rem]"}
                        data-testid={`mrp-tier-select-${slug}`}
                      >
                        <option value="">Skip (no tier)</option>
                        {preview.tiers.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {groupItems.map((it) => {
                      const disabled = it.action === "imported" || !tierId;
                      const checked = !disabled && !!selected[it.code];
                      const editedName = nameByCode[it.code] ?? it.name;
                      const renamed = editedName.trim() !== it.name.trim() && editedName.trim().length > 0;
                      return (
                        <li
                          key={it.code}
                          className={[
                            "flex items-start gap-2 rounded-md border p-2 text-xs",
                            disabled ? "border-slate-100 bg-slate-50/60 opacity-70" : "border-slate-200 bg-white",
                          ].join(" ")}
                          data-testid={`mrp-item-${it.code}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={(e) => setSelected((s) => ({ ...s, [it.code]: e.target.checked }))}
                            className="mt-1.5 flex-shrink-0"
                            data-testid={`mrp-item-toggle-${it.code}`}
                          />
                          <img
                            src={it.sourceUrl}
                            alt=""
                            className="w-9 h-9 rounded-full object-cover bg-slate-100 ring-1 ring-slate-200 flex-shrink-0 mt-0.5"
                            loading="lazy"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <input
                              type="text"
                              value={editedName}
                              disabled={disabled}
                              onChange={(e) => setNameByCode((n) => ({ ...n, [it.code]: e.target.value }))}
                              className="w-full h-7 px-2 rounded border border-slate-200 text-xs focus:outline-none focus:border-[var(--brand-blue)] bg-white disabled:bg-slate-50 disabled:text-slate-400"
                              placeholder={it.name}
                              data-testid={`mrp-item-name-${it.code}`}
                            />
                            <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                              <span>{it.code}</span>
                              <span>·</span>
                              <span className={
                                it.action === "imported" ? "text-emerald-600" :
                                it.action === "update" ? "text-amber-600" :
                                "text-slate-500"
                              }>
                                {it.action === "imported" ? "Already imported" : it.action === "update" ? "Update photo" : "Create"}
                              </span>
                              {renamed && (
                                <span className="text-[var(--brand-blue)]" data-testid={`mrp-item-renamed-${it.code}`}>· renamed</span>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {result && (
          <div className="space-y-3" data-testid="mrp-import-results">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <strong>{result.totals.created}</strong> created ·{" "}
              <strong>{result.totals.updated}</strong> updated ·{" "}
              <strong>{result.totals.skipped}</strong> skipped ·{" "}
              <strong className={result.totals.failed > 0 ? "text-rose-600" : ""}>{result.totals.failed}</strong> failed
            </div>
            {result.results.some((r) => r.status === "failed") && (
              <ul className="text-xs text-slate-600 space-y-1 max-h-40 overflow-y-auto">
                {result.results.filter((r) => r.status === "failed").map((r) => (
                  <li key={r.code}><strong>{r.code}</strong> — {r.message ?? "failed"}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-mrp-import-close">
            {result ? "Done" : "Cancel"}
          </Button>
          {preview && !result && (
            <Button
              onClick={() => commitMut.mutate()}
              disabled={commitMut.isPending || selectableCount === 0}
              data-testid="button-mrp-import-commit"
            >
              {commitMut.isPending ? "Importing…" : `Import ${selectableCount} ${selectableCount === 1 ? "color" : "colors"}`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Task #2116 — Catalog CSV: Upload & Export. One pair of header buttons:
// Export downloads the entire catalog as an editable CSV; Upload parses an
// edited CSV, validates every row, shows an added / updated / removed
// preview, then applies it transactionally on confirm. Round-trips
// cleanly — re-uploading an unchanged export reports no changes.
type CatalogCsvPlan = {
  errors: { rowNum: number; message: string }[];
  colorGroups: { added: string[]; removed: string[] };
  swatches: {
    added: { group: string; name: string }[];
    updated: { group: string; name: string }[];
    removed: { group: string; name: string }[];
  };
  prices: {
    added: { group: string; qty: number }[];
    updated: { group: string; qty: number }[];
    removed: { group: string; qty: number }[];
  };
  specs: {
    added: { key: string }[];
    updated: { key: string }[];
    removed: { key: string }[];
  };
  hasChanges: boolean;
};

function CatalogCsvPlanSection({
  title,
  added = [],
  updated = [],
  removed = [],
}: {
  title: string;
  added?: string[];
  updated?: string[];
  removed?: string[];
}) {
  if (added.length === 0 && updated.length === 0 && removed.length === 0) return null;
  const Row = ({ label, items, cls }: { label: string; items: string[]; cls: string }) =>
    items.length === 0 ? null : (
      <div className="text-xs leading-relaxed">
        <span className={"font-semibold " + cls}>
          {label} ({items.length}):
        </span>{" "}
        <span className="text-slate-600">
          {items.slice(0, 30).join(", ")}
          {items.length > 30 ? `, …+${items.length - 30}` : ""}
        </span>
      </div>
    );
  return (
    <div className="rounded-md border border-slate-200 p-3 space-y-1">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <Row label="Added" items={added} cls="text-emerald-700" />
      <Row label="Updated" items={updated} cls="text-blue-700" />
      <Row label="Removed" items={removed} cls="text-rose-700" />
    </div>
  );
}

function CatalogCsvButtons({
  pressId,
  pressName,
  onApplied,
}: {
  pressId: string;
  pressName: string | null;
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [plan, setPlan] = useState<CatalogCsvPlan | null>(null);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setCsv("");
      setFileName("");
      setPlan(null);
    }
  }, [open]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await apiRequest("GET", `/api/admin/manufacturers/${pressId}/catalog/csv/export`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = (pressName || "press").replace(/[^A-Za-z0-9_-]+/g, "-").toLowerCase();
      a.download = `catalog-${safe}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  const previewMut = useMutation({
    mutationFn: async (content: string) => {
      const r = await apiRequest(
        "POST",
        `/api/admin/manufacturers/${pressId}/catalog/csv/preview`,
        { csv: content },
      );
      return (await r.json()) as CatalogCsvPlan;
    },
    onSuccess: (p) => setPlan(p),
    onError: (e: any) =>
      toast({ title: "Couldn't read CSV", description: e?.message, variant: "destructive" }),
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/admin/manufacturers/${pressId}/catalog/csv/apply`,
        { csv },
      );
      return (await r.json()) as { ok: boolean; result: Record<string, number> };
    },
    onSuccess: (res) => {
      onApplied();
      setOpen(false);
      const r = res.result;
      toast({
        title: "Catalog updated",
        description: `${r.tiersCreated} groups added · ${r.swatchesCreated + r.swatchesUpdated} swatches written · ${r.laddersWritten} price ladders · ${r.specsUpserted} specs`,
      });
    },
    onError: (e: any) =>
      toast({ title: "Apply failed", description: e?.message, variant: "destructive" }),
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    // Drop any prior preview immediately so a stale plan can't keep "Apply"
    // enabled while the new file's preview is still loading.
    setPlan(null);
    setCsv("");
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      setCsv(content);
      previewMut.mutate(content);
    };
    reader.readAsText(f);
    e.target.value = "";
  }

  const errs = plan?.errors ?? [];
  // Apply only the plan currently shown: gate on a settled preview for the
  // loaded CSV, never a leftover plan from a previous file.
  const canApply =
    !!plan &&
    !!csv &&
    errs.length === 0 &&
    plan.hasChanges &&
    !previewMut.isPending &&
    !applyMut.isPending;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-shrink-0"
            data-testid="button-catalog-csv-options"
          >
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            CSV Options
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onSelect={handleExport}
            disabled={exporting}
            data-testid="button-catalog-csv-export"
          >
            <Download className="w-4 h-4 mr-2" />
            {exporting ? "Exporting…" : "Export CSV"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setOpen(true)}
            data-testid="button-catalog-csv-upload"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-catalog-csv">
          <DialogHeader>
            <DialogTitle>Upload catalog CSV</DialogTitle>
            <DialogDescription>
              Export the catalog, edit it in a spreadsheet, then upload it here. Every row is validated
              and you'll see exactly what will be added, updated, or removed before anything is saved.
              Re-uploading an unchanged export makes no changes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={onFile}
                className="hidden"
                data-testid="input-catalog-csv-file"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-catalog-csv-choose"
              >
                Choose CSV…
              </Button>
              {fileName && (
                <span className="text-xs text-slate-500" data-testid="text-catalog-csv-filename">
                  {fileName}
                </span>
              )}
            </div>

            {previewMut.isPending && (
              <div className="py-6 text-center text-sm text-slate-500">Reading CSV…</div>
            )}

            {plan && errs.length > 0 && (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-3" data-testid="catalog-csv-errors">
                <div className="text-xs font-semibold text-rose-700 mb-1.5">
                  {errs.length} row {errs.length === 1 ? "error" : "errors"} — fix and re-upload
                </div>
                <ul className="space-y-1 text-xs text-rose-700">
                  {errs.slice(0, 50).map((e, i) => (
                    <li key={i} data-testid={`catalog-csv-error-${i}`}>
                      Row {e.rowNum}: {e.message}
                    </li>
                  ))}
                  {errs.length > 50 && <li>…and {errs.length - 50} more.</li>}
                </ul>
              </div>
            )}

            {plan &&
              errs.length === 0 &&
              (plan.hasChanges ? (
                <div className="space-y-3" data-testid="catalog-csv-plan">
                  <CatalogCsvPlanSection
                    title="Color groups"
                    added={plan.colorGroups.added}
                    removed={plan.colorGroups.removed}
                  />
                  <CatalogCsvPlanSection
                    title="Swatches"
                    added={plan.swatches.added.map((s) => `${s.group} — ${s.name}`)}
                    updated={plan.swatches.updated.map((s) => `${s.group} — ${s.name}`)}
                    removed={plan.swatches.removed.map((s) => `${s.group} — ${s.name}`)}
                  />
                  <CatalogCsvPlanSection
                    title="Pricing"
                    added={plan.prices.added.map((p) => `${p.group} — qty ${p.qty}`)}
                    updated={plan.prices.updated.map((p) => `${p.group} — qty ${p.qty}`)}
                    removed={plan.prices.removed.map((p) => `${p.group} — qty ${p.qty}`)}
                  />
                  <CatalogCsvPlanSection
                    title="Specs"
                    added={plan.specs.added.map((s) => s.key)}
                    updated={plan.specs.updated.map((s) => s.key)}
                    removed={plan.specs.removed.map((s) => s.key)}
                  />
                </div>
              ) : (
                <div
                  className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"
                  data-testid="catalog-csv-nochange"
                >
                  No changes — this CSV matches the current catalog.
                </div>
              ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-catalog-csv-close">
              Cancel
            </Button>
            <Button
              onClick={() => applyMut.mutate()}
              disabled={!canApply}
              data-testid="button-catalog-csv-apply"
            >
              {applyMut.isPending ? "Applying…" : "Apply changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Task #670 — Hellbender pricing-sync button. Re-fetches Hellbender's
// public Shopify catalog (every `/products/<handle>.js`), maps each
// color's handle prefix to one of this press's tiers, and rewrites
// the matching rungs on the default-jacket combos. Idempotent: a
// re-run with unchanged Shopify prices is a no-op (same numbers
// land; `synced_at` advances). Splatter and 2LP cells stay on their
// Task #624 private-quote seeds — Shopify doesn't price those.
type SyncProduct = {
  handle: string;
  name: string;
  mappedTiersByFormat: Record<string, string>;
  rungs: { format: string; tierName: string; qty: number; unitCents: number }[];
  error?: string;
};
type SyncProposal = {
  source: string;
  fetchedAt: string;
  products: SyncProduct[];
  unmapped: { handle: string; name: string; reason: string }[];
  writes: { format: string; tierName: string; qty: number; unitCents: number }[];
};
type SyncCommitResult = {
  syncId: string;
  rungsWritten: number;
  rungsSkipped: number;
  tiersMissing: string[];
  proposal: SyncProposal;
};
function HellbenderPricingSyncButton({
  pressId,
  onSynced,
}: {
  pressId: string;
  onSynced: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [proposal, setProposal] = useState<SyncProposal | null>(null);
  const [commitResult, setCommitResult] = useState<SyncCommitResult | null>(null);

  const previewMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/admin/manufacturers/${pressId}/pricing-sync/hellbender/preview`,
        {},
      );
      return (await r.json()) as { proposal: SyncProposal };
    },
    onSuccess: (d) => setProposal(d.proposal),
    onError: (e: any) =>
      toast({
        title: "Preview failed",
        description: e?.message || "Unknown error",
        variant: "destructive",
      }),
  });

  const commitMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/admin/manufacturers/${pressId}/pricing-sync/hellbender/commit`,
        {},
      );
      return (await r.json()) as SyncCommitResult;
    },
    onSuccess: (d) => {
      setCommitResult(d);
      onSynced();
      toast({
        title: "Pricing synced",
        description: `${d.rungsWritten} rungs written${d.tiersMissing.length ? ` · ${d.tiersMissing.length} tier(s) missing` : ""}.`,
      });
    },
    onError: (e: any) =>
      toast({
        title: "Sync failed",
        description: e?.message || "Unknown error",
        variant: "destructive",
      }),
  });

  const close = () => {
    setOpen(false);
    setProposal(null);
    setCommitResult(null);
  };
  const onOpen = () => {
    setOpen(true);
    setProposal(null);
    setCommitResult(null);
    previewMut.mutate();
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onOpen}
        className="shrink-0"
        data-testid="button-sync-hellbender-pricing"
      >
        Sync pricing from Hellbender
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sync pricing from Hellbender</DialogTitle>
            <DialogDescription>
              Fetches every color's <span className="font-mono text-xs">/products/&lt;handle&gt;.js</span>{" "}
              from hellbendervinyl.com, decodes the Shopify variants (size × quantity × upgrade),
              and overwrites the matching rungs on this press's default-jacket combos. Splatter, 2LP,
              and quantities 750/2000/3000 are left untouched — they stay on the seeded private-quote
              values. Re-running is safe; identical prices are a no-op.
            </DialogDescription>
          </DialogHeader>
          {previewMut.isPending && (
            <div className="py-8 text-center text-slate-500 text-sm" data-testid="text-pricing-sync-loading">
              Fetching Hellbender's Shopify catalog…
            </div>
          )}
          {commitResult && (
            <div className="space-y-3 py-2">
              <div className="text-sm" data-testid="text-pricing-sync-result">
                Wrote {commitResult.rungsWritten} rungs · Skipped {commitResult.rungsSkipped} · Missing tiers{" "}
                {commitResult.tiersMissing.length}
              </div>
              {commitResult.tiersMissing.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="font-semibold mb-1">Tiers missing on this press — create them, then re-sync:</div>
                  <ul className="space-y-0.5">
                    {commitResult.tiersMissing.map((t) => (
                      <li key={t} className="font-mono">{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end pt-2">
                <Button type="button" onClick={close} data-testid="button-pricing-sync-close">
                  Done
                </Button>
              </div>
            </div>
          )}
          {!previewMut.isPending && !commitResult && proposal && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500" data-testid="text-pricing-sync-summary">
                Fetched {proposal.products.length} products · {proposal.writes.length} aggregated rungs ready ·{" "}
                {proposal.unmapped.length} unmapped
              </div>
              {proposal.writes.length > 0 && (
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Format</th>
                        <th className="px-2 py-1.5 text-left font-medium">Tier</th>
                        <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                        <th className="px-2 py-1.5 text-right font-medium">Unit ¢</th>
                        <th className="px-2 py-1.5 text-right font-medium">Total $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposal.writes.map((w) => (
                        <tr
                          key={`${w.format}|${w.tierName}|${w.qty}`}
                          className="border-t border-slate-100"
                          data-testid={`row-pricing-write-${w.format}-${w.tierName}-${w.qty}`}
                        >
                          <td className="px-2 py-1 font-mono">{w.format}</td>
                          <td className="px-2 py-1">{w.tierName}</td>
                          <td className="px-2 py-1 text-right">{w.qty}</td>
                          <td className="px-2 py-1 text-right">{w.unitCents.toLocaleString()}</td>
                          <td className="px-2 py-1 text-right">
                            ${((w.unitCents * w.qty) / 100).toFixed(0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {proposal.unmapped.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="font-semibold mb-1">Unmapped colors ({proposal.unmapped.length})</div>
                  <ul className="space-y-0.5">
                    {proposal.unmapped.map((u) => (
                      <li key={u.handle} data-testid={`text-pricing-unmapped-${u.handle}`}>
                        <span className="font-medium">{u.name}</span>{" "}
                        <span className="font-mono text-xs">({u.handle})</span> — {u.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white">
                <Button
                  type="button"
                  variant="outline"
                  onClick={close}
                  data-testid="button-pricing-sync-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => commitMut.mutate()}
                  disabled={commitMut.isPending || proposal.writes.length === 0}
                  data-testid="button-pricing-sync-commit"
                >
                  {commitMut.isPending
                    ? "Writing…"
                    : `Write ${proposal.writes.length} rung${proposal.writes.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PressCatalogPanel({
  pressId,
  pressDomain,
  placeholderUrl = null,
  pressLogoUrl = null,
}: {
  pressId: string;
  pressDomain: string | null;
  placeholderUrl?: string | null;
  pressLogoUrl?: string | null;
}) {
  // Role gate — server is authoritative; we hide the panel for admins
  // who would just see a 403 either way.
  const { data: roleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
  });
  const canEdit =
    roleInfo?.role === "super_admin" ||
    roleInfo?.role === "admin" ||
    (roleInfo?.role === "manufacturer" && roleInfo?.roleScopeId === pressId);
  const { data, isLoading } = useQuery<Catalog>({
    queryKey: ["/api/admin/manufacturers", pressId, "catalog"],
    enabled: !!pressId && !!canEdit,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/admin/manufacturers", pressId, "catalog"] });

  const toggleFormat = useMutation({
    mutationFn: async (args: { format: AlbumFormat; enabled: boolean }) => {
      const r = await apiRequest(
        "PUT",
        `/api/admin/manufacturers/${pressId}/catalog/formats/${args.format}`,
        { enabled: args.enabled },
      );
      return r.json();
    },
    onSuccess: invalidate,
  });

  const hideFormat = useMutation({
    mutationFn: async (args: { format: AlbumFormat; hidden: boolean }) => {
      const r = await apiRequest(
        "PUT",
        `/api/admin/manufacturers/${pressId}/catalog/formats/${args.format}`,
        { hidden: args.hidden },
      );
      return r.json();
    },
    onSuccess: invalidate,
  });

  // Hooks must run unconditionally — declare state before any early
  // return so a role flip from undefined → unauthorized doesn't trip
  // React's "rendered fewer hooks" guard.
  // Task #2114 — the redesigned editor edits ONE format at a time.
  // Task #2194 — activeTab also accepts "gooddeeds" for the printing
  // price editor; gooddeeds is always available regardless of offered formats.
  const [activeTab, setActiveTab] = useState<CatalogTab | null>(null);
  useEffect(() => {
    if (!data) return;
    const offeredList = (data?.formats ?? []).map((f) => f.format) as AlbumFormat[];
    // Initial state: pick the first physical format, or gooddeeds if none offered.
    if (activeTab === null) {
      if (offeredList.length === 0) setActiveTab("gooddeeds");
      else setActiveTab(ALBUM_FORMATS.find((f) => offeredList.includes(f)) ?? offeredList[0]);
      return;
    }
    // If the currently selected physical format was removed, fall back.
    if (activeTab !== "gooddeeds" && !offeredList.includes(activeTab as AlbumFormat)) {
      if (offeredList.length === 0) setActiveTab("gooddeeds");
      else setActiveTab(ALBUM_FORMATS.find((f) => offeredList.includes(f)) ?? offeredList[0]);
    }
  }, [data, activeTab]);

  if (roleInfo && !canEdit) return null;

  const offered = new Set((data?.formats ?? []).map((f) => f.format));
  const offeredFormats = ALBUM_FORMATS.filter((f) => offered.has(f));
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4" data-testid="panel-press-catalog">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold text-slate-900">Catalog</h2>
          <p className="text-[13px] text-slate-500 mt-1">
            The products you offer in one place. Here you can adjust or add color options, upload
            vinyl swatch images, and dial in prices for each quantity.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <CatalogCsvButtons pressId={pressId} pressName={pressDomain} onApplied={invalidate} />
          {pressDomain === "hellbendervinyl.com" && (
            <>
              <HellbenderImportButton pressId={pressId} catalog={data ?? null} onImported={invalidate} />
              <HellbenderPricingSyncButton pressId={pressId} onSynced={invalidate} />
            </>
          )}
        </div>
      </div>
      {isLoading || !data ? (
        <div className="text-slate-500 text-sm py-4">Loading…</div>
      ) : (
        <div className="space-y-5">
          {/* FORMAT DROPDOWN — Vinyl / CD / Cassette / GoodDeeds */}
          <FormatDropdown
            offered={offered}
            activeTab={activeTab}
            onSetTab={setActiveTab}
            onAddFormat={(fmt) => {
              setActiveTab(fmt);
              toggleFormat.mutate({ format: fmt, enabled: true });
            }}
            onRemoveFormat={(fmt) => {
              // After removing the active format, fall back to next offered or gooddeeds.
              const remaining = ALBUM_FORMATS.filter((f) => offered.has(f) && f !== fmt);
              setActiveTab(remaining.length > 0 ? remaining[0] : "gooddeeds");
              toggleFormat.mutate({ format: fmt, enabled: false });
            }}
            addBusy={toggleFormat.isPending}
            removeBusy={toggleFormat.isPending}
          />
          {activeTab === "gooddeeds" ? (
            <GoodDeedPrintingEditor pressId={pressId} />
          ) : activeTab ? (
            <CatalogEditor
              pressId={pressId}
              pressDomain={pressDomain}
              placeholderUrl={placeholderUrl}
              pressLogoUrl={pressLogoUrl ?? null}
              catalog={data}
              activeFormat={activeTab as AlbumFormat}
              setActiveFormat={(f) => setActiveTab(f)}
              offeredFormats={offeredFormats}
              offered={offered}
              onChanged={invalidate}
              onAddVinylSize={(fmt) => {
                setActiveTab(fmt);
                toggleFormat.mutate({ format: fmt, enabled: true });
              }}
              addBusy={toggleFormat.isPending}
              onRemoveFormat={() => toggleFormat.mutate({ format: activeTab as AlbumFormat, enabled: false })}
              removeBusy={toggleFormat.isPending}
              isFormatHidden={!!(data?.formats.find((f) => f.format === activeTab)?.hidden)}
              onHideFormat={(hidden) => hideFormat.mutate({ format: activeTab as AlbumFormat, hidden })}
              hideBusy={hideFormat.isPending}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Format dropdown ─────────────────────────────────────────────────────────
// A dropdown that switches between Vinyl / CD / Cassette / GoodDeeds, with
// "Add format" items at the bottom. GoodDeeds is always available; physical
// formats only appear when offered. Vinyl keeps its secondary size-picker row.
function FormatDropdown({
  offered,
  activeTab,
  onSetTab,
  onAddFormat,
  onRemoveFormat,
  addBusy,
  removeBusy,
}: {
  offered: Set<string>;
  activeTab: CatalogTab | null;
  onSetTab: (tab: CatalogTab) => void;
  onAddFormat: (fmt: AlbumFormat) => void;
  onRemoveFormat?: (fmt: AlbumFormat) => void;
  addBusy?: boolean;
  removeBusy?: boolean;
}) {
  const offeredVinyl = VINYL_FORMATS.filter((f) => offered.has(f));
  const vinylActive = !!activeTab && activeTab !== "gooddeeds" && isVinylFormat(activeTab as AlbumFormat);

  const canAddVinyl = offeredVinyl.length === 0;
  const canAddCD = !offered.has("cd");
  const canAddCassette = !offered.has("cassette");
  const hasAddable = canAddVinyl || canAddCD || canAddCassette;

  const activeLabel =
    activeTab === "gooddeeds"
      ? "GoodDeeds"
      : activeTab && isVinylFormat(activeTab as AlbumFormat)
      ? "Vinyl"
      : activeTab
      ? ALBUM_FORMAT_LABEL[activeTab as AlbumFormat]
      : "Select format";

  return (
    <div className="space-y-2" data-testid="catalog-format-selector">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Format</span>
      <div className="flex flex-wrap items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)]"
              data-testid="button-format-dropdown"
            >
              {vinylActive && <Disc3 className="w-3.5 h-3.5 text-slate-500" />}
              {activeLabel}
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {/* Offered physical formats */}
            {offeredVinyl.length > 0 && (
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => {
                  const target = vinylActive ? (activeTab as AlbumFormat) : offeredVinyl[0];
                  onSetTab(target);
                }}
                data-testid="option-format-vinyl"
              >
                <Disc3 className="w-3.5 h-3.5 text-slate-400" />
                Vinyl
                {vinylActive && <span className="ml-auto text-[color:var(--brand-blue)] text-xs">✓</span>}
              </DropdownMenuItem>
            )}
            {offered.has("cd") && (
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => onSetTab("cd")}
                data-testid="option-format-cd"
              >
                <Disc className="w-3.5 h-3.5 text-slate-400" />
                CD
                {activeTab === "cd" && <span className="ml-auto text-[color:var(--brand-blue)] text-xs">✓</span>}
              </DropdownMenuItem>
            )}
            {offered.has("cassette") && (
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => onSetTab("cassette")}
                data-testid="option-format-cassette"
              >
                <CassetteIcon className="w-3.5 h-3.5 text-slate-400" />
                Cassette
                {activeTab === "cassette" && <span className="ml-auto text-[color:var(--brand-blue)] text-xs">✓</span>}
              </DropdownMenuItem>
            )}
            {/* GoodDeeds — always available */}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => onSetTab("gooddeeds")}
              data-testid="option-format-gooddeeds"
            >
              <Award className="w-3.5 h-3.5 text-slate-400" />
              GoodDeeds
              {activeTab === "gooddeeds" && <span className="ml-auto text-[color:var(--brand-blue)] text-xs">✓</span>}
            </DropdownMenuItem>
            {/* Add physical format options */}
            {hasAddable && (
              <>
                <DropdownMenuSeparator />
                {canAddVinyl && (
                  <DropdownMenuItem
                    className="gap-2 text-[color:var(--brand-blue)]"
                    disabled={addBusy}
                    onSelect={() => onAddFormat("7_inch")}
                    data-testid="option-add-format-7_inch"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Vinyl
                  </DropdownMenuItem>
                )}
                {canAddCD && (
                  <DropdownMenuItem
                    className="gap-2 text-[color:var(--brand-blue)]"
                    disabled={addBusy}
                    onSelect={() => onAddFormat("cd")}
                    data-testid="option-add-format-cd"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add CD
                  </DropdownMenuItem>
                )}
                {canAddCassette && (
                  <DropdownMenuItem
                    className="gap-2 text-[color:var(--brand-blue)]"
                    disabled={addBusy}
                    onSelect={() => onAddFormat("cassette")}
                    data-testid="option-add-format-cassette"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Cassette
                  </DropdownMenuItem>
                )}
              </>
            )}
            {/* Remove the currently active physical format */}
            {onRemoveFormat && activeTab && activeTab !== "gooddeeds" && offered.has(activeTab) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 text-rose-600 focus:text-rose-600"
                  disabled={removeBusy}
                  onSelect={() => onRemoveFormat(activeTab as AlbumFormat)}
                  data-testid={`option-remove-format-${activeTab}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove {activeTab === "7_inch" || activeTab === "12_lp" || activeTab === "12_dlp" ? "Vinyl" : ALBUM_FORMAT_LABEL[activeTab as AlbumFormat]}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── GoodDeed printing price editor ──────────────────────────────────────────
// Per-press price ladder for GoodDeed certificate printing runs.
// Stored in manufacturers.gooddeed_printing_json.
const GOODDEED_RUNGS = [25, 50, 100, 200, 300, 500, 1000] as const;

function GoodDeedPrintingEditor({ pressId }: { pressId: string }) {
  const { toast } = useToast();
  const qk = ["/api/admin/manufacturers", pressId, "gooddeed-printing"];
  const { data, isLoading } = useQuery<{
    active: boolean;
    tiers: Array<{ qty: number; perUnitCents: number }>;
  }>({ queryKey: qk });

  const [active, setActive] = useState(false);
  const [offeredQtys, setOfferedQtys] = useState<Set<number>>(new Set());
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!data || initialized) return;
    setInitialized(true);
    setActive(data.active);
    const offered = new Set(data.tiers.map((t) => t.qty));
    setOfferedQtys(offered);
    const p: Record<number, string> = {};
    for (const t of data.tiers) {
      p[t.qty] = String((t.perUnitCents / 100).toFixed(2));
    }
    setPrices(p);
  }, [data, initialized]);

  const dirty =
    initialized &&
    data &&
    (active !== data.active ||
      JSON.stringify(
        GOODDEED_RUNGS.filter((q) => offeredQtys.has(q)).map((q) => ({
          qty: q,
          perUnitCents: Math.round((parseFloat(prices[q] ?? "0") || 0) * 100),
        })),
      ) !==
        JSON.stringify(data.tiers));

  const save = useMutation({
    mutationFn: async () => {
      const tiers = GOODDEED_RUNGS.filter((q) => offeredQtys.has(q)).map((q) => ({
        qty: q,
        perUnitCents: Math.round((parseFloat(prices[q] ?? "0") || 0) * 100),
      }));
      const r = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/gooddeed-printing`, {
        active,
        tiers,
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? "Save failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      toast({ title: "GoodDeed printing pricing saved" });
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="text-slate-500 text-sm py-4">Loading…</div>;

  return (
    <div className="space-y-4" data-testid="gooddeed-printing-editor">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-800">GoodDeed printing pricing</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Per-unit costs for printing GoodDeed certificates at this press. Toggle each quantity
            tier on or off and enter the per-certificate cost in USD.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500">{active ? "Active" : "Inactive"}</span>
          <button
            type="button"
            onClick={() => setActive((v) => !v)}
            className={[
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
              active ? "bg-[color:var(--brand-blue)]" : "bg-slate-200",
            ].join(" ")}
            data-testid="toggle-gooddeed-active"
          >
            <span
              className={[
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200",
                active ? "translate-x-4" : "translate-x-0",
              ].join(" ")}
            />
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm" data-testid="table-gooddeed-tiers">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 w-8">On</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">
                Min qty
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">
                Per cert (USD)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {GOODDEED_RUNGS.map((qty) => {
              const on = offeredQtys.has(qty);
              return (
                <tr
                  key={qty}
                  className={on ? "bg-white" : "bg-slate-50/60"}
                  data-testid={`row-gooddeed-tier-${qty}`}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOfferedQtys((prev) => {
                          const next = new Set(prev);
                          if (next.has(qty)) next.delete(qty);
                          else next.add(qty);
                          return next;
                        });
                      }}
                      className="text-slate-400 hover:text-slate-700 transition-colors"
                      data-testid={`toggle-gooddeed-qty-${qty}`}
                    >
                      {on ? <Eye className="w-4 h-4 text-[color:var(--brand-blue)]" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{qty.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 text-xs">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={prices[qty] ?? ""}
                        onChange={(e) =>
                          setPrices((prev) => ({ ...prev, [qty]: e.target.value }))
                        }
                        disabled={!on}
                        placeholder="0.00"
                        className={
                          INPUT +
                          " w-24 h-7 py-0 text-xs disabled:opacity-40"
                        }
                        data-testid={`input-gooddeed-price-${qty}`}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <SaveLink
          dirty={!!dirty}
          busy={save.isPending}
          onClick={() => save.mutate()}
          testId="button-save-gooddeed-printing"
        />
      </div>
    </div>
  );
}

// Top-level "Add format" — shows Vinyl (if no vinyl at all), CD, Cassette.
function AddFormatPicker({
  offered,
  offeredVinyl,
  onPick,
  disabled,
}: {
  offered: Set<string>;
  offeredVinyl: AlbumFormat[];
  onPick: (fmt: AlbumFormat) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Category-level: show "Vinyl" only when NO vinyl sizes at all, "CD" / "Cassette" when absent.
  const items: { label: string; icon: ReactNode; fmt: AlbumFormat }[] = [];
  if (offeredVinyl.length === 0) {
    items.push({ label: "Vinyl", icon: <Disc3 className="w-3.5 h-3.5" />, fmt: "7_inch" });
  }
  if (!offered.has("cd")) {
    items.push({ label: "CD", icon: <Disc className="w-3.5 h-3.5" />, fmt: "cd" });
  }
  if (!offered.has("cassette")) {
    items.push({
      label: "Cassette",
      icon: <CassetteIcon className="w-3.5 h-3.5" />,
      fmt: "cassette",
    });
  }
  if (items.length === 0) return null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-dashed border-slate-300 text-xs text-slate-600 hover:border-[color:var(--brand-blue)] hover:text-[color:var(--brand-blue)] transition-colors disabled:opacity-50"
        data-testid="button-add-format"
      >
        <Plus className="w-3.5 h-3.5" />
        Add format
      </button>
      {open && (
        <div className="absolute z-20 mt-1 min-w-[12rem] rounded-md border border-slate-200 bg-white shadow-lg py-1">
          {items.map(({ label, icon, fmt }) => (
            <button
              key={fmt}
              type="button"
              onClick={() => {
                onPick(fmt);
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              data-testid={`option-add-format-${fmt}`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// "Add size" within the vinyl secondary row — adds a vinyl size not yet offered.
function AddVinylSizePicker({
  offered,
  onPick,
  disabled,
}: {
  offered: Set<string>;
  onPick: (fmt: AlbumFormat) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const available = VINYL_FORMATS.filter((f) => !offered.has(f));
  if (available.length === 0) return null;
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-dashed border-slate-300 text-xs text-slate-500 hover:border-[color:var(--brand-blue)] hover:text-[color:var(--brand-blue)] transition-colors disabled:opacity-50"
        data-testid="button-add-vinyl-size"
      >
        <Plus className="w-3 h-3" />
        Add size
      </button>
      {open && (
        <div className="absolute z-20 mt-1 min-w-[11rem] rounded-md border border-slate-200 bg-white shadow-lg py-1">
          {available.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                onPick(f);
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              data-testid={`option-add-vinyl-size-${f}`}
            >
              <Disc3 className="w-3.5 h-3.5 text-slate-400" />
              {ALBUM_FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CatalogEditor({
  pressId,
  pressDomain,
  placeholderUrl,
  pressLogoUrl,
  catalog,
  activeFormat,
  setActiveFormat,
  offeredFormats,
  offered,
  onChanged,
  onAddVinylSize,
  addBusy,
  onRemoveFormat,
  removeBusy,
  isFormatHidden,
  onHideFormat,
  hideBusy,
}: {
  pressId: string;
  pressDomain: string | null;
  placeholderUrl: string | null;
  pressLogoUrl?: string | null;
  catalog: Catalog;
  activeFormat: AlbumFormat;
  setActiveFormat: (f: AlbumFormat) => void;
  offeredFormats: AlbumFormat[];
  offered: Set<string>;
  onChanged: () => void;
  onAddVinylSize: (fmt: AlbumFormat) => void;
  addBusy: boolean;
  onRemoveFormat: () => void;
  removeBusy: boolean;
  isFormatHidden: boolean;
  onHideFormat: (hidden: boolean) => void;
  hideBusy: boolean;
}) {
  const { toast } = useToast();
  const fmt = activeFormat;
  const isVinyl = isVinylFormat(fmt);
  const discSize = discSizeOf(fmt);
  // Task #2114 — each vinyl format manages its OWN colors. 12" Double LP
  // historically carries its own distinct press_colors rows (and the fan
  // SellPanel resolves a double-LP album's colors from those rows, not
  // 12" LP's), so we must NOT read-through to 12" LP here or existing
  // double-LP swatches would vanish from the editor and diverge from what
  // fans see. Cross-disc-size convenience now lives only in the per-swatch
  // "Color applies to" toggle (additive copy by name), never a hard mirror.
  const swatchFmt = fmt;
  const isMirror = false;

  const fmtRow = catalog.formats.find((f) => f.format === fmt) ?? null;
  const swatchFmtRow = catalog.formats.find((f) => f.format === swatchFmt) ?? null;
  const priceTiers = fmtRow?.tiers ?? [];
  const swatchTiers = swatchFmtRow?.tiers ?? [];
  const defaultJacketId = fmtRow?.defaultJacketId ?? catalog.defaultJacketId;

  const [editing, setEditing] = useState(false);
  const [selectedPriceTierId, setSelectedPriceTierId] = useState<string | null>(priceTiers[0]?.id ?? null);
  const [selectedSwatchTierId, setSelectedSwatchTierId] = useState<string | null>(swatchTiers[0]?.id ?? null);
  const pendingPriceTierIdRef = useRef<string | null>(null);
  const [selectedSwatchId, setSelectedSwatchId] = useState<string | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // Pricing drafts. Key = `${format}:${tierId}` (jacket is always the
  // format's resolved default — the jacket axis is no longer exposed).
  const [drafts, setDrafts] = useState<Record<string, Record<number, string>>>({});
  // Task #2114 — "offered" set per combo. A quantity is OFFERED when a
  // saved rung exists (or the operator toggled the eye on); offered +
  // price = confirmed, offered + blank = TBD/Quote, not-offered = no
  // rung at all (renders "—", and the album Sell panel skips it).
  const [offeredDrafts, setOfferedDrafts] = useState<Record<string, Set<number>>>({});
  const [extraQuantities, setExtraQuantities] = useState<number[]>([]);

  // Keep the selected price group valid as products/groups change.
  useEffect(() => {
    if (priceTiers.length === 0) {
      if (selectedPriceTierId !== null) setSelectedPriceTierId(null);
      pendingPriceTierIdRef.current = null;
      return;
    }
    if (pendingPriceTierIdRef.current) {
      if (priceTiers.some((t) => t.id === pendingPriceTierIdRef.current)) {
        pendingPriceTierIdRef.current = null;
      } else {
        return;
      }
    }
    if (!priceTiers.some((t) => t.id === selectedPriceTierId)) {
      setSelectedPriceTierId(priceTiers[0].id);
    }
  }, [priceTiers, selectedPriceTierId]);
  useEffect(() => {
    if (swatchTiers.length === 0) {
      if (selectedSwatchTierId !== null) setSelectedSwatchTierId(null);
      return;
    }
    if (!swatchTiers.some((t) => t.id === selectedSwatchTierId)) {
      setSelectedSwatchTierId(swatchTiers[0].id);
    }
  }, [swatchTiers, selectedSwatchTierId]);

  // Color Options operate on THIS format's own tiers (swatchFmt === fmt for
  // every vinyl format). The color group IS the pricing group (same format),
  // so the two selections stay in lockstep. `isMirror` is permanently false
  // here — the read-through mirror was removed (Task #2114) so 12" Double LP
  // keeps its own swatches; the branches are kept only to localize the change.
  const colorTiers = swatchTiers;
  const colorGroupId = isMirror ? selectedSwatchTierId : selectedPriceTierId;
  const setColorGroupId = isMirror ? setSelectedSwatchTierId : setSelectedPriceTierId;
  const selectedColorTier = colorTiers.find((t) => t.id === colorGroupId) ?? null;

  // Keep the previewed swatch valid for the selected color group.
  const colorIds = (selectedColorTier?.colors ?? []).map((c) => c.id).join(",");
  useEffect(() => {
    const colors = selectedColorTier?.colors ?? [];
    if (colors.length === 0) {
      if (selectedSwatchId !== null) setSelectedSwatchId(null);
      return;
    }
    if (!colors.some((c) => c.id === selectedSwatchId)) {
      setSelectedSwatchId(colors[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorIds]);

  const selectedSwatch = (selectedColorTier?.colors ?? []).find((c) => c.id === selectedSwatchId) ?? null;
  const previewColor: VinylColorOption = selectedSwatch
    ? {
        id: selectedSwatch.id,
        name: selectedSwatch.name,
        tier: "opaque",
        swatch: selectedSwatch.swatchHex ?? "#888888",
        thumbnailUrl: selectedSwatch.swatchImageUrl ?? null,
      }
    : resolveVinylColor(null);
  // Operator/press-uploaded override wins; otherwise fall back to the
  // hard-coded per-domain placeholder asset (VinylPreview supplies its own
  // generic gray jacket when both are null).
  const placeholderArt = placeholderUrl || pressPlaceholderArt(pressDomain);
  const [placeholderEditorOpen, setPlaceholderEditorOpen] = useState(false);

  // ── Pricing combo
  const selectedPriceTier = priceTiers.find((t) => t.id === selectedPriceTierId) ?? null;
  const comboKey = selectedPriceTier ? `${fmt}:${selectedPriceTier.id}` : null;
  const ladderForTier = (
    tier: CatalogTier | null,
    fRow: CatalogFormat | null,
  ): { qty: number; unitCents: number; confirmed?: boolean }[] => {
    if (!tier) return [];
    const jId = fRow?.defaultJacketId ?? catalog.defaultJacketId;
    if (jId && tier.laddersByJacket[jId]) return tier.laddersByJacket[jId];
    return tier.priceLadder ?? [];
  };
  const savedLadder = ladderForTier(selectedPriceTier, fmtRow);

  const columns = useMemo(() => {
    const set = new Set<number>(DEFAULT_QTY_COLUMNS);
    for (const f of catalog.formats) {
      for (const t of f.tiers) {
        for (const r of t.priceLadder ?? []) set.add(r.qty);
        for (const j of Object.keys(t.laddersByJacket)) for (const r of t.laddersByJacket[j]) set.add(r.qty);
      }
    }
    for (const q of extraQuantities) set.add(q);
    return Array.from(set).sort((a, b) => a - b);
  }, [catalog, extraQuantities]);

  // Seed the offered set for a combo from its saved rungs.
  const savedRungKey = comboKey
    ? savedLadder
        .map((r) => `${r.qty}:${r.confirmed === false ? "q" : "p"}`)
        .sort()
        .join(",")
    : "";
  useEffect(() => {
    if (!comboKey) return;
    setOfferedDrafts((prev) => ({ ...prev, [comboKey]: new Set(savedLadder.map((r) => r.qty)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comboKey, savedRungKey]);

  const offeredFor = (q: number): boolean => {
    if (!comboKey) return false;
    const s = offeredDrafts[comboKey];
    if (s) return s.has(q);
    return savedLadder.some((r) => r.qty === q);
  };
  const toggleOffered = (q: number) => {
    if (!comboKey) return;
    setOfferedDrafts((prev) => {
      const cur = prev[comboKey] ?? new Set<number>(savedLadder.map((r) => r.qty));
      const next = new Set(cur);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return { ...prev, [comboKey]: next };
    });
  };
  const cellValue = (q: number): string => {
    if (!comboKey) return "";
    const d = drafts[comboKey];
    if (d && Object.prototype.hasOwnProperty.call(d, q)) return d[q];
    const saved = savedLadder.find((r) => r.qty === q);
    if (!saved || saved.confirmed === false) return "";
    return formatDollars(saved.unitCents);
  };
  const setCellValue = (q: number, v: string) => {
    if (!comboKey) return;
    setDrafts((prev) => ({ ...prev, [comboKey]: { ...(prev[comboKey] ?? {}), [q]: v } }));
  };

  // Build the ladder we'd persist for a given combo's local state.
  const buildLadder = (
    cKey: string,
    saved: { qty: number; unitCents: number; confirmed?: boolean }[],
  ): { ladder: { qty: number; unitCents: number; confirmed: boolean }[]; error: string | null } => {
    const off = offeredDrafts[cKey] ?? new Set<number>(saved.map((r) => r.qty));
    const dr = drafts[cKey] ?? {};
    const out: { qty: number; unitCents: number; confirmed: boolean }[] = [];
    for (const q of columns) {
      if (!off.has(q)) continue;
      let raw: string;
      if (Object.prototype.hasOwnProperty.call(dr, q)) raw = dr[q];
      else {
        const s = saved.find((r) => r.qty === q);
        raw = s && s.confirmed !== false ? formatDollars(s.unitCents) : "";
      }
      const v = (raw ?? "").trim();
      if (!v) {
        out.push({ qty: q, unitCents: 0, confirmed: false });
        continue;
      }
      const cents = parseDollars(v);
      if (cents === null) return { ladder: out, error: `"${v}" at qty ${q} isn't a valid dollar amount` };
      out.push({ qty: q, unitCents: cents, confirmed: true });
    }
    return { ladder: out, error: null };
  };
  const normalize = (l: { qty: number; unitCents: number; confirmed?: boolean }[]): string =>
    l
      .slice()
      .sort((a, b) => a.qty - b.qty)
      .map((r) => `${r.qty}:${r.confirmed === false ? "Q" : r.unitCents}`)
      .join("|");
  const comboIsDirty = (cKey: string): boolean => {
    const [f, tierId] = cKey.split(":");
    const fRow = catalog.formats.find((x) => x.format === f) ?? null;
    const tier = fRow?.tiers.find((t) => t.id === tierId) ?? null;
    if (!tier) return false;
    const saved = ladderForTier(tier, fRow);
    const { ladder } = buildLadder(cKey, saved);
    return normalize(ladder) !== normalize(saved);
  };
  const dirty = comboKey ? comboIsDirty(comboKey) : false;
  const anyDirty = (() => {
    const keys = Array.from(new Set<string>([...Object.keys(drafts), ...Object.keys(offeredDrafts)]));
    return keys.some((k) => comboIsDirty(k));
  })();

  // ── Mutations
  const addTier = useMutation({
    mutationFn: async (name: string) => {
      const r = await apiRequest(
        "POST",
        `/api/admin/manufacturers/${pressId}/catalog/formats/${fmt}/tiers`,
        { name: name.trim() },
      );
      return r.json() as Promise<{ id: string }>;
    },
    onSuccess: (row) => {
      setNewGroupName("");
      setAddingGroup(false);
      pendingPriceTierIdRef.current = row.id;
      setSelectedPriceTierId(row.id);
      if (!isMirror) setSelectedSwatchTierId(row.id);
      onChanged();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't add color group", description: e?.message, variant: "destructive" }),
  });
  const deleteTier = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/catalog/tiers/${id}`);
    },
    onSuccess: onChanged,
    onError: (e: any) =>
      toast({ title: "Couldn't delete color group", description: e?.message, variant: "destructive" }),
  });
  const saveLadder = useMutation({
    mutationFn: async () => {
      if (!selectedPriceTier || !comboKey) throw new Error("Pick a color group first.");
      let jacketId = defaultJacketId;
      if (!jacketId) {
        const jr = await apiRequest("POST", `/api/admin/manufacturers/${pressId}/catalog/jackets`, {
          name: "Standard",
        });
        jacketId = ((await jr.json()) as { id: string }).id;
      }
      const { ladder, error } = buildLadder(comboKey, savedLadder);
      if (error) throw new Error(error);
      const r = await apiRequest(
        "PUT",
        `/api/admin/manufacturers/${pressId}/catalog/tiers/${selectedPriceTier.id}/jackets/${jacketId}/ladder`,
        { priceLadder: ladder },
      );
      return r.json();
    },
    onSuccess: () => {
      if (comboKey) setDrafts((prev) => ({ ...prev, [comboKey]: {} }));
      toast({ title: "Pricing saved" });
      onChanged();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save pricing", description: e?.message, variant: "destructive" }),
  });

  const exitEdit = () => {
    setDrafts({});
    setOfferedDrafts({});
    setAddingGroup(false);
    setNewGroupName("");
    setEditing(false);
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const formatMenuSlot = editing ? (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            label="Format options"
            variant="ghost"
            size="md"
            disabled={removeBusy || hideBusy}
            className="text-slate-400 hover:text-slate-700"
            data-testid={`menu-format-options-${fmt}`}
          >
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            className="gap-2 text-rose-600 focus:text-rose-600"
            onSelect={() => setShowDeleteConfirm(true)}
            data-testid={`menu-item-delete-format-${fmt}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete format
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => onHideFormat(!isFormatHidden)}
            disabled={hideBusy}
            data-testid={`menu-item-hide-format-${fmt}`}
          >
            {isFormatHidden ? (
              <>
                <Eye className="w-3.5 h-3.5" />
                Unhide format
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                Hide format
              </>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this format?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the format and all of its saved color groups and swatch
              images. This cannot be undone.
              <br /><br />
              If you just want to take it off the menu temporarily, cancel and use{" "}
              <strong>Hide format</strong> instead — that keeps everything intact and lets you
              restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid={`button-cancel-delete-format-${fmt}`}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={onRemoveFormat}
              disabled={removeBusy}
              data-testid={`button-confirm-delete-format-${fmt}`}
            >
              {removeBusy ? "Deleting…" : "Delete format"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  ) : null;

  const canManagePriceGroups = isMirror || !isVinyl;
  const groupAdder = (
    <div className="flex items-center gap-1.5">
      <input
        value={newGroupName}
        onChange={(e) => setNewGroupName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && newGroupName.trim()) addTier.mutate(newGroupName);
          if (e.key === "Escape") {
            setAddingGroup(false);
            setNewGroupName("");
          }
        }}
        autoFocus
        placeholder={isVinyl ? "Group name (e.g. Splatter)" : "Tier name"}
        className={INPUT + " h-8 w-48"}
        data-testid={`input-new-group-${fmt}`}
      />
      <button
        type="button"
        onClick={() => newGroupName.trim() && addTier.mutate(newGroupName)}
        disabled={!newGroupName.trim() || addTier.isPending}
        className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2 disabled:opacity-50"
        data-testid={`button-confirm-add-group-${fmt}`}
      >
        {addTier.isPending ? "Adding…" : "Add"}
      </button>
      <button
        type="button"
        onClick={() => {
          setAddingGroup(false);
          setNewGroupName("");
        }}
        className="text-xs text-slate-500 hover:underline underline-offset-2"
      >
        Cancel
      </button>
    </div>
  );

  return (
    <div className="space-y-5" data-testid={`catalog-format-${fmt}`}>
      <div className="rounded-lg border border-slate-200 bg-white">

        {/* PRODUCT TYPE — vinyl size pills */}
        {isVinyl && (
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between gap-4 mb-3">
              <span className="text-sm font-semibold text-slate-800">Product Type</span>
              <div className="flex items-center gap-1.5">
                {isFormatHidden && (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wide bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                    data-testid={`badge-format-hidden-${fmt}`}
                  >
                    <EyeOff className="w-3 h-3" /> Hidden
                  </span>
                )}
                {formatMenuSlot}
                {!editing ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                    data-testid={`button-edit-catalog-${fmt}`}
                  >
                    Edit
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={exitEdit}
                    className="text-xs text-slate-500 hover:underline underline-offset-2"
                    data-testid={`button-cancel-edit-${fmt}`}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {offeredFormats.filter((f) => isVinylFormat(f)).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActiveFormat(f)}
                  className={[
                    "h-8 px-3.5 rounded-full text-xs font-medium transition-colors border",
                    f === fmt
                      ? "border-[color:var(--brand-blue)] text-[color:var(--brand-blue)] bg-white"
                      : "border-transparent text-slate-600 hover:border-slate-200 bg-white",
                  ].join(" ")}
                  data-testid={`pill-product-type-${f}`}
                >
                  {ALBUM_FORMAT_LABEL[f]}
                </button>
              ))}
              {VINYL_FORMATS.some((f) => !offered.has(f)) && (
                <AddVinylSizePicker offered={offered} onPick={onAddVinylSize} disabled={addBusy} />
              )}
            </div>
          </div>
        )}

        {/* For non-vinyl formats: header with edit controls */}
        {!isVinyl && (
          <div className="px-5 pt-5 pb-4 flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-slate-800">
              {ALBUM_FORMAT_LABEL[fmt]}
            </span>
            <div className="flex items-center gap-1.5">
              {formatMenuSlot}
              {!editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                  data-testid={`button-edit-catalog-${fmt}`}
                >
                  Edit
                </button>
              ) : (
                <button
                  type="button"
                  onClick={exitEdit}
                  className="text-xs text-slate-500 hover:underline underline-offset-2"
                  data-testid={`button-cancel-edit-${fmt}`}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {/* COLOR OPTIONS — vinyl only */}
        {isVinyl && (
          <div className="border-t border-slate-100 px-5 py-4" data-testid={`color-options-${fmt}`}>
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div className="space-y-3 min-w-0">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Color</span>
                {colorTiers.length === 0 ? (
                  <div className="text-xs text-slate-500">
                    No color groups yet{isMirror ? " — add them under 12\" LP." : "."}
                    {editing && !isMirror && !addingGroup && (
                      <button
                        type="button"
                        onClick={() => setAddingGroup(true)}
                        className="ml-2 text-[color:var(--brand-blue)] hover:underline underline-offset-2"
                        data-testid={`button-add-color-group-first-${fmt}`}
                      >
                        + Add group
                      </button>
                    )}
                    {editing && !isMirror && addingGroup && groupAdder}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {isMirror && (
                      <span className="text-xs text-slate-400 block">
                        Shares the 12&quot; LP color set — edit under 12&quot; LP.
                      </span>
                    )}
                    <div className="relative">
                      <select
                        value={colorGroupId ?? ""}
                        onChange={(e) => setColorGroupId(e.target.value || null)}
                        className="w-full h-9 pl-3 pr-9 rounded-md border border-slate-300 bg-white text-sm text-slate-700 appearance-none focus:outline-none focus:border-[color:var(--brand-blue)] focus:ring-1 focus:ring-[color:var(--brand-blue)]"
                        data-testid={`select-color-group-${fmt}`}
                      >
                        {colorTiers.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                    {editing && !isMirror && (
                      <div className="flex items-center gap-2">
                        {selectedColorTier && (
                          <DeleteTierButton
                            tier={selectedColorTier}
                            onConfirm={() => deleteTier.mutate(selectedColorTier.id)}
                            disabled={deleteTier.isPending}
                          />
                        )}
                        {!addingGroup ? (
                          <button
                            type="button"
                            onClick={() => setAddingGroup(true)}
                            className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2"
                            data-testid={`button-add-color-group-${fmt}`}
                          >
                            + Add color group
                          </button>
                        ) : (
                          groupAdder
                        )}
                      </div>
                    )}
                  </div>
                )}
                {selectedColorTier && (
                  <div className="flex flex-wrap items-center gap-1.5" data-testid={`swatches-${fmt}`}>
                    {selectedColorTier.colors.map((c) => (
                      <SwatchChip
                        key={c.id}
                        pressId={pressId}
                        color={c}
                        onChanged={onChanged}
                        editable={editing && !isMirror}
                        onPreview={() => setSelectedSwatchId(c.id)}
                        selected={c.id === selectedSwatchId}
                        mirror={
                          editing && !isMirror
                            ? { catalog, groupName: selectedColorTier.name, currentSize: discSize, currentLabel: ALBUM_FORMAT_LABEL[fmt] }
                            : undefined
                        }
                      />
                    ))}
                    {editing && !isMirror && (
                      <AddSwatchChip pressId={pressId} tierId={selectedColorTier.id} onChanged={onChanged} />
                    )}
                  </div>
                )}
                {selectedSwatch && (
                  <div
                    className="flex items-center gap-1.5 text-xs text-slate-700"
                    data-testid={`text-selected-swatch-name-${fmt}`}
                  >
                    <Pencil className="w-3 h-3 text-slate-400" />
                    {selectedSwatch.name}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-start gap-1.5 md:pl-2">
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <VinylPreview
                    artworkUrl={placeholderArt}
                    color={previewColor}
                    jacketUpgrade={DEFAULT_JACKET_UPGRADE}
                    format={fmt}
                    size="2xl"
                    placeholderLogoUrl={placeholderArt ? null : (pressLogoUrl ?? null)}
                    jacketOverlay={
                      <button
                        type="button"
                        onClick={() => setPlaceholderEditorOpen(true)}
                        className="group/edit absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--brand-blue)]"
                        aria-label={placeholderUrl ? "Change jacket image" : "Add jacket image"}
                        data-testid={`button-edit-placeholder-art-${fmt}`}
                      >
                        <span className="absolute inset-0 bg-black/0 group-hover/edit:bg-black/40 group-focus-visible/edit:bg-black/40 transition-colors" />
                        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100 transition-opacity">
                          <span className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 inline-flex items-center justify-center shadow-lg ring-1 ring-black/5">
                            <Pencil className="w-4 h-4" />
                          </span>
                        </span>
                      </button>
                    }
                  />
                </div>
                <span className="text-xs text-slate-400" data-testid={`text-preview-color-${fmt}`}>
                  {ALBUM_FORMAT_LABEL[fmt]} w/ full-color Inner Sleeve
                </span>
              </div>
            </div>
          </div>
        )}
      {/* PRICE PER UNIT */}
      <div className="border-t border-slate-100 px-5 py-4 space-y-3" data-testid={`pricing-${fmt}`}>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Price per unit
            {editing && <Pencil className="w-3 h-3 text-slate-400" />}
          </span>
          {editing && selectedPriceTier && (
            <SaveLink
              dirty={dirty}
              busy={saveLadder.isPending}
              onClick={() => saveLadder.mutate()}
              testId={`button-save-ladder-${selectedPriceTier.id}`}
            />
          )}
        </div>
        {/* Pricing tier/group — vinyl color-group selection lives in Color
            Options above (shared state); only non-vinyl needs it here. */}
        {!isVinyl && (priceTiers.length === 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">No price groups yet for this product.</span>
            {editing && canManagePriceGroups &&
              (!addingGroup ? (
                <button
                  type="button"
                  onClick={() => setAddingGroup(true)}
                  className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2"
                  data-testid={`button-add-price-group-${fmt}`}
                >
                  + Add group
                </button>
              ) : (
                groupAdder
              ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedPriceTierId ?? ""}
              onChange={(e) => setSelectedPriceTierId(e.target.value || null)}
              className={INPUT + " w-auto min-w-[12rem]"}
              data-testid={`select-price-group-${fmt}`}
            >
              {priceTiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {editing && canManagePriceGroups && selectedPriceTier && (
              <DeleteTierButton
                tier={selectedPriceTier}
                onConfirm={() => deleteTier.mutate(selectedPriceTier.id)}
                disabled={deleteTier.isPending}
              />
            )}
            {editing && canManagePriceGroups &&
              (!addingGroup ? (
                <button
                  type="button"
                  onClick={() => setAddingGroup(true)}
                  className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2"
                  data-testid={`button-add-price-group-${fmt}`}
                >
                  + Add group
                </button>
              ) : (
                groupAdder
              ))}
          </div>
        ))}
        {selectedPriceTier && (
          <div className="space-y-2">
            <span className="text-xs text-slate-500">
              Price per unit (USD){isVinyl ? ` — ${selectedPriceTier.name}` : ""}
            </span>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border-separate border-spacing-0">
                <thead>
                  <tr>
                    {columns.map((q) => (
                      <th
                        key={q}
                        className="px-2 py-1 text-slate-500 font-semibold text-center border-b border-slate-200"
                      >
                        {q}
                      </th>
                    ))}
                    {editing && (
                      <th className="px-2 py-1 border-b border-slate-200 text-left">
                        <AddQuantityButton
                          existing={columns}
                          onAdd={(q) => setExtraQuantities((prev) => [...prev, q])}
                          fmt={fmt}
                        />
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {columns.map((q) => {
                      const offeredQ = offeredFor(q);
                      const saved = savedLadder.find((r) => r.qty === q);
                      const hasPrice = saved !== undefined && saved.confirmed !== false;

                      if (!editing) {
                        return (
                          <td key={q} className="px-2 py-1.5 text-center align-middle">
                            {!offeredQ ? (
                              <span className="text-slate-300" aria-label={`Quantity ${q} — not offered`}>
                                —
                              </span>
                            ) : hasPrice ? (
                              <span
                                className="text-xs font-medium text-slate-900 tabular-nums"
                                data-testid={`cell-ladder-price-${selectedPriceTier.id}-${q}`}
                              >
                                ${formatDollars(saved!.unitCents)}
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center justify-center h-6 px-2 rounded-full bg-slate-100 text-slate-500 text-xs font-medium"
                                title="Awaiting quote"
                                data-testid={`cell-ladder-quote-${selectedPriceTier.id}-${q}`}
                              >
                                Quote
                              </span>
                            )}
                          </td>
                        );
                      }

                      return (
                        <td key={q} className="px-1 py-1.5 align-middle">
                          <div className="flex items-center gap-1">
                            <div className="relative">
                              {offeredQ && (
                                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                  $
                                </span>
                              )}
                              <input
                                value={offeredQ ? cellValue(q) : ""}
                                onChange={(e) => setCellValue(q, e.target.value)}
                                disabled={!offeredQ}
                                placeholder={offeredQ ? "Quote" : "—"}
                                inputMode="decimal"
                                className={[
                                  "w-20 h-8 pr-2 rounded-md border text-xs tabular-nums text-right focus:outline-none focus:border-[color:var(--brand-blue)]",
                                  offeredQ
                                    ? "pl-6 border-slate-200 bg-white"
                                    : "pl-2 border-slate-100 bg-slate-50 text-slate-300 placeholder:text-slate-300",
                                ].join(" ")}
                                data-testid={`input-ladder-cell-${selectedPriceTier.id}-${q}`}
                                aria-label={offeredQ ? `Quantity ${q}` : `Quantity ${q} — not offered`}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleOffered(q)}
                              aria-pressed={offeredQ}
                              className={[
                                "h-8 w-8 inline-flex items-center justify-center rounded-md border transition-colors shrink-0",
                                offeredQ
                                  ? "border-[color:var(--brand-blue)] text-[color:var(--brand-blue)] bg-[color:var(--brand-blue-soft)]"
                                  : "border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300",
                              ].join(" ")}
                              title={
                                offeredQ
                                  ? "Offered at this quantity — click to stop offering"
                                  : "Not offered — click to offer this quantity"
                              }
                              data-testid={`button-toggle-offered-${selectedPriceTier.id}-${q}`}
                            >
                              {offeredQ ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                              <span className="sr-only">{offeredQ ? "Offered" : "Not offered"}</span>
                            </button>
                          </div>
                        </td>
                      );
                    })}
                    {editing && <td className="px-2 py-1.5" />}
                  </tr>
                </tbody>
              </table>
            </div>
            {editing && (
              <p className="text-xs text-slate-400">
                Toggle the eye to set which run quantities this {isVinyl ? "color group" : "product"} is offered
                at. Offered with a price shows the price; offered with no price shows a “Quote” chip; not
                offered is hidden from the artist's Sell panel.
              </p>
            )}
          </div>
        )}
      </div>
      {isVinyl && <PressTemplateSpecsCard pressId={pressId} fmt={fmt} />}
      </div>

      <PressLogoEditorDialog
        name="this press"
        title="Jacket placeholder image"
        logoUrl={placeholderUrl}
        apiPath={`/api/admin/manufacturers/${pressId}`}
        fieldName="vinylPlaceholderUrl"
        open={placeholderEditorOpen}
        onOpenChange={setPlaceholderEditorOpen}
        onInvalidate={() => {
          void invalidateAdminEntity(queryClient, "manufacturer", pressId);
          onChanged();
        }}
        FallbackIcon={Factory}
        testIdPrefix="placeholder"
        hint="Shown as the branded jacket in this catalog's color preview. A square image works best; clear it to fall back to the default press artwork."
      />
    </div>
  );
}

// Task #2115 — per press × product print-template editor. Each vinyl
// product (12" Single LP / 12" Double LP / 7" Single) gets three component
// slots (Jacket / Center labels / Inner sleeve), stored in the generic
// catalog slot (variantKey="" discCount=0) of `press_template_specs`. The
// uploaded file becomes (1) an artist download in the album Package/Physical
// tab and (2) the completed-template-check baseline (preferred over the
// measured-constant fallback, which stays intact). Optional artboard / page
// / color fields refine that baseline. Additive only.
type PressTemplateSpec = {
  id: string;
  format: AlbumFormat;
  componentKey: "jacket" | "labels" | "inner_sleeve";
  variantKey: string;
  discCount: number;
  artboardWInches: number | null;
  artboardHInches: number | null;
  expectedPages: number | null;
  color: "process-4c" | "cmyk-or-pms" | null;
  fontsRule: string | null;
  templateFileUrl: string | null;
};
const TEMPLATE_COMPONENTS: {
  key: PressTemplateSpec["componentKey"];
  label: string;
  hint: string;
}[] = [
  { key: "jacket", label: "Jacket", hint: "Outer sleeve / cover artwork" },
  { key: "inner_sleeve", label: "Inner Sleeve", hint: "Printed inner sleeve / bag" },
  { key: "labels", label: "Center Labels", hint: "On-disc label artwork" },
];

function PressTemplateSpecsCard({ pressId, fmt }: { pressId: string; fmt: AlbumFormat }) {
  const { toast } = useToast();
  const qk = ["/api/admin/manufacturers", pressId, "template-specs"];
  const { data, isLoading } = useQuery<{ specs: PressTemplateSpec[] }>({ queryKey: qk });
  const specsForFmt = (data?.specs ?? []).filter(
    (s) => s.format === fmt && s.variantKey === "" && s.discCount === 0,
  );
  const byComponent = (key: PressTemplateSpec["componentKey"]) =>
    specsForFmt.find((s) => s.componentKey === key) ?? null;

  const save = useMutation({
    mutationFn: async (body: Partial<PressTemplateSpec> & { componentKey: string }) => {
      const res = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/template-specs`, {
        format: fmt,
        variantKey: "",
        discCount: 0,
        ...body,
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk }),
    onError: (e: any) =>
      toast({ title: e?.message || "Couldn't save template", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async (specId: string) => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/template-specs/${specId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk }),
    onError: (e: any) =>
      toast({ title: e?.message || "Couldn't remove template", variant: "destructive" }),
  });

  return (
    <div className="border-t border-slate-100 px-5 py-4">
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        Specs
      </span>
      <div className="mt-3 divide-y divide-slate-100">
        {TEMPLATE_COMPONENTS.map((c) => (
          <TemplateComponentRow
            key={c.key}
            label={c.label}
            hint={c.hint}
            spec={byComponent(c.key)}
            busy={save.isPending || remove.isPending || isLoading}
            onSave={(body) => {
              // The PUT is a full-row upsert: any field it doesn't receive
              // is written as null. So always re-send the existing row's
              // other fields and let `body` override only what changed —
              // otherwise uploading a file wipes the saved check dims (and
              // vice-versa).
              const existing = byComponent(c.key);
              save.mutate({
                componentKey: c.key,
                templateFileUrl: existing?.templateFileUrl ?? null,
                artboardWInches: existing?.artboardWInches ?? null,
                artboardHInches: existing?.artboardHInches ?? null,
                expectedPages: existing?.expectedPages ?? null,
                color: existing?.color ?? null,
                fontsRule: existing?.fontsRule ?? null,
                ...body,
              });
            }}
            onRemove={(specId) => remove.mutate(specId)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Template file preview panel ─────────────────────────────────────────────
// Floating fixed-position panel that previews an uploaded template file.
// Resizable by dragging the top-left handle.
function TemplatePreviewPanel({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const [size, setSize] = useState({ w: 440, h: 560 });
  const isDragging = useRef(false);
  const startRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const isImage = /\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i.test(url);

  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    startRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !startRef.current) return;
    const dx = startRef.current.x - e.clientX;
    const dy = startRef.current.y - e.clientY;
    setSize({
      w: Math.max(320, Math.min(900, startRef.current.w + dx)),
      h: Math.max(280, Math.min(840, startRef.current.h + dy)),
    });
  };
  const onResizeUp = () => {
    isDragging.current = false;
    startRef.current = null;
  };

  return (
    <div
      className="fixed z-50 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
      style={{ bottom: "5rem", right: "1.5rem", width: size.w, height: size.h }}
      data-testid="panel-template-preview"
    >
      {/* Resize handle — drag toward top-left to enlarge */}
      <div
        className="absolute top-0 left-0 w-8 h-8 cursor-nw-resize z-10 flex items-end justify-end p-1"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        title="Drag to resize"
      >
        <GripVertical className="w-3.5 h-3.5 text-slate-300 rotate-45" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50 shrink-0">
        <div className="flex items-center gap-2 min-w-0 pl-4">
          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-xs font-medium text-slate-700 truncate">{title}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <a
            href={url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
            title="Download"
            data-testid="button-preview-download"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
          <IconButton
            label="Close preview"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800"
            data-testid="button-close-template-preview"
          >
            <X />
          </IconButton>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden bg-slate-100">
        {isImage ? (
          <img
            src={url}
            alt={title}
            className="w-full h-full object-contain"
            data-testid="img-template-preview"
          />
        ) : /\.pdf(\?|$)/i.test(url) ? (
          <object
            data={url}
            type="application/pdf"
            className="w-full h-full border-none"
            data-testid="object-template-preview"
          >
            {/* Fallback for browsers that block embedded PDF */}
            <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
              <FileText className="w-10 h-10 text-slate-300" />
              <p className="text-sm text-slate-500">Your browser can't embed this PDF.</p>
              <a
                href={url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-[var(--brand-blue)] hover:underline underline-offset-2"
                data-testid="link-template-preview-download-fallback"
              >
                <Download className="w-3.5 h-3.5" />
                Download to view
              </a>
            </div>
          </object>
        ) : (
          /* Unsupported file type — download fallback */
          <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
            <FileText className="w-10 h-10 text-slate-300" />
            <p className="text-sm text-slate-500">Preview not available for this file type.</p>
            <a
              href={url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--brand-blue)] hover:underline underline-offset-2"
              data-testid="link-template-preview-download-fallback"
            >
              <Download className="w-3.5 h-3.5" />
              Download to view
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateComponentRow({
  label,
  hint,
  spec,
  busy,
  onSave,
  onRemove,
}: {
  label: string;
  hint: string;
  spec: PressTemplateSpec | null;
  busy: boolean;
  onSave: (body: Partial<PressTemplateSpec>) => void;
  onRemove: (specId: string) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showDims, setShowDims] = useState(false);

  // Optional check-dims. These refine the finished-file check baseline
  // (preferred over the measured fallback when set; left blank = fallback).
  const numOrEmpty = (n: number | null | undefined) => (n == null ? "" : String(n));
  const [wDraft, setWDraft] = useState(numOrEmpty(spec?.artboardWInches));
  const [hDraft, setHDraft] = useState(numOrEmpty(spec?.artboardHInches));
  const [pagesDraft, setPagesDraft] = useState(numOrEmpty(spec?.expectedPages));
  const [colorDraft, setColorDraft] = useState<string>(spec?.color ?? "");
  useEffect(() => {
    setWDraft(numOrEmpty(spec?.artboardWInches));
    setHDraft(numOrEmpty(spec?.artboardHInches));
    setPagesDraft(numOrEmpty(spec?.expectedPages));
    setColorDraft(spec?.color ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.artboardWInches, spec?.artboardHInches, spec?.expectedPages, spec?.color]);

  const dimsDirty =
    wDraft !== numOrEmpty(spec?.artboardWInches) ||
    hDraft !== numOrEmpty(spec?.artboardHInches) ||
    pagesDraft !== numOrEmpty(spec?.expectedPages) ||
    colorDraft !== (spec?.color ?? "");

  const saveDims = () => {
    const w = wDraft.trim() === "" ? null : Number(wDraft);
    const h = hDraft.trim() === "" ? null : Number(hDraft);
    const pages = pagesDraft.trim() === "" ? null : Number(pagesDraft);
    if ((w != null && !Number.isFinite(w)) || (h != null && !Number.isFinite(h)) || (pages != null && !Number.isFinite(pages))) {
      toast({ title: "Enter valid numbers for the check dimensions.", variant: "destructive" });
      return;
    }
    onSave({
      artboardWInches: w,
      artboardHInches: h,
      expectedPages: pages,
      color: (colorDraft || null) as PressTemplateSpec["color"],
    });
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAdminDoc(file);
      onSave({ templateFileUrl: url });
    } catch (e: any) {
      toast({ title: e?.message || "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const commitUrl = () => {
    const url = urlDraft.trim();
    if (!url) return;
    onSave({ templateFileUrl: url });
    setUrlDraft("");
  };

  const fileUrl = spec?.templateFileUrl ?? null;
  const fileName = fileUrl ? fileUrl.split("/").pop() ?? "template" : null;
  const isImageFile = !!fileUrl && /\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i.test(fileUrl);

  return (
    <div className="py-2.5" data-testid={`template-row-${spec?.componentKey ?? label}`}>
      <div className="text-xs text-slate-500 mb-1" title={hint}>
        {label}
      </div>
      <div className="flex items-center gap-2">
        {fileUrl ? (
          <div className="flex-1 min-w-0 flex items-center gap-2 h-9 px-3 rounded-md border border-slate-200 bg-slate-50">
            {isImageFile ? (
              <img src={fileUrl} alt="" className="w-5 h-5 rounded object-cover shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <a
              href={fileUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-xs text-slate-600 hover:text-[var(--brand-blue)]"
              data-testid={`link-press-template-${spec?.componentKey ?? label}`}
              title={fileName ?? "Download template"}
            >
              <span data-testid={`text-template-filename-${spec?.componentKey ?? label}`}>
                {fileName}
              </span>
            </a>
          </div>
        ) : (
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitUrl();
            }}
            placeholder="Paste a URL"
            className="flex-1 min-w-0 h-9 px-3 rounded-md border border-slate-300 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[color:var(--brand-blue)] focus:ring-1 focus:ring-[color:var(--brand-blue)]"
            disabled={busy || uploading}
            data-testid={`input-template-url-${label.toLowerCase().replace(/\s+/g, "-")}`}
          />
        )}

        {!fileUrl && urlDraft.trim() && (
          <button
            type="button"
            onClick={commitUrl}
            disabled={busy}
            className="h-9 px-3 rounded-md border border-[color:var(--brand-blue)] bg-[color:var(--brand-blue-soft)] text-xs font-medium text-[color:var(--brand-blue)] hover:opacity-90 disabled:opacity-50 shrink-0"
            data-testid={`button-save-template-url-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        )}

        {!fileUrl && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || uploading}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:text-slate-800 hover:border-slate-400 disabled:opacity-50 shrink-0"
            title={uploading ? "Uploading…" : "Upload a file"}
            data-testid={`button-upload-template-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <Upload className="w-4 h-4" />
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              label={`${label} template options`}
              variant="ghost"
              size="md"
              disabled={busy || uploading}
              className="text-slate-500 hover:text-slate-800"
              data-testid={`button-template-menu-${spec?.componentKey ?? label}`}
            >
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {fileUrl && (
              <DropdownMenuItem onSelect={() => setPreviewOpen(true)}>
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              {fileUrl ? "Replace file" : "Upload a file"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setShowDims((v) => !v)}>
              <FileText className="w-4 h-4 mr-2" />
              {showDims ? "Hide finished-file check" : "Finished-file check…"}
            </DropdownMenuItem>
            {fileUrl && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-rose-600 focus:text-rose-600"
                  onSelect={() => setConfirmRemove(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Template preview panel — floating, resizable */}
      {previewOpen && fileUrl && (
        <TemplatePreviewPanel
          url={fileUrl}
          title={label}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {showDims && (
        <div className="mt-2.5 rounded-md border border-slate-100 bg-slate-50/60 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Finished-file check (optional)
          </span>
          <SaveLink
            dirty={dimsDirty}
            busy={busy}
            onClick={saveDims}
            testId={`button-save-template-dims-${label.toLowerCase().replace(/\s+/g, "-")}`}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            value={wDraft}
            onChange={(e) => setWDraft(e.target.value)}
            inputMode="decimal"
            placeholder="W (in)"
            className={INPUT}
            disabled={busy}
            data-testid={`input-template-w-${label.toLowerCase().replace(/\s+/g, "-")}`}
          />
          <input
            value={hDraft}
            onChange={(e) => setHDraft(e.target.value)}
            inputMode="decimal"
            placeholder="H (in)"
            className={INPUT}
            disabled={busy}
            data-testid={`input-template-h-${label.toLowerCase().replace(/\s+/g, "-")}`}
          />
          <input
            value={pagesDraft}
            onChange={(e) => setPagesDraft(e.target.value)}
            inputMode="numeric"
            placeholder="Pages"
            className={INPUT}
            disabled={busy}
            data-testid={`input-template-pages-${label.toLowerCase().replace(/\s+/g, "-")}`}
          />
          <select
            value={colorDraft}
            onChange={(e) => setColorDraft(e.target.value)}
            className={INPUT}
            disabled={busy}
            data-testid={`select-template-color-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <option value="">Color…</option>
            <option value="process-4c">Process 4C</option>
            <option value="cmyk-or-pms">CMYK or PMS</option>
          </select>
        </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={DOC_UPLOAD_ACCEPT}
        className="hidden"
        onChange={(e) => handleUpload(e.target.files?.[0])}
      />

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the {label} template?</AlertDialogTitle>
            <AlertDialogDescription>
              Artists will no longer be able to download this {label.toLowerCase()} template, and the
              finished-file check falls back to its measured defaults.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                if (spec) onRemove(spec.id);
                setConfirmRemove(false);
              }}
              data-testid="button-confirm-remove-template"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DeleteTierButton({
  tier,
  onConfirm,
  disabled,
}: {
  tier: CatalogTier;
  onConfirm: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="text-xs text-rose-600 hover:underline underline-offset-2 disabled:opacity-50"
        data-testid={`button-delete-tier-${tier.id}`}
      >
        Delete tier
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{tier.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the tier, every swatch under it, and every (tier × jacket) price ladder
              that used it. Albums already quoted on this tier keep their snapshot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Delete tier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DeleteJacketButton({
  jacket,
  onConfirm,
  disabled,
}: {
  jacket: CatalogJacket;
  onConfirm: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="text-xs text-rose-600 hover:underline underline-offset-2 disabled:opacity-50"
        data-testid={`button-delete-jacket-${jacket.id}`}
      >
        Delete jacket
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{jacket.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every (tier × jacket) price ladder that uses this jacket across every
              format on this press. Saved albums keep their snapshot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Delete jacket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AddQuantityButton({
  existing,
  onAdd,
  fmt,
}: {
  existing: number[];
  onAdd: (q: number) => void;
  fmt: AlbumFormat;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const commit = () => {
    const n = parseInt(text.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(n) || n <= 0) return;
    if (!existing.includes(n)) onAdd(n);
    setText("");
    setAdding(false);
  };
  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2"
        data-testid={`button-add-quantity-${fmt}`}
      >
        + Add qty
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setAdding(false);
            setText("");
          }
        }}
        autoFocus
        inputMode="numeric"
        placeholder="Qty"
        className="w-16 h-7 px-2 rounded-md border border-slate-200 text-xs bg-white focus:outline-none focus:border-[color:var(--brand-blue)]"
        data-testid={`input-new-quantity-${fmt}`}
      />
      <button
        type="button"
        onClick={commit}
        className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2"
      >
        Add
      </button>
    </div>
  );
}

function SwatchChip({
  pressId,
  color,
  onChanged,
  editable = true,
  onPreview,
  selected = false,
  mirror,
}: {
  pressId: string;
  color: CatalogColor;
  onChanged: () => void;
  editable?: boolean;
  onPreview?: () => void;
  selected?: boolean;
  // Task #2114 — when set, the editor shows a "Color applies to" toggle
  // that ADDITIVELY copies this swatch by NAME into the OTHER disc size's
  // same-named color group (12" ↔ 7"). It is convenience only — each
  // format still owns its own color rows; nothing is read-through.
  mirror?: { catalog: Catalog; groupName: string; currentSize: DiscSize; currentLabel?: string };
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(color.name);
  const [hex, setHex] = useState(color.swatchHex ?? "#000000");
  const [imageUrl, setImageUrl] = useState<string | null>(color.swatchImageUrl);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  useEffect(() => {
    setName(color.name);
    setHex(color.swatchHex ?? "#000000");
    setImageUrl(color.swatchImageUrl);
    setSelectedFileName(null);
  }, [color.id, color.name, color.swatchHex, color.swatchImageUrl]);

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/admin/manufacturers/${pressId}/catalog/colors/${color.id}`, {
        name: name.trim(),
        swatchHex: imageUrl ? null : hex,
        swatchImageUrl: imageUrl,
      });
    },
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
    onError: (e: any) => toast({ title: "Couldn't save swatch", description: e?.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/catalog/colors/${color.id}`);
    },
    onSuccess: () => {
      setConfirmDelete(false);
      setEditing(false);
      onChanged();
    },
    onError: (e: any) => toast({ title: "Couldn't delete swatch", description: e?.message, variant: "destructive" }),
  });
  const [cropToDisc, setCropToDisc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      return await uploadSwatchImage(file, { cropToDisc });
    },
    onSuccess: ({ url, maskApplied }) => {
      setImageUrl(url);
      // Surfaces the "we couldn't find a clear disc" case so the admin
      // knows the original mockup landed unchanged and can decide
      // whether to retouch by hand or upload a tighter source.
      if (cropToDisc && maskApplied === false) {
        toast({
          title: "Couldn't auto-detect the vinyl disc",
          description: "Saved the original photo as-is. Try a tighter mockup or turn the toggle off.",
        });
      }
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e?.message, variant: "destructive" }),
  });

  // ── Task #2114: cross-disc-size mirror ("Color applies to") ──
  const normName = (s: string) => s.trim().toLowerCase();
  const otherSize: DiscSize | null = mirror ? (mirror.currentSize === "12" ? "7" : "12") : null;
  const otherFmt = otherSize ? canonicalSwatchFormat(otherSize) : null;
  const otherTier =
    mirror && otherFmt
      ? (mirror.catalog.formats.find((f) => f.format === otherFmt)?.tiers ?? []).find(
          (t) => normName(t.name) === normName(mirror.groupName),
        ) ?? null
      : null;
  const mirroredColor = otherTier?.colors.find((c) => normName(c.name) === normName(color.name)) ?? null;
  const mirroredOn = !!mirroredColor;
  const setMirror = useMutation({
    mutationFn: async (on: boolean) => {
      if (!mirror || !otherFmt) return;
      if (on) {
        let tierId = otherTier?.id;
        if (!tierId) {
          const tr = await apiRequest(
            "POST",
            `/api/admin/manufacturers/${pressId}/catalog/formats/${otherFmt}/tiers`,
            { name: mirror.groupName },
          );
          tierId = ((await tr.json()) as { id: string }).id;
        }
        await apiRequest("POST", `/api/admin/manufacturers/${pressId}/catalog/tiers/${tierId}/colors`, {
          name: color.name,
          swatchHex: color.swatchImageUrl ? null : color.swatchHex,
          swatchImageUrl: color.swatchImageUrl,
        });
      } else if (mirroredColor) {
        await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/catalog/colors/${mirroredColor.id}`);
      }
    },
    onSuccess: onChanged,
    onError: (e: any) =>
      toast({ title: "Couldn't update where this color applies", description: e?.message, variant: "destructive" }),
  });
  const sizeLabel = (s: DiscSize) => (s === "12" ? '12" LP' : '7" Single');

  // Read-only chip — circular disc swatch (no text label). When the
  // editor passes onPreview, clicking the disc drives the live preview.
  if (!editable) {
    const ringCls = selected
      ? "ring-2 ring-[color:var(--brand-blue)] ring-offset-1"
      : "";
    const discEl = (
      <span
        className={`w-7 h-7 rounded-full border border-black/10 shrink-0 overflow-hidden block ${ringCls}`}
        style={
          color.swatchImageUrl
            ? { backgroundImage: `url(${color.swatchImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { background: color.swatchHex ?? "#cccccc" }
        }
      />
    );
    if (onPreview) {
      return (
        <button
          type="button"
          onClick={onPreview}
          aria-pressed={selected}
          className="rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)]"
          data-testid={`chip-color-${color.id}`}
          title={color.name}
        >
          {discEl}
        </button>
      );
    }
    return (
      <span data-testid={`chip-color-${color.id}`} title={color.name}>
        {discEl}
      </span>
    );
  }

  const ringCls = selected ? "ring-2 ring-[color:var(--brand-blue)] ring-offset-1" : "";
  return (
    <>
      <button
        type="button"
        onClick={() => {
          onPreview?.();
          setEditing(true);
        }}
        aria-pressed={selected}
        className={`w-7 h-7 rounded-full border border-black/10 overflow-hidden shrink-0 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)] ${ringCls}`}
        style={
          color.swatchImageUrl
            ? { backgroundImage: `url(${color.swatchImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { background: color.swatchHex ?? "#cccccc" }
        }
        data-testid={`chip-color-${color.id}`}
        title={color.name}
      />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit swatch</DialogTitle>
            <DialogDescription>
              Rename the color, input the hex code, or upload a photo for the vinyl swatch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Row 1: Name (wide) + Hex (narrow) side by side */}
            <div className="flex gap-3 items-end">
              <div className="flex-1 min-w-0">
                <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={INPUT}
                  data-testid={`input-swatch-name-${color.id}`}
                />
              </div>
              <div className="w-36 shrink-0">
                <span className={`block text-xs font-semibold uppercase tracking-wider mb-1 ${imageUrl ? "text-slate-300" : "text-slate-500"}`}>
                  Hex
                </span>
                <div className={`flex items-center gap-1.5 ${imageUrl ? "opacity-50 pointer-events-none" : ""}`}>
                  <input
                    type="color"
                    value={hex}
                    disabled={!!imageUrl}
                    onChange={(e) => setHex(e.target.value)}
                    className="h-9 w-9 shrink-0 rounded border border-slate-200 cursor-pointer disabled:cursor-not-allowed p-0.5"
                    data-testid={`input-swatch-hex-${color.id}`}
                  />
                  <input
                    value={hex}
                    disabled={!!imageUrl}
                    onChange={(e) => setHex(e.target.value)}
                    className={`${INPUT} font-mono`}
                  />
                </div>
                {imageUrl && (
                  <span className="block text-xs text-slate-400 mt-1">Photo overrides hex.</span>
                )}
              </div>
            </div>

            {/* Row 2: Photo — round disc preview + Upload button + helper text + drag-and-drop */}
            <div>
              <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">Photo</span>
              <div className="flex items-start gap-3">
                {/* Round disc preview — drag-and-drop target; clicking also triggers the picker */}
                <div
                  className={`w-14 h-14 rounded-full overflow-hidden shrink-0 border cursor-pointer transition-opacity ${
                    imageUrl ? "border-slate-200" : "border-dashed border-slate-300 bg-slate-50"
                  } ${upload.isPending ? "opacity-60" : ""}`}
                  style={
                    imageUrl
                      ? { backgroundImage: `url(${imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                      : {}
                  }
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) { setSelectedFileName(f.name); upload.mutate(f); }
                  }}
                  data-testid={`preview-swatch-photo-${color.id}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={upload.isPending}
                      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                      data-testid={`button-swatch-upload-${color.id}`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {upload.isPending ? "Uploading…" : "Upload"}
                    </button>
                    {imageUrl && (
                      <button
                        type="button"
                        onClick={() => setImageUrl(null)}
                        className="text-xs text-slate-500 hover:underline underline-offset-2"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    Drag an image onto the photo, or click upload.{" "}
                    JPEG, PNG, WEBP, or HEIC — up to 5 MB.
                  </p>
                  {/* Compact "Crop to vinyl disc" toggle folded into the Photo row */}
                  <label className="flex items-center gap-1.5 mt-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={cropToDisc}
                      onChange={(e) => setCropToDisc(e.target.checked)}
                      className="accent-[color:var(--brand-blue)]"
                      data-testid={`toggle-crop-disc-${color.id}`}
                    />
                    <span className="text-xs text-slate-600 font-medium">Crop to vinyl disc</span>
                  </label>
                </div>
                {/* Hidden file input — triggered programmatically */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setSelectedFileName(f.name); upload.mutate(f); e.target.value = ""; }
                  }}
                  data-testid={`input-swatch-upload-${color.id}`}
                />
              </div>
            </div>

            {/* Row 3: Color applies to — segmented pill toggles */}
            {mirror && otherSize && (
              <div>
                <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
                  Color applies to
                </span>
                <div className="flex items-center gap-2">
                  {/* Current size — always active, static pill */}
                  <span className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-full bg-[color:var(--brand-blue)] text-white">
                    <Eye className="w-3.5 h-3.5" />
                    {mirror.currentLabel ?? sizeLabel(mirror.currentSize)}
                  </span>
                  {/* Other size — click to toggle mirror on/off */}
                  <button
                    type="button"
                    onClick={() => !setMirror.isPending && setMirror.mutate(!mirroredOn)}
                    disabled={setMirror.isPending}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-full border transition-colors disabled:opacity-50 ${
                      mirroredOn
                        ? "bg-[color:var(--brand-blue)] text-white border-[color:var(--brand-blue)]"
                        : "bg-white text-slate-500 border-slate-300 hover:border-[color:var(--brand-blue)] hover:text-[color:var(--brand-blue)]"
                    }`}
                    data-testid={`toggle-color-applies-${otherSize}-${color.id}`}
                  >
                    <EyeOff className={`w-3.5 h-3.5 ${mirroredOn ? "opacity-60" : ""}`} />
                    {sizeLabel(otherSize)}
                    {setMirror.isPending ? "…" : ""}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer: trash icon left, Cancel + Save right */}
          <div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={remove.isPending}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-rose-500 hover:bg-rose-50 disabled:opacity-50 transition-colors"
              data-testid={`button-delete-color-${color.id}`}
              title="Delete swatch"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs text-slate-500 hover:underline underline-offset-2"
              >
                Cancel
              </button>
              <Button
                type="button"
                onClick={() => save.mutate()}
                disabled={!name.trim() || save.isPending}
                className="h-8 px-3 text-xs"
                data-testid={`button-save-color-${color.id}`}
              >
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{color.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the color from this group. Pricing for the group is unaffected. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid={`button-cancel-delete-color-${color.id}`}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
              disabled={remove.isPending}
              className="bg-rose-600 hover:bg-rose-700"
              data-testid={`button-confirm-delete-color-${color.id}`}
            >
              {remove.isPending ? "Deleting…" : "Delete swatch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AddSwatchChip({
  pressId,
  tierId,
  onChanged,
}: {
  pressId: string;
  tierId: string;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#000000");
  const create = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/admin/manufacturers/${pressId}/catalog/tiers/${tierId}/colors`, {
        name: name.trim(),
        swatchHex: hex,
      });
    },
    onSuccess: () => {
      setOpen(false);
      setName("");
      setHex("#000000");
      onChanged();
    },
    onError: (e: any) => toast({ title: "Couldn't add swatch", description: e?.message, variant: "destructive" }),
  });
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-7 h-7 rounded-full border border-dashed border-slate-300 inline-flex items-center justify-center text-slate-400 hover:border-[color:var(--brand-blue)] hover:text-[color:var(--brand-blue)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)]"
        data-testid={`button-add-color-${tierId}`}
        title="Add color"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add swatch</DialogTitle>
            <DialogDescription>Name and pick a hex; you can upload a photo from the chip after it lands.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Color name (e.g. Translucent Red)"
              className={INPUT}
              autoFocus
              data-testid={`input-add-color-name-${tierId}`}
            />
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={hex}
                onChange={(e) => setHex(e.target.value)}
                className="h-9 w-12 rounded border border-slate-200 cursor-pointer"
                data-testid={`input-add-color-hex-${tierId}`}
              />
              <input value={hex} onChange={(e) => setHex(e.target.value)} className={INPUT} />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-slate-500 hover:underline underline-offset-2"
              >
                Cancel
              </button>
              <Button
                type="button"
                onClick={() => create.mutate()}
                disabled={!name.trim() || create.isPending}
                className="h-8 px-3 text-xs"
                data-testid={`button-confirm-add-color-${tierId}`}
              >
                {create.isPending ? "Adding…" : "Add swatch"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-slate-500 text-[11px] font-semibold uppercase tracking-wider mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

/* PressLogoEditorDialog now lives in
 * `@/components/admin/PressLogoEditorDialog` so other admin
 * partner-shaped pages (Fulfillment, etc.) can share the same primitive.
 */
