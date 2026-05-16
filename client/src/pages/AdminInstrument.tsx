import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  Pencil,
  Upload,
  Loader2,
  ImageIcon,
  Guitar,
  Store,
  Eye,
  EyeOff,
  Trash2,
  ExternalLink,
  Plus,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin · Single instrument. Wrapped in AdminFrame so it shares the top
 * bar + left entity sidebar with /admin/instruments.
 *
 * Tabs:
 *   Overview · Photo · Vendors — real read + per-attachment edits
 *
 * The vendor-attach flow (URL scrape + find-or-create vendor) still
 * lives in the classic admin — that's the meaty UI. Here we surface
 * what's already attached and let the admin toggle visibility, edit
 * the affiliate URL, or detach inline.
 */

interface AttachedVendor {
  // instrument_vendors row id (the attachment, not the vendor)
  id: string;
  vendorId: string;
  affiliateUrl: string;
  position: number;
  isHidden: boolean;
  name: string;
  domain: string;
  logoUrl: string | null;
  tagline: string | null;
  homeUrl: string | null;
}

interface InstrumentFull {
  id: string;
  name: string;
  category: string;
  shortCategory: string | null;
  photoUrl: string | null;
  about: string | null;
  artistNote: string | null;
  vendors: AttachedVendor[];
}

type Tab = "overview" | "photo" | "vendors";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "photo", label: "Photo" },
  { key: "vendors", label: "Vendors" },
];

export function AdminInstrument() {
  const { user, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ id: string }>("/admin/instruments/:id");
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const instrumentId = params?.id ?? "";

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  const { data: instrument, isLoading, error } = useQuery<InstrumentFull>({
    queryKey: ["/api/instruments", instrumentId],
    enabled: !!user?.isAdmin && !!instrumentId,
  });

  const openInClassicAdmin = () => {
    try {
      localStorage.setItem("gt:admin:entity", "gear");
      localStorage.setItem("gt:admin:focus-instrument", instrumentId);
    } catch {}
    navigate("/admin");
  };

  if (authLoading || isLoading) {
    return (
      <AdminFrame active="gear">
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

  if (error || !instrument) {
    return (
      <AdminFrame active="gear">
        <div className="py-20 text-center space-y-3">
          <h1 className="text-slate-900 text-lg font-semibold">
            Instrument not found
          </h1>
          <Link
            href="/admin/instruments"
            className="text-[#319ED8] text-sm hover:underline inline-flex items-center gap-1"
            data-testid="link-back-to-instruments"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to gear
          </Link>
        </div>
      </AdminFrame>
    );
  }

  const vendorCount = instrument.vendors?.length ?? 0;

  return (
    <AdminFrame active="gear">
      <div className="space-y-6">
        {/* BREADCRUMB */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium">
          <Link
            href="/admin/instruments"
            className="hover:text-slate-700"
            data-testid="link-breadcrumb-instruments"
          >
            Gear
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">
            {instrument.name}
          </span>
        </div>

        {/* HEADER */}
        <div className="flex items-start gap-5">
          <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-100 ring-1 ring-slate-200 shadow-sm flex-shrink-0">
            {instrument.photoUrl ? (
              <img
                src={instrument.photoUrl}
                alt={instrument.name}
                className="w-full h-full object-cover"
                data-testid="img-instrument-photo"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-300">
                <Guitar className="w-10 h-10" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
              {instrument.shortCategory || instrument.category}
            </div>
            <h1
              className="text-slate-900 text-[26px] font-bold tracking-tight mt-0.5"
              data-testid="heading-instrument-name"
            >
              {instrument.name}
            </h1>
            <div className="text-slate-500 text-[13px] mt-0.5 inline-flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-slate-400" />
              {vendorCount} {vendorCount === 1 ? "vendor" : "vendors"}
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
          data-testid="tabs-admin-instrument"
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

        {/* TAB CONTENT */}
        {tab === "overview" && (
          <OverviewPanel
            instrument={instrument}
            onEdit={openInClassicAdmin}
          />
        )}
        {tab === "photo" && <PhotoPanel instrument={instrument} />}
        {tab === "vendors" && (
          <VendorsPanel
            instrument={instrument}
            onEdit={openInClassicAdmin}
          />
        )}
      </div>
    </AdminFrame>
  );
}

/* ─── Overview ─────────────────────────────────────────────────────── */

function OverviewPanel({
  instrument,
  onEdit,
}: {
  instrument: InstrumentFull;
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
          <Field label="Name" value={instrument.name} testId="field-name" />
          <Field
            label="Category"
            value={instrument.category}
            testId="field-category"
          />
          <Field
            label="Short category"
            value={instrument.shortCategory}
            testId="field-short-category"
          />
        </dl>
      </section>

      <section
        className="group rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-5"
        data-testid="panel-overview-notes"
      >
        <PanelHeader title="Notes" onEdit={onEdit} />
        <div>
          <dt className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-1">
            About
          </dt>
          <dd
            className={[
              "text-[13.5px] leading-relaxed whitespace-pre-line",
              instrument.about ? "text-slate-700" : "text-slate-300 italic",
            ].join(" ")}
            data-testid="field-about"
          >
            {instrument.about || "No description yet"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-1">
            Artist note
          </dt>
          <dd
            className={[
              "text-[13.5px] leading-relaxed whitespace-pre-line",
              instrument.artistNote
                ? "text-slate-700"
                : "text-slate-300 italic",
            ].join(" ")}
            data-testid="field-artist-note"
          >
            {instrument.artistNote || "No artist note yet"}
          </dd>
        </div>
      </section>
    </div>
  );
}

/* ─── Photo tab ────────────────────────────────────────────────────── */

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

function PhotoPanel({ instrument }: { instrument: InstrumentFull }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async (file: File) => {
      setPreviewUrl(URL.createObjectURL(file));
      const url = await uploadImageFile(file);
      await apiRequest("PUT", `/api/admin/instruments/${instrument.id}`, {
        photoUrl: url,
      });
      return url;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["/api/instruments", instrument.id],
      });
      await qc.invalidateQueries({ queryKey: ["/api/instruments"] });
      setPreviewUrl(null);
      toast({ title: "Photo updated" });
    },
    onError: (e: any) => {
      setPreviewUrl(null);
      toast({
        title: "Couldn't update the photo",
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
  const shownUrl = previewUrl || instrument.photoUrl;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <section
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6"
        data-testid="panel-photo-current"
      >
        <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-3">
          Current photo
        </div>
        <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 ring-1 ring-slate-200">
          {shownUrl ? (
            <img
              src={shownUrl}
              alt={instrument.name}
              className="w-full h-full object-cover"
              data-testid="img-photo-current"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-300">
              <Guitar className="w-12 h-12" />
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
        data-testid="panel-photo-upload"
      >
        <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-3">
          Replace photo
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
          data-testid="dropzone-photo"
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
          data-testid="input-photo-file"
        />
        <p className="mt-4 text-[11.5px] text-slate-500 leading-relaxed">
          Square works best — used in the fan-side InstrumentSheet and in the
          credits surface when a performer played this on a track.
        </p>
      </section>
    </div>
  );
}

/* ─── Vendors tab ──────────────────────────────────────────────────── */

function VendorsPanel({
  instrument,
  onEdit,
}: {
  instrument: InstrumentFull;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const vendors = (instrument.vendors ?? []).slice().sort(
    (a, b) => a.position - b.position,
  );

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: ["/api/instruments", instrument.id],
    });

  const toggleHidden = useMutation({
    mutationFn: async (v: AttachedVendor) => {
      await apiRequest("PUT", `/api/admin/instrument-vendors/${v.id}`, {
        isHidden: !v.isHidden,
      });
    },
    onSuccess: async () => {
      await invalidate();
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't update visibility",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const detach = useMutation({
    mutationFn: async (attachmentId: string) => {
      await apiRequest(
        "DELETE",
        `/api/admin/instrument-vendors/${attachmentId}`,
      );
    },
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Vendor detached" });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't detach vendor",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  return (
    <section
      className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
      data-testid="panel-vendors"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-slate-900 text-[14px] font-bold inline-flex items-center gap-2">
            <Store className="w-4 h-4 text-slate-400" />
            Vendors
          </h2>
          <p className="text-slate-400 text-[11.5px]">
            {vendors.length} attached · hidden vendors show on the fan side
            as removed, useful when a competing brand is sponsoring this track
          </p>
        </div>
        <button
          onClick={onEdit}
          className="px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5"
          data-testid="button-add-vendor"
        >
          <Plus className="w-3.5 h-3.5" />
          Add vendor
        </button>
      </div>
      {vendors.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <Store className="w-6 h-6" />
          </div>
          <p className="text-slate-700 text-[14px] font-semibold">
            No vendors attached yet
          </p>
          <p className="text-slate-400 text-[12.5px] mt-1 max-w-xs mx-auto">
            Add one in the classic editor — paste a product URL and the
            scraper finds-or-creates the vendor entity and attaches it.
          </p>
        </div>
      ) : (
        <ul
          className="divide-y divide-slate-100"
          data-testid="list-vendors"
        >
          {vendors.map((v) => (
            <VendorRow
              key={v.id}
              vendor={v}
              onToggleHidden={() => toggleHidden.mutate(v)}
              onDetach={() => {
                if (confirm(`Detach "${v.name}" from this instrument?`)) {
                  detach.mutate(v.id);
                }
              }}
              busy={toggleHidden.isPending || detach.isPending}
              onEdit={onEdit}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function VendorRow({
  vendor,
  onToggleHidden,
  onDetach,
  busy,
  onEdit,
}: {
  vendor: AttachedVendor;
  onToggleHidden: () => void;
  onDetach: () => void;
  busy: boolean;
  onEdit: () => void;
}) {
  return (
    <li
      className={[
        "group flex items-center gap-4 px-6 py-3.5 transition-colors",
        vendor.isHidden ? "bg-slate-50" : "hover:bg-slate-50/50",
      ].join(" ")}
      data-testid={`row-vendor-${vendor.id}`}
    >
      {/* Logo */}
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
        {vendor.logoUrl ? (
          <img
            src={vendor.logoUrl}
            alt={vendor.name}
            className="w-full h-full object-contain p-1"
          />
        ) : (
          <Store className="w-4 h-4 text-slate-400" />
        )}
      </div>

      {/* Identity */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={[
              "text-[13.5px] font-semibold truncate",
              vendor.isHidden ? "text-slate-500" : "text-slate-900",
            ].join(" ")}
            data-testid={`text-vendor-name-${vendor.id}`}
          >
            {vendor.name}
          </span>
          {vendor.isHidden && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
              <EyeOff className="w-2.5 h-2.5" />
              Hidden
            </span>
          )}
        </div>
        <div className="text-slate-400 text-[11.5px] truncate">
          {vendor.tagline || vendor.domain}
        </div>
      </div>

      {/* Affiliate URL preview */}
      <a
        href={vendor.affiliateUrl}
        target="_blank"
        rel="noreferrer"
        className="hidden md:inline-flex items-center gap-1 text-[11.5px] text-slate-400 hover:text-[#319ED8] truncate max-w-[280px]"
        data-testid={`link-affiliate-${vendor.id}`}
      >
        <span className="truncate">
          {vendor.affiliateUrl.replace(/^https?:\/\//, "")}
        </span>
        <ExternalLink className="w-3 h-3 flex-shrink-0" />
      </a>

      {/* Actions — hover-reveal cluster */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onToggleHidden}
          disabled={busy}
          aria-label={vendor.isHidden ? "Show vendor" : "Hide vendor"}
          title={vendor.isHidden ? "Show vendor" : "Hide vendor"}
          className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 inline-flex items-center justify-center"
          data-testid={`button-toggle-hidden-${vendor.id}`}
        >
          {vendor.isHidden ? (
            <Eye className="w-3.5 h-3.5" />
          ) : (
            <EyeOff className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit in classic admin"
          title="Edit in classic admin"
          className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 inline-flex items-center justify-center"
          data-testid={`button-edit-vendor-${vendor.id}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDetach}
          disabled={busy}
          aria-label="Detach vendor"
          title="Detach vendor"
          className="w-7 h-7 rounded-full bg-slate-100 text-rose-600 hover:bg-rose-50 hover:text-rose-700 inline-flex items-center justify-center"
          data-testid={`button-detach-${vendor.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
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
        data-testid={`button-edit-${title.toLowerCase().replace(/\s+/g, "-")}`}
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

/* ─── Photo upload helper (exported for AdminInstruments if needed) ── */
export { uploadImageFile };
