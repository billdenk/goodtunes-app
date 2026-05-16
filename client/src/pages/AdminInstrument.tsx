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
import { EditablePanel } from "@/components/admin/EditablePanel";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin · Single instrument. Wrapped in AdminFrame so it shares the top
 * bar + left entity sidebar with /admin/instruments.
 *
 * Tabs:
 *   Overview · Photo · Vendors — fully inline, no classic-admin handoff
 *
 * Vendors tab supports:
 *   - Add: paste an affiliate URL → server auto-extracts the domain and
 *     finds-or-creates the vendor entity. If the domain is new, the form
 *     re-prompts for a vendor name (and optionally a logo URL).
 *   - Edit per row: expand to edit vendor-entity fields (name, tagline,
 *     bio, location, logo, cover, about URL) plus the attachment's
 *     affiliate URL in one save. Logo + cover support drag-drop upload
 *     via the shared /api/admin/upload endpoint.
 *   - Hide / detach: hover-revealed action cluster on each row.
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
  homeUrl: string | null;
  aboutUrl: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  tagline: string | null;
  bio: string | null;
  location: string | null;
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
            Gear not found
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
        {tab === "overview" && <OverviewPanel instrument={instrument} />}
        {tab === "photo" && <PhotoPanel instrument={instrument} />}
        {tab === "vendors" && (
          <VendorsPanel instrument={instrument} />
        )}
      </div>
    </AdminFrame>
  );
}

/* ─── Overview (inline-editable) ───────────────────────────────────── */

function OverviewPanel({ instrument }: { instrument: InstrumentFull }) {
  const invalidate: (readonly unknown[])[] = [
    ["/api/instruments", instrument.id],
    ["/api/instruments"],
  ];
  const endpoint = `/api/admin/instruments/${instrument.id}`;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <EditablePanel
        title="Identity"
        testId="panel-overview-identity"
        endpoint={endpoint}
        values={{
          name: instrument.name,
          category: instrument.category,
          shortCategory: instrument.shortCategory,
        }}
        invalidate={invalidate}
        fields={[
          { key: "name", label: "Name", type: "text", required: true },
          {
            key: "category",
            label: "Category",
            type: "text",
            required: true,
            placeholder: "e.g. Electric Guitar",
          },
          {
            key: "shortCategory",
            label: "Short category",
            type: "text",
            placeholder: "e.g. Guitar",
          },
        ]}
      />
      <EditablePanel
        title="Notes"
        testId="panel-overview-notes"
        endpoint={endpoint}
        values={{
          about: instrument.about,
          artistNote: instrument.artistNote,
        }}
        invalidate={invalidate}
        fields={[
          {
            key: "about",
            label: "About",
            type: "textarea",
            placeholder: "Background on this piece of gear itself.",
          },
          {
            key: "artistNote",
            label: "Artist note",
            type: "textarea",
            placeholder:
              "What the artist says about why this gear matters to them.",
          },
        ]}
      />
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

function VendorsPanel({ instrument }: { instrument: InstrumentFull }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
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
          onClick={() => setAdding((v) => !v)}
          className={
            "px-3 py-1.5 rounded-md text-[12px] font-semibold inline-flex items-center gap-1.5 " +
            (adding
              ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
              : "bg-[#319ED8] text-white hover:bg-[#2890c8]")
          }
          aria-expanded={adding}
          data-testid="button-toggle-add-vendor"
        >
          <Plus className={"w-3.5 h-3.5 " + (adding ? "rotate-45" : "")} />
          {adding ? "Done" : "Add vendor"}
        </button>
      </div>

      {adding && (
        <AddVendorForm
          instrumentId={instrument.id}
          onSaved={invalidate}
          onClose={() => setAdding(false)}
        />
      )}

      {vendors.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <Store className="w-6 h-6" />
          </div>
          <p className="text-slate-700 text-[14px] font-semibold">
            No vendors attached yet
          </p>
          <p className="text-slate-400 text-[12.5px] mt-1 max-w-xs mx-auto">
            Click "Add vendor" above — paste the product URL and we'll find
            or create the vendor entity for you.
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
                if (confirm(`Detach "${v.name}" from this gear?`)) {
                  detach.mutate(v.id);
                }
              }}
              busy={toggleHidden.isPending || detach.isPending}
              onSaved={invalidate}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─── Inline "Add vendor" composer ─────────────────────────────────── */

// Pulls the host out of a URL, normalizes `www.` away, and returns null
// if the URL is malformed. Used to auto-fill the domain we send to the
// find-or-create endpoint so the user only has to paste a product URL.
function domainFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function AddVendorForm({
  instrumentId,
  onSaved,
  onClose,
}: {
  instrumentId: string;
  onSaved: () => void | Promise<unknown>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  // We start with just the URL field; if the server tells us the vendor
  // is new (domain doesn't match anything), we expand to ask for a name
  // and (optionally) a logo. This keeps the common case — re-using an
  // already-known vendor — one field and one keystroke.
  const [needsName, setNeedsName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queueMicrotask(() => urlRef.current?.focus());
  }, []);

  // Autofocus the name field the moment we discover the vendor is new.
  useEffect(() => {
    if (needsName) queueMicrotask(() => nameRef.current?.focus());
  }, [needsName]);

  const domain = domainFromUrl(affiliateUrl);

  const createMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = { affiliateUrl: affiliateUrl.trim() };
      if (vendorName.trim()) body.name = vendorName.trim();
      if (logoUrl.trim()) body.logoUrl = logoUrl.trim();
      const res = await apiRequest(
        "POST",
        `/api/admin/instruments/${instrumentId}/vendors`,
        body,
      );
      return res.json();
    },
    onSuccess: async () => {
      await onSaved();
      toast({ title: "Vendor attached" });
      onClose();
    },
    onError: (e: any) => {
      const msg: string = e?.message || "";
      // Server tells us "name is required when creating a new vendor"
      // → flip into the two-field stage instead of yelling a toast.
      if (/name is required/i.test(msg)) {
        setNeedsName(true);
        setError(
          "We haven't seen this vendor before — add a display name to create it.",
        );
        return;
      }
      setError(msg || "Couldn't attach the vendor. Try again in a moment.");
    },
  });

  const submit = () => {
    const url = affiliateUrl.trim();
    if (!url) {
      setError("Affiliate URL is required.");
      urlRef.current?.focus();
      return;
    }
    if (!domainFromUrl(url)) {
      setError("That doesn't look like a valid URL. Include https://.");
      urlRef.current?.focus();
      return;
    }
    if (needsName && !vendorName.trim()) {
      setError("Add a display name for this new vendor.");
      nameRef.current?.focus();
      return;
    }
    setError(null);
    createMut.mutate();
  };

  return (
    <div
      className="border-b border-slate-200 bg-[#319ED8]/5 px-6 py-4 space-y-3"
      data-testid="form-add-vendor"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (!createMut.isPending) submit();
        } else if (e.key === "Escape" && !createMut.isPending) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div>
        <label
          htmlFor="add-vendor-url"
          className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
        >
          Affiliate URL
        </label>
        <input
          ref={urlRef}
          id="add-vendor-url"
          type="url"
          value={affiliateUrl}
          onChange={(e) => {
            setAffiliateUrl(e.target.value);
            if (error) setError(null);
            // Reset the "new vendor" stage if they paste a different URL.
            if (needsName) setNeedsName(false);
          }}
          placeholder="https://reverb.com/item/12345-some-guitar"
          disabled={createMut.isPending}
          className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent disabled:opacity-50"
          data-testid="input-add-vendor-url"
        />
        {domain && (
          <p className="text-[11px] text-slate-500 mt-1">
            Domain: <span className="font-mono text-slate-700">{domain}</span>
          </p>
        )}
      </div>

      {needsName && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="add-vendor-name"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              Vendor name
            </label>
            <input
              ref={nameRef}
              id="add-vendor-name"
              type="text"
              value={vendorName}
              onChange={(e) => {
                setVendorName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Reverb"
              disabled={createMut.isPending}
              className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent disabled:opacity-50"
              data-testid="input-add-vendor-name"
            />
          </div>
          <div>
            <label
              htmlFor="add-vendor-logo"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              Logo URL <span className="text-slate-400 font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="add-vendor-logo"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…/logo.svg"
              disabled={createMut.isPending}
              className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent disabled:opacity-50"
              data-testid="input-add-vendor-logo"
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500 flex-1">
          {error ? (
            <span className="text-rose-600">{error}</span>
          ) : (
            <>
              Press Enter to attach · Esc to close · We'll auto-extract the
              domain from your URL.
            </>
          )}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={createMut.isPending}
            className="px-3 h-8 rounded-md bg-white border border-slate-200 text-slate-600 text-[11.5px] font-semibold hover:bg-slate-50"
            data-testid="button-cancel-add-vendor"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={createMut.isPending}
            className="px-3 h-8 rounded-md bg-[#319ED8] text-white text-[11.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1.5"
            data-testid="button-save-add-vendor"
          >
            {createMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              "Attach vendor"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Single vendor row + inline edit expansion ────────────────────── */

function VendorRow({
  vendor,
  onToggleHidden,
  onDetach,
  busy,
  onSaved,
}: {
  vendor: AttachedVendor;
  onToggleHidden: () => void;
  onDetach: () => void;
  busy: boolean;
  onSaved: () => void | Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <li
      className={[
        "group flex flex-col transition-colors",
        vendor.isHidden ? "bg-slate-50" : "",
      ].join(" ")}
      data-testid={`row-vendor-${vendor.id}`}
    >
      <div
        className={[
          "flex items-center gap-4 px-6 py-3.5",
          editing ? "bg-[#319ED8]/5" : "hover:bg-slate-50/50",
        ].join(" ")}
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
          onClick={(e) => {
            // Don't follow the link from inside the row hover — the row
            // is wide and clicking near the link should still toggle
            // edit when the user actually means "edit". The explicit
            // ExternalLink icon makes the intent clear.
            if (editing) e.preventDefault();
          }}
        >
          <span className="truncate">
            {vendor.affiliateUrl.replace(/^https?:\/\//, "")}
          </span>
          <ExternalLink className="w-3 h-3 flex-shrink-0" />
        </a>

        {/* Actions — hover-reveal cluster */}
        <div
          className={[
            "flex items-center gap-1 transition-opacity",
            editing
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
          ].join(" ")}
        >
          <button
            type="button"
            onClick={onToggleHidden}
            disabled={busy || editing}
            aria-label={vendor.isHidden ? "Show vendor" : "Hide vendor"}
            title={vendor.isHidden ? "Show vendor" : "Hide vendor"}
            className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 inline-flex items-center justify-center disabled:opacity-40 disabled:hover:bg-slate-100"
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
            onClick={() => setEditing((v) => !v)}
            aria-label={editing ? "Close vendor editor" : "Edit vendor"}
            aria-expanded={editing}
            title={editing ? "Close" : "Edit"}
            className={
              "w-7 h-7 rounded-full inline-flex items-center justify-center " +
              (editing
                ? "bg-[#319ED8] text-white hover:bg-[#2890c8]"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900")
            }
            data-testid={`button-edit-vendor-${vendor.id}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDetach}
            disabled={busy || editing}
            aria-label="Detach vendor"
            title="Detach vendor"
            className="w-7 h-7 rounded-full bg-slate-100 text-rose-600 hover:bg-rose-50 hover:text-rose-700 inline-flex items-center justify-center disabled:opacity-40 disabled:hover:bg-slate-100"
            data-testid={`button-detach-${vendor.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {editing && (
        <VendorEditForm
          vendor={vendor}
          onSaved={onSaved}
          onClose={() => setEditing(false)}
        />
      )}
    </li>
  );
}

/* ─── Inline vendor + attachment editor ────────────────────────────── */

function VendorEditForm({
  vendor,
  onSaved,
  onClose,
}: {
  vendor: AttachedVendor;
  onSaved: () => void | Promise<unknown>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  // One draft object so we can dirty-check + send only changed fields.
  const [draft, setDraft] = useState({
    name: vendor.name,
    tagline: vendor.tagline ?? "",
    location: vendor.location ?? "",
    aboutUrl: vendor.aboutUrl ?? "",
    logoUrl: vendor.logoUrl ?? "",
    coverUrl: vendor.coverUrl ?? "",
    bio: vendor.bio ?? "",
    affiliateUrl: vendor.affiliateUrl,
  });
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queueMicrotask(() => nameRef.current?.focus());
  }, []);

  // Helpers to coerce "" ↔ null when comparing/sending so a cleared
  // field properly nulls the column server-side.
  const norm = (s: string) => (s.trim() ? s.trim() : null);

  const vendorEntityDirty =
    draft.name.trim() !== vendor.name ||
    norm(draft.tagline) !== vendor.tagline ||
    norm(draft.location) !== vendor.location ||
    norm(draft.aboutUrl) !== vendor.aboutUrl ||
    norm(draft.logoUrl) !== vendor.logoUrl ||
    norm(draft.coverUrl) !== vendor.coverUrl ||
    norm(draft.bio) !== vendor.bio;
  const attachmentDirty = draft.affiliateUrl.trim() !== vendor.affiliateUrl;
  const anyDirty = vendorEntityDirty || attachmentDirty;

  const saveMut = useMutation({
    mutationFn: async () => {
      // PUT vendor entity first so the (possibly-new) logo/cover refs
      // are saved before we surface them in the list refetch. Only send
      // the entity update when something on it actually changed.
      if (vendorEntityDirty) {
        if (!draft.name.trim()) {
          throw new Error("Vendor name can't be empty.");
        }
        await apiRequest("PUT", `/api/admin/vendors/${vendor.vendorId}`, {
          name: draft.name.trim(),
          tagline: norm(draft.tagline),
          location: norm(draft.location),
          aboutUrl: norm(draft.aboutUrl),
          logoUrl: norm(draft.logoUrl),
          coverUrl: norm(draft.coverUrl),
          bio: norm(draft.bio),
        });
      }
      if (attachmentDirty) {
        const url = draft.affiliateUrl.trim();
        if (!url) throw new Error("Affiliate URL can't be empty.");
        await apiRequest("PUT", `/api/admin/instrument-vendors/${vendor.id}`, {
          affiliateUrl: url,
        });
      }
    },
    onSuccess: async () => {
      await onSaved();
      toast({ title: "Vendor saved" });
      onClose();
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save vendor",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const uploadFor = async (kind: "logo" | "cover", file: File) => {
    setUploading(kind);
    try {
      const url = await uploadImageFile(file);
      setDraft((d) =>
        kind === "logo" ? { ...d, logoUrl: url } : { ...d, coverUrl: url },
      );
      toast({ title: `${kind === "logo" ? "Logo" : "Cover"} uploaded` });
    } catch (e: any) {
      toast({
        title: `Couldn't upload ${kind}`,
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setUploading(null);
    }
  };

  return (
    <div
      className="border-t border-slate-200 bg-[#319ED8]/5 px-6 py-4"
      data-testid={`form-edit-vendor-${vendor.id}`}
      onKeyDown={(e) => {
        // Ctrl/Cmd+Enter saves; Escape cancels.
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          if (anyDirty && !saveMut.isPending) saveMut.mutate();
        } else if (e.key === "Escape" && !saveMut.isPending) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {/* Identity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <Field label="Vendor name">
          <input
            ref={nameRef}
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            disabled={saveMut.isPending}
            className={vendorInputCls}
            data-testid={`input-vendor-name-${vendor.id}`}
          />
        </Field>
        <Field label="Tagline">
          <input
            type="text"
            value={draft.tagline}
            placeholder="The world's largest marketplace for music gear"
            onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
            disabled={saveMut.isPending}
            className={vendorInputCls}
            data-testid={`input-vendor-tagline-${vendor.id}`}
          />
        </Field>
        <Field label="Location">
          <input
            type="text"
            value={draft.location}
            placeholder="Brooklyn, NY"
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            disabled={saveMut.isPending}
            className={vendorInputCls}
            data-testid={`input-vendor-location-${vendor.id}`}
          />
        </Field>
        <Field label="About URL">
          <input
            type="url"
            value={draft.aboutUrl}
            placeholder="https://reverb.com/about"
            onChange={(e) => setDraft({ ...draft, aboutUrl: e.target.value })}
            disabled={saveMut.isPending}
            className={vendorInputCls}
            data-testid={`input-vendor-about-${vendor.id}`}
          />
        </Field>
      </div>

      {/* Images: logo + cover */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <ImagePicker
          label="Logo"
          url={draft.logoUrl}
          onUrlChange={(v) => setDraft({ ...draft, logoUrl: v })}
          onFile={(f) => uploadFor("logo", f)}
          uploading={uploading === "logo"}
          disabled={saveMut.isPending}
          aspect="square"
          testId={`vendor-logo-${vendor.id}`}
        />
        <ImagePicker
          label="Cover"
          url={draft.coverUrl}
          onUrlChange={(v) => setDraft({ ...draft, coverUrl: v })}
          onFile={(f) => uploadFor("cover", f)}
          uploading={uploading === "cover"}
          disabled={saveMut.isPending}
          aspect="wide"
          testId={`vendor-cover-${vendor.id}`}
        />
      </div>

      {/* Bio */}
      <Field label="Bio" className="mb-3">
        <textarea
          value={draft.bio}
          onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
          disabled={saveMut.isPending}
          rows={3}
          placeholder="Short paragraph the fan sees when they tap a vendor card in SuperCredits™."
          className={
            vendorInputCls +
            " py-2 resize-y min-h-[72px] leading-snug"
          }
          data-testid={`textarea-vendor-bio-${vendor.id}`}
        />
      </Field>

      {/* Affiliate URL (attachment-only) */}
      <Field
        label="Affiliate URL for this gear"
        hint="The product page link fans land on from this gear's SuperCredits card. Vendor-wide fields above apply everywhere this vendor appears."
        className="mb-4"
      >
        <input
          type="url"
          value={draft.affiliateUrl}
          onChange={(e) => setDraft({ ...draft, affiliateUrl: e.target.value })}
          disabled={saveMut.isPending}
          className={vendorInputCls}
          data-testid={`input-vendor-affiliate-${vendor.id}`}
        />
      </Field>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">
          {anyDirty
            ? "Unsaved changes · Ctrl+Enter to save"
            : "No changes yet"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saveMut.isPending}
            className="px-3 h-8 rounded-md bg-white border border-slate-200 text-slate-600 text-[11.5px] font-semibold hover:bg-slate-50"
            data-testid={`button-cancel-edit-vendor-${vendor.id}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={!anyDirty || saveMut.isPending || !!uploading}
            className="px-3 h-8 rounded-md bg-[#319ED8] text-white text-[11.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1.5"
            data-testid={`button-save-edit-vendor-${vendor.id}`}
          >
            {saveMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              "Save vendor"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Tiny field + image-picker helpers used by VendorEditForm ─────── */

const vendorInputCls =
  "w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent disabled:opacity-50";

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={"block " + (className ?? "")}>
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </span>
      {children}
      {hint && (
        <span className="block text-[11px] text-slate-400 mt-1 leading-snug">
          {hint}
        </span>
      )}
    </label>
  );
}

function ImagePicker({
  label,
  url,
  onUrlChange,
  onFile,
  uploading,
  disabled,
  aspect,
  testId,
}: {
  label: string;
  url: string;
  onUrlChange: (v: string) => void;
  onFile: (f: File) => void;
  uploading: boolean;
  disabled: boolean;
  aspect: "square" | "wide";
  testId: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const previewCls =
    aspect === "square"
      ? "w-16 h-16 rounded-lg"
      : "w-28 h-16 rounded-md";

  return (
    <div>
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </span>
      <div className="flex items-start gap-3">
        <div
          className={
            previewCls +
            " overflow-hidden bg-white border border-slate-200 flex items-center justify-center flex-shrink-0"
          }
        >
          {url ? (
            <img
              src={url}
              alt={`${label} preview`}
              className="w-full h-full object-contain p-1"
            />
          ) : (
            <ImageIcon className="w-5 h-5 text-slate-300" />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <input
            type="url"
            value={url}
            placeholder="https://…"
            onChange={(e) => onUrlChange(e.target.value)}
            disabled={disabled || uploading}
            className={vendorInputCls}
            data-testid={`input-${testId}-url`}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || uploading}
              className="px-2.5 h-7 rounded-md bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5"
              data-testid={`button-${testId}-upload`}
            >
              {uploading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              {uploading ? "Uploading…" : "Upload"}
            </button>
            {url && (
              <button
                type="button"
                onClick={() => onUrlChange("")}
                disabled={disabled || uploading}
                className="text-[11px] text-slate-400 hover:text-rose-600"
                data-testid={`button-${testId}-clear`}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
        data-testid={`input-${testId}-file`}
      />
    </div>
  );
}

/* ─── Photo upload helper (exported for AdminInstruments if needed) ── */
export { uploadImageFile };
