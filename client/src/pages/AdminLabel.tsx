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
} from "lucide-react";
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
import { PayoutAccountPanel } from "@/components/admin/PayoutAccountPanel";
import { PartnerPermissionsPanel } from "@/components/admin/PartnerPermissionsPanel";
import { InvitedByPressPanel } from "@/components/admin/InvitedByPressPanel";
import { OrganizationPeople } from "@/components/admin/OrganizationPeople";
import {
  LabelPreviewCard,
  type LabelPreviewAlbum,
  type LabelPreviewPerson,
} from "@/components/admin/previews/LabelPreviewCard";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { invalidateAdminEntity } from "@/lib/adminEntityInvalidation";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin · Single label (Phase 6f).
 *
 * Tabs: Overview · Logo · Cover · Releases
 *
 * Releases is derived client-side from /api/albums filtered by labelId
 * — no dedicated endpoint, but the album list is already cached.
 */

interface Label {
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
  // Task #199 — if this label was invited by a specific press, their
  // Sell-panel Presses surface is hard-locked to that press until
  // they ship their first run. Super-admin can clear/switch via the
  // Identity panel.
  invitedByPressId: string | null;
}

interface AlbumLite {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  year: number | null;
  type: string;
  labelId: string | null;
  isHidden: boolean;
  primaryArtistId: string | null;
}

type Tab = "overview" | "logo" | "cover" | "releases" | "payouts" | "permissions";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "logo", label: "Logo" },
  { key: "cover", label: "Cover" },
  { key: "releases", label: "Releases" },
  { key: "payouts", label: "Payouts" },
  { key: "permissions", label: "Permissions" },
];

export function AdminLabel() {
  const { user, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ id: string }>("/admin/labels/:id");
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const labelId = params?.id ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const deleteLabel = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/labels/${labelId}`);
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["/api/labels", labelId] });
      qc.invalidateQueries({ queryKey: ["/api/labels"] });
      qc.invalidateQueries({ queryKey: ["/api/albums"] });
      qc.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Label deleted." });
      setDeleteConfirmOpen(false);
      navigate("/admin/labels");
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't delete label",
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

  const { data: label, isLoading, error } = useQuery<Label>({
    queryKey: ["/api/labels", labelId],
    enabled: !!user?.isAdmin && !!labelId,
  });

  const rescrape = useMutation({
    mutationFn: async () => {
      if (!label?.websiteUrl) throw new Error("No website saved");
      const r = await apiRequest("POST", `/api/admin/labels/scrape`, { url: label.websiteUrl });
      const scraped = (await r.json()) as {
        name: string | null;
        logoUrl: string | null;
        bio: string | null;
      };
      const patch: Partial<Label> = {};
      if (scraped.name) patch.name = scraped.name;
      if (scraped.logoUrl) patch.logoUrl = scraped.logoUrl;
      if (scraped.bio) patch.bio = scraped.bio;
      if (Object.keys(patch).length === 0) return null;
      const r2 = await apiRequest("PUT", `/api/admin/labels/${labelId}`, patch);
      return (await r2.json()) as Label;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["/api/labels", labelId] });
      qc.invalidateQueries({ queryKey: ["/api/labels"] });
      toast({ title: row ? "Refreshed from website" : "Nothing new to update" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't re-scrape", description: e?.message, variant: "destructive" }),
  });

  const { data: allAlbums = [] } = useQuery<AlbumLite[]>({
    queryKey: ["/api/albums"],
    enabled: !!user?.isAdmin,
  });

  const { data: allPeople = [] } = useQuery<LabelPreviewPerson[]>({
    queryKey: ["/api/people"],
    enabled: !!user?.isAdmin,
  });

  const releases = useMemo(
    () =>
      allAlbums
        .filter((a) => a.labelId === labelId)
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
    [allAlbums, labelId],
  );

  // People directly signed to this label. `albums.labelId` is also a link
  // but we count those via `releases` above so the operator sees the two
  // numbers separately.
  const linkedPeopleCount = useMemo(
    () => allPeople.filter((p) => p.labelId === labelId).length,
    [allPeople, labelId],
  );

  const openInClassicAdmin = () => {
    try {
      localStorage.setItem("gt:admin:entity", "labels");
      localStorage.setItem("gt:admin:focus-label", labelId);
    } catch {}
    navigate("/admin");
  };

  if (authLoading || isLoading) {
    return (
      <AdminFrame active="labels">
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
      <AdminFrame active="labels">
        <div className="py-20 text-center space-y-3">
          <h1 className="text-slate-900 text-lg font-semibold">
            Label not found
          </h1>
          <Link
            href="/admin/labels"
            className="text-[var(--brand-blue)] text-sm hover:underline inline-flex items-center gap-1"
            data-testid="link-back-to-labels"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to labels
          </Link>
        </div>
      </AdminFrame>
    );
  }

  const previewAlbums: LabelPreviewAlbum[] = allAlbums.map((a) => ({
    id: a.id,
    title: a.title,
    artist: a.artist,
    artwork: a.artwork,
    year: a.year,
    type: a.type,
    labelId: a.labelId,
    isHidden: a.isHidden,
    primaryArtistId: a.primaryArtistId,
  }));

  return (
    <AdminFrame
      active="labels"
      contentWidth="narrow"
      preview={
        <LabelPreviewCard
          label={label}
          albums={previewAlbums}
          people={allPeople}
        />
      }
    >
      <div className="space-y-6">
        {/* BREADCRUMB */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium">
          <Link
            href="/admin/labels"
            className="hover:text-slate-700"
            data-testid="link-breadcrumb-labels"
          >
            Labels
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">
            {label.name}
          </span>
        </div>

        {/* HEADER */}
        <div className="flex items-start gap-5">
          <div className="w-24 h-24 rounded-xl overflow-hidden bg-white ring-1 ring-slate-200 shadow-sm flex-shrink-0 flex items-center justify-center">
            {label.logoUrl ? (
              <img
                src={label.logoUrl}
                alt={label.name}
                className="w-full h-full object-cover"
                data-testid="img-label-logo"
              />
            ) : (
              <Tag className="w-10 h-10 text-slate-300" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
              Label
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
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
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
              disabled={deleteLabel.isPending}
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
            apiPath={`/api/labels/${label.id}/people`}
            testIdPrefix="label"
            entityKind="label"
            entityId={label.id}
            entityName={label.name}
            blurb="People at this label — A&R, label manager, accounts, anyone you need to reach."
          />
        )}
        {tab === "logo" && <LogoPanel label={label} />}
        {tab === "cover" && <CoverPanel label={label} />}
        {tab === "releases" && <ReleasesPanel releases={releases} />}
        {tab === "payouts" && (
          <PayoutAccountPanel
            ownerKind="label"
            ownerId={label.id}
            ownerName={label.name}
            ownerEmail={null}
          />
        )}
        {tab === "permissions" && (
          <PartnerPermissionsPanel scopeKind="label" scopeId={label.id} scopeName={label.name} />
        )}
      </div>

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(v) => !deleteLabel.isPending && setDeleteConfirmOpen(v)}
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
              disabled={deleteLabel.isPending}
              className="bg-white text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-50"
              data-testid="button-delete-label-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => deleteLabel.mutate()}
              disabled={deleteLabel.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white ml-2"
              data-testid="button-delete-label-confirm"
            >
              {deleteLabel.isPending ? "Deleting…" : "Delete label"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminFrame>
  );
}

/* ─── Overview (inline-editable) ───────────────────────────────────── */

function OverviewPanel({ label }: { label: Label }) {
  const invalidate: (readonly unknown[])[] = [
    ["/api/labels", label.id],
    ["/api/labels"],
  ];
  const endpoint = `/api/admin/labels/${label.id}`;
  return (
    <div className="space-y-5">
      <InvitedByPressPanel kind="labels" id={label.id} currentPressId={label.invitedByPressId} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <EditablePanel
        title="Identity"
        testId="panel-overview-identity"
        endpoint={endpoint}
        values={{
          name: label.name,
          location: label.location,
          bio: label.bio,
        }}
        invalidate={invalidate}
        fields={[
          { key: "name", label: "Name", type: "text", required: true },
          {
            key: "location",
            label: "Location",
            type: "text",
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
  label: Label;
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
      await apiRequest("PUT", `/api/admin/labels/${label.id}`, {
        [field]: url,
      });
      return url;
    },
    onSuccess: async () => {
      await invalidateAdminEntity(qc, "label", label.id);
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
      await apiRequest("PUT", `/api/admin/labels/${label.id}`, {
        logoLocked: nextLocked,
      });
      return nextLocked;
    },
    onSuccess: async () => {
      await invalidateAdminEntity(qc, "label", label.id);
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

function LogoPanel({ label }: { label: Label }) {
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

function CoverPanel({ label }: { label: Label }) {
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

/* ─── Releases ─────────────────────────────────────────────────────── */

function ReleasesPanel({ releases }: { releases: AlbumLite[] }) {
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
          <li key={a.id}>
            <Link
              href={`/admin/albums/${a.id}`}
              className="flex items-center gap-3.5 px-6 py-3 hover:bg-slate-50 transition-colors"
              data-testid={`row-release-${a.id}`}
            >
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
                  {a.artist}
                  {a.year ? ` · ${a.year}` : ""} · {a.type}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
