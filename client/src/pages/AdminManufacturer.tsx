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
import { AdminPartnerDashboard } from "@/components/admin/AdminPartnerDashboard";
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
            <PressCatalogPanel pressId={id} pressDomain={m?.domain ?? null} />
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

async function uploadSwatchImage(
  file: File,
  opts?: { cropToDisc?: boolean },
): Promise<{ url: string; maskApplied?: boolean }> {
  const fd = new FormData();
  fd.append("file", file);
  const tok = (await import("@/lib/queryClient")).getAuthToken();
  if (!tok) throw new Error("Sign out and back in — your session token is missing.");
  const qs = opts?.cropToDisc ? "?mask=disc" : "";
  const r = await fetch(`/api/admin/upload${qs}`, {
    method: "POST",
    body: fd,
    headers: { Authorization: `Bearer ${tok}` },
    credentials: "include",
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.message || `Upload failed (${r.status})`);
  }
  const { url, maskApplied } = await r.json();
  return { url, maskApplied };
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

function PressCatalogPanel({ pressId, pressDomain }: { pressId: string; pressDomain: string | null }) {
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

  // Hooks must run unconditionally — declare the MRP dialog state
  // before any early return so a role flip from undefined → unauthorized
  // doesn't trip React's "rendered fewer hooks" guard.
  const [mrpImportOpen, setMrpImportOpen] = useState(false);

  if (roleInfo && !canEdit) return null;

  const offered = new Set((data?.formats ?? []).map((f) => f.format));
  const isMrp = pressDomain === MRP_DOMAIN_CLIENT;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4" data-testid="panel-press-catalog">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold text-slate-900">Catalog</h2>
          <p className="text-[13px] text-slate-500 mt-1">
            Pick the formats this press runs. Under each format, set up the color tiers (Black /
            Standard / Splatter…) with their swatches, and the jackets this press offers. The price
            ladder lives on the (tier × jacket) combo — one row per run quantity. Artists invited by
            this press see the resulting picker on their album's Sell panel.
          </p>
        </div>
        {pressDomain === "hellbendervinyl.com" && (
          <HellbenderImportButton pressId={pressId} catalog={data ?? null} onImported={invalidate} />
        )}
        {isMrp && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMrpImportOpen(true)}
            className="flex-shrink-0"
            data-testid="button-mrp-import-open"
          >
            Import colors from memphisrecordpressing.com
          </Button>
        )}
      </div>
      {isMrp && (
        <MrpImportDialog
          pressId={pressId}
          open={mrpImportOpen}
          onOpenChange={setMrpImportOpen}
          onImported={invalidate}
        />
      )}
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
  // Task #624 — a rung saved as `confirmed:false` (a TBD placeholder)
  // intentionally renders as a blank input so the admin can either
  // type the real price (promotes it to confirmed) or leave it as TBD.
  const cellValue = (qty: number): string => {
    if (!comboKey) return "";
    const d = drafts[comboKey];
    if (d && Object.prototype.hasOwnProperty.call(d, qty)) return d[qty];
    const saved = savedLadder.find((r) => r.qty === qty);
    if (!saved) return "";
    if (saved.confirmed === false) return "";
    return formatDollars(saved.unitCents);
  };
  const setCellValue = (qty: number, v: string) => {
    if (!comboKey) return;
    setDrafts((prev) => ({ ...prev, [comboKey]: { ...(prev[comboKey] ?? {}), [qty]: v } }));
    // Typing a value implicitly clears the explicit-TBD flag for this
    // cell — Save will land it as confirmed:true.
    if (v.trim().length > 0) {
      setUnconfirmedDrafts((prev) => {
        const s = prev[comboKey!];
        if (!s || !s.has(qty)) return prev;
        const next = new Set(s);
        next.delete(qty);
        return { ...prev, [comboKey!]: next };
      });
    }
  };

  // Task #624 — explicit TBD state per cell. Initialised from the
  // saved ladder's `confirmed:false` rungs whenever the combo
  // (tier+jacket) changes; admin toggles via the per-cell TBD button.
  const [unconfirmedDrafts, setUnconfirmedDrafts] = useState<Record<string, Set<number>>>({});
  const savedUnconfirmedKey = comboKey
    ? savedLadder.filter((r) => r.confirmed === false).map((r) => r.qty).sort((a, b) => a - b).join(",")
    : "";
  useEffect(() => {
    if (!comboKey) return;
    const seed = new Set<number>();
    for (const r of savedLadder) if (r.confirmed === false) seed.add(r.qty);
    setUnconfirmedDrafts((prev) => ({ ...prev, [comboKey]: seed }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comboKey, savedUnconfirmedKey]);
  const isUnconfirmedDraft = (qty: number): boolean => {
    if (!comboKey) return false;
    return unconfirmedDrafts[comboKey]?.has(qty) ?? false;
  };
  const toggleUnconfirmed = (qty: number) => {
    if (!comboKey) return;
    setUnconfirmedDrafts((prev) => {
      const cur = prev[comboKey] ?? new Set<number>();
      const next = new Set(cur);
      if (next.has(qty)) {
        next.delete(qty);
      } else {
        next.add(qty);
      }
      return { ...prev, [comboKey]: next };
    });
    // Marking TBD clears any drafted dollar value for this cell.
    setDrafts((prev) => ({ ...prev, [comboKey]: { ...(prev[comboKey] ?? {}), [qty]: "" } }));
  };

  const dirty = (() => {
    if (!comboKey) return false;
    const d = drafts[comboKey];
    if (d) {
      for (const q of Object.keys(d)) {
        const qty = Number(q);
        const saved = savedLadder.find((r) => r.qty === qty);
        const savedStr = saved && saved.confirmed !== false ? formatDollars(saved.unitCents) : "";
        if ((d[qty] ?? "") !== savedStr) return true;
      }
    }
    // Explicit TBD toggle is also "dirty" when it diverges from saved.
    const tbdNow = unconfirmedDrafts[comboKey] ?? new Set<number>();
    const tbdSaved = new Set<number>(savedLadder.filter((r) => r.confirmed === false).map((r) => r.qty));
    if (tbdNow.size !== tbdSaved.size) return true;
    for (const q of tbdNow) if (!tbdSaved.has(q)) return true;
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
      // Build ladder from every column that has a parseable dollar
      // value. Task #624 — any rung the admin actually types lands as
      // confirmed:true, promoting a seeded `confirmed:false`
      // placeholder out of the yellow "TBD — awaiting quote" state.
      const ladder: { qty: number; unitCents: number; confirmed: boolean }[] = [];
      for (const q of columns) {
        // Explicit TBD wins: persist a `confirmed:false` placeholder
        // even with no dollar value so the cell keeps rendering
        // yellow on next load.
        if (isUnconfirmedDraft(q)) {
          ladder.push({ qty: q, unitCents: 0, confirmed: false });
          continue;
        }
        const v = cellValue(q).trim();
        if (!v) continue;
        const cents = parseDollars(v);
        if (cents === null) throw new Error(`"${v}" at qty ${q} isn't a valid dollar amount`);
        ladder.push({ qty: q, unitCents: cents, confirmed: true });
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
                  {columns.map((q) => {
                    // Task #624 — a cell is "unconfirmed / TBD" when:
                    //   1) admin explicitly toggled TBD on it (draft), OR
                    //   2) the saved rung has `confirmed:false`
                    //      (e.g. a seeded Black placeholder), OR
                    //   3) it's a default-qty column the press hasn't
                    //      priced yet but neighbours are priced —
                    //      surfaces the gap so it gets quoted.
                    const saved = savedLadder.find((r) => r.qty === q);
                    const explicitTbd = isUnconfirmedDraft(q);
                    const savedTbd = saved !== undefined && saved.confirmed === false;
                    const draftedValue = (drafts[comboKey ?? ""] ?? {})[q];
                    const hasAnyValueOrDraft =
                      (draftedValue !== undefined && draftedValue.trim() !== "") ||
                      (saved !== undefined && saved.confirmed !== false);
                    const tierHasAnyConfirmed = savedLadder.some((r) => r.confirmed !== false) ||
                      Object.values(drafts[comboKey ?? ""] ?? {}).some((s) => s && s.trim() !== "");
                    const gapInDefaults =
                      DEFAULT_QTY_COLUMNS.includes(q) &&
                      !hasAnyValueOrDraft &&
                      tierHasAnyConfirmed;
                    const isUnconfirmed = explicitTbd || (savedTbd && !draftedValue) || gapInDefaults;
                    return (
                    <td key={q} className="px-1 py-1.5 align-middle" title={isUnconfirmed ? "TBD — awaiting quote" : undefined}>
                      {/* Task #662 follow-up — the relative wrapper
                          must scope to ONLY the input or `top-1/2`
                          centers `$` against the whole input+button
                          stack (lands between them). */}
                      <div className="relative">
                        <span
                          className={[
                            "pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs",
                            isUnconfirmed ? "text-amber-500" : "text-slate-400",
                          ].join(" ")}
                        >
                          $
                        </span>
                        <input
                          value={cellValue(q)}
                          onChange={(e) => setCellValue(q, e.target.value)}
                          placeholder={isUnconfirmed ? "TBD" : ""}
                          inputMode="decimal"
                          className={[
                            "w-20 h-8 pl-6 pr-2 rounded-md border text-xs tabular-nums text-right focus:outline-none focus:border-[color:var(--brand-blue)]",
                            isUnconfirmed
                              ? "border-amber-400 bg-amber-50 text-amber-900 placeholder:text-amber-400"
                              : "border-slate-200 bg-white",
                          ].join(" ")}
                          data-testid={`input-ladder-cell-${selectedTier.id}-${selectedJacket.id}-${q}`}
                          aria-label={
                            isUnconfirmed
                              ? `Quantity ${q} — TBD, awaiting quote`
                              : `Quantity ${q}`
                          }
                        />
                        </div>
                        {(() => {
                          // Task #624 — TBD button reflects what Save
                          // will actually persist: explicit-TBD flag
                          // wins; otherwise a saved-TBD rung whose
                          // value hasn't been typed yet stays TBD;
                          // typing into the cell promotes to confirmed
                          // and the button flips back to "Mark TBD".
                          const willPersistTbd =
                            explicitTbd ||
                            (savedTbd && (draftedValue ?? "").trim() === "");
                          return (
                            <button
                              type="button"
                              onClick={() => toggleUnconfirmed(q)}
                              className={[
                                "mt-1 block w-20 text-xs rounded-md border px-1.5 py-0.5",
                                willPersistTbd
                                  ? "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200"
                                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                              ].join(" ")}
                              title={
                                willPersistTbd
                                  ? "Clear TBD flag"
                                  : "Mark this rung as TBD — awaiting quote"
                              }
                              data-testid={`button-toggle-tbd-${selectedTier.id}-${selectedJacket.id}-${q}`}
                            >
                              {willPersistTbd ? "✓ TBD" : "Mark TBD"}
                            </button>
                          );
                        })()}
                    </td>
                    );
                  })}
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
      setEditing(false);
      onChanged();
    },
  });
  const [cropToDisc, setCropToDisc] = useState(false);
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
              <label className="block min-w-0">
                <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Photo</span>
                <div className="flex items-center gap-3 min-w-0">
                  {/* Round preview — matches the live catalog chip's
                      circular swatch dot so admins can tell the photo
                      will display as a disc, not a square with
                      whitespace around it (task #667). */}
                  <div
                    className={`w-12 h-12 rounded-full overflow-hidden shrink-0 border ${
                      imageUrl ? "border-slate-200" : "border-dashed border-slate-300 bg-slate-50"
                    }`}
                    style={
                      imageUrl
                        ? { backgroundImage: `url(${imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                        : {}
                    }
                    data-testid={`preview-swatch-photo-${color.id}`}
                  />
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setSelectedFileName(f.name);
                          upload.mutate(f);
                        }
                      }}
                      title={selectedFileName ?? undefined}
                      className="text-xs block max-w-full"
                      data-testid={`input-swatch-upload-${color.id}`}
                    />
                  </div>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl(null)}
                      className="shrink-0 text-xs text-slate-500 hover:underline underline-offset-2"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </label>
            </div>
            {/* "Crop to vinyl disc" — opt-in disc-mask at upload time.
                Vendor mockups (Hellbender on gray, MRP on black/checker)
                ship the record dead-center on a studio backdrop; this
                masks everything outside the detected disc to transparent
                so the chip shows just the record + label. */}
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={cropToDisc}
                onChange={(e) => setCropToDisc(e.target.checked)}
                className="mt-0.5 accent-[color:var(--brand-blue)]"
                data-testid={`toggle-crop-disc-${color.id}`}
              />
              <span>
                <span className="font-medium text-slate-700">Crop to vinyl disc</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Best for vendor mockups where the record sits on a studio backdrop — keeps the label and vinyl, drops the background.
                </span>
              </span>
            </label>
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
