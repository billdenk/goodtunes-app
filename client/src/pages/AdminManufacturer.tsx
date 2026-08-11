import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatUsdCents } from "@shared/money";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  X,
  Zap,
} from "lucide-react";
import { VinylPreview } from "@/components/VinylPreview";
import { resolveVinylColor, DEFAULT_JACKET_UPGRADE, type VinylColorOption } from "@shared/pressing";
import { resolvePressPlaceholderArt as _resolvePressPlaceholderArt } from "@/lib/pressPlaceholderArt";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAdminDark, useDarkMarkLogo } from "@/lib/adminAppearance";
import { postAdminImage } from "@/lib/adminUpload";
import { invalidateAdminEntity } from "@/lib/adminEntityInvalidation";
import { useToast } from "@/hooks/use-toast";
import { ViewAsPartnerButton } from "@/components/admin/ViewAsPartnerButton";
import { useAuth } from "@/hooks/useAuth";
import { AddressAutocompleteField } from "@/components/admin/AddressAutocompleteField";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { StatusDot } from "@/components/admin/StatusDot";
import { NotificationsCard } from "@/components/admin/NotificationsCard";
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
import { PressPackagePricingCatalog } from "@/pages/PressPackagePricingCatalog";
import { PressSpecs } from "@/pages/PressSpecs";
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
export type CatalogTab = AlbumFormat | "gooddeeds";

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
    <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-5 space-y-4" data-testid="panel-auto-trigger-consent">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--apple-ink)] flex items-center gap-2">
            <Zap className={`w-4 h-4 ${consented ? "text-[var(--brand-blue)]" : "text-[var(--apple-faint)]"}`} />
            Pool-funded early cut
          </div>
          <p className="text-[var(--apple-subink)] text-sm mt-1 max-w-xl">
            Allow GoodTunes to stage masters cuts early for this press's
            albums once their per-sale funding pool covers the minimum-run
            floor. Each cut still needs the artist's opt-in and your approval
            in the Early Cut Review queue — and no GoodTunes capital is ever
            fronted.
          </p>
          <div className="text-xs mt-2" data-testid="text-consent-state">
            {consented ? (
              <StatusDot tone="ready">Consent on — early cuts can be staged.</StatusDot>
            ) : (
              <StatusDot tone="neutral">Consent off — pools still build, but no cut is ever staged.</StatusDot>
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
      <div className="border-t border-[var(--apple-hairline)] pt-3" data-testid="section-early-cut-pools">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)] mb-2">Funding pools</div>
        {poolsLoading ? (
          <div className="text-xs text-[var(--apple-subink)]" data-testid="text-pools-loading">Loading pools…</div>
        ) : pools.length === 0 ? (
          <div className="text-xs text-[var(--apple-faint)] font-medium" data-testid="text-pools-empty">
            No albums are building a funding pool for this press yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {pools.map((p) => (
              <div
                key={p.albumId}
                className="flex items-center gap-3 rounded-lg border border-[var(--apple-hairline)] bg-[var(--apple-track)] px-3 py-2"
                data-testid={`row-pool-${p.albumId}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[var(--apple-ink)] truncate" data-testid={`text-pool-title-${p.albumId}`}>
                    {p.albumTitle}
                  </div>
                  <div className="text-xs text-[var(--apple-subink)] flex items-center gap-2 mt-0.5">
                    {p.mastersTriggeredAt ? (
                      <StatusDot tone="ready">Cut staged</StatusDot>
                    ) : p.artistConsentAt ? (
                      <StatusDot tone="accent">Artist opted in</StatusDot>
                    ) : (
                      <StatusDot tone="neutral">Awaiting artist opt-in</StatusDot>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-[var(--apple-ink)] tabular-nums" data-testid={`text-pool-available-${p.albumId}`}>
                    {usd(p.availableCents)}
                  </div>
                  <div className="text-xs text-[var(--apple-faint)] tabular-nums">
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
  // Logo policy (Aug 10 2026) — optional raster "identity icon" used only
  // for in-app identification (avatar chips, activity feeds). Product
  // surfaces (covers/center labels) keep rendering from the SVG logo.
  const [identityIconEditorOpen, setIdentityIconEditorOpen] = useState(false);
  // Dark-mode header logo: black marks (SVGs or black-on-transparent PNGs
  // like the Memphis badge) vanish on the charcoal backdrop — flip them
  // white and ring the tile dark gray. Colored logos/photos are left alone
  // (pixel-sampled darkness gate, not extension-based — Memphis is a PNG).
  const adminDark = useAdminDark();
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

  // handoff/press-specs — which Catalog section the quiet pull-down shows
  // (GoodTunes Packages / White Label / GoodDeed Certificates / Specs).
  // Deep-linkable via ?section= (partner-portal tab-in-URL convention).
  const [catalogSection, setCatalogSectionState] = useState<CatalogSection>(() => {
    if (typeof window === "undefined") return "packages";
    const q = new URLSearchParams(window.location.search).get("section");
    return q === "specs" || q === "gooddeeds" ? q : "packages";
  });
  const setCatalogSection = (next: CatalogSection) => {
    setCatalogSectionState(next);
    try {
      const u = new URL(window.location.href);
      if (next === "packages") u.searchParams.delete("section");
      else u.searchParams.set("section", next);
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
  const logoIsDarkMark = useDarkMarkLogo(m?.logoUrl ?? null);
  const invertHeaderLogo = adminDark && logoIsDarkMark;

  const save = useMutation({
    mutationFn: async (patch: Partial<Manufacturer>) => {
      const r = await apiRequest("PUT", `/api/admin/manufacturers/${id}`, patch);
      return (await r.json()) as Manufacturer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers", id] });
      // A press logo / vinyl_placeholder_url change re-resolves the press art
      // shown on album cards (batchEnrichWithPressPlaceholders), but that's
      // computed per-request and never cached in the DB — so the staleTime:Infinity
      // album list keeps the old art until a hard refresh. Invalidate it here.
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
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
      // Re-scrape can replace logoUrl, which feeds album-card press art — keep
      // the cached album list in sync (see save mutation note above).
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
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
      <main className="min-h-screen bg-[var(--apple-canvas)] flex items-center justify-center p-8">
        <p className="text-[var(--apple-subink)] text-sm">Admin only.</p>
      </main>
    );
  }
  if (!m) {
    return (
      <AdminFrame active="manufacturers">
        <div className="py-20 text-center">
          <h1 className="text-[var(--apple-ink)] text-lg font-semibold">Press not found</h1>
          <Link href="/admin/manufacturers" className="text-[var(--brand-blue)] text-sm hover:underline">
            Back to presses
          </Link>
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="manufacturers" contentWidth="wide">
      <div className="space-y-6">
        {/* BREADCRUMB */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium min-w-0">
            <Link href="/admin/manufacturers" className="hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors flex-shrink-0" data-testid="link-breadcrumb-presses">
              Presses
            </Link>
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
            <span className="text-slate-700 font-semibold truncate max-w-[420px]">{m.name}</span>
          </div>
          <ViewAsPartnerButton role="manufacturer" scopeId={id} label={m.name} />
        </div>

        {/* HEADER — logo tile + domain eyebrow + name + Visit link */}
        <div className="flex items-start gap-4 sm:gap-5">
          <button
            type="button"
            onClick={() => setLogoEditorOpen(true)}
            className={[
              "group relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden shadow-sm flex-shrink-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2",
              m.logoUrl ? (invertHeaderLogo ? "ring-1 ring-slate-700" : "") : "bg-white ring-1 ring-slate-200",
            ].join(" ")}
            aria-label="Edit press logo"
            data-testid="button-edit-press-logo"
          >
            {m.logoUrl ? (
              <img
                src={m.logoUrl}
                alt={m.name}
                className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]"
                style={invertHeaderLogo ? { filter: "invert(1) brightness(1.7)" } : undefined}
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
            {/* Identity icon chip (logo policy Aug 10 2026) — small avatar
                circle overlaid on the logo tile's corner. Click opens its own
                editor; stops propagation so it doesn't open the logo dialog. */}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setIdentityIconEditorOpen(true); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault(); e.stopPropagation(); setIdentityIconEditorOpen(true);
                }
              }}
              className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-[var(--brand-blue)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
              aria-label="Edit identity icon"
              title="Identity icon — shown next to the press name in lists and feeds"
              data-testid="button-edit-press-identity-icon"
            >
              {(m as any).identityIconUrl ? (
                <img src={(m as any).identityIconUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <Pencil className="w-3 h-3 text-slate-400" />
              )}
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
          {/* Identity icon (logo policy Aug 10 2026) — optional PNG/JPG used
              only for identification chips/avatars; never covers or labels. */}
          <PressLogoEditorDialog
            name={m.name}
            logoUrl={(m as any).identityIconUrl ?? null}
            apiPath={`/api/admin/manufacturers/${m.id}`}
            fieldName="identityIconUrl"
            title="Identity icon"
            hint="Optional PNG or JPG shown next to the press name in lists and activity feeds. Product surfaces (covers, center labels) always use the SVG logo. Remove it to fall back to the SVG here too."
            open={identityIconEditorOpen}
            onOpenChange={setIdentityIconEditorOpen}
            onInvalidate={() => {
              void invalidateAdminEntity(queryClient, "manufacturer", m.id);
            }}
            FallbackIcon={Factory}
            testIdPrefix="press-identity-icon"
          />
          <div className="flex-1 min-w-0">
            <h1
              className="text-[var(--apple-ink)] text-[30px] font-semibold tracking-[-0.02em] truncate"
              data-testid="heading-manufacturer-name"
            >
              {m.name}
            </h1>
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
                  className="px-2.5 py-1.5 rounded-full text-[11.5px] font-semibold inline-flex items-center gap-1.5 text-[var(--apple-blue)] hover:bg-[var(--apple-blue)]/10 disabled:opacity-50 disabled:cursor-not-allowed"
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
        {tab === "catalog" && catalogSection === "specs" && (
          <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: "32px 40px 96px" }}>
            {/* handoff/press-specs — Catalog heading + quiet section pull-down
                (SuperAdminPressSpecsDark), rendering the same Specs page the
                press sees. */}
            <div className="flex items-center gap-4">
              <h1 className="tracking-tight" style={{ color: adminDark ? "#f5f5f7" : "var(--apple-ink)", fontSize: 32, lineHeight: 1.1, fontWeight: 700 }}>
                Catalog
              </h1>
              <CatalogSectionPulldown value={catalogSection} onChange={setCatalogSection} dark={adminDark} />
            </div>
            <PressSpecs pressId={id} variant="admin" />
          </div>
        )}
        {tab === "catalog" && catalogSection === "gooddeeds" && (
          <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: "32px 40px 96px" }}>
            <div className="flex items-center gap-4">
              <h1 className="tracking-tight" style={{ color: adminDark ? "#f5f5f7" : "var(--apple-ink)", fontSize: 32, lineHeight: 1.1, fontWeight: 700 }}>
                Catalog
              </h1>
              <CatalogSectionPulldown value={catalogSection} onChange={setCatalogSection} dark={adminDark} />
            </div>
            <div className="mt-6 max-w-3xl">
              <GoodDeedPrintingEditor pressId={id} />
            </div>
          </div>
        )}
        {tab === "catalog" && catalogSection === "packages" && (
          <>
            <PressPackagePricingCatalog
              pressId={id}
              pressDomain={m?.domain ?? null}
              placeholderUrl={m?.vinylPlaceholderUrl ?? null}
              pressLogoUrl={m?.logoUrl ?? null}
              sectionPulldown={
                <CatalogSectionPulldown value={catalogSection} onChange={setCatalogSection} dark={adminDark} />
              }
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
        <AlertDialogContent className="rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Delete this press?</AlertDialogTitle>
            <AlertDialogDescription>
              Open RFQs that invited this plant will keep their reply rows, but the plant won't
              appear in new RFQs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-0 text-[var(--apple-subink)] hover:bg-[var(--apple-track)]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()} className="rounded-full bg-[var(--apple-critical)]/10 text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/20">
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

// Task #2670 — unified fulfillment destination picker reused on
// PartnerProfileForm (press default) and, via export, on AdminAlbum
// split rows. Loads from /api/fulfillment-destinations which merges
// partners + self-fulfilling presses + ad-hoc custom addresses.
interface UnifiedFulfillmentDest {
  id: string;
  kind: "partner" | "manufacturer" | "custom";
  name: string;
  city?: string | null;
  country?: string | null;
  // Task #2703 — custom ("Other") destinations carry a full contact card.
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  isResidential?: boolean;
}
export function UnifiedFulfillmentDestPicker({
  value,
  onChange,
  label,
  testId,
  allowAddNew,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  testId?: string;
  allowAddNew?: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: dests = [] } = useQuery<UnifiedFulfillmentDest[]>({
    queryKey: ["/api/fulfillment-destinations"],
  });
  const INPUT_CLS =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-blue)] disabled:opacity-60";

  const [creatingAddr, setCreatingAddr] = useState(false);
  const [addrName, setAddrName] = useState("");
  // Task #2703 — contact-card parity with the album Fulfillment tab's
  // "Other…" inline form: contact person, phone, email, residential flag.
  const [addrContact, setAddrContact] = useState("");
  const [addrPhone, setAddrPhone] = useState("");
  const [addrEmail, setAddrEmail] = useState("");
  const [addrResidential, setAddrResidential] = useState(false);
  const [addrLine1, setAddrLine1] = useState("");
  const [addrLine2, setAddrLine2] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [addrPostal, setAddrPostal] = useState("");
  const [addrCountry, setAddrCountry] = useState("");
  const [savingAddr, setSavingAddr] = useState(false);

  const saveAddr = async () => {
    if (!addrName.trim() && !addrContact.trim()) {
      toast({ title: "Company or contact name is required", variant: "destructive" });
      return;
    }
    setSavingAddr(true);
    try {
      const res = await apiRequest("POST", "/api/admin/fulfillment-destinations", {
        name: addrName.trim() || null,
        contactName: addrContact.trim() || null,
        phone: addrPhone.trim() || null,
        email: addrEmail.trim() || null,
        isResidential: addrResidential,
        addressLine1: addrLine1.trim() || null,
        addressLine2: addrLine2.trim() || null,
        city: addrCity.trim() || null,
        state: addrState.trim() || null,
        postalCode: addrPostal.trim() || null,
        country: addrCountry.trim() || null,
      });
      const newDest = await res.json();
      await qc.invalidateQueries({ queryKey: ["/api/fulfillment-destinations"] });
      onChange(newDest.id ?? "");
      setCreatingAddr(false);
      setAddrName(""); setAddrContact(""); setAddrPhone(""); setAddrEmail("");
      setAddrResidential(false);
      setAddrLine1(""); setAddrLine2(""); setAddrCity("");
      setAddrState(""); setAddrPostal(""); setAddrCountry("");
      toast({ title: "Address saved." });
    } catch {
      toast({ title: "Could not save address", variant: "destructive" });
    } finally {
      setSavingAddr(false);
    }
  };

  const sel = (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLS}
      data-testid={testId ?? "select-unified-fulfillment-dest"}
    >
      <option value="">— Platform default —</option>
      {dests.filter((d) => d.kind === "partner").length > 0 && (
        <optgroup label="Fulfillment warehouses">
          {dests
            .filter((d) => d.kind === "partner")
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </optgroup>
      )}
      {dests.filter((d) => d.kind === "manufacturer").length > 0 && (
        <optgroup label="Press (self-fulfill)">
          {dests
            .filter((d) => d.kind === "manufacturer")
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </optgroup>
      )}
      {dests.filter((d) => d.kind === "custom").length > 0 && (
        <optgroup label="Custom addresses">
          {dests
            .filter((d) => d.kind === "custom")
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.city ? ` — ${d.city}` : ""}
                {d.country ? `, ${d.country}` : ""}
              </option>
            ))}
        </optgroup>
      )}
    </select>
  );

  const inner = (
    <div className="space-y-1">
      {sel}
      {allowAddNew && !creatingAddr && (
        <button
          type="button"
          className="text-xs text-[var(--brand-blue)] hover:underline"
          onClick={() => setCreatingAddr(true)}
          data-testid="btn-picker-add-custom-addr"
        >
          + New custom address…
        </button>
      )}
      {allowAddNew && creatingAddr && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 mt-1">
          <p className="text-xs font-semibold text-slate-700">New custom address</p>
          <input placeholder="Company name" value={addrName} onChange={(e) => setAddrName(e.target.value)} className={INPUT_CLS} data-testid="input-picker-addr-name" />
          <input placeholder="Contact name" value={addrContact} onChange={(e) => setAddrContact(e.target.value)} className={INPUT_CLS} data-testid="input-picker-addr-contact" />
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Phone" value={addrPhone} onChange={(e) => setAddrPhone(e.target.value)} className={INPUT_CLS} data-testid="input-picker-addr-phone" />
            <input placeholder="Email" value={addrEmail} onChange={(e) => setAddrEmail(e.target.value)} className={INPUT_CLS} data-testid="input-picker-addr-email" />
          </div>
          <input placeholder="Address line 1" value={addrLine1} onChange={(e) => setAddrLine1(e.target.value)} className={INPUT_CLS} data-testid="input-picker-addr-line1" />
          <input placeholder="Address line 2 (optional)" value={addrLine2} onChange={(e) => setAddrLine2(e.target.value)} className={INPUT_CLS} data-testid="input-picker-addr-line2" />
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="City" value={addrCity} onChange={(e) => setAddrCity(e.target.value)} className={INPUT_CLS} data-testid="input-picker-addr-city" />
            <input placeholder="State" value={addrState} onChange={(e) => setAddrState(e.target.value)} className={INPUT_CLS} data-testid="input-picker-addr-state" />
            <input placeholder="Postal code" value={addrPostal} onChange={(e) => setAddrPostal(e.target.value)} className={INPUT_CLS} data-testid="input-picker-addr-postal" />
            <input placeholder="Country" value={addrCountry} onChange={(e) => setAddrCountry(e.target.value)} className={INPUT_CLS} data-testid="input-picker-addr-country" />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={addrResidential}
              onChange={(e) => setAddrResidential(e.target.checked)}
              data-testid="checkbox-picker-addr-residential"
            />
            Residential address
          </label>
          <div className="flex gap-2 pt-1">
            <Button type="button" size="sm" onClick={saveAddr} disabled={savingAddr || (!addrName.trim() && !addrContact.trim())} data-testid="btn-picker-save-addr">
              {savingAddr ? "Saving…" : "Save address"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreatingAddr(false)} data-testid="btn-picker-cancel-addr">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  if (!label) return inner;
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-slate-700">{label}</label>
      {inner}
    </div>
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
  // Task #2670 — unified default fulfillment dest. Resolves which FK to
  // write on save by looking up the kind from the /api/fulfillment-destinations
  // list; clears the other two columns so there's only ever one set.
  const { data: _allDests = [] } = useQuery<UnifiedFulfillmentDest[]>({
    queryKey: ["/api/fulfillment-destinations"],
  });
  // Seed the unified picker from whichever FK is set on the row.
  const initialDestId = (() => {
    if ((initial as any).defaultFulfillmentDestinationId) return (initial as any).defaultFulfillmentDestinationId as string;
    if ((initial as any).defaultFulfillmentManufacturerId) return (initial as any).defaultFulfillmentManufacturerId as string;
    if (initial.defaultFulfillmentPartnerId) return initial.defaultFulfillmentPartnerId;
    return "";
  })();
  const [defaultFulfillmentDestId, setDefaultFulfillmentDestId] = useState<string>(initialDestId);
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
    // Task #2670 — resolve which FK to write based on the unified dest kind;
    // clear the other two so only one is ever set at a time.
    const destEntry = _allDests.find((d) => d.id === defaultFulfillmentDestId);
    const resolvedPartnerDest = destEntry?.kind === "partner" ? defaultFulfillmentDestId : null;
    const resolvedMfrDest = destEntry?.kind === "manufacturer" ? defaultFulfillmentDestId : null;
    const resolvedCustomDest = destEntry?.kind === "custom" ? defaultFulfillmentDestId : null;
    // If nothing is selected, clear all three
    const noneSelected = !defaultFulfillmentDestId;
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
      // Task #2670 — write exactly one FK, clear the others
      defaultFulfillmentPartnerId: noneSelected ? null : (resolvedPartnerDest || null),
      defaultFulfillmentManufacturerId: noneSelected ? null : (resolvedMfrDest || null),
      defaultFulfillmentDestinationId: noneSelected ? null : (resolvedCustomDest || null),
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

      {/* Task #2670 — unified default fulfillment destination. Covers
          warehouse partners, self-fulfill presses, and custom addresses.
          allowAddNew surfaces an inline "New custom address…" form so
          operators don't have to navigate away. On save the submit()
          resolves the kind and writes exactly one FK column. */}
      <UnifiedFulfillmentDestPicker
        value={defaultFulfillmentDestId}
        onChange={setDefaultFulfillmentDestId}
        label="Default fulfillment destination"
        testId="select-mfr-default-dest"
        allowAddNew
      />

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
export type CatalogColor = {
  id: string;
  name: string;
  swatchHex: string | null;
  swatchImageUrl: string | null;
  // Task #2872 — ~150px thumbnail for chip grids. Null = fall back to swatchImageUrl.
  swatchThumbUrl: string | null;
  position: number;
  // Task #668 — set when the row was created by the MRP color-library
  // importer. Used to flag "already imported" on subsequent runs.
  importSourceUrl: string | null;
  // Task #2872 — cross-format color group id. Null on pre-existing rows.
  colorGroupId: string | null;
  /** Optional API alias used by pressing color payloads. */
  thumbnailUrl?: string | null;
};
export type CatalogTier = {
  id: string;
  name: string;
  position: number;
  priceLadder: { qty: number; unitCents: number; confirmed?: boolean }[];
  laddersByJacket: Record<string, { qty: number; unitCents: number; confirmed?: boolean }[]>;
  // Item 28 — 180 g heavyweight price book (shares run sizes with the 140 g
  // ladder above; each weight keeps its own numbers). Only jackets with a
  // saved 180 g ladder appear here.
  laddersByJacket180?: Record<string, { qty: number; unitCents: number; confirmed?: boolean }[]>;
  colors: CatalogColor[];
  // Task #2998 — operator-uploaded type-tile disc image (disc-masked upload).
  // Null = the tile falls back to the type's first color swatch.
  previewImageUrl?: string | null;
};
export type CatalogFormat = {
  format: AlbumFormat;
  position: number;
  tiers: CatalogTier[];
  // Task #1998 — format-specific default jacket resolved by the server.
  defaultJacketId: string | null;
  // Task #2168 — non-destructive hide flag (excluded from artist picker).
  hidden?: boolean;
  // Per-format turnaround override (week range). Null = inherit the
  // press-level default (manufacturers.turnaround_weeks_*).
  turnaroundWeeksMin?: number | null;
  turnaroundWeeksMax?: number | null;
  // Item 28 — template tiles tucked away by the press (componentKey values:
  // "jacket" | "inner_sleeve" | "labels" | "booklet"). Server default when the
  // press has never touched it: ["booklet"].
  hiddenTemplates?: string[];
};
export type CatalogJacket = {
  id: string;
  name: string;
  position: number;
  isDefault: boolean;
  // Task #1998 — null = applies to all formats (back-compat).
  applicableFormats: string[] | null;
};
export type Catalog = {
  formats: CatalogFormat[];
  jackets: CatalogJacket[];
  defaultJacketId: string | null;
  // Task #2335 — server-computed editor flag (pressUserCanEdit). Read-only
  // press "Staff" teammates get `false`; absent/undefined is treated as
  // editable (operators + Owner/Admin) so older payloads don't lock out.
  canEdit?: boolean;
  // handoff/cd-cassette-catalog — fixed-structure CD/cassette catalogs
  // (custom spot inks, run price ladder, turnaround), resolved server-side.
  cdCatalog?: { customSpotColors: { name: string; hex: string }[]; prices: { qty: number; unitCents: number }[]; turnaroundWeeksMin: number; turnaroundWeeksMax: number };
  cassetteCatalog?: { customSpotColors: { name: string; hex: string }[]; prices: { qty: number; unitCents: number }[]; turnaroundWeeksMin: number; turnaroundWeeksMax: number };
};

export const parseDollars = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};
export const formatDollars = (c: number) => (c / 100).toFixed(2);

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
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Paid units</div>
            <div className="text-[var(--apple-ink)] text-xl font-bold tabular-nums">{totalPaidUnits.toLocaleString()}</div>
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="text-[var(--apple-subink)] text-sm py-4">Loading…</div>
      ) : artists.length === 0 ? (
        <AdminEmptyState testId="empty-referrals">
          No artists invited yet.
        </AdminEmptyState>
      ) : (
        <ul className="divide-y divide-[var(--apple-hairline)]">
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
// Task #2872 — standard six rungs per Bill's catalog brief. 50 and 200
// survive as priced custom extras (shown only when they carry saved data).
export const DEFAULT_QTY_COLUMNS = [100, 300, 500, 1000, 2000, 3000];

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

export function HellbenderImportButton({
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Import colors from Hellbender</DialogTitle>
            <DialogDescription>
              Scrapes <span className="font-mono text-xs">hellbendervinyl.com/pages/custom-vinyl</span>{" "}
              for every color tile, runs each photo through the same disc mask used by the manual
              swatch uploader, and rehosts the result in our object storage. Re-runs update existing
              rows with a matching name instead of duplicating them.
            </DialogDescription>
          </DialogHeader>
          {previewMut.isPending && (
            <div className="py-8 text-center text-[var(--apple-subink)] text-sm" data-testid="text-import-preview-loading">
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
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full px-4 py-2 text-sm font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors"
                  data-testid="button-import-cancel"
                >
                  Cancel
                </button>
                <Button
                  type="button"
                  onClick={() => commitMut.mutate()}
                  disabled={commitMut.isPending || selectedCount === 0}
                  className="rounded-full"
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
export function pressPlaceholderArt(domain: string | null): string | null {
  return _resolvePressPlaceholderArt(domain);
}

// Task #2114 — vinyl formats carry the Color Options section; CD and
// cassette do not (their print/sticker customization is a future add).
export const VINYL_FORMATS: AlbumFormat[] = ["7_inch", "12_lp", "12_double"];
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
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]" data-testid="dialog-mrp-import">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Import colors from memphisrecordpressing.com</DialogTitle>
          <DialogDescription>
            Pulls the published <a href="https://memphisrecordpressing.com/all-vinyl-colors/" target="_blank" rel="noreferrer" className="text-[var(--brand-blue)] hover:underline underline-offset-2">all-vinyl-colors</a> page,
            groups tiles by MRP's own section headings (Translucent, Smoke Blends, …), and saves each
            swatch into the matching Vinyl tier. Rename any swatch in place before committing. Re-runs
            are safe — rows already imported show as "Already imported" and aren't touched (and
            existing names, hand-picked hex colors, and ladders are preserved on photo refreshes).
          </DialogDescription>
        </DialogHeader>

        {previewMut.isPending && (
          <div className="py-10 text-center text-sm text-[var(--apple-subink)]">Reading MRP color page…</div>
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
            <div className="rounded-md border border-[var(--apple-hairline)] bg-[var(--apple-track)] p-3 text-sm text-[var(--apple-ink)]">
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

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--apple-hairline)]">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full px-4 py-2 text-sm font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors"
            data-testid="button-mrp-import-close"
          >
            {result ? "Done" : "Cancel"}
          </button>
          {preview && !result && (
            <Button
              onClick={() => commitMut.mutate()}
              disabled={commitMut.isPending || selectableCount === 0}
              className="rounded-full"
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
type TwelveInchSyncPlan = {
  hasChanges: boolean;
  applied: boolean;
  groupCreates: { toFormat: string; name: string; colorCount: number }[];
  colorCopies: { toFormat: string; groupName: string; colorName: string }[];
  swatchFills: { toFormat: string; groupName: string; colorName: string }[];
};

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

export function CatalogCsvButtons({
  pressId,
  pressName,
  onApplied,
  canEdit = true,
}: {
  pressId: string;
  pressName: string | null;
  onApplied: () => void;
  // Task #2335 — Export stays available to read-only Staff; Upload (which
  // writes the catalog) is hidden for non-editors.
  canEdit?: boolean;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [plan, setPlan] = useState<CatalogCsvPlan | null>(null);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncPlan, setSyncPlan] = useState<TwelveInchSyncPlan | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncPreviewMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/manufacturers/${pressId}/catalog/sync-twelve-inch`, { apply: false });
      return (await r.json()) as TwelveInchSyncPlan;
    },
    onSuccess: (p) => setSyncPlan(p),
    onError: (e: any) => setSyncError(e?.message ?? "Couldn't check the 12\" formats."),
  });

  const syncApplyMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/manufacturers/${pressId}/catalog/sync-twelve-inch`, { apply: true });
      return (await r.json()) as TwelveInchSyncPlan;
    },
    onSuccess: (p) => {
      onApplied();
      setSyncOpen(false);
      toast({
        title: '12" formats synced',
        description: `${p.groupCreates.length} groups created · ${p.colorCopies.length} colors copied · ${p.swatchFills.length} swatches filled`,
      });
    },
    onError: (e: any) => toast({ title: "Sync failed", description: e?.message, variant: "destructive" }),
  });

  function openSync() {
    setSyncPlan(null);
    setSyncError(null);
    setSyncOpen(true);
    syncPreviewMut.mutate();
  }

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
          {canEdit && (
            <DropdownMenuItem
              onSelect={() => setOpen(true)}
              data-testid="button-catalog-csv-upload"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload CSV
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem
              onSelect={openSync}
              data-testid="button-catalog-sync-12in"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Sync 12&quot; formats
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]" data-testid="dialog-sync-12in">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Sync 12&quot; formats</DialogTitle>
            <DialogDescription>
              Reconciles differences between the 12&quot; LP and 12&quot; Double LP color catalogs in both
              directions: missing color groups and colors are copied over, and empty swatches inherit
              the other format&apos;s swatch. Pricing, ordering, and swatches that differ on both sides
              are never changed. Review the preview before applying.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {syncPreviewMut.isPending && (
              <div className="text-sm text-[var(--apple-subink)]" data-testid="sync-12in-loading">Comparing the two 12&quot; catalogs…</div>
            )}
            {syncError && (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" data-testid="sync-12in-error">
                {syncError}
              </div>
            )}
            {syncPlan && !syncPlan.hasChanges && (
              <div className="rounded-md border border-[var(--apple-hairline)] bg-[var(--apple-track)] p-3 text-sm text-[var(--apple-subink)]" data-testid="sync-12in-nochange">
                Already in sync — the two 12&quot; formats match.
              </div>
            )}
            {syncPlan && syncPlan.hasChanges && (
              <div className="space-y-2" data-testid="sync-12in-plan">
                <CatalogCsvPlanSection
                  title="Color groups to create"
                  added={syncPlan.groupCreates.map((g) => `${g.name} → ${g.toFormat} (${g.colorCount} colors)`)}
                />
                <CatalogCsvPlanSection
                  title="Colors to copy"
                  added={syncPlan.colorCopies.map((c) => `${c.groupName} — ${c.colorName} → ${c.toFormat}`)}
                />
                <CatalogCsvPlanSection
                  title="Swatches to fill"
                  updated={syncPlan.swatchFills.map((s) => `${s.groupName} — ${s.colorName} → ${s.toFormat}`)}
                />
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--apple-hairline)]">
            <button
              type="button"
              onClick={() => setSyncOpen(false)}
              className="rounded-full px-4 py-2 text-sm font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors"
              data-testid="button-sync-12in-close"
            >
              Cancel
            </button>
            <Button
              onClick={() => syncApplyMut.mutate()}
              disabled={!syncPlan?.hasChanges || syncPreviewMut.isPending || syncApplyMut.isPending}
              className="rounded-full"
              data-testid="button-sync-12in-apply"
            >
              {syncApplyMut.isPending ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]" data-testid="dialog-catalog-csv">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Upload catalog CSV</DialogTitle>
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
                <span className="text-xs text-[var(--apple-subink)]" data-testid="text-catalog-csv-filename">
                  {fileName}
                </span>
              )}
            </div>

            {previewMut.isPending && (
              <div className="py-6 text-center text-sm text-[var(--apple-subink)]">Reading CSV…</div>
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
                  className="rounded-md border border-[var(--apple-hairline)] bg-[var(--apple-track)] p-3 text-sm text-[var(--apple-subink)]"
                  data-testid="catalog-csv-nochange"
                >
                  No changes — this CSV matches the current catalog.
                </div>
              ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--apple-hairline)]">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-4 py-2 text-sm font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors"
              data-testid="button-catalog-csv-close"
            >
              Cancel
            </button>
            <Button
              onClick={() => applyMut.mutate()}
              disabled={!canApply}
              className="rounded-full"
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
export function HellbenderPricingSyncButton({
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Sync pricing from Hellbender</DialogTitle>
            <DialogDescription>
              Fetches every color's <span className="font-mono text-xs">/products/&lt;handle&gt;.js</span>{" "}
              from hellbendervinyl.com, decodes the Shopify variants (size × quantity × upgrade),
              and overwrites the matching rungs on this press's default-jacket combos. Splatter, 2LP,
              and quantities 750/2000/3000 are left untouched — they stay on the seeded private-quote
              values. Re-running is safe; identical prices are a no-op.
            </DialogDescription>
          </DialogHeader>
          {previewMut.isPending && (
            <div className="py-8 text-center text-[var(--apple-subink)] text-sm" data-testid="text-pricing-sync-loading">
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
                <Button type="button" onClick={close} className="rounded-full" data-testid="button-pricing-sync-close">
                  Done
                </Button>
              </div>
            </div>
          )}
          {!previewMut.isPending && !commitResult && proposal && (
            <div className="space-y-3">
              <div className="text-xs text-[var(--apple-subink)]" data-testid="text-pricing-sync-summary">
                Fetched {proposal.products.length} products · {proposal.writes.length} aggregated rungs ready ·{" "}
                {proposal.unmapped.length} unmapped
              </div>
              {proposal.writes.length > 0 && (
                <div className="rounded-md border border-[var(--apple-hairline)] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--apple-track)] text-[var(--apple-subink)]">
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
                          className="border-t border-[var(--apple-hairline)]"
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
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full px-4 py-2 text-sm font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors"
                  data-testid="button-pricing-sync-cancel"
                >
                  Cancel
                </button>
                <Button
                  type="button"
                  onClick={() => commitMut.mutate()}
                  disabled={commitMut.isPending || proposal.writes.length === 0}
                  className="rounded-full"
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

// ─── Format dropdown ─────────────────────────────────────────────────────────
// A dropdown that switches between Vinyl / CD / Cassette / GoodDeeds, with
// "Add format" items at the bottom. GoodDeeds is always available; physical
// formats only appear when offered. Vinyl keeps its secondary size-picker row.
export function FormatDropdown({
  offered,
  activeTab,
  onSetTab,
  onAddFormat,
  onRemoveFormat,
  addBusy,
  removeBusy,
  canEdit = true,
}: {
  offered: Set<string>;
  activeTab: CatalogTab | null;
  onSetTab: (tab: CatalogTab) => void;
  onAddFormat: (fmt: AlbumFormat) => void;
  onRemoveFormat?: (fmt: AlbumFormat) => void;
  addBusy?: boolean;
  removeBusy?: boolean;
  // Task #2335 — read-only Staff can switch between formats to VIEW them
  // but cannot add or remove formats.
  canEdit?: boolean;
}) {
  const offeredVinyl = VINYL_FORMATS.filter((f) => offered.has(f));
  const vinylActive = !!activeTab && activeTab !== "gooddeeds" && isVinylFormat(activeTab as AlbumFormat);

  const canAddVinyl = canEdit && offeredVinyl.length === 0;
  const canAddCD = canEdit && !offered.has("cd");
  const canAddCassette = canEdit && !offered.has("cassette");
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
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Format</span>
      <div className="flex flex-wrap items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full border border-[var(--apple-hairline)] bg-white text-sm font-medium text-[var(--apple-ink)] hover:bg-[var(--apple-track)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)]"
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
            {canEdit && onRemoveFormat && activeTab && activeTab !== "gooddeeds" && offered.has(activeTab) && (
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

// ─── handoff/press-specs — Catalog section pull-down (super admin) ──────────
// Quiet pill next to the Catalog heading picking between GoodTunes Packages /
// White Label / GoodDeed Certificates / Specs. Styles verbatim from
// SuperAdminPressSpecsDark (dark tokens), with light-theme equivalents.
type CatalogSection = "packages" | "white-label" | "gooddeeds" | "specs";
const CATALOG_SECTION_LABELS: Record<CatalogSection, string> = {
  packages: "GoodTunes Packages",
  "white-label": "White Label",
  gooddeeds: "GoodDeed Certificates",
  specs: "Specs",
};
function CatalogSectionPulldown({ value, onChange, dark }: { value: CatalogSection; onChange: (s: CatalogSection) => void; dark: boolean }) {
  const [open, setOpen] = useState(false);
  const CARD = dark ? "#1e1e20" : "#ffffff";
  const HAIRLINE = dark ? "rgba(255,255,255,0.10)" : "var(--apple-hairline)";
  const INK = dark ? "#f5f5f7" : "var(--apple-ink)";
  const SUBINK = dark ? "#98989d" : "var(--apple-subink)";
  const FAINT = dark ? "#6e6e73" : "var(--apple-faint)";
  const BLUE = "#319ED8";
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-8 pl-3.5 pr-2.5 rounded-full inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
        style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, color: INK }}
        data-testid="button-catalog-section"
      >
        {CATALOG_SECTION_LABELS[value]}
        <ChevronDown className="w-3.5 h-3.5" style={{ color: FAINT, transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-9 w-56 rounded-xl py-1.5 z-10"
          style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, boxShadow: dark ? "0 12px 32px rgba(0,0,0,0.55)" : "0 12px 32px rgba(0,0,0,0.16)" }}
        >
          {(Object.keys(CATALOG_SECTION_LABELS) as CatalogSection[]).map((s) => {
            const on = s === value;
            const soon = s === "white-label";
            return (
              <button
                key={s}
                type="button"
                disabled={soon}
                onClick={() => {
                  if (soon) return;
                  onChange(s);
                  setOpen(false);
                }}
                className={`w-full flex items-center px-3.5 h-8 text-[12.5px] text-left transition-colors ${soon ? "" : dark ? "hover:bg-white/5" : "hover:bg-black/5"}`}
                style={{ color: soon ? FAINT : on ? INK : SUBINK, fontWeight: on ? 600 : 400 }}
                data-testid={`option-section-${CATALOG_SECTION_LABELS[s].toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              >
                <span className="flex-1 truncate">{CATALOG_SECTION_LABELS[s]}</span>
                {soon && (
                  <span className="ml-auto flex-shrink-0 px-2 h-[18px] rounded-full text-[10px] font-semibold tracking-wide flex items-center" style={{ color: SUBINK, backgroundColor: dark ? "#26262a" : "#f2f2f4", border: `1px solid ${HAIRLINE}` }}>
                    Soon
                  </span>
                )}
                {on && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: BLUE }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── GoodDeed printing price editor ──────────────────────────────────────────
// Per-press price ladder for GoodDeed certificate printing runs.
// Stored in manufacturers.gooddeed_printing_json.
const GOODDEED_RUNGS = [25, 50, 100, 200, 300, 500, 1000] as const;

export function GoodDeedPrintingEditor({ pressId }: { pressId: string }) {
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
    setActive(data.active ?? false);
    const tiers = Array.isArray(data.tiers) ? data.tiers : [];
    const offered = new Set(tiers.map((t) => t.qty));
    setOfferedQtys(offered);
    const p: Record<number, string> = {};
    for (const t of tiers) {
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
        <div className="absolute z-20 mt-1 min-w-[12rem] rounded-md border border-[var(--apple-hairline)] bg-white shadow-lg py-1">
          {items.map(({ label, icon, fmt }) => (
            <button
              key={fmt}
              type="button"
              onClick={() => {
                onPick(fmt);
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-[var(--apple-ink)] hover:bg-[var(--apple-track)]"
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
        <div className="absolute z-20 mt-1 min-w-[11rem] rounded-md border border-[var(--apple-hairline)] bg-white shadow-lg py-1">
          {available.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                onPick(f);
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-[var(--apple-ink)] hover:bg-[var(--apple-track)]"
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

// Per-product turnaround override. The press-level "Standard turnaround"
// (manufacturers.turnaround_weeks_*) is the default; this lets the operator
// say a specific product presses faster or slower (e.g. a 7" turns around
// quicker than a gatefold double LP). Blank inputs inherit the press default.
// Saves through the same formats PUT the hide/enable toggles use.
export function FormatTurnaroundEditor({
  pressId,
  format,
  initialMin,
  initialMax,
  onChanged,
}: {
  pressId: string;
  format: AlbumFormat;
  initialMin: number | null;
  initialMax: number | null;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const { data: press } = useQuery<Manufacturer>({
    queryKey: ["/api/manufacturers", pressId],
  });
  const [min, setMin] = useState(initialMin != null ? String(initialMin) : "");
  const [max, setMax] = useState(initialMax != null ? String(initialMax) : "");
  // Resync when the operator switches products (or a save refetches the
  // catalog) so the inputs always mirror the saved values.
  useEffect(() => {
    setMin(initialMin != null ? String(initialMin) : "");
    setMax(initialMax != null ? String(initialMax) : "");
  }, [format, initialMin, initialMax]);

  const rangeLabel = (lo: number | null, hi: number | null): string | null => {
    if (lo != null && hi != null) return `${lo}–${hi} weeks`;
    if (lo != null) return `${lo}+ weeks`;
    if (hi != null) return `up to ${hi} weeks`;
    return null;
  };
  const pressMin = press?.turnaroundWeeksMin ?? null;
  const pressMax = press?.turnaroundWeeksMax ?? null;
  const pressLabel = rangeLabel(pressMin, pressMax);
  // A blank side inherits the press default per-field — matching the "leave
  // blank to use the press default" copy and the input placeholders. So a 7"
  // with min 6 and a blank max resolves to 6–<press default max>, not "6+".
  const resolvedMin = initialMin ?? pressMin;
  const resolvedMax = initialMax ?? pressMax;
  const resolvedLabel = rangeLabel(resolvedMin, resolvedMax);

  const parse = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isInteger(n) && n > 0 && n <= 520 ? n : null;
  };
  const parsedMin = parse(min);
  const parsedMax = parse(max);
  const minBad = min.trim() !== "" && parsedMin === null;
  const maxBad = max.trim() !== "" && parsedMax === null;
  const rangeBad = parsedMin != null && parsedMax != null && parsedMin > parsedMax;
  const dirty = parsedMin !== (initialMin ?? null) || parsedMax !== (initialMax ?? null);
  const hasOverride = initialMin != null || initialMax != null;

  const save = useMutation({
    mutationFn: async (payload: {
      turnaroundWeeksMin: number | null;
      turnaroundWeeksMax: number | null;
    }) => {
      const r = await apiRequest(
        "PUT",
        `/api/admin/manufacturers/${pressId}/catalog/formats/${format}`,
        payload,
      );
      return r.json();
    },
    onSuccess: () => {
      onChanged();
      toast({ title: "Turnaround saved" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save turnaround",
        description: e?.message ?? "",
        variant: "destructive",
      }),
  });

  const inputCls =
    "w-16 h-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]";

  return (
    <div
      className="border-t border-slate-100 px-5 py-4"
      data-testid={`format-turnaround-${format}`}
    >
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        Turnaround
      </span>
      <p className="text-sm text-slate-500 mt-1">
        How long this product takes to press.{" "}
        {pressLabel
          ? `Leave blank to use the press default (${pressLabel}).`
          : "Leave blank to use the press default."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          inputMode="numeric"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onBlur={() => {
            if (!minBad && !maxBad && !rangeBad && dirty) {
              save.mutate({ turnaroundWeeksMin: parsedMin, turnaroundWeeksMax: parsedMax });
            }
          }}
          placeholder={pressMin != null ? String(pressMin) : "min"}
          aria-label="Minimum weeks"
          className={inputCls}
          data-testid={`input-format-turnaround-min-${format}`}
        />
        <span className="text-sm text-slate-400">–</span>
        <input
          inputMode="numeric"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onBlur={() => {
            if (!minBad && !maxBad && !rangeBad && dirty) {
              save.mutate({ turnaroundWeeksMin: parsedMin, turnaroundWeeksMax: parsedMax });
            }
          }}
          placeholder={pressMax != null ? String(pressMax) : "max"}
          aria-label="Maximum weeks"
          className={inputCls}
          data-testid={`input-format-turnaround-max-${format}`}
        />
        <span className="text-sm text-slate-500">weeks</span>
        {hasOverride && (
          <button
            type="button"
            onClick={() => save.mutate({ turnaroundWeeksMin: null, turnaroundWeeksMax: null })}
            disabled={save.isPending}
            className="text-xs text-slate-500 hover:underline underline-offset-2"
            data-testid={`button-clear-format-turnaround-${format}`}
          >
            Use press default
          </button>
        )}
      </div>
      {rangeBad && (
        <p className="mt-2 text-xs text-rose-600">Min weeks can't be more than max weeks.</p>
      )}
      <p
        className="mt-2 text-xs text-slate-400"
        data-testid={`text-format-turnaround-resolved-${format}`}
      >
        {hasOverride
          ? `This product: ${resolvedLabel ?? "—"}`
          : pressLabel
          ? `Using press default: ${pressLabel}`
          : "No turnaround set yet."}
      </p>
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
  componentKey: "jacket" | "labels" | "inner_sleeve" | "booklet";
  variantKey: string;
  discCount: number;
  artboardWInches: number | null;
  artboardHInches: number | null;
  expectedPages: number | null;
  minPpi: number | null;
  color: "process-4c" | "cmyk-or-pms" | null;
  fontsRule: string | null;
  templateFileUrl: string | null;
  // Task #3012 — per-component print-rule overrides (null = inherit the
  // press-level defaults saved in the Print rules card below).
  printRules: PressPrintRulesDraftShape | null;
  // Task #3011 — measured-from-template values (server scans the attached
  // PDF). Explicit fields above always win; these fill in when blank.
  measuredArtboardWInches: number | null;
  measuredArtboardHInches: number | null;
  measuredPages: number | null;
  measuredHasCmyk: boolean | null;
  measuredHasRgb: boolean | null;
  measuredHasSpot: boolean | null;
  measuredHasLiveText: boolean | null;
  measuredHasEmbeddedFonts: boolean | null;
  measuredHasDieline: boolean | null;
  measuredAt: string | null;
  measuredError: string | null;
};

// Task #3012 — shared shape for print rules (press-level defaults +
// per-component overrides). Mirrors shared/vendorSpecs.ts PressPrintRules.
type PressPrintRulesDraftShape = {
  bleedMinInches?: number | null;
  bleedRecommendedInches?: number | null;
  safetyMarginInches?: number | null;
  minPpi?: number | null;
  minPpiBitmap?: number | null;
  grayscaleRequired?: boolean | null;
  pantoneOnly?: boolean | null;
  placedImageRule?: string | null;
  advisories?: string[] | null;
  labelAdvisories?: string[] | null;
  acceptedFormatsNote?: string | null;
  jobOptionsUrl?: string | null;
  jobOptionsName?: string | null;
  preflightProfileUrl?: string | null;
  preflightProfileName?: string | null;
};
const TEMPLATE_COMPONENTS: {
  key: PressTemplateSpec["componentKey"];
  label: string;
  hint: string;
}[] = [
  { key: "jacket", label: "Jacket", hint: "Outer sleeve / cover artwork" },
  { key: "inner_sleeve", label: "Inner Sleeve", hint: "Printed inner sleeve / bag" },
  { key: "labels", label: "Center Labels", hint: "On-disc label artwork" },
  { key: "booklet", label: "Booklet", hint: "Printed booklet / insert pages" },
];

export function PressTemplateSpecsCard({ pressId, fmt }: { pressId: string; fmt: AlbumFormat }) {
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
  // Task #3011 — manual re-measure of an attached template file.
  const rescan = useMutation({
    mutationFn: async (specId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/admin/manufacturers/${pressId}/template-specs/${specId}/measure`,
      );
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk }),
    onError: (e: any) =>
      toast({ title: e?.message || "Couldn't measure the template", variant: "destructive" }),
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
                minPpi: existing?.minPpi ?? null,
                color: existing?.color ?? null,
                fontsRule: existing?.fontsRule ?? null,
                printRules: existing?.printRules ?? null,
                ...body,
              });
            }}
            onRemove={(specId) => remove.mutate(specId)}
            onRescan={(specId) => rescan.mutate(specId)}
            rescanBusy={rescan.isPending}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Task #3012 — Press-level print rules (MRP guide parity) ─────────────────
// One jsonb blob per press (manufacturers.print_rules): machine-checkable
// print standards the completed-art check enforces (bleed min/recommended,
// safety margin, dual PPI floors, Pantone-only, placed-image rule,
// advisories) plus the accepted-formats note and reference artifacts
// (.joboptions / preflight profile) shown to whoever uploads. Blank =
// today's behavior; component rows can override per field. Mirrors the
// PressAudioSpecCard save pattern (full-document PUT).
export function PressPrintRulesCard({ pressId }: { pressId: string }) {
  const { toast } = useToast();
  const fileRefs = { joboptions: useRef<HTMLInputElement>(null), preflight: useRef<HTMLInputElement>(null) };
  const qk = ["/api/admin/manufacturers", pressId, "print-rules"];
  const { data, isLoading } = useQuery<{ printRules: PressPrintRulesDraftShape | null }>({
    queryKey: qk,
  });
  const rules = data?.printRules ?? null;

  const numOrEmpty = (n: number | null | undefined) => (n == null ? "" : String(n));
  const [bleedMin, setBleedMin] = useState("");
  const [bleedRec, setBleedRec] = useState("");
  const [safety, setSafety] = useState("");
  const [minPpi, setMinPpi] = useState("");
  const [bitmapPpi, setBitmapPpi] = useState("");
  const [grayscale, setGrayscale] = useState(false);
  const [pantone, setPantone] = useState(false);
  const [placedRule, setPlacedRule] = useState("");
  const [advisories, setAdvisories] = useState("");
  const [labelAdvisories, setLabelAdvisories] = useState("");
  const [formatsNote, setFormatsNote] = useState("");
  const [artifacts, setArtifacts] = useState<{
    jobOptionsUrl: string | null;
    jobOptionsName: string | null;
    preflightProfileUrl: string | null;
    preflightProfileName: string | null;
  }>({ jobOptionsUrl: null, jobOptionsName: null, preflightProfileUrl: null, preflightProfileName: null });
  const [uploading, setUploading] = useState<"joboptions" | "preflight" | null>(null);

  useEffect(() => {
    setBleedMin(numOrEmpty(rules?.bleedMinInches));
    setBleedRec(numOrEmpty(rules?.bleedRecommendedInches));
    setSafety(numOrEmpty(rules?.safetyMarginInches));
    setMinPpi(numOrEmpty(rules?.minPpi));
    setBitmapPpi(numOrEmpty(rules?.minPpiBitmap));
    setGrayscale(!!rules?.grayscaleRequired);
    setPantone(!!rules?.pantoneOnly);
    setPlacedRule(rules?.placedImageRule ?? "");
    setAdvisories((rules?.advisories ?? []).join("\n"));
    setLabelAdvisories((rules?.labelAdvisories ?? []).join("\n"));
    setFormatsNote(rules?.acceptedFormatsNote ?? "");
    setArtifacts({
      jobOptionsUrl: rules?.jobOptionsUrl ?? null,
      jobOptionsName: rules?.jobOptionsName ?? null,
      preflightProfileUrl: rules?.preflightProfileUrl ?? null,
      preflightProfileName: rules?.preflightProfileName ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules]);

  const buildBody = (over: Partial<typeof artifacts> = {}): PressPrintRulesDraftShape | null => {
    const num = (s: string) => (s.trim() === "" ? null : Number(s));
    const lines = (s: string) =>
      s.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 12);
    const a = { ...artifacts, ...over };
    const body: PressPrintRulesDraftShape = {
      bleedMinInches: num(bleedMin),
      bleedRecommendedInches: num(bleedRec),
      safetyMarginInches: num(safety),
      minPpi: num(minPpi) != null ? Math.round(num(minPpi)!) : null,
      minPpiBitmap: num(bitmapPpi) != null ? Math.round(num(bitmapPpi)!) : null,
      grayscaleRequired: grayscale || null,
      pantoneOnly: pantone || null,
      placedImageRule: placedRule.trim() || null,
      advisories: lines(advisories).length > 0 ? lines(advisories) : null,
      labelAdvisories: lines(labelAdvisories).length > 0 ? lines(labelAdvisories) : null,
      acceptedFormatsNote: formatsNote.trim() || null,
      jobOptionsUrl: a.jobOptionsUrl,
      jobOptionsName: a.jobOptionsName,
      preflightProfileUrl: a.preflightProfileUrl,
      preflightProfileName: a.preflightProfileName,
    };
    const bad = [body.bleedMinInches, body.bleedRecommendedInches, body.safetyMarginInches, body.minPpi, body.minPpiBitmap].some(
      (n) => n != null && !Number.isFinite(n),
    );
    if (bad) {
      toast({ title: "Enter valid numbers for the print rules.", variant: "destructive" });
      return null;
    }
    return Object.values(body).some((v) => v != null) ? body : null;
  };

  const save = useMutation({
    mutationFn: async (printRules: PressPrintRulesDraftShape | null) => {
      const res = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/print-rules`, {
        printRules,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      toast({ title: "Print rules saved" });
    },
    onError: (e: any) =>
      toast({ title: e?.message || "Couldn't save print rules", variant: "destructive" }),
  });

  const busy = save.isPending || isLoading || uploading != null;

  const handleArtifactUpload = async (slot: "joboptions" | "preflight", file: File | undefined) => {
    if (!file) return;
    setUploading(slot);
    try {
      const url = await uploadAdminDoc(file);
      const over =
        slot === "joboptions"
          ? { jobOptionsUrl: url, jobOptionsName: file.name }
          : { preflightProfileUrl: url, preflightProfileName: file.name };
      setArtifacts((a) => ({ ...a, ...over }));
      const body = buildBody(over);
      save.mutate(body);
    } catch (e: any) {
      toast({ title: e?.message || "Upload failed", variant: "destructive" });
    } finally {
      setUploading(null);
      const ref = fileRefs[slot].current;
      if (ref) ref.value = "";
    }
  };

  const artifactRow = (
    slot: "joboptions" | "preflight",
    label: string,
    url: string | null,
    name: string | null,
  ) => (
    <div className="flex items-center gap-2">
      <span className="w-44 shrink-0 text-xs font-medium text-slate-600">{label}</span>
      {url ? (
        <>
          <a
            href={url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate text-xs text-slate-600 hover:text-[var(--brand-blue)]"
            data-testid={`link-print-artifact-${slot}`}
          >
            {name || url.split("/").pop()}
          </a>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const over =
                slot === "joboptions"
                  ? { jobOptionsUrl: null, jobOptionsName: null }
                  : { preflightProfileUrl: null, preflightProfileName: null };
              setArtifacts((a) => ({ ...a, ...over }));
              save.mutate(buildBody(over));
            }}
            className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-50"
            data-testid={`button-remove-print-artifact-${slot}`}
          >
            Remove
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRefs[slot].current?.click()}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50"
          data-testid={`button-upload-print-artifact-${slot}`}
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading === slot ? "Uploading…" : "Upload"}
        </button>
      )}
      <input
        ref={fileRefs[slot]}
        type="file"
        className="hidden"
        onChange={(e) => handleArtifactUpload(slot, e.target.files?.[0])}
      />
    </div>
  );

  return (
    <div className="border-t border-slate-100 px-5 py-4">
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        Print rules
      </span>
      <p className="mt-1 text-xs text-slate-400">
        The plant's published print standards — these drive the completed-artwork check's
        pass/warn/fail verdicts. Leave a field blank for no check (today's behavior). Component
        rows in the product specs above can override any value per piece.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <input value={bleedMin} onChange={(e) => setBleedMin(e.target.value)} inputMode="decimal" placeholder="Bleed min (in)" title="Minimum bleed beyond the trim line, inches — fails below this." className={INPUT} disabled={busy} data-testid="input-print-bleed-min" />
        <input value={bleedRec} onChange={(e) => setBleedRec(e.target.value)} inputMode="decimal" placeholder="Bleed rec (in)" title="Recommended bleed, inches — warns below this." className={INPUT} disabled={busy} data-testid="input-print-bleed-rec" />
        <input value={safety} onChange={(e) => setSafety(e.target.value)} inputMode="decimal" placeholder="Safety (in)" title="Safety margin from the cut line, inches — advisory only." className={INPUT} disabled={busy} data-testid="input-print-safety" />
        <input value={minPpi} onChange={(e) => setMinPpi(e.target.value)} inputMode="numeric" placeholder="Min PPI" title="PPI floor for standard placed images (component Min PPI wins when both are set)." className={INPUT} disabled={busy} data-testid="input-print-min-ppi" />
        <input value={bitmapPpi} onChange={(e) => setBitmapPpi(e.target.value)} inputMode="numeric" placeholder="Bitmap PPI" title="Second PPI floor for 1-bit / bitmap / line-art images." className={INPUT} disabled={busy} data-testid="input-print-bitmap-ppi" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={grayscale}
            onChange={(e) => setGrayscale(e.target.checked)}
            disabled={busy}
            data-testid="checkbox-print-grayscale"
          />
          Grayscale required for B/W pieces
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={pantone}
            onChange={(e) => setPantone(e.target.checked)}
            disabled={busy}
            data-testid="checkbox-print-pantone"
          />
          Official Pantone spot colors only
        </label>
      </div>
      <input
        value={placedRule}
        onChange={(e) => setPlacedRule(e.target.value)}
        placeholder="Placed-image format rule (e.g. 'No GIF or PNG-sourced images')"
        className={`${INPUT} mt-2 w-full`}
        disabled={busy}
        data-testid="input-print-placed-rule"
      />
      <textarea
        value={advisories}
        onChange={(e) => setAdvisories(e.target.value)}
        rows={2}
        placeholder="Advisories, one per line — rules the check can't verify (shown as info rows on every piece)"
        className={`${INPUT} mt-2 w-full`}
        disabled={busy}
        data-testid="textarea-print-advisories"
      />
      <textarea
        value={labelAdvisories}
        onChange={(e) => setLabelAdvisories(e.target.value)}
        rows={2}
        placeholder="Center-label advisories, one per line (e.g. 'Solid image, no center-hole knockout')"
        className={`${INPUT} mt-2 w-full`}
        disabled={busy}
        data-testid="textarea-print-label-advisories"
      />
      <textarea
        value={formatsNote}
        onChange={(e) => setFormatsNote(e.target.value)}
        rows={2}
        placeholder='Accepted submission formats note shown to uploaders (e.g. "Press-quality PDF preferred")'
        className={`${INPUT} mt-2 w-full`}
        disabled={busy}
        data-testid="textarea-print-formats-note"
      />

      <div className="mt-3 space-y-2">
        {artifactRow("joboptions", "PDF output preset (.joboptions)", artifacts.jobOptionsUrl, artifacts.jobOptionsName)}
        {artifactRow("preflight", "Preflight profile", artifacts.preflightProfileUrl, artifacts.preflightProfileName)}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          type="button"
          disabled={busy}
          onClick={() => save.mutate(buildBody())}
          data-testid="button-save-print-rules"
        >
          {save.isPending ? "Saving…" : "Save print rules"}
        </Button>
        {rules && (
          <button
            type="button"
            disabled={busy}
            onClick={() => save.mutate(null)}
            className="text-sm text-slate-500 hover:text-[var(--brand-heart)] disabled:opacity-50"
            data-testid="button-clear-print-rules"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Task #2324 — Operator/partner-editable AUDIO spec override ──────────────
// One row per press. Mirrors PressTemplateSpecsCard but for the AUDIO
// preflight: the plant's CONFIRMED bit depth, sample-rate minimum, and
// per-side length budgets. The validator resolves these OVER the measured
// constants in shared/vendorSpecs.ts — a BLANK field inherits the baseline,
// so nothing is fabricated. Most plants (Viryl etc.) publish no audio
// numbers at all, which is the gap this fills. Press-scoped (not per format).
type PressAudioSpec = {
  id: string;
  requiredBitDepth: number | null;
  requiredSampleRateHz: number | null;
  maxSideSeconds: Record<string, Record<string, number>> | null;
  notes: string | null;
};
const AUDIO_SIZES = ['7"', '10"', '12"'] as const;
const AUDIO_RPMS = ["33", "45"] as const;

// The inherited measured-baseline this press resolves to when a field is left
// blank (server-resolved per press in GET …/audio-spec). Surfaced beside each
// input so operators can see the default at a glance.
type AudioBaseline = {
  requiredBitDepth: number | null;
  requiredSampleRateHz: number | null;
  maxSideSeconds: Record<string, Record<string, number>> | null;
};

export function PressAudioSpecCard({ pressId }: { pressId: string }) {
  const { toast } = useToast();
  const qk = ["/api/admin/manufacturers", pressId, "audio-spec"];
  const { data, isLoading } = useQuery<{
    spec: PressAudioSpec | null;
    baseline: AudioBaseline | null;
  }>({ queryKey: qk });
  const spec = data?.spec ?? null;
  const baseline = data?.baseline ?? null;

  const [bitDepth, setBitDepth] = useState("");
  const [sampleKhz, setSampleKhz] = useState("");
  const [grid, setGrid] = useState<Record<string, Record<string, string>>>({});
  const [notes, setNotes] = useState("");

  // Rehydrate the draft from the saved row whenever it (re)loads. Seconds
  // are surfaced to operators as minutes (one decimal); Hz as kHz.
  useEffect(() => {
    setBitDepth(spec?.requiredBitDepth != null ? String(spec.requiredBitDepth) : "");
    setSampleKhz(
      spec?.requiredSampleRateHz != null ? String(spec.requiredSampleRateHz / 1000) : "",
    );
    const g: Record<string, Record<string, string>> = {};
    for (const size of AUDIO_SIZES) {
      for (const rpm of AUDIO_RPMS) {
        const secs = spec?.maxSideSeconds?.[size]?.[rpm];
        if (typeof secs === "number") {
          (g[size] ??= {})[rpm] = String(Math.round((secs / 60) * 10) / 10);
        }
      }
    }
    setGrid(g);
    setNotes(spec?.notes ?? "");
  }, [spec]);

  const save = useMutation({
    mutationFn: async () => {
      const maxSideSeconds: Record<string, Record<string, number>> = {};
      for (const size of AUDIO_SIZES) {
        for (const rpm of AUDIO_RPMS) {
          const raw = grid[size]?.[rpm];
          const mins = raw != null && raw.trim() !== "" ? Number(raw) : NaN;
          if (Number.isFinite(mins) && mins > 0) {
            (maxSideSeconds[size] ??= {})[rpm] = Math.round(mins * 60);
          }
        }
      }
      const bd = bitDepth.trim() !== "" ? Number(bitDepth) : NaN;
      const khz = sampleKhz.trim() !== "" ? Number(sampleKhz) : NaN;
      const res = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/audio-spec`, {
        requiredBitDepth: Number.isFinite(bd) ? Math.round(bd) : null,
        requiredSampleRateHz: Number.isFinite(khz) ? Math.round(khz * 1000) : null,
        maxSideSeconds: Object.keys(maxSideSeconds).length > 0 ? maxSideSeconds : null,
        notes: notes.trim() !== "" ? notes.trim() : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      toast({ title: "Audio spec saved" });
    },
    onError: (e: any) =>
      toast({ title: e?.message || "Couldn't save audio spec", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/audio-spec`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      toast({ title: "Audio override cleared — inheriting baseline" });
    },
    onError: (e: any) =>
      toast({ title: e?.message || "Couldn't clear audio spec", variant: "destructive" }),
  });

  const busy = save.isPending || remove.isPending || isLoading;
  const setCell = (size: string, rpm: string, v: string) =>
    setGrid((g) => ({ ...g, [size]: { ...(g[size] ?? {}), [rpm]: v } }));

  // Inherited defaults shown beside each field so a blank input's resolved
  // value is never a mystery. Bit depth / sample rate can be "no minimum"
  // (e.g. MRP states no number); side-length defaults render greyed in-cell.
  const bitDefault =
    baseline?.requiredBitDepth != null ? `${baseline.requiredBitDepth}-bit` : "no minimum";
  const rateDefault =
    baseline?.requiredSampleRateHz != null
      ? `${baseline.requiredSampleRateHz / 1000} kHz`
      : "no minimum";
  const sideDefault = (size: string, rpm: string): string => {
    const secs = baseline?.maxSideSeconds?.[size]?.[rpm];
    return typeof secs === "number" ? String(Math.round((secs / 60) * 10) / 10) : "";
  };

  return (
    <div className="border-t border-slate-100 px-5 py-4">
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        Audio spec
      </span>
      <p className="mt-1 text-xs text-slate-400">
        The plant's confirmed cutting requirements. Leave a field blank to inherit the
        measured baseline — nothing here is assumed. These drive the album's audio preflight.
      </p>

      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">Min bit depth</span>
          <input
            type="number"
            inputMode="numeric"
            min={8}
            max={32}
            value={bitDepth}
            disabled={busy}
            onChange={(e) => setBitDepth(e.target.value)}
            placeholder="inherit"
            className="w-28 rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-800 focus:border-slate-400 focus:outline-none disabled:opacity-50"
            data-testid="input-audio-bit-depth"
          />
          <span className="text-xs text-slate-400" data-testid="text-audio-bit-depth-default">
            Default: {bitDefault}
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">Min sample rate (kHz)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min={8}
            value={sampleKhz}
            disabled={busy}
            onChange={(e) => setSampleKhz(e.target.value)}
            placeholder="inherit"
            className="w-32 rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-800 focus:border-slate-400 focus:outline-none disabled:opacity-50"
            data-testid="input-audio-sample-rate"
          />
          <span className="text-xs text-slate-400" data-testid="text-audio-sample-rate-default">
            Default: {rateDefault}
          </span>
        </label>
      </div>

      <div className="mt-4">
        <span className="text-xs font-medium text-slate-600">
          Max side length (minutes)
        </span>
        <div className="mt-2 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                <th className="px-2 py-1 text-left font-medium">Size</th>
                {AUDIO_RPMS.map((rpm) => (
                  <th key={rpm} className="px-2 py-1 text-left font-medium">
                    {rpm} RPM
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AUDIO_SIZES.map((size) => (
                <tr key={size}>
                  <td className="px-2 py-1 text-slate-600">{size}</td>
                  {AUDIO_RPMS.map((rpm) => (
                    <td key={rpm} className="px-2 py-1">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min={0}
                        value={grid[size]?.[rpm] ?? ""}
                        disabled={busy}
                        onChange={(e) => setCell(size, rpm, e.target.value)}
                        placeholder={sideDefault(size, rpm) || "inherit"}
                        className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-800 focus:border-slate-400 focus:outline-none disabled:opacity-50"
                        data-testid={`input-audio-side-${size.replace(/\D/g, "")}-${rpm}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-xs text-slate-400" data-testid="text-audio-side-defaults-note">
          Grey numbers are the inherited defaults (minutes) — leave a cell blank to use them.
        </p>
      </div>

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-600">Notes</span>
        <textarea
          rows={2}
          value={notes}
          disabled={busy}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => { if (notes !== (spec?.notes ?? "")) save.mutate(); }}
          placeholder="Optional context for operators (e.g. source of these numbers)."
          className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-800 focus:border-slate-400 focus:outline-none disabled:opacity-50"
          data-testid="input-audio-notes"
        />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <Button
          type="button"
          disabled={busy}
          onClick={() => save.mutate()}
          data-testid="button-save-audio-spec"
        >
          {save.isPending ? "Saving…" : "Save audio spec"}
        </Button>
        {spec && (
          <button
            type="button"
            disabled={busy}
            onClick={() => remove.mutate()}
            className="text-sm text-slate-500 hover:text-[var(--brand-heart)] disabled:opacity-50"
            data-testid="button-clear-audio-spec"
          >
            Clear override
          </button>
        )}
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
            className="p-1.5 rounded hover:bg-[var(--apple-track)] text-[var(--apple-subink)] transition-colors"
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
  onRescan,
  rescanBusy,
}: {
  label: string;
  hint: string;
  spec: PressTemplateSpec | null;
  busy: boolean;
  onSave: (body: Partial<PressTemplateSpec>) => void;
  onRemove: (specId: string) => void;
  onRescan: (specId: string) => void;
  rescanBusy: boolean;
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
  const [minPpiDraft, setMinPpiDraft] = useState(numOrEmpty(spec?.minPpi));
  const [colorDraft, setColorDraft] = useState<string>(spec?.color ?? "");
  // Task #3012 — per-component press print-rule overrides (blank = inherit
  // press-level defaults from the Print rules card).
  const pr = spec?.printRules ?? null;
  const [bleedMinDraft, setBleedMinDraft] = useState(numOrEmpty(pr?.bleedMinInches));
  const [bleedRecDraft, setBleedRecDraft] = useState(numOrEmpty(pr?.bleedRecommendedInches));
  const [safetyDraft, setSafetyDraft] = useState(numOrEmpty(pr?.safetyMarginInches));
  const [bitmapPpiDraft, setBitmapPpiDraft] = useState(numOrEmpty(pr?.minPpiBitmap));
  const [grayscaleDraft, setGrayscaleDraft] = useState(!!pr?.grayscaleRequired);
  const [pantoneDraft, setPantoneDraft] = useState(!!pr?.pantoneOnly);
  const [placedRuleDraft, setPlacedRuleDraft] = useState(pr?.placedImageRule ?? "");
  const [advisoriesDraft, setAdvisoriesDraft] = useState((pr?.advisories ?? []).join("\n"));
  useEffect(() => {
    setWDraft(numOrEmpty(spec?.artboardWInches));
    setHDraft(numOrEmpty(spec?.artboardHInches));
    setPagesDraft(numOrEmpty(spec?.expectedPages));
    setMinPpiDraft(numOrEmpty(spec?.minPpi));
    setColorDraft(spec?.color ?? "");
    const rules = spec?.printRules ?? null;
    setBleedMinDraft(numOrEmpty(rules?.bleedMinInches));
    setBleedRecDraft(numOrEmpty(rules?.bleedRecommendedInches));
    setSafetyDraft(numOrEmpty(rules?.safetyMarginInches));
    setBitmapPpiDraft(numOrEmpty(rules?.minPpiBitmap));
    setGrayscaleDraft(!!rules?.grayscaleRequired);
    setPantoneDraft(!!rules?.pantoneOnly);
    setPlacedRuleDraft(rules?.placedImageRule ?? "");
    setAdvisoriesDraft((rules?.advisories ?? []).join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.artboardWInches, spec?.artboardHInches, spec?.expectedPages, spec?.minPpi, spec?.color, spec?.printRules]);

  const dimsDirty =
    wDraft !== numOrEmpty(spec?.artboardWInches) ||
    hDraft !== numOrEmpty(spec?.artboardHInches) ||
    pagesDraft !== numOrEmpty(spec?.expectedPages) ||
    minPpiDraft !== numOrEmpty(spec?.minPpi) ||
    colorDraft !== (spec?.color ?? "") ||
    bleedMinDraft !== numOrEmpty(pr?.bleedMinInches) ||
    bleedRecDraft !== numOrEmpty(pr?.bleedRecommendedInches) ||
    safetyDraft !== numOrEmpty(pr?.safetyMarginInches) ||
    bitmapPpiDraft !== numOrEmpty(pr?.minPpiBitmap) ||
    grayscaleDraft !== !!pr?.grayscaleRequired ||
    pantoneDraft !== !!pr?.pantoneOnly ||
    placedRuleDraft !== (pr?.placedImageRule ?? "") ||
    advisoriesDraft !== (pr?.advisories ?? []).join("\n");

  const saveDims = () => {
    const w = wDraft.trim() === "" ? null : Number(wDraft);
    const h = hDraft.trim() === "" ? null : Number(hDraft);
    const pages = pagesDraft.trim() === "" ? null : Number(pagesDraft);
    const minPpi = minPpiDraft.trim() === "" ? null : Number(minPpiDraft);
    const bleedMin = bleedMinDraft.trim() === "" ? null : Number(bleedMinDraft);
    const bleedRec = bleedRecDraft.trim() === "" ? null : Number(bleedRecDraft);
    const safety = safetyDraft.trim() === "" ? null : Number(safetyDraft);
    const bitmapPpi = bitmapPpiDraft.trim() === "" ? null : Number(bitmapPpiDraft);
    const nums = [w, h, pages, minPpi, bleedMin, bleedRec, safety, bitmapPpi];
    if (nums.some((n) => n != null && !Number.isFinite(n))) {
      toast({ title: "Enter valid numbers for the check dimensions.", variant: "destructive" });
      return;
    }
    if (minPpi != null && (minPpi < 72 || minPpi > 2400)) {
      toast({ title: "Minimum resolution must be between 72 and 2400 PPI.", variant: "destructive" });
      return;
    }
    if (bitmapPpi != null && (bitmapPpi < 72 || bitmapPpi > 4800)) {
      toast({ title: "Bitmap resolution must be between 72 and 4800 PPI.", variant: "destructive" });
      return;
    }
    if ([bleedMin, bleedRec, safety].some((n) => n != null && (n < 0 || n > 2))) {
      toast({ title: "Bleed and safety values must be between 0 and 2 inches.", variant: "destructive" });
      return;
    }
    const advisories = advisoriesDraft
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    const printRules: PressPrintRulesDraftShape = {
      bleedMinInches: bleedMin,
      bleedRecommendedInches: bleedRec,
      safetyMarginInches: safety,
      minPpiBitmap: bitmapPpi != null ? Math.round(bitmapPpi) : null,
      grayscaleRequired: grayscaleDraft || null,
      pantoneOnly: pantoneDraft || null,
      placedImageRule: placedRuleDraft.trim() || null,
      advisories: advisories.length > 0 ? advisories : null,
    };
    const hasAnyRule = Object.values(printRules).some((v) => v != null);
    onSave({
      artboardWInches: w,
      artboardHInches: h,
      expectedPages: pages,
      minPpi: minPpi != null ? Math.round(minPpi) : null,
      color: (colorDraft || null) as PressTemplateSpec["color"],
      printRules: hasAnyRule ? printRules : null,
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
            onBlur={() => { if (urlDraft.trim()) commitUrl(); }}
            placeholder="Paste a URL"
            className="w-full max-w-[560px] h-9 px-3 rounded-md border border-slate-300 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[color:var(--brand-blue)] focus:ring-1 focus:ring-[color:var(--brand-blue)]"
            disabled={busy || uploading}
            data-testid={`input-template-url-${label.toLowerCase().replace(/\s+/g, "-")}`}
          />
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

      {/* Task #3011 — measured-from-template summary. Shown whenever a
          template file is attached: what the scan actually found (size,
          pages, color mode, live text, dieline), the "couldn't measure"
          note on failure, and a Re-scan action. Mismatch flags against
          explicit operator values so the press confirms conventions
          instead of inheriting them blind. */}
      {fileUrl && spec && (spec.measuredAt || spec.measuredError) && (
        <div className="mt-1.5" data-testid={`template-measured-${spec.componentKey}`}>
          {spec.measuredError ? (
            <div className="flex items-center gap-2 text-xs text-amber-700">
              <span data-testid={`text-template-measure-error-${spec.componentKey}`}>
                Couldn't measure this template — checks fall back to the baseline/computed spec.{" "}
                <span className="text-amber-600/80">({spec.measuredError})</span>
              </span>
              <button
                type="button"
                onClick={() => onRescan(spec.id)}
                disabled={busy || rescanBusy}
                className="shrink-0 text-[var(--brand-blue)] hover:underline disabled:opacity-50"
                data-testid={`button-template-rescan-${spec.componentKey}`}
              >
                {rescanBusy ? "Measuring…" : "Re-scan"}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
              <span className="font-medium text-slate-600">Measured from template:</span>
              {spec.measuredArtboardWInches != null && spec.measuredArtboardHInches != null && (
                <span data-testid={`text-template-measured-size-${spec.componentKey}`}>
                  {spec.measuredArtboardWInches.toFixed(2)}″ × {spec.measuredArtboardHInches.toFixed(2)}″
                </span>
              )}
              {spec.measuredPages != null && (
                <span>· {spec.measuredPages} {spec.measuredPages === 1 ? "page" : "pages"}</span>
              )}
              <span>
                ·{" "}
                {[
                  spec.measuredHasCmyk ? "CMYK" : null,
                  spec.measuredHasSpot ? "spot/PMS" : null,
                  spec.measuredHasRgb ? "RGB" : null,
                ]
                  .filter(Boolean)
                  .join(" + ") || "color mode unknown"}
              </span>
              <span>
                · {spec.measuredHasLiveText ? (spec.measuredHasEmbeddedFonts ? "live text (fonts embedded)" : "live text (fonts NOT embedded)") : "text outlined"}
              </span>
              <span>· {spec.measuredHasDieline ? "dieline/template layer present" : "no dieline layer"}</span>
              {/* Mismatch flags: explicit operator values vs the template's own contents. */}
              {spec.artboardWInches != null &&
                spec.artboardHInches != null &&
                spec.measuredArtboardWInches != null &&
                spec.measuredArtboardHInches != null &&
                (Math.abs(spec.artboardWInches - spec.measuredArtboardWInches) > 0.02 ||
                  Math.abs(spec.artboardHInches - spec.measuredArtboardHInches) > 0.02) && (
                  <span className="text-amber-700" data-testid={`text-template-size-mismatch-${spec.componentKey}`}>
                    ⚠ manual size override differs from the template — the manual value wins
                  </span>
                )}
              {spec.expectedPages != null &&
                spec.measuredPages != null &&
                spec.expectedPages !== spec.measuredPages && (
                  <span className="text-amber-700" data-testid={`text-template-pages-mismatch-${spec.componentKey}`}>
                    ⚠ manual page count ({spec.expectedPages}) differs from the template ({spec.measuredPages}) — the manual value wins
                  </span>
                )}
              <button
                type="button"
                onClick={() => onRescan(spec.id)}
                disabled={busy || rescanBusy}
                className="shrink-0 text-[var(--brand-blue)] hover:underline disabled:opacity-50"
                data-testid={`button-template-rescan-${spec.componentKey}`}
              >
                {rescanBusy ? "Measuring…" : "Re-scan"}
              </button>
            </div>
          )}
        </div>
      )}

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
          <input
            value={minPpiDraft}
            onChange={(e) => setMinPpiDraft(e.target.value)}
            inputMode="numeric"
            placeholder="Min PPI"
            title="Minimum embedded-image resolution (PPI) — advisory check, blank = no check"
            className={INPUT}
            disabled={busy}
            data-testid={`input-template-minppi-${label.toLowerCase().replace(/\s+/g, "-")}`}
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

        {/* Task #3012 — per-component press print-rule overrides. Blank =
            inherit the press-level defaults from the Print rules card. */}
        <div className="mt-3 mb-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Print rules (override press defaults)
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            value={bleedMinDraft}
            onChange={(e) => setBleedMinDraft(e.target.value)}
            inputMode="decimal"
            placeholder="Bleed min (in)"
            title={'Minimum bleed beyond the trim line, inches (e.g. 0.125). Fails below this.'}
            className={INPUT}
            disabled={busy}
            data-testid={`input-template-bleed-min-${label.toLowerCase().replace(/\s+/g, "-")}`}
          />
          <input
            value={bleedRecDraft}
            onChange={(e) => setBleedRecDraft(e.target.value)}
            inputMode="decimal"
            placeholder="Bleed rec (in)"
            title={'Recommended bleed, inches (e.g. 0.25). Warns below this.'}
            className={INPUT}
            disabled={busy}
            data-testid={`input-template-bleed-rec-${label.toLowerCase().replace(/\s+/g, "-")}`}
          />
          <input
            value={safetyDraft}
            onChange={(e) => setSafetyDraft(e.target.value)}
            inputMode="decimal"
            placeholder="Safety (in)"
            title="Safety margin from the cut line, inches — advisory only."
            className={INPUT}
            disabled={busy}
            data-testid={`input-template-safety-${label.toLowerCase().replace(/\s+/g, "-")}`}
          />
          <input
            value={bitmapPpiDraft}
            onChange={(e) => setBitmapPpiDraft(e.target.value)}
            inputMode="numeric"
            placeholder="Bitmap PPI"
            title="Second PPI floor for 1-bit / bitmap / line-art images."
            className={INPUT}
            disabled={busy}
            data-testid={`input-template-bitmap-ppi-${label.toLowerCase().replace(/\s+/g, "-")}`}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={grayscaleDraft}
              onChange={(e) => setGrayscaleDraft(e.target.checked)}
              disabled={busy}
              data-testid={`checkbox-template-grayscale-${label.toLowerCase().replace(/\s+/g, "-")}`}
            />
            Grayscale required (B/W piece)
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={pantoneDraft}
              onChange={(e) => setPantoneDraft(e.target.checked)}
              disabled={busy}
              data-testid={`checkbox-template-pantone-${label.toLowerCase().replace(/\s+/g, "-")}`}
            />
            Official Pantone spot colors only
          </label>
        </div>
        <input
          value={placedRuleDraft}
          onChange={(e) => setPlacedRuleDraft(e.target.value)}
          placeholder="Placed-image format rule (e.g. 'No GIF or PNG-sourced images') — blank = inherit"
          className={`${INPUT} mt-2 w-full`}
          disabled={busy}
          data-testid={`input-template-placed-rule-${label.toLowerCase().replace(/\s+/g, "-")}`}
        />
        <textarea
          value={advisoriesDraft}
          onChange={(e) => setAdvisoriesDraft(e.target.value)}
          rows={2}
          placeholder="Advisory notes, one per line (rules the check can't verify — shown as info rows)"
          className={`${INPUT} mt-2 w-full`}
          disabled={busy}
          data-testid={`textarea-template-advisories-${label.toLowerCase().replace(/\s+/g, "-")}`}
        />
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
        <AlertDialogContent className="rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Remove the {label} template?</AlertDialogTitle>
            <AlertDialogDescription>
              Artists will no longer be able to download this {label.toLowerCase()} template, and the
              finished-file check falls back to its measured defaults.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-0 text-[var(--apple-subink)] hover:bg-[var(--apple-track)]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-[var(--apple-critical)]/10 text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/20"
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
        <AlertDialogContent className="rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Delete "{tier.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the tier, every swatch under it, and every (tier × jacket) price ladder
              that used it. Albums already quoted on this tier keep their snapshot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-0 text-[var(--apple-subink)] hover:bg-[var(--apple-track)]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              className="rounded-full bg-[var(--apple-critical)]/10 text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/20"
            >
              Delete tier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Task #2872 — ManageColorsPanel: unified inline panel for adding,
// renaming, reordering, and deleting colors within a tier. Replaces the
// separate ReorderColorsButton modal and AddSwatchChip dialog. Multi-photo
// drop zone at top; per-row thumbnail + editable name + delete; drag-to-
// reorder with row numbers; footer: Reset + single "Save changes" (atomic
// commit of creates, renames, deletes, and reorder in sequence).
export function ManageColorsPanel({
  open,
  pressId,
  tier,
  onChanged,
  onClose,
}: {
  open: boolean;
  pressId: string;
  tier: CatalogTier;
  onChanged: () => void;
  onClose: () => void;
}) {
  const { toast } = useToast();

  type DraftRow = {
    key: string;
    id: string | null; // null = new (not yet saved)
    name: string;
    swatchHex: string | null;
    swatchImageUrl: string | null;
    swatchThumbUrl: string | null;
    isNew?: boolean;
    uploading?: boolean;
    hexPickerOpen?: boolean;
  };

  const buildInitialRows = (): DraftRow[] =>
    tier.colors
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        key: c.id,
        id: c.id,
        name: c.name,
        swatchHex: c.swatchHex,
        swatchImageUrl: c.swatchImageUrl,
        swatchThumbUrl: c.swatchThumbUrl ?? null,
      }));

  const [rows, setRows] = useState<DraftRow[]>(buildInitialRows);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropOnId, setDropOnId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);
  const [cropToDisc, setCropToDisc] = useState(false);
  const [rowErrors, setRowErrors] = useState<Set<string>>(new Set());

  const originalOrder = tier.colors.map((c) => c.id).join(",");
  const originalNames = useMemo(
    () => Object.fromEntries(tier.colors.map((c) => [c.id, c.name])) as Record<string, string>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tier.id],
  );

  const isDirty = useMemo(() => {
    const active = rows.filter((r) => !deletedIds.has(r.id ?? ""));
    if (active.some((r) => r.id === null && !r.uploading)) return true;
    if (deletedIds.size > 0) return true;
    const existingOrder = active.filter((r) => r.id !== null).map((r) => r.id!).join(",");
    if (existingOrder !== originalOrder) return true;
    return active.some((r) => r.id !== null && originalNames[r.id!] !== r.name.trim());
  }, [rows, deletedIds, originalOrder, originalNames]);

  const handleFileDrop = async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter((f) => f.size <= 5 * 1024 * 1024);
    if (files.length > fileArr.length)
      toast({ title: "Some files skipped", description: "Each photo must be ≤ 5 MB.", variant: "destructive" });
    for (const file of fileArr) {
      const tempKey = `new-${Date.now()}-${Math.random()}`;
      const placeholder = file.name.replace(/\.[^.]+$/, "");
      setRows((prev) => [
        ...prev,
        { key: tempKey, id: null, name: placeholder, swatchHex: null, swatchImageUrl: null, swatchThumbUrl: null, isNew: true, uploading: true },
      ]);
      try {
        const result = await postAdminImage(file, cropToDisc ? { mask: "disc" } : undefined);
        setRows((prev) => prev.map((r) => (r.key === tempKey ? { ...r, swatchImageUrl: result.url, uploading: false } : r)));
      } catch (e: any) {
        toast({ title: "Upload failed", description: e?.message, variant: "destructive" });
        setRows((prev) => prev.filter((r) => r.key !== tempKey));
      }
    }
  };

  const handleDragStart = (key: string) => (e: React.DragEvent) => {
    setDragId(key);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", key); } catch {}
  };
  const handleDragOver = (key: string) => (e: React.DragEvent) => {
    if (!dragId || dragId === key) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropOnId !== key) setDropOnId(key);
  };
  const handleDragEnd = () => { setDragId(null); setDropOnId(null); };
  const handleDrop = (targetKey: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragId;
    setDragId(null);
    setDropOnId(null);
    if (!src || src === targetKey) return;
    setRows((prev) => {
      const keys = prev.map((r) => r.key);
      const from = keys.indexOf(src);
      const to = keys.indexOf(targetKey);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(from < to ? to - 1 : to, 0, moved);
      return next;
    });
  };

  const handleSave = async () => {
    // Validate: every non-deleted, non-uploading row needs a photo or hex
    const activeRows = rows.filter((r) => !deletedIds.has(r.id ?? "") && !r.uploading);
    const invalid = activeRows.filter((r) => !r.swatchImageUrl && !r.swatchHex);
    if (invalid.length > 0) {
      setRowErrors(new Set(invalid.map((r) => r.key)));
      return;
    }
    setRowErrors(new Set());

    setSaving(true);
    try {
      // Track server-assigned IDs for newly created rows so they can be
      // included in the final reorder at their intended drag positions.
      const newIdMap = new Map<string, string>(); // draft key → server id

      // 1. Create new colors and capture their server IDs
      for (const r of rows) {
        if (r.id === null && !r.uploading && r.name.trim()) {
          const resp = await apiRequest("POST", `/api/admin/manufacturers/${pressId}/catalog/tiers/${tier.id}/colors`, {
            name: r.name.trim(),
            swatchHex: r.swatchImageUrl ? null : (r.swatchHex ?? null),
            swatchImageUrl: r.swatchImageUrl ?? null,
          });
          const created = (await resp.json()) as { id: string };
          if (created.id) newIdMap.set(r.key, created.id);
        }
      }
      // 2. Rename changed existing colors
      for (const r of rows) {
        if (r.id && !deletedIds.has(r.id) && originalNames[r.id] !== r.name.trim()) {
          await apiRequest("PATCH", `/api/admin/manufacturers/${pressId}/catalog/colors/${r.id}`, {
            name: r.name.trim(),
          });
        }
      }
      // 3. Delete removed colors
      for (const id of Array.from(deletedIds)) {
        await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/catalog/colors/${id}`);
      }
      // 4. Reorder: build a complete ordered list that includes newly created
      //    IDs at their intended drag positions (not appended at the end).
      //    Errors propagate to the outer catch — no silent swallow.
      const allOrderedIds = rows
        .filter((r) => !deletedIds.has(r.id ?? ""))
        .map((r) => r.id !== null ? r.id : (newIdMap.get(r.key) ?? null))
        .filter((id): id is string => id !== null);
      const hasNewColors = newIdMap.size > 0;
      const existingOriginalOrder = tier.colors
        .map((c) => c.id)
        .filter((id) => !deletedIds.has(id));
      const orderChanged =
        hasNewColors ||
        allOrderedIds.join(",") !== existingOriginalOrder.join(",");
      if (allOrderedIds.length > 1 && orderChanged) {
        await apiRequest(
          "POST",
          `/api/admin/manufacturers/${pressId}/catalog/tiers/${tier.id}/colors/reorder`,
          { colorIds: allOrderedIds },
        );
      }
      onChanged();
      onClose();
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const visibleRows = rows.filter((r) => !deletedIds.has(r.id ?? ""));
  const deleteRow = rows.find((r) => r.key === deleteConfirmKey) ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden rounded-2xl border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]"
        data-testid={`manage-colors-panel-${tier.id}`}
      >
        {/* Header — shadcn DialogContent auto-adds a close ✕ in the top-right */}
        <div className="flex items-center px-6 py-4 border-b border-[var(--apple-hairline)] shrink-0">
          <span className="text-[17px] font-semibold text-[var(--apple-ink)]">Manage colors — {tier.name}</span>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Photo drop zone */}
          <div
            className="mx-6 mt-4 mb-1 border-2 border-dashed border-slate-200 rounded-lg px-4 py-3 text-center hover:border-[color:var(--brand-blue)] transition-colors cursor-pointer"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files.length) handleFileDrop(e.dataTransfer.files); }}
            onClick={() => {
              const inp = document.createElement("input");
              inp.type = "file"; inp.multiple = true;
              inp.accept = ".jpg,.jpeg,.png,.webp,.heic,.heif";
              inp.onchange = () => { if (inp.files?.length) handleFileDrop(inp.files); };
              inp.click();
            }}
          >
            <Upload className="w-4 h-4 mx-auto text-[var(--apple-faint)] mb-1" />
            <p className="text-xs text-[var(--apple-subink)]">Drop photos here or click — JPEG, PNG, WEBP, HEIC · max 5 MB each</p>
            <label
              className="flex items-center justify-center gap-1.5 mt-1.5 cursor-pointer select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={cropToDisc}
                onChange={(e) => setCropToDisc(e.target.checked)}
                className="accent-[color:var(--brand-blue)]"
              />
              <span className="text-xs text-[var(--apple-subink)]">Crop to vinyl disc</span>
            </label>
          </div>

          {/* + Add color manually */}
          <p className="text-sm px-6 mt-2 mb-3">
            <button
              type="button"
              onClick={() => {
                const tempKey = `manual-${Date.now()}-${Math.random()}`;
                setRows((prev) => [
                  ...prev,
                  { key: tempKey, id: null, name: "", swatchHex: null, swatchImageUrl: null, swatchThumbUrl: null, isNew: true },
                ]);
              }}
              className="text-[color:var(--brand-blue)] hover:underline underline-offset-2"
            >
              + Add color manually
            </button>
            <span className="text-[var(--apple-faint)]"> — name and hex, no photo needed</span>
          </p>

          {/* Color rows */}
          <div className="px-6 pb-2" data-testid={`manage-colors-list-${tier.id}`}>
            {visibleRows.length === 0 && (
              <p className="text-xs text-[var(--apple-faint)] font-medium py-3 text-center border-t border-[var(--apple-hairline)]">No colors yet — drop photos above or add manually.</p>
            )}
            {visibleRows.map((r, idx) => (
              <div key={r.key}>
                {/* Main row */}
                <div
                  draggable={!r.uploading && r.id !== null}
                  onDragStart={r.uploading || r.id === null ? undefined : handleDragStart(r.key)}
                  onDragOver={r.uploading ? undefined : handleDragOver(r.key)}
                  onDragEnd={handleDragEnd}
                  onDrop={r.uploading ? undefined : handleDrop(r.key)}
                  className={[
                    "flex items-center gap-3 py-2.5 border-t border-[var(--apple-hairline)] select-none",
                    dragId === r.key ? "opacity-50" : "",
                    dropOnId === r.key ? "!border-t-2 !border-[color:var(--brand-blue)]" : "",
                  ].join(" ")}
                  data-testid={`manage-color-row-${r.key}`}
                >
                  <GripVertical className={`w-4 h-4 shrink-0 ${r.id !== null && !r.uploading ? "text-slate-300 cursor-grab" : "text-slate-100"}`} />
                  <span className="text-xs text-slate-400 w-4 text-right shrink-0 tabular-nums">{idx + 1}</span>

                  {/* Color chip — click to toggle inline hex picker */}
                  <button
                    type="button"
                    disabled={r.uploading}
                    onClick={() => {
                      setRows((prev) => prev.map((row) =>
                        row.key === r.key
                          ? { ...row, hexPickerOpen: !row.hexPickerOpen }
                          : { ...row, hexPickerOpen: false },
                      ));
                    }}
                    className="w-[34px] h-[34px] rounded-full shrink-0 relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)] disabled:opacity-50 transition-transform hover:scale-105"
                    style={
                      r.swatchImageUrl
                        ? { backgroundImage: `url(${r.swatchThumbUrl ?? r.swatchImageUrl})`, backgroundSize: "cover", backgroundPosition: "center", border: "1px solid #e2e8f0" }
                        : r.swatchHex
                          ? { background: r.swatchHex, border: "1px solid #e2e8f0" }
                          : { background: "#FFFFFF", border: "1.5px dashed #cbd5e1" }
                    }
                    title="Click to set hex color"
                  >
                    {r.uploading && (
                      <span className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />
                      </span>
                    )}
                    {r.isNew && !r.uploading && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[color:var(--brand-blue)] rounded-full border border-white" aria-label="New" />
                    )}
                  </button>

                  {/* Name input */}
                  <input
                    value={r.name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((prev) => prev.map((row) => (row.key === r.key ? { ...row, name: v } : row)));
                    }}
                    disabled={r.uploading}
                    className="flex-1 min-w-0 h-9 px-2.5 rounded-md border border-transparent hover:border-slate-200 focus:border-[color:var(--brand-blue)] focus:outline-none text-sm text-slate-800 bg-transparent focus:bg-white transition-colors disabled:opacity-50"
                    placeholder="Color name"
                    data-testid={`input-manage-color-name-${r.key}`}
                  />

                  {/* Hex value pill — visible for hex-only rows */}
                  {!r.swatchImageUrl && r.swatchHex && (
                    <span className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 whitespace-nowrap font-mono shrink-0">
                      {r.swatchHex.toUpperCase()}
                    </span>
                  )}

                  {/* "Set hex" dashed pill — visible for rows with neither photo nor hex */}
                  {!r.swatchImageUrl && !r.swatchHex && (
                    <button
                      type="button"
                      onClick={() => {
                        setRows((prev) => prev.map((row) =>
                          row.key === r.key
                            ? { ...row, hexPickerOpen: !row.hexPickerOpen }
                            : { ...row, hexPickerOpen: false },
                        ));
                      }}
                      className="text-xs text-slate-400 border border-dashed border-slate-300 rounded-full px-2.5 py-1 whitespace-nowrap shrink-0 hover:border-[color:var(--brand-blue)] hover:text-[color:var(--brand-blue)] transition-colors"
                    >
                      Set hex
                    </button>
                  )}

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmKey(r.key)}
                    disabled={r.uploading}
                    className="shrink-0 text-rose-400 hover:text-rose-600 disabled:opacity-30 transition-colors p-0.5"
                    data-testid={`button-manage-color-delete-${r.key}`}
                    title="Remove color"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Inline hex picker — opens below the row when chip/Set-hex is clicked */}
                {r.hexPickerOpen && !r.swatchImageUrl && (
                  <div className="flex items-center gap-2 pb-2.5 pl-[62px]">
                    <input
                      type="color"
                      value={r.swatchHex ?? "#000000"}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => prev.map((row) => (row.key === r.key ? { ...row, swatchHex: v } : row)));
                        setRowErrors((prev) => { const next = new Set(prev); next.delete(r.key); return next; });
                      }}
                      className="h-9 w-9 shrink-0 rounded border border-slate-200 cursor-pointer p-0.5"
                    />
                    <input
                      value={r.swatchHex ?? ""}
                      onChange={(e) => {
                        let v = e.target.value;
                        if (v && !v.startsWith("#")) v = "#" + v;
                        setRows((prev) => prev.map((row) => (row.key === r.key ? { ...row, swatchHex: v || null } : row)));
                        setRowErrors((prev) => { const next = new Set(prev); next.delete(r.key); return next; });
                      }}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                          setRows((prev) => prev.map((row) => (row.key === r.key ? { ...row, swatchHex: v.toUpperCase() } : row)));
                        }
                      }}
                      placeholder="#000000"
                      className="w-28 h-9 px-2.5 rounded-md border border-slate-200 text-sm font-mono focus:outline-none focus:border-[color:var(--brand-blue)] bg-white"
                    />
                  </div>
                )}

                {/* Per-row validation error */}
                {rowErrors.has(r.key) && (
                  <p className="text-xs text-rose-600 pb-1.5 pl-[62px]">Add a photo or hex color to save this swatch.</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--apple-hairline)] shrink-0">
          <div className="flex gap-4">
            <button type="button" disabled className="text-sm text-[var(--apple-faint)] cursor-not-allowed" title="Undo — coming soon">
              Undo
            </button>
            <button type="button" disabled className="text-sm text-[var(--apple-faint)] cursor-not-allowed" title="Redo — coming soon">
              Redo
            </button>
            <button
              type="button"
              onClick={() => { setRows(buildInitialRows()); setDeletedIds(new Set()); setRowErrors(new Set()); }}
              disabled={saving || !isDirty}
              className="text-sm text-[var(--apple-subink)] hover:underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
              data-testid={`button-manage-colors-reset-${tier.id}`}
            >
              Reset
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-full px-4 py-2 text-sm font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors"
            >
              Cancel
            </button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || saving || rows.some((r) => r.uploading)}
              className="h-9 px-4 text-sm rounded-full"
              data-testid={`button-manage-colors-save-${tier.id}`}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>

        {/* Delete confirm */}
        <AlertDialog open={!!deleteConfirmKey} onOpenChange={(o) => !o && setDeleteConfirmKey(null)}>
          <AlertDialogContent className="rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Remove this color?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteRow
                  ? deleteRow.id
                    ? `"${deleteRow.name}" will be removed from this group and can't be recovered.`
                    : `"${deleteRow.name}" (not yet saved) will be discarded.`
                  : "This color will be removed."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-full border-0 text-[var(--apple-subink)] hover:bg-[var(--apple-track)]">Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-full bg-[var(--apple-critical)]/10 text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/20"
                onClick={() => {
                  if (deleteRow) {
                    if (deleteRow.id) {
                      setDeletedIds((prev) => new Set(Array.from(prev).concat(deleteRow.id!)));
                    } else {
                      setRows((prev) => prev.filter((x) => x.key !== deleteRow.key));
                    }
                  }
                  setDeleteConfirmKey(null);
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
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
        <AlertDialogContent className="rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Delete "{jacket.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every (tier × jacket) price ladder that uses this jacket across every
              format on this press. Saved albums keep their snapshot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-0 text-[var(--apple-subink)] hover:bg-[var(--apple-track)]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              className="rounded-full bg-[var(--apple-critical)]/10 text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/20"
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
        // Task #2872 — server-side copy reads source row fresh (fixes the
        // stale-client-snapshot bug that lost photos on the 7"↔12" toggle).
        await apiRequest(
          "POST",
          `/api/admin/manufacturers/${pressId}/catalog/colors/${color.id}/mirror-to-format`,
          { targetFormat: otherFmt, groupName: mirror.groupName },
        );
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
        className={`w-14 h-14 rounded-full border border-black/10 shrink-0 overflow-hidden block ${ringCls}`}
        style={
          color.swatchImageUrl
            ? { backgroundImage: `url(${color.swatchThumbUrl ?? color.swatchImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
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
        className={`w-14 h-14 rounded-full border border-black/10 overflow-hidden shrink-0 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)] ${ringCls}`}
        style={
          color.swatchImageUrl
            ? { backgroundImage: `url(${color.swatchThumbUrl ?? color.swatchImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { background: color.swatchHex ?? "#cccccc" }
        }
        data-testid={`chip-color-${color.id}`}
        title={color.name}
      />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md rounded-2xl border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Edit swatch</DialogTitle>
            <DialogDescription>
              Rename the color, input the hex code, or upload a photo for the vinyl swatch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {/* Name + Hex — one row, matched h-9 controls */}
            <div className="flex gap-3 items-start">
              <div className="flex-1 min-w-0">
                <span className="block text-[var(--apple-subink)] text-[11px] font-semibold uppercase tracking-wider mb-1.5">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={INPUT}
                  data-testid={`input-swatch-name-${color.id}`}
                />
              </div>
              <div className="w-36 shrink-0">
                <span className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${imageUrl ? "text-[var(--apple-faint)]" : "text-[var(--apple-subink)]"}`}>
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

            {/* Photo — disc + Upload/Clear centered, helper text + crop below */}
            <div>
              <span className="block text-[var(--apple-subink)] text-[11px] font-semibold uppercase tracking-wider mb-1.5">Photo</span>
              <div className="flex items-center gap-3">
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
                {/* Upload + Clear — vertically centered against the disc */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={upload.isPending}
                    className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium rounded-md border border-[var(--apple-hairline)] bg-white text-[var(--apple-ink)] hover:bg-[var(--apple-track)] disabled:opacity-50 transition-colors"
                    data-testid={`button-swatch-upload-${color.id}`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {upload.isPending ? "Uploading…" : "Upload"}
                  </button>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl(null)}
                      className="h-9 px-3 text-xs text-slate-500 hover:underline underline-offset-2"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {/* Hidden file input */}
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
              {/* Helper text + crop below the photo row */}
              <p className="text-xs text-[var(--apple-subink)] mt-2 leading-relaxed">
                Drag an image onto the photo, or click upload. JPEG, PNG, WEBP, or HEIC — up to 5 MB.
              </p>
              <label className="flex items-center gap-1.5 mt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={cropToDisc}
                  onChange={(e) => setCropToDisc(e.target.checked)}
                  className="accent-[color:var(--brand-blue)]"
                  data-testid={`toggle-crop-disc-${color.id}`}
                />
                <span className="text-xs text-[var(--apple-subink)] font-medium">Crop to vinyl disc</span>
              </label>
            </div>

            {/* Color applies to — segmented pill toggles */}
            {mirror && otherSize && (
              <div>
                <span className="block text-[var(--apple-subink)] text-[11px] font-semibold uppercase tracking-wider mb-2">
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
                    {mirroredOn ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    {sizeLabel(otherSize)}
                    {setMirror.isPending ? "…" : ""}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer: trash icon left, Cancel + Save right */}
          <div className="flex items-center justify-between pt-3 mt-1 border-t border-[var(--apple-hairline)]">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={remove.isPending}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/10 disabled:opacity-50 transition-colors"
              data-testid={`button-delete-color-${color.id}`}
              title="Delete swatch"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-full px-4 py-2 text-xs font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors"
              >
                Cancel
              </button>
              <Button
                type="button"
                onClick={() => save.mutate()}
                disabled={!name.trim() || save.isPending}
                className="h-8 px-3 text-xs rounded-full"
                data-testid={`button-save-color-${color.id}`}
              >
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Delete "{color.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the color from this group. Pricing for the group is unaffected. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-0 text-[var(--apple-subink)] hover:bg-[var(--apple-track)]" data-testid={`button-cancel-delete-color-${color.id}`}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
              disabled={remove.isPending}
              className="rounded-full bg-[var(--apple-critical)]/10 text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/20"
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
        <DialogContent className="sm:max-w-sm rounded-2xl border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Add swatch</DialogTitle>
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
                className="rounded-full px-4 py-2 text-xs font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors"
              >
                Cancel
              </button>
              <Button
                type="button"
                onClick={() => create.mutate()}
                disabled={!name.trim() || create.isPending}
                className="h-8 px-3 text-xs rounded-full"
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
      <span className="block text-[var(--apple-subink)] text-[11px] font-semibold uppercase tracking-wider mb-1">
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
