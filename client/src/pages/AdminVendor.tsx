import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Upload,
  Guitar,
  Store,
  ExternalLink,
  Lock,
  LockOpen,
  MapPin,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useSmartBackCrumb } from "@/hooks/useSmartBackCrumb";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { VendorPreviewCard } from "@/components/admin/previews/VendorPreviewCard";
import { GoodDeedServicesTab } from "@/components/admin/GoodDeedServicesTab";
import { EditablePanel } from "@/components/admin/EditablePanel";
import { PartnerPermissionsPanel } from "@/components/admin/PartnerPermissionsPanel";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { invalidateAdminEntity } from "@/lib/adminEntityInvalidation";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Admin · Single vendor (Phase 6e).
 *
 * Tabs: Overview · Cover · Instruments
 *
 * Logo is edited from a modal that hangs off the header logo's pencil
 * chip — same pattern as AdminAlbum's Artwork editor and AdminPerson's
 * photo editor. Cover stays a tab because the wide background banner
 * needs the full canvas (and a different art-direction story we're
 * still working out).
 *
 * Logo + Cover are real drag-drop uploads that PUT logoUrl/coverUrl on
 * /api/admin/vendors/:id. Identity + bio still defer to the classic
 * admin (hover-reveal pencil) for now — single-source-of-truth edits.
 * Instruments tab is a live read of /api/vendors/:id/profile → each row
 * links straight to that instrument's new admin page.
 */

interface Vendor {
  id: string;
  name: string;
  domain: string;
  homeUrl: string | null;
  aboutUrl: string | null;
  logoUrl: string | null;
  // Curation lock on `logoUrl` — when true, automated refresh paths
  // (favicon backfill, future "re-scrape from website" enrichment)
  // skip writing the logo. The admin's own Replace upload from the
  // logo editor still works after unlock. Mirrors `people.photoLocked`.
  logoLocked: boolean;
  tagline: string | null;
  bio: string | null;
  location: string | null;
  coverUrl: string | null;
  // Task #174 — a single vendor row can carry both flags (Gibson is
  // both a Maker and a Reseller). Toggle them on the Roles panel.
  isMaker: boolean;
  isReseller: boolean;
  // Task #237 — sub-brand self-reference. When set, this vendor is a
  // sub-brand of `parentVendorId` (e.g. Epiphone → Gibson). Edited
  // from the Lineage panel. One level deep only — sub-brands can't
  // own sub-brands.
  parentVendorId?: string | null;
}

interface ParentLite {
  id: string;
  name: string;
  domain: string;
  logoUrl: string | null;
}

interface ChildLite {
  id: string;
  name: string;
  domain: string;
  logoUrl: string | null;
}

interface VendorInstrument {
  id: string;
  name: string;
  category: string;
  shortCategory: string | null;
  photoUrl: string | null;
  // Task #174 — only populated by /api/makers/:id/profile. On the
  // reseller surface this field is omitted; the panel hides the
  // per-row reseller chip rail when absent.
  resellers?: Array<{
    id: string;
    name: string;
    domain: string | null;
    logoUrl: string | null;
    affiliateUrl: string | null;
  }>;
}

interface VendorProfile {
  vendor: Vendor;
  instruments: VendorInstrument[];
  artists: Array<{ id: string; name: string; trackCount: number }>;
  // Task #237 — sub-brand graph. `parent` is set when this vendor is
  // a sub-brand; `children` lists the sub-brands this vendor owns.
  parent?: ParentLite | null;
  children?: ChildLite[];
}

type Tab = "overview" | "cover" | "instruments" | "gooddeed" | "permissions";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "cover", label: "Cover" },
  { key: "instruments", label: "Instruments" },
  // Task #245 — vendor-quoted GoodDeed pricing (printing / hologram /
  // insertion). Same panel a vendor-role partner sees in /vendor.
  { key: "gooddeed", label: "GoodDeed Services" },
  // Task #297 — per-vendor partner-permissions card. Same panel and
  // server endpoint Label/Artist/Press use; vendor was wired into
  // PARTNER_SCOPE_KINDS at Task #79.
  { key: "permissions", label: "Permissions" },
];

export function AdminVendor() {
  const { user, isLoading: authLoading } = useAuth();
  // Task #174 — same component is mounted at both /admin/vendors/:id and
  // /admin/makers/:id. We pull the id from whichever path matched, and
  // keep the rest of the page chrome (active sidebar key, breadcrumb,
  // list-route fallbacks) in sync with the surface the operator came in
  // through. The underlying DB row is the same vendor entity either way.
  const [matchReseller, resellerParams] =
    useRoute<{ id: string }>("/admin/vendors/:id");
  const [matchMaker, makerParams] =
    useRoute<{ id: string }>("/admin/makers/:id");
  const mode: "maker" | "reseller" = matchMaker ? "maker" : "reseller";
  const params = matchMaker ? makerParams : resellerParams;
  const listRoute = mode === "maker" ? "/admin/makers" : "/admin/vendors";
  const listLabel = mode === "maker" ? "Makers" : "Resellers";
  const activeKey: "makers" | "vendors" = mode === "maker" ? "makers" : "vendors";
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  // Logo editor lives as a modal hanging off the header logo thumbnail
  // (same pencil-on-thumbnail pattern as AdminAlbum's Artwork editor).
  // The dedicated Logo tab was removed; Cover stays a tab because the
  // wide background banner needs more real estate (and a different art
  // direction story we're still figuring out).
  const [logoEditorOpen, setLogoEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const vendorId = params?.id ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  // Origin signal — when the operator came here from a sibling section
  // (e.g. an instrument's Vendors tab), the first breadcrumb swaps from
  // "Vendors" to the origin row's name and links back to it. Soft signal
  // via `?from=<entity>&<entity>Id=<id>` query string so deep-links +
  // refreshes still work. See `useSmartBackCrumb` + replit.md.
  const backCrumb = useSmartBackCrumb();

  const deleteVendor = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/vendors/${vendorId}`);
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["/api/vendors", vendorId, "profile"] });
      qc.invalidateQueries({ queryKey: ["/api/vendors"] });
      qc.invalidateQueries({ queryKey: ["/api/instruments"] });
      toast({ title: `${mode === "maker" ? "Maker" : "Reseller"} deleted.` });
      setDeleteConfirmOpen(false);
      navigate(listRoute);
    },
    onError: (e: any) => {
      toast({
        title: `Couldn't delete ${mode === "maker" ? "maker" : "reseller"}`,
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  // Task #174 — the profile endpoint differs by mode. Reseller mode
  // uses /api/vendors/:id/profile (instrument_vendors join — every
  // piece this storefront carries). Maker mode uses /api/makers/:id/
  // profile (instruments.maker_vendor_id FK — every piece this brand
  // built, each row hydrated with its own reseller list). Both
  // responses are normalized to `{ vendor, instruments }` here so the
  // rest of the page treats them the same. The maker-mode instrument
  // rows carry an extra `resellers[]` array that InstrumentsPanel
  // shows inline.
  const profileEndpoint =
    mode === "maker"
      ? `/api/makers/${vendorId}/profile`
      : `/api/vendors/${vendorId}/profile`;
  const { data: profile, isLoading, error } = useQuery<VendorProfile>({
    queryKey: [profileEndpoint],
    enabled: !!user?.isAdmin && !!vendorId,
  });

  const rescrape = useMutation({
    mutationFn: async () => {
      const v = profile?.vendor;
      if (!v?.homeUrl) throw new Error("No website saved");
      const r = await apiRequest("POST", `/api/admin/vendors/scrape`, { url: v.homeUrl });
      const scraped = (await r.json()) as {
        name: string | null;
        logoUrl: string | null;
        coverUrl: string | null;
        bio: string | null;
      };
      const patch: Partial<Vendor> = {};
      if (scraped.name) patch.name = scraped.name;
      if (scraped.logoUrl) patch.logoUrl = scraped.logoUrl;
      if (scraped.coverUrl) patch.coverUrl = scraped.coverUrl;
      if (scraped.bio) patch.bio = scraped.bio;
      if (Object.keys(patch).length === 0) return null;
      const r2 = await apiRequest("PUT", `/api/admin/vendors/${vendorId}`, patch);
      return (await r2.json()) as Vendor;
    },
    onSuccess: (row) => {
      void invalidateAdminEntity(qc, "vendor", vendorId);
      toast({ title: row ? "Refreshed from website" : "Nothing new to update" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't re-scrape", description: e?.message, variant: "destructive" }),
  });

  const openInClassicAdmin = () => {
    try {
      localStorage.setItem("gt:admin:entity", "vendors");
      localStorage.setItem("gt:admin:focus-vendor", vendorId);
    } catch {}
    navigate("/admin");
  };

  if (authLoading || isLoading) {
    return (
      <AdminFrame active={activeKey}>
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

  if (error || !profile) {
    return (
      <AdminFrame active={activeKey}>
        <div className="py-20 text-center space-y-3">
          <h1 className="text-slate-900 text-lg font-semibold">
            {mode === "maker" ? "Maker" : "Reseller"} not found
          </h1>
          {backCrumb ? (
            <Link
              href={backCrumb.href}
              className="text-[var(--brand-blue)] text-sm hover:underline inline-flex items-center gap-1"
              data-testid={backCrumb.testId}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back to {backCrumb.name}
            </Link>
          ) : (
            <Link
              href={listRoute}
              className="text-[var(--brand-blue)] text-sm hover:underline inline-flex items-center gap-1"
              data-testid="link-back-to-vendors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back to {listLabel.toLowerCase()}
            </Link>
          )}
        </div>
      </AdminFrame>
    );
  }

  const { vendor, instruments } = profile;

  return (
    <AdminFrame
      active={activeKey}
      contentWidth="narrow"
      preview={
        <VendorPreviewCard vendor={vendor} instruments={instruments} />
      }
    >
      <div className="space-y-6">
        {/* BREADCRUMB */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium">
          {backCrumb ? (
            <Link
              href={backCrumb.href}
              className="hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors truncate max-w-[420px]"
              data-testid={backCrumb.testId}
            >
              {backCrumb.name}
            </Link>
          ) : (
            <Link
              href={listRoute}
              className="hover:text-slate-700"
              data-testid="link-breadcrumb-vendors"
            >
              {listLabel}
            </Link>
          )}
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">
            {vendor.name}
          </span>
        </div>

        {/* HEADER */}
        <div className="flex items-start gap-5">
          {/* Logo thumbnail doubles as the logo editor trigger — same
              hover-scrim + pencil-chip pattern as AdminAlbum's cover
              thumbnail. */}
          <button
            type="button"
            onClick={() => setLogoEditorOpen(true)}
            className="group relative w-24 h-24 rounded-xl overflow-hidden bg-white ring-1 ring-slate-200 shadow-sm flex-shrink-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2"
            aria-label="Edit vendor logo"
            data-testid="button-edit-vendor-logo"
          >
            {vendor.logoUrl ? (
              <img
                src={vendor.logoUrl}
                alt={vendor.name}
                className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]"
                data-testid="img-vendor-logo"
              />
            ) : (
              <Store className="w-10 h-10 text-slate-300" />
            )}
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 group-focus-visible:bg-black/40 transition-colors" />
            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
              <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 inline-flex items-center justify-center shadow-lg ring-1 ring-black/5">
                <Pencil className="w-4 h-4" />
              </span>
            </span>
          </button>
          <LogoEditorDialog
            vendor={vendor}
            open={logoEditorOpen}
            onOpenChange={setLogoEditorOpen}
          />
          <div className="flex-1 min-w-0">
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
              {vendor.domain}
            </div>
            <h1
              className="text-slate-900 text-[26px] font-bold tracking-tight mt-0.5"
              data-testid="heading-vendor-name"
            >
              {vendor.name}
            </h1>
            <div className="flex items-center gap-3 text-slate-500 text-[12.5px] mt-1">
              <span className="inline-flex items-center gap-1.5">
                <Guitar className="w-3.5 h-3.5 text-slate-400" />
                {instruments.length}{" "}
                {instruments.length === 1 ? "instrument" : "instruments"}
              </span>
              {vendor.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {vendor.location}
                </span>
              )}
              {vendor.homeUrl && (
                <a
                  href={vendor.homeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-[var(--brand-blue)]"
                  data-testid="link-vendor-home"
                >
                  Visit
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* TABS — left-aligned tabs, gray trash on the right, both
            riding the same hairline. Mirrors AdminPerson/AdminAlbum:
            hover reveals a "Delete" label; opens a rose-tinted confirm
            sheet per the replit.md destructive-actions rule. */}
        <div
          className="flex items-end justify-between gap-5 border-b border-slate-200"
          data-testid="tabs-admin-vendor"
        >
          <div className="flex items-center gap-5 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  "relative pb-2.5 text-[13.5px] font-semibold whitespace-nowrap transition-colors",
                  tab === t.key
                    ? "text-slate-900"
                    : "text-slate-400 hover:text-slate-700",
                ].join(" ")}
                data-testid={`tab-${t.key}`}
              >
                {t.label}
                {tab === t.key && (
                  <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[var(--brand-blue)] rounded-full" />
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => rescrape.mutate()}
            disabled={!vendor.homeUrl || rescrape.isPending}
            aria-label="Refresh from website"
            title={vendor.homeUrl ? "Re-fetch logo, cover, and bio from the website" : "Add a home URL first"}
            className="group inline-flex items-center gap-1.5 h-7 px-1.5 mb-1 rounded-md text-slate-400 hover:text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/10 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40"
            data-testid="button-rescrape-vendor"
          >
            <span className="text-[12px] font-medium opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
              {rescrape.isPending ? "Refreshing…" : "Refresh from website"}
            </span>
            <RefreshCw className={`w-3.5 h-3.5 ${rescrape.isPending ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={deleteVendor.isPending}
            aria-label="Delete vendor"
            className="group inline-flex items-center gap-1.5 h-7 px-1.5 mb-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            data-testid="button-delete-vendor"
          >
            <span className="text-[12px] font-medium opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
              Delete
            </span>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          </div>
        </div>

        {/* CONTENT */}
        {tab === "overview" && <OverviewPanel vendor={vendor} />}
        {tab === "overview" && <RolesPanel vendor={vendor} />}
        {tab === "overview" && (
          <LineagePanel
            vendor={vendor}
            parent={profile.parent ?? null}
            childRows={profile.children ?? []}
          />
        )}
        {tab === "cover" && <CoverPanel vendor={vendor} />}
        {tab === "instruments" && (
          <InstrumentsPanel instruments={instruments} mode={mode} />
        )}
        {tab === "gooddeed" && (
          <div className="mt-6">
            <GoodDeedServicesTab vendorId={vendorId} />
          </div>
        )}
        {tab === "permissions" && (
          <PartnerPermissionsPanel
            scopeKind="vendor"
            scopeId={vendor.id}
            scopeName={vendor.name}
          />
        )}
      </div>

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(v) => !deleteVendor.isPending && setDeleteConfirmOpen(v)}
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-delete-vendor"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900 pr-8">
              Delete <span className="italic">{vendor.name}</span>?
            </DialogTitle>
            <DialogDescription className="text-[13px] font-normal text-slate-500">
              {instruments.length > 0 ? (
                <>
                  This vendor is listed on{" "}
                  <span className="font-semibold text-slate-700">
                    {instruments.length}{" "}
                    {instruments.length === 1
                      ? "piece of gear"
                      : "pieces of gear"}
                  </span>
                  . Cancel to review the Instruments tab first, or continue
                  to remove it everywhere — this can't be undone.
                </>
              ) : (
                <>
                  Nothing currently links to this vendor. This cannot be
                  undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-1">
            <Button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleteVendor.isPending}
              className="bg-white text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-50"
              data-testid="button-delete-vendor-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => deleteVendor.mutate()}
              disabled={deleteVendor.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white ml-2"
              data-testid="button-delete-vendor-confirm"
            >
              {deleteVendor.isPending ? "Deleting…" : "Delete vendor"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminFrame>
  );
}

/* ─── Lineage panel (Task #237) ────────────────────────────────────── */

// Sub-brand graph editor — sits below the Roles panel on Overview.
// Two halves:
//   • Parent picker: when this vendor is a sub-brand (has parentVendorId),
//     show the parent chip + an "Unlink" button. When it isn't, show a
//     dropdown of every top-level vendor as a candidate parent (excluding
//     self + any vendor that already has children, since we only support
//     one level of nesting).
//   • Sub-brand list: when this vendor owns sub-brands (children[]),
//     render each as a Link chip so the operator can hop straight in.
//
// PUT /api/admin/vendors/:id with `parentVendorId: <id> | null`. Server
// enforces "no chains" + "no self" + "no parent-of-existing-parent".
function LineagePanel({
  vendor,
  parent,
  childRows,
}: {
  vendor: Vendor;
  parent: ParentLite | null;
  childRows: ChildLite[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const hasChildren = childRows.length > 0;

  // Candidate parents — every top-level vendor that isn't us and that
  // doesn't itself have children. We pull /api/vendors and filter
  // client-side; it's at most a few hundred rows.
  const { data: allVendors = [] } = useQuery<
    Array<{ id: string; name: string; domain: string; logoUrl: string | null; parentVendorId?: string | null }>
  >({
    queryKey: ["/api/vendors"],
    enabled: !hasChildren && !parent,
  });

  const candidates = allVendors
    .filter((v) => v.id !== vendor.id && !v.parentVendorId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const setParent = useMutation({
    mutationFn: async (nextParentId: string | null) => {
      await apiRequest("PUT", `/api/admin/vendors/${vendor.id}`, {
        parentVendorId: nextParentId,
      });
    },
    onSuccess: () => {
      void invalidateAdminEntity(qc, "vendor", vendor.id);
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't update sub-brand link",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  return (
    <div className="mt-5">
      <div
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5"
        data-testid="panel-lineage"
      >
        <div className="mb-3">
          <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider">
            Lineage
          </div>
          <p className="text-slate-500 text-[12.5px] mt-1 max-w-md">
            Sub-brands let Gibson-owned brands like Epiphone or Kramer keep
            their own vendor page while still showing "Owned by Gibson" to
            fans. One level deep only.
          </p>
        </div>

        {/* Parent half */}
        <div className="space-y-2">
          <div className="text-slate-700 text-[12px] font-semibold">
            Parent brand
          </div>
          {parent ? (
            <div
              className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
              data-testid="lineage-current-parent"
            >
              <div className="w-9 h-9 rounded-md overflow-hidden bg-white ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
                {parent.logoUrl ? (
                  <img
                    src={parent.logoUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Store className="w-4 h-4 text-slate-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/vendors/${parent.id}`}
                  className="block text-slate-900 text-[13.5px] font-semibold truncate hover:text-[var(--brand-blue)]"
                  data-testid={`link-lineage-parent-${parent.id}`}
                >
                  {parent.name}
                </Link>
                <div className="text-slate-400 text-[11.5px] truncate">
                  {parent.domain}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={setParent.isPending}
                onClick={() => setParent.mutate(null)}
                data-testid="button-lineage-unlink-parent"
              >
                Unlink
              </Button>
            </div>
          ) : hasChildren ? (
            <p className="text-slate-400 text-[12.5px]">
              This vendor owns sub-brands, so it can't itself be a sub-brand.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <select
                disabled={setParent.isPending || candidates.length === 0}
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setParent.mutate(v);
                }}
                className="flex-1 h-9 px-2 rounded-md border border-slate-300 bg-white text-[12.5px] outline-none focus:border-[var(--brand-blue)]"
                data-testid="select-lineage-parent"
              >
                <option value="">— Set parent brand…</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.domain})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Children half */}
        {hasChildren && (
          <div className="space-y-2 mt-4">
            <div className="text-slate-700 text-[12px] font-semibold">
              Sub-brands ({childRows.length})
            </div>
            <div
              className="flex flex-wrap gap-2"
              data-testid="lineage-sub-brand-list"
            >
              {childRows.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/vendors/${c.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white pl-1 pr-3 py-1 hover:border-[var(--brand-blue)]/40"
                  data-testid={`link-lineage-child-${c.id}`}
                >
                  <span className="w-6 h-6 rounded-full overflow-hidden bg-white ring-1 ring-slate-200 flex items-center justify-center">
                    {c.logoUrl ? (
                      <img src={c.logoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Store className="w-3 h-3 text-slate-300" />
                    )}
                  </span>
                  <span className="text-slate-700 text-[12.5px] font-medium">
                    {c.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Roles panel (Task #174) ──────────────────────────────────────── */

// One vendor row can carry both flags — Gibson is both a Maker (builds
// the gear) and a Reseller (sells it). The two toggles live here so the
// operator can promote a reseller-only row into a Maker (or vice versa)
// without having to delete and re-create on the other surface. PUTting
// either flag re-issues both vendor list caches so the sidebar counts
// settle immediately.
function RolesPanel({ vendor }: { vendor: Vendor }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const flip = useMutation({
    mutationFn: async (patch: { isMaker?: boolean; isReseller?: boolean }) => {
      await apiRequest("PUT", `/api/admin/vendors/${vendor.id}`, patch);
      return patch;
    },
    onSuccess: () => {
      void invalidateAdminEntity(qc, "vendor", vendor.id);
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't change roles",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const ensureOne = (nextMaker: boolean, nextReseller: boolean): boolean => {
    if (!nextMaker && !nextReseller) {
      toast({
        title: "Pick at least one role",
        description: "A vendor must be a Maker, a Reseller, or both.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  return (
    <div className="mt-5">
      <div
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5"
        data-testid="panel-roles"
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider">
              Roles
            </div>
            <p className="text-slate-500 text-[12.5px] mt-1 max-w-md">
              Makers build the gear; Resellers sell it. A row can be both
              — Gibson, Steinway, and Fender all are.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <RoleToggle
            label="Maker"
            description="Builds gear that gets listed under their name."
            checked={vendor.isMaker}
            disabled={flip.isPending}
            testId="toggle-role-maker"
            onChange={(next) => {
              if (!ensureOne(next, vendor.isReseller)) return;
              flip.mutate({ isMaker: next });
            }}
          />
          <RoleToggle
            label="Reseller"
            description="Sells gear via an affiliate / product URL."
            checked={vendor.isReseller}
            disabled={flip.isPending}
            testId="toggle-role-reseller"
            onChange={(next) => {
              if (!ensureOne(vendor.isMaker, next)) return;
              flip.mutate({ isReseller: next });
            }}
          />
        </div>
      </div>
    </div>
  );
}

function RoleToggle({
  label,
  description,
  checked,
  disabled,
  testId,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  testId: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      className={[
        "text-left rounded-xl border p-3 flex items-start gap-3 transition-colors",
        checked
          ? "border-[var(--brand-blue)]/40 bg-[var(--brand-blue)]/5"
          : "border-slate-200 bg-white hover:bg-slate-50",
        disabled && "opacity-50",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={[
          "mt-0.5 inline-flex w-9 h-5 rounded-full p-0.5 transition-colors flex-shrink-0",
          checked ? "bg-[var(--brand-blue)]" : "bg-slate-300",
        ].join(" ")}
      >
        <span
          className={[
            "block w-4 h-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0",
          ].join(" ")}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-slate-900 text-[13.5px] font-semibold">
          {label}
        </span>
        <span className="block text-slate-500 text-[11.5px] mt-0.5">
          {description}
        </span>
      </span>
    </button>
  );
}

/* ─── Overview (inline-editable) ───────────────────────────────────── */

function OverviewPanel({ vendor }: { vendor: Vendor }) {
  // EditablePanel takes a static list of keys; mirror the helper's
  // vendor entry by hand so a save invalidates the same surfaces as an
  // upload (full-URL profile keys, not the never-matching ["/api/vendors", id, "profile"] tuple).
  const invalidate: (readonly unknown[])[] = [
    [`/api/vendors/${vendor.id}/profile`],
    [`/api/makers/${vendor.id}/profile`],
    ["/api/vendors"],
    ["/api/instruments"],
  ];
  const endpoint = `/api/admin/vendors/${vendor.id}`;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <EditablePanel
        title="Identity"
        testId="panel-overview-identity"
        endpoint={endpoint}
        values={{
          name: vendor.name,
          domain: vendor.domain,
          tagline: vendor.tagline,
          location: vendor.location,
        }}
        invalidate={invalidate}
        fields={[
          { key: "name", label: "Name", type: "text", required: true },
          {
            key: "domain",
            label: "Domain",
            type: "text",
            required: true,
            placeholder: "reverb.com",
          },
          {
            key: "tagline",
            label: "Tagline",
            type: "text",
            placeholder: "Short line shown on vendor cards.",
          },
          {
            key: "location",
            label: "Location",
            type: "text",
            placeholder: "Nashville, TN",
          },
        ]}
      />
      <EditablePanel
        title="Links & bio"
        testId="panel-overview-links-bio"
        endpoint={endpoint}
        values={{
          homeUrl: vendor.homeUrl,
          aboutUrl: vendor.aboutUrl,
          bio: vendor.bio,
        }}
        invalidate={invalidate}
        fields={[
          {
            key: "homeUrl",
            label: "Home URL",
            type: "url",
            placeholder: "https://reverb.com/",
          },
          {
            key: "aboutUrl",
            label: "About URL",
            type: "url",
            placeholder: "https://reverb.com/about",
          },
          {
            key: "bio",
            label: "Bio",
            type: "textarea",
            placeholder: "A short paragraph about the shop.",
          },
        ]}
      />
    </div>
  );
}

/* ─── Upload helper ────────────────────────────────────────────────── */

async function uploadImageFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const token = getAuthToken();
  if (!token) {
    throw new Error("Sign out and back in — your session token is missing.");
  }
  const res = await fetch("/api/admin/upload", {
    method: "POST",
    body: fd,
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Upload failed (${res.status})`);
  }
  const { url } = await res.json();
  return url as string;
}

/* ─── Generic image-upload panel ───────────────────────────────────── */

function ImageUploadPanel({
  vendor,
  field,
  fieldLabel,
  description,
  aspect,
  emptyIcon: EmptyIcon,
}: {
  vendor: Vendor;
  field: "logoUrl" | "coverUrl";
  fieldLabel: string;
  description: string;
  aspect: "square" | "wide";
  emptyIcon: typeof Store;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Curation lock — only `logoUrl` is lockable today (per the locked-vendor-
  // logos task). Cover keeps a plain dropzone.
  const isLogo = field === "logoUrl";
  const locked = isLogo ? !!vendor.logoLocked : false;

  const mut = useMutation({
    mutationFn: async (file: File) => {
      setPreviewUrl(URL.createObjectURL(file));
      const url = await uploadImageFile(file);
      await apiRequest("PUT", `/api/admin/vendors/${vendor.id}`, {
        [field]: url,
      });
      return url;
    },
    onSuccess: async () => {
      await invalidateAdminEntity(qc, "vendor", vendor.id);
      setPreviewUrl(null);
      toast({ title: `${fieldLabel} updated` });
    },
    onError: (e: any) => {
      setPreviewUrl(null);
      toast({
        title: `Couldn't update the ${fieldLabel.toLowerCase()}`,
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  // Toggle the curation lock. Optimistic via invalidate-on-success so the
  // chip flips instantly; a failed write rolls back when the refetch
  // arrives. Same shape as AdminPerson's photo/cover lock mutation.
  const lockMut = useMutation({
    mutationFn: async (nextLocked: boolean) => {
      await apiRequest("PUT", `/api/admin/vendors/${vendor.id}`, {
        logoLocked: nextLocked,
      });
      return nextLocked;
    },
    onSuccess: async () => {
      await invalidateAdminEntity(qc, "vendor", vendor.id);
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't change the lock",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const acceptFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast({
        title: "That's not an image",
        description: "Use a JPG, PNG, or WebP file.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Keep images under 8 MB.",
        variant: "destructive",
      });
      return;
    }
    mut.mutate(file);
  };

  const busy = mut.isPending;
  const shownUrl = previewUrl || vendor[field];
  const aspectClass = aspect === "square" ? "aspect-square" : "aspect-[3/1]";
  const objectFitClass = "object-cover";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <Card
        className="rounded-2xl shadow-sm p-6"
        data-testid={`panel-${field}-current`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider">
            Current {fieldLabel.toLowerCase()}
          </div>
          {/* Lock chip — only on Logo (Cover doesn't lock yet). Brand-blue
              when locked, slate when not. Matches AdminPerson's photo/cover
              chip exactly (7×7 ghost button, 3.5×3.5 padlock glyph). */}
          {isLogo && (
            <button
              type="button"
              onClick={() => !lockMut.isPending && lockMut.mutate(!locked)}
              disabled={lockMut.isPending}
              aria-pressed={locked}
              title={
                locked
                  ? "Locked \u2014 automated refreshes will skip this logo"
                  : "Unlocked \u2014 automated refreshes may update this logo"
              }
              className={[
                "inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40 active:scale-[0.94]",
                locked
                  ? "text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/10"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100",
                lockMut.isPending && "opacity-50",
              ]
                .filter(Boolean)
                .join(" ")}
              data-testid="button-lock-logo"
            >
              {locked ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <LockOpen className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
        <div
          className={[
            "relative rounded-xl overflow-hidden",
            aspectClass,
          ].join(" ")}
        >
          {shownUrl ? (
            <img
              src={shownUrl}
              alt={vendor.name}
              className={["w-full h-full", objectFitClass].join(" ")}
              data-testid={`img-${field}-current`}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-300">
              <EmptyIcon className="w-12 h-12" />
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
              <Spinner className="w-6 h-6 text-[var(--brand-blue)] animate-spin" />
              <span className="text-[12px] text-slate-700 font-semibold">
                Uploading…
              </span>
            </div>
          )}
        </div>
      </Card>

      <Card
        className="rounded-2xl shadow-sm p-6 flex flex-col"
        data-testid={`panel-${field}-upload`}
      >
        <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-3">
          Replace {fieldLabel.toLowerCase()}
        </div>
        <button
          type="button"
          onClick={() => {
            if (busy) return;
            if (locked) {
              toast({
                title: "Unlock first",
                description: `Tap the lock on the Current ${fieldLabel.toLowerCase()} card to allow changes.`,
              });
              return;
            }
            fileInputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy && !locked) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (busy || locked) return;
            acceptFile(e.dataTransfer.files?.[0]);
          }}
          disabled={busy}
          aria-disabled={locked}
          data-testid={`dropzone-${field}`}
          className={[
            "flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors px-6 py-10 text-center",
            dragging
              ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/5"
              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
            busy && "opacity-60 cursor-not-allowed",
            locked && "opacity-40 cursor-not-allowed hover:border-slate-200 hover:bg-transparent",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {locked ? (
            <>
              <Lock className="w-6 h-6 text-slate-400" />
              <div className="text-slate-700 text-[13px] font-semibold">
                Unlock to replace
              </div>
              <div className="text-slate-400 text-[11.5px]">
                Tap the lock on the current {fieldLabel.toLowerCase()} to allow changes.
              </div>
            </>
          ) : (
            <>
              <Upload
                className={[
                  "w-7 h-7",
                  dragging ? "text-[var(--brand-blue)]" : "text-slate-400",
                ].join(" ")}
              />
              <div className="text-slate-700 text-[13px] font-semibold">
                {dragging
                  ? "Drop to upload"
                  : "Drag an image here, or click to pick"}
              </div>
              <div className="text-slate-400 text-[11.5px]">
                JPG, PNG, or WebP · up to 8 MB
              </div>
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            acceptFile(e.target.files?.[0]);
            e.target.value = "";
          }}
          data-testid={`input-${field}-file`}
        />
        <p className="mt-4 text-[11.5px] text-slate-500 leading-relaxed">
          {description}
        </p>
      </Card>
    </div>
  );
}

function LogoPanel({ vendor }: { vendor: Vendor }) {
  return (
    <ImageUploadPanel
      vendor={vendor}
      field="logoUrl"
      fieldLabel="Logo"
      aspect="square"
      emptyIcon={Store}
      description="Square works best — used in the SuperCredits™ vendor row and every instrument that links to this vendor."
    />
  );
}

/**
 * LogoEditorDialog — wraps the LogoPanel drop-zone in a modal, triggered
 * by the pencil-on-logo in the page header. Mirrors AdminAlbum's
 * ArtworkPanel and AdminPerson's PhotoEditorDialog so the three surfaces
 * read as the same product.
 */
function LogoEditorDialog({
  vendor,
  open,
  onOpenChange,
}: {
  vendor: Vendor;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl bg-white rounded-2xl border-slate-200 shadow-xl p-6 gap-5"
        data-testid="dialog-edit-vendor-logo"
      >
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-slate-900 text-[14px] font-bold">
            Logo
          </DialogTitle>
          <DialogDescription className="sr-only">
            Replace the logo for {vendor.name}.
          </DialogDescription>
        </DialogHeader>
        <LogoPanel vendor={vendor} />
      </DialogContent>
    </Dialog>
  );
}

function CoverPanel({ vendor }: { vendor: Vendor }) {
  return (
    <ImageUploadPanel
      vendor={vendor}
      field="coverUrl"
      fieldLabel="Cover"
      aspect="wide"
      emptyIcon={Store}
      description="3:1 banner — used as the header backdrop on the fan-facing VendorSheet."
    />
  );
}

/* ─── Instruments ──────────────────────────────────────────────────── */

function InstrumentsPanel({
  instruments,
  mode,
}: {
  instruments: VendorInstrument[];
  mode: "maker" | "reseller";
}) {
  const isMaker = mode === "maker";
  if (instruments.length === 0) {
    return (
      <Card
        className="rounded-2xl shadow-sm p-10 text-center"
        data-testid="panel-instruments-empty"
      >
        <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
          <Guitar className="w-6 h-6" />
        </div>
        <p className="text-slate-700 text-[14px] font-semibold">
          {isMaker
            ? "No gear yet attributes its build to this maker"
            : "No instruments link to this vendor yet"}
        </p>
        <p className="text-slate-400 text-[12.5px] mt-1 max-w-xs mx-auto">
          {isMaker
            ? "Open a piece of gear and pick this brand as its Maker — it'll show up here."
            : "Attach a product URL to any instrument and this vendor will appear here."}
        </p>
      </Card>
    );
  }
  return (
    <Card
      className="rounded-2xl shadow-sm overflow-hidden"
      data-testid="panel-instruments"
    >
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-slate-900 text-[14px] font-bold inline-flex items-center gap-2">
          <Guitar className="w-4 h-4 text-slate-400" />
          {isMaker ? "Built by this maker" : "Instruments"}
        </h2>
        <p className="text-slate-400 text-[11.5px]">
          {instruments.length}{" "}
          {instruments.length === 1
            ? isMaker
              ? "piece"
              : "instrument"
            : isMaker
            ? "pieces"
            : "instruments"}{" "}
          {isMaker ? "tied to this maker" : "attached"}
        </p>
      </div>
      <ul className="divide-y divide-slate-100" data-testid="list-instruments">
        {instruments.map((i) => (
          <li key={i.id} className="px-6 py-3 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
                {i.photoUrl ? (
                  <img
                    src={i.photoUrl}
                    alt={i.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Guitar className="w-4 h-4 text-slate-400" />
                )}
              </div>
              <Link
                href={`/admin/instruments/${i.id}`}
                className="flex-1 min-w-0"
                data-testid={`row-instrument-${i.id}`}
              >
                <div className="text-slate-900 text-[13.5px] font-semibold truncate">
                  {i.name}
                </div>
                <div className="text-slate-400 text-[11.5px] truncate">
                  {i.shortCategory || i.category}
                </div>
              </Link>
              <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
            </div>
            {isMaker && i.resellers && (
              <div
                className="mt-2 ml-[54px] flex flex-wrap items-center gap-1.5"
                data-testid={`resellers-${i.id}`}
              >
                {i.resellers.length === 0 ? (
                  <span className="text-slate-400 text-[11px] italic">
                    No resellers yet
                  </span>
                ) : (
                  <>
                    <span className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mr-1">
                      Available at
                    </span>
                    {i.resellers.map((r) => (
                      <Link
                        key={`${i.id}-${r.id}`}
                        href={`/admin/vendors/${r.id}`}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors px-2 py-0.5 text-[11px] text-slate-700"
                        data-testid={`chip-reseller-${i.id}-${r.id}`}
                      >
                        {r.logoUrl ? (
                          <img
                            src={r.logoUrl}
                            alt=""
                            className="w-3 h-3 rounded-sm object-cover"
                          />
                        ) : (
                          <Store className="w-2.5 h-2.5 text-slate-400" />
                        )}
                        <span className="font-medium">{r.name}</span>
                      </Link>
                    ))}
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

