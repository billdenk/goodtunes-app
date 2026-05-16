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
  Guitar,
  Store,
  ExternalLink,
  MapPin,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { EditablePanel } from "@/components/admin/EditablePanel";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin · Single vendor (Phase 6e).
 *
 * Tabs: Overview · Logo · Cover · Instruments
 *
 * Logo + Cover are real drag-drop uploads that PUT photoUrl/coverUrl on
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
  tagline: string | null;
  bio: string | null;
  location: string | null;
  coverUrl: string | null;
}

interface VendorInstrument {
  id: string;
  name: string;
  category: string;
  shortCategory: string | null;
  photoUrl: string | null;
}

interface VendorProfile {
  vendor: Vendor;
  instruments: VendorInstrument[];
  artists: Array<{ id: string; name: string; trackCount: number }>;
}

type Tab = "overview" | "logo" | "cover" | "instruments";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "logo", label: "Logo" },
  { key: "cover", label: "Cover" },
  { key: "instruments", label: "Instruments" },
];

export function AdminVendor() {
  const { user, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ id: string }>("/admin/vendors/:id");
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const vendorId = params?.id ?? "";

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  const { data: profile, isLoading, error } = useQuery<VendorProfile>({
    queryKey: ["/api/vendors", vendorId, "profile"],
    enabled: !!user?.isAdmin && !!vendorId,
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
      <AdminFrame active="vendors">
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

  if (error || !profile) {
    return (
      <AdminFrame active="vendors">
        <div className="py-20 text-center space-y-3">
          <h1 className="text-slate-900 text-lg font-semibold">
            Vendor not found
          </h1>
          <Link
            href="/admin/vendors"
            className="text-[#319ED8] text-sm hover:underline inline-flex items-center gap-1"
            data-testid="link-back-to-vendors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to vendors
          </Link>
        </div>
      </AdminFrame>
    );
  }

  const { vendor, instruments } = profile;

  return (
    <AdminFrame active="vendors">
      <div className="space-y-6">
        {/* BREADCRUMB */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium">
          <Link
            href="/admin/vendors"
            className="hover:text-slate-700"
            data-testid="link-breadcrumb-vendors"
          >
            Vendors
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">
            {vendor.name}
          </span>
        </div>

        {/* HEADER */}
        <div className="flex items-start gap-5">
          <div className="w-24 h-24 rounded-xl overflow-hidden bg-white ring-1 ring-slate-200 shadow-sm flex-shrink-0 flex items-center justify-center">
            {vendor.logoUrl ? (
              <img
                src={vendor.logoUrl}
                alt={vendor.name}
                className="w-full h-full object-contain p-2"
                data-testid="img-vendor-logo"
              />
            ) : (
              <Store className="w-10 h-10 text-slate-300" />
            )}
          </div>
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
                  className="inline-flex items-center gap-1 hover:text-[#319ED8]"
                  data-testid="link-vendor-home"
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
          data-testid="tabs-admin-vendor"
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

        {/* CONTENT */}
        {tab === "overview" && <OverviewPanel vendor={vendor} />}
        {tab === "logo" && <LogoPanel vendor={vendor} />}
        {tab === "cover" && <CoverPanel vendor={vendor} />}
        {tab === "instruments" && (
          <InstrumentsPanel instruments={instruments} />
        )}
      </div>
    </AdminFrame>
  );
}

/* ─── Overview (inline-editable) ───────────────────────────────────── */

function OverviewPanel({ vendor }: { vendor: Vendor }) {
  const invalidate: (readonly unknown[])[] = [
    ["/api/vendors", vendor.id, "profile"],
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
      await qc.invalidateQueries({
        queryKey: ["/api/vendors", vendor.id, "profile"],
      });
      await qc.invalidateQueries({ queryKey: ["/api/vendors"] });
      await qc.invalidateQueries({ queryKey: ["/api/instruments"] });
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
  const shownUrl = previewUrl || vendor[field];
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
}: {
  instruments: VendorInstrument[];
}) {
  if (instruments.length === 0) {
    return (
      <section
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-10 text-center"
        data-testid="panel-instruments-empty"
      >
        <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
          <Guitar className="w-6 h-6" />
        </div>
        <p className="text-slate-700 text-[14px] font-semibold">
          No instruments link to this vendor yet
        </p>
        <p className="text-slate-400 text-[12.5px] mt-1 max-w-xs mx-auto">
          Attach a product URL to any instrument and this vendor will
          appear here.
        </p>
      </section>
    );
  }
  return (
    <section
      className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
      data-testid="panel-instruments"
    >
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-slate-900 text-[14px] font-bold inline-flex items-center gap-2">
          <Guitar className="w-4 h-4 text-slate-400" />
          Instruments
        </h2>
        <p className="text-slate-400 text-[11.5px]">
          {instruments.length}{" "}
          {instruments.length === 1 ? "instrument" : "instruments"} attached
        </p>
      </div>
      <ul className="divide-y divide-slate-100" data-testid="list-instruments">
        {instruments.map((i) => (
          <li key={i.id}>
            <Link
              href={`/admin/instruments/${i.id}`}
              className="flex items-center gap-3.5 px-6 py-3 hover:bg-slate-50 transition-colors"
              data-testid={`row-instrument-${i.id}`}
            >
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
              <div className="flex-1 min-w-0">
                <div className="text-slate-900 text-[13.5px] font-semibold truncate">
                  {i.name}
                </div>
                <div className="text-slate-400 text-[11.5px] truncate">
                  {i.shortCategory || i.category}
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

