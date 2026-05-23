import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw, Trash2, X, Plus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
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
      <div className="space-y-5">
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium">
          <Link href="/admin/manufacturers" className="hover:text-slate-700">
            Presses
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">{m.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[26px] font-bold text-slate-900 truncate" data-testid="heading-manufacturer-name">
            {m.name}
          </h1>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              onClick={() => rescrape.mutate()}
              disabled={!m.websiteUrl || rescrape.isPending}
              title={m.websiteUrl ? "Re-fetch logo, cover, and bio from the website" : "Add a website URL first"}
              data-testid="button-rescrape-manufacturer"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${rescrape.isPending ? "animate-spin" : ""}`} />
              {rescrape.isPending ? "Refreshing…" : "Refresh from website"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              data-testid="button-delete-manufacturer"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
          </div>
        </div>

        <PartnerProfileForm
          initial={m}
          partners={partners}
          onSave={(patch) => save.mutate(patch)}
          saving={save.isPending}
        />

        <PressFormatCostsPanel pressId={id} />
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
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
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
      logoUrl: logoUrl.trim() || null,
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
        <Field label="Logo URL">
          <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={INPUT} placeholder="https://…/logo.png" data-testid="input-mfr-logo" />
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

type PressFormatCostRow = {
  format: AlbumFormat;
  manufacturingCents: number;
  publishingCents: number;
  paymentProcessingCents: number;
  goodtunesCents: number;
  isOverride: boolean;
};

const COST_FIELDS: { key: keyof Omit<PressFormatCostRow, "format" | "isOverride">; label: string }[] = [
  { key: "manufacturingCents", label: "Manufacturing" },
  { key: "publishingCents", label: "Publishing" },
  { key: "paymentProcessingCents", label: "Payment processing" },
  { key: "goodtunesCents", label: "GoodTunes margin" },
];

const parseDollars = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};
const formatDollars = (c: number) => (c / 100).toFixed(2);

function PressFormatCostsPanel({ pressId }: { pressId: string }) {
  const { toast } = useToast();
  // Role gate — server is authoritative (returns 403 for non-platform
  // admins outside this press's scope), but we hide the panel up front
  // for admins who would just see a 403 either way. Platform staff
  // (super_admin/admin) and manufacturer-role admins scoped to this
  // press see + edit the panel.
  const { data: roleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
  });
  const canEdit =
    roleInfo?.role === "super_admin" ||
    roleInfo?.role === "admin" ||
    (roleInfo?.role === "manufacturer" && roleInfo?.roleScopeId === pressId);
  const { data, isLoading } = useQuery<PressFormatCostRow[]>({
    queryKey: ["/api/admin/manufacturers", pressId, "format-costs"],
    enabled: !!pressId && !!canEdit,
  });

  if (roleInfo && !canEdit) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4" data-testid="panel-press-format-costs">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">Per-format costs</h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Set this press's per-unit cost breakdown for each format. Saved rows replace the platform default
          on the cost calculator for any artist or label invited by this press.
        </p>
      </div>
      {isLoading || !data ? (
        <div className="text-slate-500 text-sm py-4">Loading…</div>
      ) : (
        <div className="space-y-3">
          {data.map((row) => (
            <PressFormatCostRowEditor
              key={row.format}
              pressId={pressId}
              row={row}
              onSaved={() => toast({ title: `Saved ${ALBUM_FORMAT_LABEL[row.format]} pricing` })}
              onReset={() => toast({ title: `Reset ${ALBUM_FORMAT_LABEL[row.format]} to platform default` })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PressFormatCostRowEditor({
  pressId,
  row,
  onSaved,
  onReset,
}: {
  pressId: string;
  row: PressFormatCostRow;
  onSaved: () => void;
  onReset: () => void;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({
    manufacturingCents: formatDollars(row.manufacturingCents),
    publishingCents: formatDollars(row.publishingCents),
    paymentProcessingCents: formatDollars(row.paymentProcessingCents),
    goodtunesCents: formatDollars(row.goodtunesCents),
  });

  // Reset local edit buffer whenever the source row updates (after
  // save/reset round-trips) so the inputs reflect the new server state.
  useEffect(() => {
    setValues({
      manufacturingCents: formatDollars(row.manufacturingCents),
      publishingCents: formatDollars(row.publishingCents),
      paymentProcessingCents: formatDollars(row.paymentProcessingCents),
      goodtunesCents: formatDollars(row.goodtunesCents),
    });
  }, [row.manufacturingCents, row.publishingCents, row.paymentProcessingCents, row.goodtunesCents]);

  const dirty = COST_FIELDS.some(
    (f) => parseDollars(values[f.key]) !== row[f.key],
  );

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, number> = {};
      for (const f of COST_FIELDS) {
        const c = parseDollars(values[f.key]);
        if (c == null) throw new Error(`Enter a valid ${f.label.toLowerCase()} amount`);
        body[f.key] = c;
      }
      const r = await apiRequest(
        "PUT",
        `/api/admin/manufacturers/${pressId}/format-costs/${row.format}`,
        body,
      );
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/manufacturers", pressId, "format-costs"],
      });
      // Invited-press calculator on the SellPanel reads merged costs;
      // bust it too so artists see the new numbers immediately.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      onSaved();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  const reset = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/format-costs/${row.format}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/manufacturers", pressId, "format-costs"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      onReset();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't reset", description: e?.message, variant: "destructive" }),
  });

  const total = COST_FIELDS.reduce((sum, f) => {
    const c = parseDollars(values[f.key]);
    return sum + (c ?? 0);
  }, 0);

  return (
    <div
      className="rounded-md border border-slate-200 p-3"
      data-testid={`row-press-format-cost-${row.format}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold text-slate-900">
            {ALBUM_FORMAT_LABEL[row.format]}
          </span>
          {row.isOverride ? (
            <span
              className="text-[10.5px] uppercase tracking-wider font-semibold rounded px-1.5 py-0.5 bg-[var(--brand-blue)]/10 text-[#266a93]"
              data-testid={`badge-override-${row.format}`}
            >
              Press pricing
            </span>
          ) : (
            <span
              className="text-[10.5px] uppercase tracking-wider font-semibold rounded px-1.5 py-0.5 bg-slate-100 text-slate-500"
              data-testid={`badge-platform-${row.format}`}
            >
              Platform default
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {row.isOverride && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => reset.mutate()}
              disabled={reset.isPending}
              className="h-8 px-2 text-[12px] text-slate-500 hover:text-slate-700"
              data-testid={`button-reset-${row.format}`}
            >
              Reset to platform
            </Button>
          )}
          <Button
            type="button"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            className="h-8 px-3 text-[12px]"
            data-testid={`button-save-format-cost-${row.format}`}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {COST_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="block text-slate-500 text-[10.5px] font-semibold uppercase tracking-wider mb-1">
              {f.label}
            </span>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[12px]">
                $
              </span>
              <input
                value={values[f.key]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
                inputMode="decimal"
                className={INPUT + " pl-5"}
                data-testid={`input-${f.key}-${row.format}`}
              />
            </div>
          </label>
        ))}
      </div>
      <div className="mt-2 text-right text-[12px] text-slate-500">
        Total per unit:{" "}
        <span
          className="text-slate-900 font-semibold"
          data-testid={`text-total-${row.format}`}
        >
          ${formatDollars(total)}
        </span>
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
