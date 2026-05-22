import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Trash2, X, Plus } from "lucide-react";
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
import type { Manufacturer, FulfillmentPartner } from "@shared/schema";

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

  const remove = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      toast({ title: "Manufacturer deleted" });
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
          <h1 className="text-slate-900 text-lg font-semibold">Manufacturer not found</h1>
          <Link href="/admin/manufacturers" className="text-[var(--brand-blue)] text-sm hover:underline">
            Back to manufacturers
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
            Manufacturers
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">{m.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[26px] font-bold text-slate-900 truncate" data-testid="heading-manufacturer-name">
            {m.name}
          </h1>
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

        <PartnerProfileForm
          initial={m}
          partners={partners}
          onSave={(patch) => save.mutate(patch)}
          saving={save.isPending}
        />
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this manufacturer?</AlertDialogTitle>
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
