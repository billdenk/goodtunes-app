import { useEffect, useState } from "react";
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
  X,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { invalidateAdminEntity } from "@/lib/adminEntityInvalidation";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { PartnerPermissionsPanel } from "@/components/admin/PartnerPermissionsPanel";
import { PressLogoEditorDialog } from "@/components/admin/PressLogoEditorDialog";
import { OrganizationPeople } from "@/components/admin/OrganizationPeople";
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
            className="group relative w-24 h-24 rounded-xl overflow-hidden bg-white ring-1 ring-slate-200 shadow-sm flex-shrink-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2"
            aria-label="Edit press logo"
            data-testid="button-edit-press-logo"
          >
            {m.logoUrl ? (
              <img
                src={m.logoUrl}
                alt={m.name}
                className="w-full h-full object-contain p-2 transition-transform group-hover:scale-[1.03]"
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

        {/* TAB BAR — Overview only for now; Refresh + Delete sit on the right. */}
        <div
          className="flex items-end justify-between gap-5 border-b border-slate-200"
          data-testid="tabs-admin-press"
        >
          <div className="flex items-center gap-5 overflow-x-auto">
            <button
              type="button"
              className="relative pb-2.5 text-[13.5px] font-semibold whitespace-nowrap text-slate-900"
              data-testid="tab-overview"
            >
              Overview
              <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[var(--brand-blue)] rounded-full" />
            </button>
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

        <PartnerProfileForm
          initial={m}
          partners={partners}
          onSave={(patch) => save.mutate(patch)}
          saving={save.isPending}
        />

        <PressCatalogPanel pressId={id} />

        <OrganizationPeople
          apiPath={`/api/manufacturers/${m.id}/people`}
          testIdPrefix="press"
          blurb="People at this plant — production manager, account rep, whoever you need to reach."
        />

        <PartnerPermissionsPanel
          scopeKind="manufacturer"
          scopeId={m.id}
          scopeName={m.name}
        />
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
  const [bio, setBio] = useState(initial.bio ?? "");
  const [turnaroundDays, setTurnaroundDays] = useState(
    initial.turnaroundDays != null ? String(initial.turnaroundDays) : "",
  );
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
      bio: bio.trim() || null,
      turnaroundDays: turnaroundDays === "" ? null : Number(turnaroundDays),
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
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={INPUT} placeholder="Berkeley, CA" data-testid="input-mfr-location" />
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
        <Field label="Standard turnaround (days)">
          <input
            type="number"
            min={0}
            value={turnaroundDays}
            onChange={(e) => setTurnaroundDays(e.target.value)}
            className={INPUT}
            placeholder="90"
            data-testid="input-mfr-turnaround"
          />
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

// Task #218 — press catalog (formats → tiers → colors).
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
  colors: CatalogColor[];
};
type CatalogFormat = {
  format: AlbumFormat;
  position: number;
  tiers: CatalogTier[];
};
type Catalog = { formats: CatalogFormat[] };

const parseDollars = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};
const formatDollars = (c: number) => (c / 100).toFixed(2);

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
          What this press offers, how it's priced. Pick the formats this press runs, then under each format
          add color tiers (e.g. Black / Standard color / Splatter) with a quantity-keyed price ladder and
          the colors that belong to that tier. Artists invited by this press see the resulting picker on
          their album's Sell panel; cost on each SKU is taken from the matching tier's ladder.
        </p>
      </div>
      {isLoading || !data ? (
        <div className="text-slate-500 text-sm py-4">Loading…</div>
      ) : (
        <div className="space-y-5">
          {ALBUM_FORMATS.map((fmt) => {
            const fmtRow = data.formats.find((f) => f.format === fmt) ?? null;
            const isOn = offered.has(fmt);
            return (
              <div
                key={fmt}
                className={[
                  "rounded-md border p-3 space-y-3",
                  isOn ? "border-slate-200" : "border-dashed border-slate-200 bg-slate-50/60",
                ].join(" ")}
                data-testid={`catalog-format-${fmt}`}
              >
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={(e) => toggleFormat.mutate({ format: fmt, enabled: e.target.checked })}
                      disabled={toggleFormat.isPending}
                      className="h-4 w-4 rounded border-slate-300"
                      data-testid={`toggle-format-${fmt}`}
                    />
                    <span className="text-[13.5px] font-semibold text-slate-900">
                      {ALBUM_FORMAT_LABEL[fmt]}
                    </span>
                  </label>
                  {!isOn && (
                    <span className="text-[11.5px] text-slate-400">Not offered</span>
                  )}
                </div>
                {isOn && fmtRow && (
                  <CatalogFormatBody pressId={pressId} fmt={fmt} tiers={fmtRow.tiers} onChanged={invalidate} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CatalogFormatBody({
  pressId,
  fmt,
  tiers,
  onChanged,
}: {
  pressId: string;
  fmt: AlbumFormat;
  tiers: CatalogTier[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [newTierName, setNewTierName] = useState("");
  const addTier = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/admin/manufacturers/${pressId}/catalog/formats/${fmt}/tiers`,
        { name: newTierName.trim(), priceLadder: [] },
      );
      return r.json();
    },
    onSuccess: () => {
      setNewTierName("");
      onChanged();
    },
    onError: (e: any) => toast({ title: "Couldn't add tier", description: e?.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-3 pl-6">
      {tiers.length === 0 && (
        <div className="text-[12px] text-slate-500">No tiers yet — add one to start.</div>
      )}
      {tiers.map((t) => (
        <CatalogTierEditor key={t.id} pressId={pressId} tier={t} onChanged={onChanged} />
      ))}
      <div className="flex items-center gap-2 pt-1">
        <input
          value={newTierName}
          onChange={(e) => setNewTierName(e.target.value)}
          placeholder="New tier name (e.g. Black, Splatter, Color-in-color)"
          className={INPUT}
          data-testid={`input-new-tier-${fmt}`}
        />
        <Button
          type="button"
          variant="ghost"
          onClick={() => newTierName.trim() && addTier.mutate()}
          disabled={!newTierName.trim() || addTier.isPending}
          data-testid={`button-add-tier-${fmt}`}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add tier
        </Button>
      </div>
    </div>
  );
}

function CatalogTierEditor({
  pressId,
  tier,
  onChanged,
}: {
  pressId: string;
  tier: CatalogTier;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(tier.name);
  // Ladder edited as plain text: "qty:$price" per line, e.g. "100:$8.50".
  // Parses back to the jsonb shape on save. Empty / malformed lines are
  // dropped silently — keeps the editor forgiving for press staff.
  const ladderToText = (l: { qty: number; unitCents: number }[]) =>
    l.map((r) => `${r.qty}: $${formatDollars(r.unitCents)}`).join("\n");
  const textToLadder = (s: string) => {
    const out: { qty: number; unitCents: number }[] = [];
    for (const raw of s.split(/\n/)) {
      const m = raw.match(/^\s*(\d+)\s*[:=]\s*\$?\s*(\d+(?:\.\d+)?)/);
      if (!m) continue;
      const qty = parseInt(m[1], 10);
      const cents = Math.round(parseFloat(m[2]) * 100);
      if (qty > 0 && Number.isFinite(cents) && cents >= 0) out.push({ qty, unitCents: cents });
    }
    return out.sort((a, b) => a.qty - b.qty);
  };
  const [ladderText, setLadderText] = useState(ladderToText(tier.priceLadder));
  useEffect(() => {
    setName(tier.name);
    setLadderText(ladderToText(tier.priceLadder));
  }, [tier.id, tier.name, tier.priceLadder]);

  const dirty = name !== tier.name || ladderText !== ladderToText(tier.priceLadder);

  const save = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "PATCH",
        `/api/admin/manufacturers/${pressId}/catalog/tiers/${tier.id}`,
        { name: name.trim(), priceLadder: textToLadder(ladderText) },
      );
      return r.json();
    },
    onSuccess: onChanged,
    onError: (e: any) => toast({ title: "Couldn't save tier", description: e?.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/catalog/tiers/${tier.id}`);
    },
    onSuccess: onChanged,
  });

  const [newColorName, setNewColorName] = useState("");
  const [newColorHex, setNewColorHex] = useState("#000000");
  const addColor = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/admin/manufacturers/${pressId}/catalog/tiers/${tier.id}/colors`,
        { name: newColorName.trim(), swatchHex: newColorHex || null },
      );
      return r.json();
    },
    onSuccess: () => {
      setNewColorName("");
      onChanged();
    },
    onError: (e: any) => toast({ title: "Couldn't add color", description: e?.message, variant: "destructive" }),
  });
  const removeColor = useMutation({
    mutationFn: async (colorId: string) => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/catalog/colors/${colorId}`);
    },
    onSuccess: onChanged,
  });

  return (
    <div className="rounded-md border border-slate-200 p-3 space-y-3" data-testid={`tier-${tier.id}`}>
      <div className="flex items-start justify-between gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={INPUT}
          data-testid={`input-tier-name-${tier.id}`}
        />
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            className="h-8 px-3 text-[12px]"
            data-testid={`button-save-tier-${tier.id}`}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
            aria-label="Delete tier"
            data-testid={`button-delete-tier-${tier.id}`}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-slate-500 text-[10.5px] font-semibold uppercase tracking-wider mb-1">
            Price ladder (qty: $price per unit)
          </span>
          <textarea
            value={ladderText}
            onChange={(e) => setLadderText(e.target.value)}
            rows={Math.max(3, ladderText.split("\n").length)}
            className={INPUT + " min-h-[80px] py-2 font-mono text-[12px]"}
            placeholder={"100: $8.50\n200: $7.10\n500: $5.40"}
            data-testid={`input-ladder-${tier.id}`}
          />
          <p className="text-[11.5px] text-slate-400 mt-1">
            Artists' typed quantity snaps up to the next rung. The top rung is the cap (above that, the
            picker shows "request a custom quote").
          </p>
        </label>
        <div className="block">
          <span className="block text-slate-500 text-[10.5px] font-semibold uppercase tracking-wider mb-1">
            Colors
          </span>
          <div className="space-y-1.5">
            {tier.colors.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 text-[12.5px] text-slate-700"
                data-testid={`color-${c.id}`}
              >
                <span
                  className="w-4 h-4 rounded-full border border-slate-200 shrink-0"
                  style={{ background: c.swatchHex ?? "#ccc" }}
                />
                <span className="flex-1 truncate">{c.name}</span>
                <button
                  type="button"
                  onClick={() => removeColor.mutate(c.id)}
                  className="text-slate-400 hover:text-rose-600"
                  aria-label={`Remove ${c.name}`}
                  data-testid={`button-delete-color-${c.id}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {tier.colors.length === 0 && (
              <div className="text-[11.5px] text-slate-400">No colors yet.</div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="color"
              value={newColorHex}
              onChange={(e) => setNewColorHex(e.target.value)}
              className="h-7 w-9 rounded border border-slate-200 cursor-pointer"
              data-testid={`input-new-color-hex-${tier.id}`}
            />
            <input
              value={newColorName}
              onChange={(e) => setNewColorName(e.target.value)}
              placeholder="Color name"
              className={INPUT}
              data-testid={`input-new-color-name-${tier.id}`}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => newColorName.trim() && addColor.mutate()}
              disabled={!newColorName.trim() || addColor.isPending}
              className="h-8 px-2"
              data-testid={`button-add-color-${tier.id}`}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
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
