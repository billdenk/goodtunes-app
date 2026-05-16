import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  Pencil,
  Upload,
  Loader2,
  Tag,
  ExternalLink,
  MapPin,
  Disc,
  Instagram,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
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
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  coverUrl: string | null;
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
}

type Tab = "overview" | "logo" | "cover" | "releases";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "logo", label: "Logo" },
  { key: "cover", label: "Cover" },
  { key: "releases", label: "Releases" },
];

export function AdminLabel() {
  const { user, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ id: string }>("/admin/labels/:id");
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const labelId = params?.id ?? "";

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

  const { data: allAlbums = [] } = useQuery<AlbumLite[]>({
    queryKey: ["/api/albums"],
    enabled: !!user?.isAdmin,
  });

  const releases = useMemo(
    () =>
      allAlbums
        .filter((a) => a.labelId === labelId)
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
    [allAlbums, labelId],
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
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
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
            className="text-[#319ED8] text-sm hover:underline inline-flex items-center gap-1"
            data-testid="link-back-to-labels"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to labels
          </Link>
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="labels">
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
                className="w-full h-full object-contain p-2"
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
                  className="inline-flex items-center gap-1 hover:text-[#319ED8]"
                  data-testid="link-label-website"
                >
                  Visit
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
          <button
            onClick={openInClassicAdmin}
            className="px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-700 text-[12px] font-semibold hover:bg-slate-50 inline-flex items-center gap-1.5 flex-shrink-0"
            data-testid="button-open-classic-admin"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Open in classic admin
          </button>
        </div>

        {/* TABS */}
        <div
          className="flex items-center gap-5 border-b border-slate-200 overflow-x-auto"
          data-testid="tabs-admin-label"
        >
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
                <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[#319ED8] rounded-full" />
              )}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <OverviewPanel label={label} onEdit={openInClassicAdmin} />
        )}
        {tab === "logo" && <LogoPanel label={label} />}
        {tab === "cover" && <CoverPanel label={label} />}
        {tab === "releases" && <ReleasesPanel releases={releases} />}
      </div>
    </AdminFrame>
  );
}

/* ─── Overview ─────────────────────────────────────────────────────── */

function OverviewPanel({
  label,
  onEdit,
}: {
  label: Label;
  onEdit: () => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <section
        className="group rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-5"
        data-testid="panel-overview-identity"
      >
        <PanelHeader title="Identity" onEdit={onEdit} />
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Name" value={label.name} testId="field-name" />
          <Field
            label="Location"
            value={label.location}
            testId="field-location"
          />
        </dl>
        <div>
          <dt className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-1">
            Bio
          </dt>
          <dd
            className={[
              "text-[13.5px] leading-relaxed whitespace-pre-line",
              label.bio ? "text-slate-700" : "text-slate-300 italic",
            ].join(" ")}
            data-testid="field-bio"
          >
            {label.bio || "No bio yet"}
          </dd>
        </div>
      </section>

      <section
        className="group rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-5"
        data-testid="panel-overview-links"
      >
        <PanelHeader title="Links" onEdit={onEdit} />
        <dl className="space-y-4">
          <LinkField
            label="Website"
            value={label.websiteUrl}
            testId="field-website-url"
          />
          <LinkField
            label="Instagram"
            value={label.instagramUrl}
            testId="field-instagram-url"
            icon={Instagram}
          />
        </dl>
      </section>
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
      await qc.invalidateQueries({
        queryKey: ["/api/labels", label.id],
      });
      await qc.invalidateQueries({ queryKey: ["/api/labels"] });
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
    field === "logoUrl" ? "object-contain p-3" : "object-cover";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <section
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6"
        data-testid={`panel-${field}-current`}
      >
        <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-3">
          Current {fieldLabel.toLowerCase()}
        </div>
        <div
          className={[
            "relative rounded-xl overflow-hidden bg-slate-50 ring-1 ring-slate-200",
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
              <Loader2 className="w-6 h-6 text-[#319ED8] animate-spin" />
              <span className="text-[12px] text-slate-700 font-semibold">
                Uploading…
              </span>
            </div>
          )}
        </div>
      </section>

      <section
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 flex flex-col"
        data-testid={`panel-${field}-upload`}
      >
        <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-3">
          Replace {fieldLabel.toLowerCase()}
        </div>
        <button
          type="button"
          onClick={() => !busy && fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (busy) return;
            acceptFile(e.dataTransfer.files?.[0]);
          }}
          disabled={busy}
          data-testid={`dropzone-${field}`}
          className={[
            "flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors px-6 py-10 text-center",
            dragging
              ? "border-[#319ED8] bg-[#319ED8]/5"
              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
            busy && "opacity-60 cursor-not-allowed",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Upload
            className={[
              "w-7 h-7",
              dragging ? "text-[#319ED8]" : "text-slate-400",
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
      </section>
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
      <section
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-10 text-center"
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
      </section>
    );
  }
  return (
    <section
      className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
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
    </section>
  );
}

/* ─── Bits ─────────────────────────────────────────────────────────── */

function PanelHeader({
  title,
  onEdit,
}: {
  title: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-slate-900 text-[14px] font-bold">{title}</h2>
      <button
        onClick={onEdit}
        aria-label="Edit in classic admin"
        title="Edit in classic admin"
        data-testid={`button-edit-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
        className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 inline-flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | null;
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <dt className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-0.5">
        {label}
      </dt>
      <dd
        className={[
          "text-[13.5px]",
          value ? "text-slate-900 font-medium" : "text-slate-300 italic",
        ].join(" ")}
      >
        {value || "Not set"}
      </dd>
    </div>
  );
}

function LinkField({
  label,
  value,
  testId,
  icon: Icon,
}: {
  label: string;
  value: string | null;
  testId?: string;
  icon?: typeof ExternalLink;
}) {
  return (
    <div data-testid={testId}>
      <dt className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-0.5">
        {label}
      </dt>
      <dd className="text-[13.5px]">
        {value ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="text-[#319ED8] font-medium hover:underline inline-flex items-center gap-1"
          >
            {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
            <span className="truncate max-w-[320px]">
              {value.replace(/^https?:\/\//, "")}
            </span>
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        ) : (
          <span className="text-slate-300 italic">Not set</span>
        )}
      </dd>
    </div>
  );
}
