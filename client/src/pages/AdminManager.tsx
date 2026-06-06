import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  Pencil,
  Upload,
  Tag,
  ExternalLink,
  Lock,
  LockOpen,
  MapPin,
  Disc,
  Instagram,
  RefreshCw,
  Trash2,
  Search,
  X,
  User as UserIcon,
} from "lucide-react";
import { SiSpotify, SiApplemusic } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { EditablePanel } from "@/components/admin/EditablePanel";
import { ViewModeToggle, useViewMode } from "@/components/admin/ViewModeToggle";
import { AddEntityButton } from "@/components/admin/AddEntityButton";
import { NewAlbumArtistDialog } from "@/components/admin/NewAlbumArtistDialog";
import { PartnerPermissionsPanel } from "@/components/admin/PartnerPermissionsPanel";
import { OrganizationPeople } from "@/components/admin/OrganizationPeople";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { invalidateAdminEntity } from "@/lib/adminEntityInvalidation";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin · Single manager (Task #1425).
 *
 * Tabs: Overview · Cover · Artists · Releases · Payouts · Permissions
 *
 * A manager's roster is people tagged via people.managerId. Releases is
 * DERIVED client-side from those roster people's albums — there is NO
 * albums.managerId, so the catalog is computed, never stored.
 */

interface Manager {
  id: string;
  name: string;
  logoUrl: string | null;
  // Curation lock on `logoUrl` — when true, automated refresh paths
  // (favicon backfill, future "re-scrape from website" enrichment)
  // skip writing the logo. The admin's own Replace upload still works
  // after unlock. Mirrors `people.photoLocked` / `vendors.logoLocked`.
  logoLocked: boolean;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  coverUrl: string | null;
}

// Mirrors AdminPeople's PersonLite — managerId + the streaming-link
// signals the StreamingBadge cares about. Reused by the Artists tab.
interface ManagerArtistPerson {
  id: string;
  name: string;
  photoUrl: string | null;
  bio?: string | null;
  managerId: string | null;
  itunesArtistId?: string | null;
  spotifyUrl?: string | null;
  spotifyHasMatch?: boolean | null;
}

interface AlbumLite {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  year: number | null;
  type: string;
  isHidden: boolean;
  primaryArtistId: string | null;
}

type Tab = "overview" | "cover" | "artists" | "releases" | "permissions";
const TABS: { key: Tab; label: string }[] = [
  // Overview leads. No partner-rollup dashboard tab and no Payouts tab —
  // manager payout economics is out of scope for Task #1425. Artists is
  // the roster (people.managerId); Releases is their derived catalog.
  { key: "overview", label: "Overview" },
  { key: "cover", label: "Cover" },
  { key: "artists", label: "Artists" },
  { key: "releases", label: "Releases" },
  { key: "permissions", label: "Permissions" },
];

export function AdminManager() {
  const { user, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ id: string }>("/admin/managers/:id");
  const [, navigate] = useLocation();
  // Overview leads + `?tab=` round-trip for deep links.
  const [tab, setTabState] = useState<Tab>(() => {
    if (typeof window === "undefined") return "overview";
    const q = new URLSearchParams(window.location.search).get("tab");
    // Unknown `?tab=` deep links quietly fall back to Overview.
    return TABS.some((t) => t.key === q) ? (q as Tab) : "overview";
  });

  // Strip a stale/unknown `?tab=` from the address bar so the deep-link
  // looks clean after the silent fallback above.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const u = new URL(window.location.href);
      const q = u.searchParams.get("tab");
      if (q && !TABS.some((t) => t.key === q)) {
        u.searchParams.delete("tab");
        window.history.replaceState({}, "", u.toString());
      }
    } catch {}
  }, []);
  const setTab = (next: Tab) => {
    setTabState(next);
    try {
      const u = new URL(window.location.href);
      if (next === "overview") u.searchParams.delete("tab");
      else u.searchParams.set("tab", next);
      window.history.replaceState({}, "", u.toString());
    } catch {}
  };
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [logoEditorOpen, setLogoEditorOpen] = useState(false);
  const managerId = params?.id ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const deleteManager = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/managers/${managerId}`);
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["/api/managers", managerId] });
      qc.invalidateQueries({ queryKey: ["/api/managers"] });
      qc.invalidateQueries({ queryKey: ["/api/albums"] });
      qc.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Manager deleted." });
      setDeleteConfirmOpen(false);
      navigate("/admin/managers");
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't delete manager",
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

  const { data: label, isLoading, error } = useQuery<Manager>({
    queryKey: ["/api/managers", managerId],
    enabled: !!user?.isAdmin && !!managerId,
  });

  const rescrape = useMutation({
    mutationFn: async () => {
      if (!label?.websiteUrl) throw new Error("No website saved");
      const r = await apiRequest("POST", `/api/admin/managers/scrape`, { url: label.websiteUrl });
      const scraped = (await r.json()) as {
        name: string | null;
        logoUrl: string | null;
        bio: string | null;
      };
      const patch: Partial<Manager> = {};
      if (scraped.name) patch.name = scraped.name;
      if (scraped.logoUrl) patch.logoUrl = scraped.logoUrl;
      if (scraped.bio) patch.bio = scraped.bio;
      if (Object.keys(patch).length === 0) return null;
      const r2 = await apiRequest("PUT", `/api/admin/managers/${managerId}`, patch);
      return (await r2.json()) as Manager;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["/api/managers", managerId] });
      qc.invalidateQueries({ queryKey: ["/api/managers"] });
      toast({ title: row ? "Refreshed from website" : "Nothing new to update" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't re-scrape", description: e?.message, variant: "destructive" }),
  });

  const { data: allAlbums = [] } = useQuery<AlbumLite[]>({
    queryKey: ["/api/albums"],
    enabled: !!user?.isAdmin,
  });

  // Extra streaming fields beyond id/name/photoUrl/managerId let the
  // Artists tab render the AdminPeople-family StreamingBadge without a
  // second fetch.
  const { data: allPeople = [] } = useQuery<ManagerArtistPerson[]>({
    queryKey: ["/api/people"],
    enabled: !!user?.isAdmin,
  });

  // Roster = people tagged to this manager via people.managerId.
  const rosterPersonIds = useMemo(
    () =>
      new Set(
        allPeople
          .filter((p) => p.managerId === managerId)
          .map((p) => p.id),
      ),
    [allPeople, managerId],
  );

  // Catalog is DERIVED, not stored: a manager's releases are their roster
  // people's albums (matched on albums.primaryArtistId). There is no
  // albums.managerId column.
  const releases = useMemo(
    () =>
      allAlbums
        .filter((a) => a.primaryArtistId != null && rosterPersonIds.has(a.primaryArtistId))
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
    [allAlbums, rosterPersonIds],
  );

  const linkedPeopleCount = rosterPersonIds.size;

  if (authLoading || isLoading) {
    return (
      <AdminFrame active="managers">
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

  if (error || !label) {
    return (
      <AdminFrame active="managers">
        <div className="py-20 text-center space-y-3">
          <h1 className="text-slate-900 text-lg font-semibold">
            Manager not found
          </h1>
          <Link
            href="/admin/managers"
            className="text-[var(--brand-blue)] text-sm hover:underline inline-flex items-center gap-1"
            data-testid="link-back-to-managers"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to managers
          </Link>
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="managers" contentWidth="narrow">
      <div className="space-y-6">
        {/* BREADCRUMB */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium">
          <Link
            href="/admin/managers"
            className="hover:text-slate-700"
            data-testid="link-breadcrumb-managers"
          >
            Managers
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">
            {label.name}
          </span>
        </div>

        {/* HEADER */}
        <div className="flex items-start gap-5">
          <button
            type="button"
            onClick={() => setLogoEditorOpen(true)}
            className={[
              "group relative w-24 h-24 rounded-xl overflow-hidden shadow-sm flex-shrink-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2",
              label.logoUrl ? "" : "bg-white ring-1 ring-slate-200",
            ].join(" ")}
            aria-label="Edit label logo"
            data-testid="button-edit-label-logo"
          >
            {label.logoUrl ? (
              <img
                src={label.logoUrl}
                alt={label.name}
                className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]"
                data-testid="img-label-logo"
              />
            ) : (
              <Tag className="w-10 h-10 text-slate-300" />
            )}
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 group-focus-visible:bg-black/40 [@media(hover:none)]:bg-black/30 transition-colors" />
            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
              <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 inline-flex items-center justify-center shadow-lg ring-1 ring-black/5">
                <Pencil className="w-4 h-4" />
              </span>
            </span>
          </button>
          <LogoEditorDialog
            label={label}
            open={logoEditorOpen}
            onOpenChange={setLogoEditorOpen}
          />
          <div className="flex-1 min-w-0">
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
              Manager
            </div>
            <h1
              className="text-slate-900 text-[26px] font-bold tracking-tight mt-0.5"
              data-testid="heading-label-name"
            >
              {label.name}
            </h1>
            <div className="flex items-center gap-3 text-slate-500 text-[12.5px] mt-1">
              <span className="inline-flex items-center gap-1.5">
                <Disc className="w-3.5 h-3.5 text-slate-400" />
                {releases.length}{" "}
                {releases.length === 1 ? "release" : "releases"}
              </span>
              {label.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {label.location}
                </span>
              )}
              {label.websiteUrl && (
                <a
                  href={label.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-[var(--brand-blue)]"
                  data-testid="link-label-website"
                >
                  Visit
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* TABS — left tabs + gray trash on the right, both riding the
            same hairline. Mirrors AdminPerson/AdminAlbum. */}
        <div
          className="flex items-end justify-between gap-5 border-b border-slate-200"
          data-testid="tabs-admin-label"
        >
          <div className="flex items-center gap-5 overflow-x-auto min-w-0 scrollbar-hide">
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
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--brand-blue)] rounded-full" />
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => rescrape.mutate()}
              disabled={!label.websiteUrl || rescrape.isPending}
              aria-label="Refresh from website"
              title={label.websiteUrl ? "Re-fetch logo and bio from the website" : "Add a website URL first"}
              className="group inline-flex items-center gap-1.5 h-7 px-1.5 mb-1 rounded-md text-slate-400 hover:text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/10 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40"
              data-testid="button-rescrape-label"
            >
              <span className="text-[12px] font-medium opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                {rescrape.isPending ? "Refreshing…" : "Refresh from website"}
              </span>
              <RefreshCw className={`w-3.5 h-3.5 ${rescrape.isPending ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleteManager.isPending}
              aria-label="Delete label"
              className="group inline-flex items-center gap-1.5 h-7 px-1.5 mb-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              data-testid="button-delete-label"
            >
              <span className="text-[12px] font-medium opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                Delete
              </span>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {tab === "overview" && <OverviewPanel label={label} />}
        {tab === "overview" && (
          <OrganizationPeople
            apiPath={`/api/managers/${label.id}/people`}
            testIdPrefix="manager"
            entityKind="manager"
            entityId={label.id}
            entityName={label.name}
            blurb="People at this manager — bookings, day-to-day, accounts, anyone you need to reach."
          />
        )}
        {tab === "cover" && <CoverPanel label={label} />}
        {tab === "artists" && (
          <ArtistsPanel
            label={label}
            allPeople={allPeople}
            onOpenPerson={(id) => navigate(`/admin/people/${id}?from=partner&backHref=${encodeURIComponent(`/admin/managers/${label.id}?tab=artists`)}&backName=${encodeURIComponent(label.name)}`)}
          />
        )}
        {tab === "releases" && (
          <ReleasesPanel
            releases={releases}
            onOpenPerson={(id) => navigate(`/admin/people/${id}?from=partner&backHref=${encodeURIComponent(`/admin/managers/${label.id}?tab=releases`)}&backName=${encodeURIComponent(label.name)}`)}
          />
        )}
        {tab === "permissions" && (
          <PartnerPermissionsPanel scopeKind="manager" scopeId={label.id} scopeName={label.name} />
        )}
      </div>

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(v) => !deleteManager.isPending && setDeleteConfirmOpen(v)}
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-delete-label"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900 pr-8">
              Delete <span className="italic">{label.name}</span>?
            </DialogTitle>
            <DialogDescription className="text-[13px] font-normal text-slate-500">
              {releases.length > 0 || linkedPeopleCount > 0 ? (
                <>
                  This label is linked to{" "}
                  {releases.length > 0 && (
                    <span className="font-semibold text-slate-700">
                      {releases.length}{" "}
                      {releases.length === 1 ? "album" : "albums"}
                    </span>
                  )}
                  {releases.length > 0 && linkedPeopleCount > 0 && " and "}
                  {linkedPeopleCount > 0 && (
                    <span className="font-semibold text-slate-700">
                      {linkedPeopleCount}{" "}
                      {linkedPeopleCount === 1 ? "person" : "people"}
                    </span>
                  )}
                  . They'll keep their snapshot but lose the label link.
                  Cancel to review them first, or continue — this can't be
                  undone.
                </>
              ) : (
                <>
                  Nothing currently links to this label. This cannot be
                  undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-1">
            <Button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleteManager.isPending}
              className="bg-white text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-50"
              data-testid="button-delete-label-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => deleteManager.mutate()}
              disabled={deleteManager.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white ml-2"
              data-testid="button-delete-label-confirm"
            >
              {deleteManager.isPending ? "Deleting…" : "Delete label"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminFrame>
  );
}

/* ─── Overview (inline-editable) ───────────────────────────────────── */

function OverviewPanel({ label }: { label: Manager }) {
  const invalidate: (readonly unknown[])[] = [
    ["/api/managers", label.id],
    ["/api/managers"],
  ];
  const endpoint = `/api/admin/managers/${label.id}`;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <EditablePanel
        title="Identity"
        testId="panel-overview-identity"
        endpoint={endpoint}
        values={{
          name: label.name,
          location: label.location,
          locationAddress: (label as any).locationAddress ?? null,
          bio: label.bio,
        }}
        invalidate={invalidate}
        fields={[
          { key: "name", label: "Name", type: "text", required: true },
          {
            key: "location",
            label: "Location",
            type: "address",
            addressKey: "locationAddress",
            placeholder: "Brooklyn, NY",
          },
          {
            key: "bio",
            label: "Bio",
            type: "textarea",
            placeholder: "A short paragraph about the label.",
          },
        ]}
      />
      <EditablePanel
        title="Links"
        testId="panel-overview-links"
        endpoint={endpoint}
        values={{
          websiteUrl: label.websiteUrl,
          instagramUrl: label.instagramUrl,
        }}
        invalidate={invalidate}
        fields={[
          {
            key: "websiteUrl",
            label: "Website",
            type: "url",
            placeholder: "https://example.com/",
          },
          {
            key: "instagramUrl",
            label: "Instagram",
            type: "url",
            placeholder: "https://instagram.com/yourlabel",
            readIcon: Instagram,
          },
        ]}
      />
      </div>
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

function ImageUploadPanel({
  label,
  field,
  fieldLabel,
  description,
  aspect,
}: {
  label: Manager;
  field: "logoUrl" | "coverUrl";
  fieldLabel: string;
  description: string;
  aspect: "square" | "wide";
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Curation lock — only `logoUrl` is lockable today (per the locked-vendor-
  // logos task). Cover keeps a plain dropzone.
  const isLogo = field === "logoUrl";
  const locked = isLogo ? !!label.logoLocked : false;

  const mut = useMutation({
    mutationFn: async (file: File) => {
      setPreviewUrl(URL.createObjectURL(file));
      const url = await uploadImageFile(file);
      await apiRequest("PUT", `/api/admin/managers/${label.id}`, {
        [field]: url,
      });
      return url;
    },
    onSuccess: async () => {
      await invalidateAdminEntity(qc, "manager", label.id);
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

  // Toggle the curation lock. Invalidate-on-success so the chip flips
  // when the row refetches. Mirrors AdminPerson's photo/cover lock.
  const lockMut = useMutation({
    mutationFn: async (nextLocked: boolean) => {
      await apiRequest("PUT", `/api/admin/managers/${label.id}`, {
        logoLocked: nextLocked,
      });
      return nextLocked;
    },
    onSuccess: async () => {
      await invalidateAdminEntity(qc, "manager", label.id);
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
  const shownUrl = previewUrl || label[field];
  const aspectClass = aspect === "square" ? "aspect-square" : "aspect-[3/1]";
  const objectFitClass =
    "object-cover";

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
          {/* Lock chip — only on Logo. Mirrors AdminPerson + AdminVendor:
              brand-blue when locked, slate when not, 7×7 ghost button. */}
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
              alt={label.name}
              className={["w-full h-full", objectFitClass].join(" ")}
              data-testid={`img-${field}-current`}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-300">
              <Tag className="w-12 h-12" />
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

function LogoPanel({ label }: { label: Manager }) {
  return (
    <ImageUploadPanel
      label={label}
      field="logoUrl"
      fieldLabel="Logo"
      aspect="square"
      description="Square works best — used in admin lists and any future fan-facing label page."
    />
  );
}

// Header pencil-overlay opens this dialog so admins can replace the
// label logo without hunting for the Logo tab. We wrap the same
// lock-aware LogoPanel used by the Logo tab — so curation lock,
// drag-drop, file-picker, and invalidation behavior are identical and
// stay in lock-step automatically. Mirrors AdminVendor's
// LogoEditorDialog so all partner headers share one source of truth.
function LogoEditorDialog({
  label,
  open,
  onOpenChange,
}: {
  label: Manager;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl bg-white rounded-2xl border-slate-200 shadow-xl p-6 gap-5"
        data-testid="dialog-edit-label-logo"
      >
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-slate-900 text-sm font-bold">
            Logo
          </DialogTitle>
          <DialogDescription className="sr-only">
            Replace the logo for {label.name}.
          </DialogDescription>
        </DialogHeader>
        <LogoPanel label={label} />
      </DialogContent>
    </Dialog>
  );
}

function CoverPanel({ label }: { label: Manager }) {
  return (
    <ImageUploadPanel
      label={label}
      field="coverUrl"
      fieldLabel="Cover"
      aspect="wide"
      description="3:1 banner — reserved for a future fan-facing label page header."
    />
  );
}

/* ─── Artists ──────────────────────────────────────────────────────── */

/**
 * In-page roster management — every Person whose `managerId` equals this
 * label, rendered in the same grid/list visuals the AdminPeople index
 * uses, plus the same chip cluster (Search · ViewModeToggle · Add).
 *
 * Adding an artist mounts `NewAlbumArtistDialog` in `mode="person"`:
 *   • Local match  → if already on this label, just navigate.
 *                    If on a *different* label, confirm before reassigning
 *                    (mirrors the partner-lock pattern; we don't want to
 *                    silently steal an artist from another label).
 *                    If unlabeled, PUT managerId and navigate.
 *   • New person   → newly created with no label, so PUT managerId.
 *
 * No remove-from-label affordance here (per task scope — operator can
 * still clear `managerId` from the Person's Overview tab).
 */
function ArtistsPanel({
  label,
  allPeople,
  onOpenPerson,
}: {
  label: Manager;
  allPeople: ManagerArtistPerson[];
  onOpenPerson: (id: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Distinct view-mode key from the People index so "list on Vendors
  // stays list" semantics extend per-surface without collision.
  const [view, setView] = useViewMode("label-artists");
  const [composerOpen, setComposerOpen] = useState(false);
  // Reassign-from-other-label confirmation state. Captured at pick time
  // so the dialog can name both sides.
  const [reassign, setReassign] = useState<{
    personId: string;
    personName: string;
    fromLabelName: string;
  } | null>(null);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Resolve other-label names for the reassign confirm copy.
  const { data: allLabels = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/managers"],
  });
  const labelNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of allLabels) m.set(l.id, l.name);
    return m;
  }, [allLabels]);

  const artists = useMemo(() => {
    const rows = allPeople.filter((p) => p.managerId === label.id);
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [allPeople, label.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? artists.filter((p) => p.name.toLowerCase().includes(q)) : artists;
  }, [artists, search]);

  const assignMut = useMutation({
    mutationFn: async (personId: string) => {
      await apiRequest("PUT", `/api/admin/people/${personId}`, {
        managerId: label.id,
      });
      return personId;
    },
    onSuccess: (personId) => {
      qc.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: `Added to ${label.name}` });
      onOpenPerson(personId);
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't add artist",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const handlePicked = ({ id, name }: { id: string; name: string }) => {
    setComposerOpen(false);
    const existing = allPeople.find((p) => p.id === id);
    if (existing && existing.managerId === label.id) {
      onOpenPerson(id);
      return;
    }
    if (existing && existing.managerId && existing.managerId !== label.id) {
      setReassign({
        personId: id,
        personName: name || existing.name,
        fromLabelName: labelNameById.get(existing.managerId) ?? "another label",
      });
      return;
    }
    // Either unlabeled existing person, or freshly created (not yet in
    // cache because the dialog's invalidate is in-flight). Either way:
    // PUT managerId.
    assignMut.mutate(id);
  };

  return (
    <div className="space-y-5" data-testid="panel-label-artists">
      {/* Chip cluster — mirrors AdminPeople's header chrome (Search ·
          ViewModeToggle · Add) so the two surfaces read as one family. */}
      <div className="flex items-center justify-end gap-1">
        {searchOpen ? (
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2.5 h-9">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search artists"
              className="w-44 text-[13px] bg-transparent outline-none placeholder:text-slate-400"
              data-testid="input-search-label-artists"
            />
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSearchOpen(false);
              }}
              className="text-slate-400 hover:text-slate-700"
              aria-label="Close search"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="h-9 w-9 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center justify-center transition-colors"
            aria-label="Search"
            data-testid="button-search-label-artists"
          >
            <Search className="w-4 h-4" />
          </button>
        )}
        <ViewModeToggle
          value={view}
          onChange={setView}
          testIdPrefix="view-mode-label-artists"
        />
        <AddEntityButton
          label="Add Artist"
          onClick={() => setComposerOpen(true)}
          testId="button-add-label-artist"
        />
      </div>

      {filtered.length === 0 ? (
        <ArtistsEmptyState
          searching={search.trim().length > 0}
          onAdd={() => setComposerOpen(true)}
        />
      ) : view === "grid" ? (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6"
          data-testid="grid-label-artists"
        >
          {filtered.map((p) => (
            <ManagerArtistCard
              key={p.id}
              person={p}
              onOpen={() => onOpenPerson(p.id)}
            />
          ))}
        </div>
      ) : (
        <div
          className="rounded-lg border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100"
          data-testid="list-label-artists"
        >
          {filtered.map((p) => (
            <ManagerArtistRow
              key={p.id}
              person={p}
              onOpen={() => onOpenPerson(p.id)}
            />
          ))}
        </div>
      )}

      <NewAlbumArtistDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        mode="person"
        onSelect={handlePicked}
        onSkip={() => setComposerOpen(false)}
      />

      <Dialog
        open={!!reassign}
        onOpenChange={(v) => !assignMut.isPending && !v && setReassign(null)}
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-reassign-artist"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900 pr-8">
              Reassign <span className="italic">{reassign?.personName}</span>?
            </DialogTitle>
            <DialogDescription className="text-[13px] font-normal text-slate-500">
              They're currently signed to{" "}
              <span className="font-semibold text-slate-700">
                {reassign?.fromLabelName}
              </span>
              . Continuing will move them to{" "}
              <span className="font-semibold text-slate-700">{label.name}</span>
              {" "}— previous label loses the link.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-1">
            <Button
              type="button"
              onClick={() => setReassign(null)}
              disabled={assignMut.isPending}
              className="bg-white text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-50"
              data-testid="button-reassign-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (reassign) assignMut.mutate(reassign.personId);
                setReassign(null);
              }}
              disabled={assignMut.isPending}
              className="bg-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/90 text-white ml-2"
              data-testid="button-reassign-confirm"
            >
              {assignMut.isPending ? "Moving…" : `Move to ${label.name}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * StreamingBadge — same priority + visuals as AdminPeople's badge,
 * inlined here so the Artists tab stays in lock-step without
 * cross-page imports. (1) Spotify confirmed → full-color, (2) Apple
 * confirmed → full-color, (3) searched-no-match → dim slate.
 */
function StreamingBadge({
  person,
  size,
}: {
  person: ManagerArtistPerson;
  size: "sm" | "md";
}) {
  const dim = size === "md" ? "w-6 h-6" : "w-4 h-4";
  const icon = size === "md" ? "w-3.5 h-3.5" : "w-2.5 h-2.5";

  let glyph: JSX.Element | null = null;
  let title = "";
  let testid = "";

  if (person.spotifyUrl) {
    glyph = <SiSpotify className={`${icon} text-[#1DB954]`} />;
    title = "Linked on Spotify";
    testid = `badge-spotify-linked-${person.id}`;
  } else if (person.itunesArtistId) {
    glyph = <SiApplemusic className={`${icon} text-[#FA243C]`} />;
    title = "Linked on Apple Music";
    testid = `badge-apple-linked-${person.id}`;
  } else if (person.spotifyHasMatch === false) {
    glyph = <SiSpotify className={`${icon} text-slate-300`} />;
    title = "Searched Spotify — no match found";
    testid = `badge-spotify-nomatch-${person.id}`;
  }

  if (!glyph) return null;
  return (
    <div
      className={`absolute bottom-[7%] right-[7%] ${dim} rounded-full bg-white ring-1 ring-slate-200 shadow-sm flex items-center justify-center`}
      title={title}
      data-testid={testid}
    >
      {glyph}
    </div>
  );
}

function initialFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

function ManagerArtistCard({
  person,
  onOpen,
}: {
  person: ManagerArtistPerson;
  onOpen: () => void;
}) {
  // Secondary "Independent / <label>" line is dropped here — every row
  // in this list is on the current label by definition, so it'd be
  // wallpaper. Card sticks to avatar + name.
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left flex flex-col items-center"
      data-testid={`card-label-artist-${person.id}`}
    >
      <div className="relative w-full aspect-square">
        <div className="w-full h-full rounded-full overflow-hidden bg-[var(--brand-blue)] ring-1 ring-slate-200 shadow-sm group-hover:shadow-md group-hover:ring-[var(--brand-blue)]/30 transition-all">
          {person.photoUrl ? (
            <img
              src={person.photoUrl}
              alt={person.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-white text-3xl font-bold">
                {initialFor(person.name)}
              </span>
            </div>
          )}
        </div>
        <StreamingBadge person={person} size="md" />
      </div>
      <div
        className="mt-3 w-full text-center text-slate-900 text-[13px] font-semibold truncate px-1"
        data-testid={`text-label-artist-name-${person.id}`}
      >
        {person.name}
      </div>
    </button>
  );
}

function ManagerArtistRow({
  person,
  onOpen,
}: {
  person: ManagerArtistPerson;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-slate-50 transition-colors"
      data-testid={`row-label-artist-${person.id}`}
    >
      <div className="relative w-10 h-10 flex-shrink-0">
        <div className="w-full h-full rounded-full overflow-hidden bg-[var(--brand-blue)] ring-1 ring-slate-200">
          {person.photoUrl ? (
            <img
              src={person.photoUrl}
              alt={person.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">
                {initialFor(person.name)}
              </span>
            </div>
          )}
        </div>
        <StreamingBadge person={person} size="sm" />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-slate-900 text-[13.5px] font-semibold truncate group-hover:text-[var(--brand-blue)] transition-colors"
          data-testid={`text-label-artist-name-${person.id}`}
        >
          {person.name}
        </div>
      </div>
    </button>
  );
}

function ArtistsEmptyState({
  searching,
  onAdd,
}: {
  searching: boolean;
  onAdd: () => void;
}) {
  return (
    <Card
      className="rounded-2xl shadow-sm p-10 text-center"
      data-testid="empty-label-artists"
    >
      <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
        <UserIcon className="w-6 h-6" />
      </div>
      <p className="text-slate-700 text-[14px] font-semibold">
        {searching ? "No artists match that search" : "No artists yet"}
      </p>
      <p className="text-slate-400 text-[12.5px] mt-1 max-w-xs mx-auto">
        {searching
          ? "Try a different name."
          : "Add the first artist signed to this label — search your local catalog or pull one from Spotify or Apple Music."}
      </p>
      {!searching && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
          data-testid="button-empty-add-first-artist"
        >
          Add your first artist
        </button>
      )}
    </Card>
  );
}

/* ─── Releases ─────────────────────────────────────────────────────── */

function ReleasesPanel({
  releases,
  onOpenPerson,
}: {
  releases: AlbumLite[];
  onOpenPerson: (id: string) => void;
}) {
  if (releases.length === 0) {
    return (
      <Card
        className="rounded-2xl shadow-sm p-10 text-center"
        data-testid="panel-releases-empty"
      >
        <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
          <Disc className="w-6 h-6" />
        </div>
        <p className="text-slate-700 text-[14px] font-semibold">
          No releases on this label yet
        </p>
        <p className="text-slate-400 text-[12.5px] mt-1 max-w-xs mx-auto">
          Assign this label to an album from the album's Overview tab and
          it'll show up here.
        </p>
      </Card>
    );
  }
  return (
    <Card
      className="rounded-2xl shadow-sm overflow-hidden"
      data-testid="panel-releases"
    >
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-slate-900 text-[14px] font-bold inline-flex items-center gap-2">
          <Disc className="w-4 h-4 text-slate-400" />
          Releases
        </h2>
        <p className="text-slate-400 text-[11.5px]">
          {releases.length}{" "}
          {releases.length === 1 ? "release" : "releases"} · newest first
        </p>
      </div>
      <ul className="divide-y divide-slate-100" data-testid="list-releases">
        {releases.map((a) => (
          // The whole row links to the album, but a credited artist needs
          // to be its own click target (→ artist page). Nested anchors are
          // invalid, so the album Link is an absolute layer behind the
          // content; the artist button sits above it with pointer-events.
          <li key={a.id} className="relative">
            <Link
              href={`/admin/albums/${a.id}`}
              className="absolute inset-0 hover:bg-slate-50 transition-colors"
              data-testid={`row-release-${a.id}`}
              aria-label={a.title}
            />
            <div className="relative z-10 flex items-center gap-3.5 px-6 py-3 pointer-events-none">
              <div className="w-11 h-11 rounded-md overflow-hidden bg-slate-100 ring-1 ring-slate-200 flex-shrink-0">
                <img
                  src={a.artwork}
                  alt={a.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-slate-900 text-[13.5px] font-semibold truncate">
                    {a.title}
                  </span>
                  {a.isHidden && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-wider flex-shrink-0">
                      Hidden
                    </span>
                  )}
                </div>
                <div className="text-slate-400 text-[11.5px] truncate">
                  {a.primaryArtistId ? (
                    <button
                      type="button"
                      onClick={() => onOpenPerson(a.primaryArtistId!)}
                      className="pointer-events-auto hover:text-slate-700 hover:underline"
                      data-testid={`link-release-artist-${a.id}`}
                    >
                      {a.artist}
                    </button>
                  ) : (
                    a.artist
                  )}
                  {a.year ? ` · ${a.year}` : ""} · {a.type}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
