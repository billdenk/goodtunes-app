import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ExternalLink,
  Factory,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { invalidateAdminEntity } from "@/lib/adminEntityInvalidation";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AddressAutocompleteField } from "@/components/admin/AddressAutocompleteField";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { PartnerPermissionsPanel } from "@/components/admin/PartnerPermissionsPanel";
import { AdminPartnerDashboardCard } from "@/components/admin/AdminPartnerDashboardCard";
import { PressLogoEditorDialog } from "@/components/admin/PressLogoEditorDialog";
import { OrganizationPeople } from "@/components/admin/OrganizationPeople";
import { EntityAlbumsTab } from "@/components/admin/EntityAlbumsTab";
import { EntityAnalyticsTab } from "@/components/admin/EntityAnalyticsTab";
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

/**
 * Admin · Single manufacturer. Editable profile + specialties chips +
 * default fulfillment partner picker. The RFQ inbox surface lives here
 * once that UI ships in a follow-up; today the link to RFQs is implicit
 * via the route layer.
 */
export function AdminManufacturer() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { user, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ id: string }>("/admin/manufacturers/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id ?? "";
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logoEditorOpen, setLogoEditorOpen] = useState(false);
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
        <div className="flex items-start gap-5">
          <button
            type="button"
            onClick={() => setLogoEditorOpen(true)}
            className={[
              "group relative w-24 h-24 rounded-xl overflow-hidden shadow-sm flex-shrink-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2",
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
            {m.domain && (
              <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider" data-testid="text-press-domain">
                {m.domain}
              </div>
            )}
            <h1
              className="text-slate-900 text-[26px] font-bold tracking-tight mt-0.5 truncate"
              data-testid="heading-manufacturer-name"
            >
              {m.name}
            </h1>
            {m.websiteUrl && (
              <div className="flex items-center gap-3 text-slate-500 text-[12.5px] mt-1">
                <a
                  href={m.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-[var(--brand-blue)]"
                  data-testid="link-press-website"
                >
                  Visit
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* TAB BAR — Overview / People / Albums / Analytics; Refresh + Delete sit on the right. */}
        <div
          className="flex items-end justify-between gap-5 border-b border-slate-200"
          data-testid="tabs-admin-press"
        >
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
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
                  <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[var(--brand-blue)] rounded-full" />
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
          <AdminPartnerDashboardCard
            scope="vendor"
            scopeKindQs="manufacturer"
            scopeIdQs={m.id}
            title={m.name}
            subtitle="Press dashboard"
          />
        )}

        {tab === "overview" && (
          <>
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
            blurb="People at this plant — production manager, account rep, whoever you need to reach."
          />
        )}
        {tab === "albums" && (
          <EntityAlbumsTab
            apiPath={`/api/admin/manufacturers/${m.id}/albums`}
            testIdPrefix="press"
            emptyHint="No pressing-order requests have resolved to this press yet."
          />
        )}
        {tab === "catalog" && <PressCatalogPanel pressId={id} />}
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
      turnaroundWeeksMin: turnaroundWeeksMin === "" ? null : Number(turnaroundWeeksMin),
      turnaroundWeeksMax: turnaroundWeeksMax === "" ? null : Number(turnaroundWeeksMax),
      specialties,
      defaultFulfillmentPartnerId: defaultFp || null,
    });
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
};
type CatalogTier = {
  id: string;
  name: string;
  position: number;
  priceLadder: { qty: number; unitCents: number }[];
  laddersByJacket: Record<string, { qty: number; unitCents: number }[]>;
  colors: CatalogColor[];
};
type CatalogFormat = {
  format: AlbumFormat;
  position: number;
  tiers: CatalogTier[];
};
type CatalogJacket = {
  id: string;
  name: string;
  position: number;
  isDefault: boolean;
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

// Standard column quantities shown across every press's catalog. The
// underlying ladder is arbitrary — Bill can "+ Add quantity" if a press
// prices a non-standard run (e.g. 250) and that column then renders for
// every other combo too. Hellbender's seed has no 750 cell; that's
// expected — empty just means "no price set for this rung".
const DEFAULT_QTY_COLUMNS = [50, 100, 300, 500, 750, 1000, 2000, 3000];

async function uploadSwatchImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const tok = (await import("@/lib/queryClient")).getAuthToken();
  if (!tok) throw new Error("Sign out and back in — your session token is missing.");
  const r = await fetch("/api/admin/upload", {
    method: "POST",
    body: fd,
    headers: { Authorization: `Bearer ${tok}` },
    credentials: "include",
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.message || `Upload failed (${r.status})`);
  }
  const { url } = await r.json();
  return url as string;
}

function PressCatalogPanel({ pressId }: { pressId: string }) {
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

  if (roleInfo && !canEdit) return null;

  const offered = new Set((data?.formats ?? []).map((f) => f.format));
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4" data-testid="panel-press-catalog">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">Catalog</h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Pick the formats this press runs. Under each format, set up the color tiers (Black /
          Standard / Splatter…) with their swatches, and the jackets this press offers. The price
          ladder lives on the (tier × jacket) combo — one row per run quantity. Artists invited by
          this press see the resulting picker on their album's Sell panel.
        </p>
      </div>
      {isLoading || !data ? (
        <div className="text-slate-500 text-sm py-4">Loading…</div>
      ) : (
        <div className="space-y-4">
          {/* Only the formats this press actually runs render as cards.
              A brand-new press starts with zero cards and a single
              "+ Add format" select; toggling a format off from its
              card removes the card and adds the format back to the
              picker. */}
          {ALBUM_FORMATS.filter((f) => offered.has(f)).map((fmt) => {
            const fmtRow = data.formats.find((f) => f.format === fmt) ?? null;
            return (
              <div
                key={fmt}
                className="rounded-md border border-slate-200 p-3 space-y-3"
                data-testid={`catalog-format-${fmt}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13.5px] font-semibold text-slate-900">
                    {ALBUM_FORMAT_LABEL[fmt]}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleFormat.mutate({ format: fmt, enabled: false })}
                    disabled={toggleFormat.isPending}
                    className="text-xs text-rose-600 hover:underline underline-offset-2 disabled:opacity-50"
                    data-testid={`toggle-format-${fmt}`}
                  >
                    Remove format
                  </button>
                </div>
                {fmtRow && (
                  <CatalogFormatBody
                    pressId={pressId}
                    fmt={fmt}
                    tiers={fmtRow.tiers}
                    jackets={data.jackets}
                    defaultJacketId={data.defaultJacketId}
                    onChanged={invalidate}
                  />
                )}
              </div>
            );
          })}
          {offered.size === 0 && (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
              <p className="text-sm text-slate-500 mb-3">
                No formats yet. Pick one this press runs to start its catalog.
              </p>
              <AddFormatPicker
                offered={offered}
                onPick={(fmt) => toggleFormat.mutate({ format: fmt, enabled: true })}
                disabled={toggleFormat.isPending}
              />
            </div>
          )}
          {offered.size > 0 && offered.size < ALBUM_FORMATS.length && (
            <div className="pt-1">
              <AddFormatPicker
                offered={offered}
                onPick={(fmt) => toggleFormat.mutate({ format: fmt, enabled: true })}
                disabled={toggleFormat.isPending}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddFormatPicker({
  offered,
  onPick,
  disabled,
}: {
  offered: Set<string>;
  onPick: (fmt: AlbumFormat) => void;
  disabled: boolean;
}) {
  const available = ALBUM_FORMATS.filter((f) => !offered.has(f));
  if (available.length === 0) return null;
  return (
    <select
      value=""
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value as AlbumFormat;
        if (v) onPick(v);
      }}
      className={INPUT + " w-auto min-w-[12rem] inline-block"}
      data-testid="select-add-format"
    >
      <option value="">+ Add format…</option>
      {available.map((f) => (
        <option key={f} value={f}>
          {ALBUM_FORMAT_LABEL[f]}
        </option>
      ))}
    </select>
  );
}

function CatalogFormatBody({
  pressId,
  fmt,
  tiers,
  jackets,
  defaultJacketId,
  onChanged,
}: {
  pressId: string;
  fmt: AlbumFormat;
  tiers: CatalogTier[];
  jackets: CatalogJacket[];
  defaultJacketId: string | null;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [selectedTierId, setSelectedTierId] = useState<string | null>(tiers[0]?.id ?? null);
  // A tier id we just created via "+ Add tier" but haven't seen in the
  // refetched `tiers` prop yet. While set, the validation effect
  // below MUST NOT reset `selectedTierId` away from it — otherwise the
  // user gets bounced back to the first tier instead of landing in
  // the new empty one (regression flagged in code review).
  const pendingTierIdRef = useRef<string | null>(null);
  const [selectedJacketId, setSelectedJacketId] = useState<string | null>(defaultJacketId);
  const [addingTier, setAddingTier] = useState(false);
  const [newTierName, setNewTierName] = useState("");
  const [addingJacket, setAddingJacket] = useState(false);
  const [newJacketName, setNewJacketName] = useState("");

  // Drafts for the ladder. Key is `${tierId}:${jacketId}` so switching
  // tier/jacket inside the format card preserves what the user typed
  // for the previous combo without writing it. Value is qty→dollarStr.
  const [drafts, setDrafts] = useState<Record<string, Record<number, string>>>({});
  // Per-format union of quantity columns. Always includes the defaults
  // plus any rung any combo has saved + anything the user just added.
  const [extraQuantities, setExtraQuantities] = useState<number[]>([]);

  // Keep selectedTierId valid as tiers come and go.
  // The pendingTierIdRef guard prevents the post-create refetch race:
  // after `+ Add tier` resolves we set selectedTierId to the new id
  // BEFORE the catalog query refetches, so this effect would otherwise
  // see an unknown id and bounce us back to tiers[0].
  useEffect(() => {
    if (tiers.length === 0) {
      if (selectedTierId !== null) setSelectedTierId(null);
      pendingTierIdRef.current = null;
      return;
    }
    if (pendingTierIdRef.current) {
      if (tiers.some((t) => t.id === pendingTierIdRef.current)) {
        pendingTierIdRef.current = null;
      } else {
        return;
      }
    }
    if (!tiers.some((t) => t.id === selectedTierId)) {
      setSelectedTierId(tiers[0].id);
    }
  }, [tiers, selectedTierId]);
  useEffect(() => {
    if (jackets.length === 0) {
      if (selectedJacketId !== null) setSelectedJacketId(null);
      return;
    }
    if (!jackets.some((j) => j.id === selectedJacketId)) {
      setSelectedJacketId(defaultJacketId ?? jackets[0].id);
    }
  }, [jackets, selectedJacketId, defaultJacketId]);

  const selectedTier = tiers.find((t) => t.id === selectedTierId) ?? null;
  const selectedJacket = jackets.find((j) => j.id === selectedJacketId) ?? null;
  const comboKey = selectedTier && selectedJacket ? `${selectedTier.id}:${selectedJacket.id}` : null;
  const savedLadder = comboKey && selectedTier ? selectedTier.laddersByJacket[selectedJacket!.id] ?? [] : [];

  // Column list = defaults ∪ every saved rung in any combo ∪ user extras.
  const columns = (() => {
    const set = new Set<number>(DEFAULT_QTY_COLUMNS);
    for (const t of tiers) {
      for (const j of Object.keys(t.laddersByJacket)) {
        for (const r of t.laddersByJacket[j]) set.add(r.qty);
      }
    }
    for (const q of extraQuantities) set.add(q);
    return Array.from(set).sort((a, b) => a - b);
  })();

  // Resolve cell value: draft override first, then saved ladder, else "".
  const cellValue = (qty: number): string => {
    if (!comboKey) return "";
    const d = drafts[comboKey];
    if (d && Object.prototype.hasOwnProperty.call(d, qty)) return d[qty];
    const saved = savedLadder.find((r) => r.qty === qty);
    return saved ? formatDollars(saved.unitCents) : "";
  };
  const setCellValue = (qty: number, v: string) => {
    if (!comboKey) return;
    setDrafts((prev) => ({ ...prev, [comboKey]: { ...(prev[comboKey] ?? {}), [qty]: v } }));
  };

  const dirty = (() => {
    if (!comboKey) return false;
    const d = drafts[comboKey];
    if (!d) return false;
    for (const q of Object.keys(d)) {
      const qty = Number(q);
      const saved = savedLadder.find((r) => r.qty === qty);
      const savedStr = saved ? formatDollars(saved.unitCents) : "";
      if ((d[qty] ?? "") !== savedStr) return true;
    }
    return false;
  })();

  // ─ Mutations
  const addTier = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/admin/manufacturers/${pressId}/catalog/formats/${fmt}/tiers`,
        { name: newTierName.trim() },
      );
      return r.json() as Promise<{ id: string }>;
    },
    onSuccess: (row) => {
      setNewTierName("");
      setAddingTier(false);
      pendingTierIdRef.current = row.id;
      setSelectedTierId(row.id);
      onChanged();
    },
    onError: (e: any) => toast({ title: "Couldn't add tier", description: e?.message, variant: "destructive" }),
  });
  const deleteTier = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/catalog/tiers/${id}`);
    },
    onSuccess: onChanged,
    onError: (e: any) => toast({ title: "Couldn't delete tier", description: e?.message, variant: "destructive" }),
  });
  const addJacket = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/manufacturers/${pressId}/catalog/jackets`, {
        name: newJacketName.trim(),
      });
      return r.json() as Promise<{ id: string }>;
    },
    onSuccess: (row) => {
      setNewJacketName("");
      setAddingJacket(false);
      setSelectedJacketId(row.id);
      onChanged();
    },
    onError: (e: any) => toast({ title: "Couldn't add jacket", description: e?.message, variant: "destructive" }),
  });
  const updateJacket = useMutation({
    mutationFn: async (args: { id: string; patch: { name?: string; isDefault?: boolean } }) => {
      const r = await apiRequest("PATCH", `/api/admin/manufacturers/${pressId}/catalog/jackets/${args.id}`, args.patch);
      return r.json();
    },
    onSuccess: onChanged,
    onError: (e: any) => toast({ title: "Couldn't save jacket", description: e?.message, variant: "destructive" }),
  });
  const deleteJacket = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/catalog/jackets/${id}`);
    },
    onSuccess: onChanged,
    onError: (e: any) => toast({ title: "Couldn't delete jacket", description: e?.message, variant: "destructive" }),
  });
  const saveLadder = useMutation({
    mutationFn: async () => {
      if (!selectedTier || !selectedJacket) throw new Error("Pick a tier and jacket first.");
      // Build ladder from every column that has a parseable dollar value.
      const ladder: { qty: number; unitCents: number }[] = [];
      for (const q of columns) {
        const v = cellValue(q).trim();
        if (!v) continue;
        const cents = parseDollars(v);
        if (cents === null) throw new Error(`"${v}" at qty ${q} isn't a valid dollar amount`);
        ladder.push({ qty: q, unitCents: cents });
      }
      const r = await apiRequest(
        "PUT",
        `/api/admin/manufacturers/${pressId}/catalog/tiers/${selectedTier.id}/jackets/${selectedJacket.id}/ladder`,
        { priceLadder: ladder },
      );
      return r.json();
    },
    onSuccess: () => {
      if (comboKey) setDrafts((prev) => ({ ...prev, [comboKey]: {} }));
      toast({ title: "Pricing saved" });
      onChanged();
    },
    onError: (e: any) => toast({ title: "Couldn't save pricing", description: e?.message, variant: "destructive" }),
  });

  if (tiers.length === 0 && !addingTier) {
    return (
      <div className="pl-6 space-y-2">
        <div className="text-xs text-slate-500">No tiers yet for this format.</div>
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-xs"
          onClick={() => setAddingTier(true)}
          data-testid={`button-add-first-tier-${fmt}`}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add tier
        </Button>
      </div>
    );
  }

  return (
    <div className="pl-6 space-y-4">
      {/* Tier dropdown row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tier</span>
        <select
          value={selectedTierId ?? ""}
          onChange={(e) => setSelectedTierId(e.target.value || null)}
          className={INPUT + " w-auto min-w-[14rem]"}
          data-testid={`select-tier-${fmt}`}
        >
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {selectedTier && (
          <DeleteTierButton
            tier={selectedTier}
            onConfirm={() => deleteTier.mutate(selectedTier.id)}
            disabled={deleteTier.isPending}
          />
        )}
        {!addingTier ? (
          <button
            type="button"
            onClick={() => setAddingTier(true)}
            className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2"
            data-testid={`button-add-tier-${fmt}`}
          >
            + Add tier
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              value={newTierName}
              onChange={(e) => setNewTierName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTierName.trim()) addTier.mutate();
                if (e.key === "Escape") {
                  setAddingTier(false);
                  setNewTierName("");
                }
              }}
              autoFocus
              placeholder="Tier name"
              className={INPUT + " h-8 w-44"}
              data-testid={`input-new-tier-${fmt}`}
            />
            <button
              type="button"
              onClick={() => newTierName.trim() && addTier.mutate()}
              disabled={!newTierName.trim() || addTier.isPending}
              className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2 disabled:opacity-50"
              data-testid={`button-confirm-add-tier-${fmt}`}
            >
              {addTier.isPending ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingTier(false);
                setNewTierName("");
              }}
              className="text-xs text-slate-500 hover:underline underline-offset-2"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Swatch chips for the selected tier */}
      {selectedTier && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedTier.colors.map((c) => (
            <SwatchChip key={c.id} pressId={pressId} color={c} onChanged={onChanged} />
          ))}
          <AddSwatchChip pressId={pressId} tierId={selectedTier.id} onChanged={onChanged} />
        </div>
      )}

      {/* Jacket dropdown row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Jacket</span>
        <select
          value={selectedJacketId ?? ""}
          onChange={(e) => setSelectedJacketId(e.target.value || null)}
          className={INPUT + " w-auto min-w-[16rem]"}
          disabled={jackets.length === 0}
          data-testid={`select-jacket-${fmt}`}
        >
          {jackets.length === 0 && <option value="">— No jackets —</option>}
          {jackets.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
              {j.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
        {selectedJacket && !selectedJacket.isDefault && (
          <button
            type="button"
            onClick={() => updateJacket.mutate({ id: selectedJacket.id, patch: { isDefault: true } })}
            className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2"
            data-testid={`button-set-default-jacket-${selectedJacket.id}`}
          >
            Set as default
          </button>
        )}
        {selectedJacket && jackets.length > 1 && (
          <DeleteJacketButton
            jacket={selectedJacket}
            onConfirm={() => deleteJacket.mutate(selectedJacket.id)}
            disabled={deleteJacket.isPending}
          />
        )}
        {!addingJacket ? (
          <button
            type="button"
            onClick={() => setAddingJacket(true)}
            className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2"
            data-testid={`button-add-jacket-${fmt}`}
          >
            + Add jacket
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              value={newJacketName}
              onChange={(e) => setNewJacketName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newJacketName.trim()) addJacket.mutate();
                if (e.key === "Escape") {
                  setAddingJacket(false);
                  setNewJacketName("");
                }
              }}
              autoFocus
              placeholder="Jacket name (e.g. Gatefold)"
              className={INPUT + " h-8 w-56"}
              data-testid={`input-new-jacket-${fmt}`}
            />
            <button
              type="button"
              onClick={() => newJacketName.trim() && addJacket.mutate()}
              disabled={!newJacketName.trim() || addJacket.isPending}
              className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2 disabled:opacity-50"
              data-testid={`button-confirm-add-jacket-${fmt}`}
            >
              {addJacket.isPending ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingJacket(false);
                setNewJacketName("");
              }}
              className="text-xs text-slate-500 hover:underline underline-offset-2"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Quantity ladder table */}
      {selectedTier && selectedJacket && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Price per unit (USD) — {selectedTier.name} · {selectedJacket.name}
            </span>
            <button
              type="button"
              onClick={() => saveLadder.mutate()}
              disabled={!dirty || saveLadder.isPending}
              className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
              data-testid={`button-save-ladder-${selectedTier.id}-${selectedJacket.id}`}
            >
              {saveLadder.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
            </button>
          </div>
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
                  <th className="px-2 py-1 border-b border-slate-200 text-left">
                    <AddQuantityButton
                      existing={columns}
                      onAdd={(q) => setExtraQuantities((prev) => [...prev, q])}
                      fmt={fmt}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {columns.map((q) => (
                    <td key={q} className="px-1 py-1.5 align-middle">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                        <input
                          value={cellValue(q)}
                          onChange={(e) => setCellValue(q, e.target.value)}
                          placeholder=""
                          inputMode="decimal"
                          className="w-20 h-8 pl-5 pr-1.5 rounded-md border border-slate-200 text-xs bg-white focus:outline-none focus:border-[color:var(--brand-blue)] tabular-nums text-right"
                          data-testid={`input-ladder-cell-${selectedTier.id}-${selectedJacket.id}-${q}`}
                        />
                      </div>
                    </td>
                  ))}
                  <td className="px-2 py-1.5" />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Leave a cell blank if this combo doesn't price that run. On the album's Sell panel an
            artist's typed quantity snaps up to the next non-blank rung; above the top rung the
            picker prompts for a custom quote.
          </p>
        </div>
      )}
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
}: {
  pressId: string;
  color: CatalogColor;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(color.name);
  const [hex, setHex] = useState(color.swatchHex ?? "#000000");
  const [imageUrl, setImageUrl] = useState<string | null>(color.swatchImageUrl);
  useEffect(() => {
    setName(color.name);
    setHex(color.swatchHex ?? "#000000");
    setImageUrl(color.swatchImageUrl);
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
      setEditing(false);
      onChanged();
    },
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const url = await uploadSwatchImage(file);
      setImageUrl(url);
      return url;
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e?.message, variant: "destructive" }),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 h-7 pl-1 pr-2.5 rounded-full border border-slate-200 bg-white text-xs text-slate-700 hover:border-[color:var(--brand-blue)] transition-colors"
        data-testid={`chip-color-${color.id}`}
      >
        <span
          className="w-4 h-4 rounded-full border border-slate-200 shrink-0 overflow-hidden"
          style={
            color.swatchImageUrl
              ? { backgroundImage: `url(${color.swatchImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { background: color.swatchHex ?? "#cccccc" }
          }
        />
        <span className="truncate max-w-[10rem]">{color.name}</span>
      </button>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit swatch</DialogTitle>
            <DialogDescription>Rename the color, pick a hex, or upload a photo for marbled / splatter / picture-disc stocks.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block">
              <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT}
                data-testid={`input-swatch-name-${color.id}`}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Hex</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={hex}
                    onChange={(e) => {
                      setHex(e.target.value);
                      setImageUrl(null);
                    }}
                    className="h-9 w-12 rounded border border-slate-200 cursor-pointer"
                    data-testid={`input-swatch-hex-${color.id}`}
                  />
                  <input
                    value={hex}
                    onChange={(e) => {
                      setHex(e.target.value);
                      setImageUrl(null);
                    }}
                    className={INPUT}
                  />
                </div>
              </label>
              <label className="block">
                <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Photo</span>
                <div className="flex items-center gap-2">
                  <div
                    className="w-9 h-9 rounded border border-slate-200 overflow-hidden bg-slate-50"
                    style={
                      imageUrl
                        ? { backgroundImage: `url(${imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                        : {}
                    }
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload.mutate(f);
                    }}
                    className="text-xs"
                    data-testid={`input-swatch-upload-${color.id}`}
                  />
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
              </label>
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="text-xs text-rose-600 hover:underline underline-offset-2 disabled:opacity-50"
                data-testid={`button-delete-color-${color.id}`}
              >
                Delete swatch
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
          </div>
        </DialogContent>
      </Dialog>
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
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-dashed border-slate-300 text-xs text-slate-500 hover:border-[color:var(--brand-blue)] hover:text-[color:var(--brand-blue)] transition-colors"
        data-testid={`button-add-color-${tierId}`}
      >
        <Plus className="w-3 h-3" />
        Add color
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
