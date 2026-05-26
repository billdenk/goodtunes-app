import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, Pencil, RefreshCw, Trash2, Truck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AddressAutocompleteField } from "@/components/admin/AddressAutocompleteField";
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
import type { FulfillmentPartner } from "@shared/schema";

export function AdminFulfillmentPartner() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { user, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ id: string }>("/admin/fulfillment-partners/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id ?? "";
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logoEditorOpen, setLogoEditorOpen] = useState(false);

  const { data: f, isLoading } = useQuery<FulfillmentPartner>({
    queryKey: ["/api/fulfillment-partners", id],
    enabled: !!user?.isAdmin && !!id,
  });

  const invalidatePartner = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/fulfillment-partners"] });
    queryClient.invalidateQueries({ queryKey: ["/api/fulfillment-partners", id] });
  };

  const save = useMutation({
    mutationFn: async (patch: Partial<FulfillmentPartner>) => {
      const r = await apiRequest("PUT", `/api/admin/fulfillment-partners/${id}`, patch);
      return (await r.json()) as FulfillmentPartner;
    },
    onSuccess: () => {
      invalidatePartner();
      toast({ title: "Saved" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  // Re-pull name/logo/cover/bio/location from the saved website URL —
  // mirrors AdminManufacturer's "Refresh from website". Disabled until
  // a websiteUrl exists; succeeds quietly with "Nothing new" when the
  // scrape returns no fresh fields.
  const rescrape = useMutation({
    mutationFn: async () => {
      if (!f?.websiteUrl) throw new Error("No website saved");
      const r = await apiRequest("POST", `/api/admin/fulfillment-partners/scrape`, { url: f.websiteUrl });
      const scraped = (await r.json()) as {
        name: string | null;
        logoUrl: string | null;
        coverUrl: string | null;
        bio: string | null;
        location: string | null;
      };
      const patch: Partial<FulfillmentPartner> = {};
      if (scraped.name) patch.name = scraped.name;
      if (scraped.logoUrl) patch.logoUrl = scraped.logoUrl;
      if (scraped.coverUrl) patch.coverUrl = scraped.coverUrl;
      if (scraped.bio) patch.bio = scraped.bio;
      if (scraped.location) patch.location = scraped.location;
      if (Object.keys(patch).length === 0) return null;
      const r2 = await apiRequest("PUT", `/api/admin/fulfillment-partners/${id}`, patch);
      return (await r2.json()) as FulfillmentPartner;
    },
    onSuccess: (row) => {
      invalidatePartner();
      toast({ title: row ? "Refreshed from website" : "Nothing new to update" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't re-scrape", description: e?.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/fulfillment-partners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fulfillment-partners"] });
      toast({ title: "Partner deleted" });
      navigate("/admin/fulfillment-partners");
    },
  });

  if (authLoading || isLoading) {
    return (
      <AdminFrame active="fulfillment" contentWidth="narrow">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }
  if (!user?.isAdmin) {
    return (
      <AdminFrame active="fulfillment" contentWidth="narrow">
        <div className="py-20 text-center text-slate-500">
          You need to be signed in as an admin to view this page.
        </div>
      </AdminFrame>
    );
  }
  if (!f) {
    return (
      <AdminFrame active="fulfillment" contentWidth="narrow">
        <div className="py-20 text-center">
          <h1 className="text-slate-900 text-lg font-semibold">Partner not found</h1>
          <Link href="/admin/fulfillment-partners" className="text-[var(--brand-blue)] text-sm hover:underline underline-offset-2">
            Back to fulfillment partners
          </Link>
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="fulfillment" contentWidth="narrow">
      <div className="space-y-5">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
          <Link href="/admin/fulfillment-partners" className="hover:text-slate-700">
            Fulfillment
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">{f.name}</span>
        </div>

        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => setLogoEditorOpen(true)}
            className="relative w-16 h-16 rounded-2xl overflow-hidden bg-white ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0 group"
            data-testid="button-edit-fulfillment-logo"
            aria-label="Edit logo"
          >
            {f.logoUrl ? (
              <img src={f.logoUrl} alt={f.name} className="w-full h-full object-cover" />
            ) : (
              <Truck className="w-7 h-7 text-slate-300" strokeWidth={1.5} />
            )}
            <span className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-colors flex items-center justify-center text-white opacity-0 group-hover:opacity-100">
              <Pencil className="w-4 h-4" />
            </span>
          </button>
          <PressLogoEditorDialog
            name={f.name}
            logoUrl={f.logoUrl}
            apiPath={`/api/admin/fulfillment-partners/${f.id}`}
            open={logoEditorOpen}
            onOpenChange={setLogoEditorOpen}
            onInvalidate={invalidatePartner}
            FallbackIcon={Truck}
            testIdPrefix="fulfillment"
            hint="Square works best — shown on the Fulfillment list and anywhere this partner is credited."
          />
          <div className="flex-1 min-w-0">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Fulfillment partner
            </div>
            <h1
              className="text-2xl font-bold text-slate-900 truncate"
              data-testid="heading-fulfillment-name"
            >
              {f.name}
            </h1>
            {f.websiteUrl && (
              <a
                href={f.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 inline-block text-xs text-[var(--brand-blue)] hover:underline underline-offset-2"
                data-testid="link-fulfillment-website"
              >
                {f.websiteUrl.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={() => rescrape.mutate()}
            disabled={!f.websiteUrl || rescrape.isPending}
            aria-label="Refresh from website"
            title={f.websiteUrl ? "Re-fetch logo, cover, and bio from the website" : "Add a website URL first"}
            className="group inline-flex items-center gap-1.5 h-8 px-2 rounded-md text-slate-400 hover:text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/10 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40"
            data-testid="button-rescrape-fulfillment"
          >
            <span className="text-xs font-medium opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
              {rescrape.isPending ? "Refreshing…" : "Refresh from website"}
            </span>
            <RefreshCw className={`w-3.5 h-3.5 ${rescrape.isPending ? "animate-spin" : ""}`} />
          </button>
          <Button
            variant="ghost"
            onClick={() => setDeleteOpen(true)}
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            data-testid="button-delete-fulfillment"
          >
            <Trash2 className="w-4 h-4 mr-1.5" />
            Delete
          </Button>
        </div>

        <FpForm initial={f} onSave={(p) => save.mutate(p)} saving={save.isPending} />

        <OrganizationPeople
          apiPath={`/api/fulfillment-partners/${f.id}/people`}
          testIdPrefix="fulfillment"
          entityKind="fulfillment"
          entityId={f.id}
          entityName={f.name}
          blurb="People at this fulfillment partner — operations lead, account rep, whoever you need to reach."
        />
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this fulfillment partner?</AlertDialogTitle>
            <AlertDialogDescription>
              Manufacturers that point at this partner as their default will fall back to no
              default; orders already routed here keep their history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remove.mutate()}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminFrame>
  );
}

function FpForm({
  initial,
  onSave,
  saving,
}: {
  initial: FulfillmentPartner;
  onSave: (p: Partial<FulfillmentPartner>) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [domain, setDomain] = useState(initial.domain ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl ?? "");
  const [contactEmail, setContactEmail] = useState(initial.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(initial.contactPhone ?? "");
  const [location, setLocation] = useState(initial.location ?? "");
  const [shippingAddress, setShippingAddress] = useState(initial.shippingAddress ?? "");
  // Task #489 — structured snapshots for both the head-office Location
  // and the receiving-dock Shipping address. Persisted via the same
  // PUT as the free-text columns above. Left untouched on plain typing.
  const [locationAddress, setLocationAddress] = useState<any>(
    (initial as any).locationAddress ?? null,
  );
  const [shippingAddressStruct, setShippingAddressStruct] = useState<any>(
    (initial as any).shippingAddressStruct ?? null,
  );
  const [bio, setBio] = useState(initial.bio ?? "");

  // Logo is edited via the thumbnail-pencil dialog in the page header,
  // not via a raw URL input here. Task #283 — match Presses / Makers.
  const dirty = useMemo(() => {
    return (
      name.trim() !== initial.name ||
      (domain.trim() || null) !== (initial.domain ?? null) ||
      (websiteUrl.trim() || null) !== (initial.websiteUrl ?? null) ||
      (contactEmail.trim() || null) !== (initial.contactEmail ?? null) ||
      (contactPhone.trim() || null) !== (initial.contactPhone ?? null) ||
      (location.trim() || null) !== (initial.location ?? null) ||
      (shippingAddress.trim() || null) !== (initial.shippingAddress ?? null) ||
      (bio.trim() || null) !== (initial.bio ?? null)
    );
  }, [
    name,
    domain,
    websiteUrl,
    contactEmail,
    contactPhone,
    location,
    shippingAddress,
    bio,
    initial,
  ]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name: name.trim(),
      domain: domain.trim() || null,
      websiteUrl: websiteUrl.trim() || null,
      contactEmail: contactEmail.trim() || null,
      contactPhone: contactPhone.trim() || null,
      location: location.trim() || null,
      locationAddress: location.trim() === "" ? null : locationAddress,
      shippingAddress: shippingAddress.trim() || null,
      shippingAddressStruct:
        shippingAddress.trim() === "" ? null : shippingAddressStruct,
      bio: bio.trim() || null,
    });
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
            data-testid="input-fp-name"
          />
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
            testId="input-fp-location"
          />
        </Field>
        <Field label="Website">
          <input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            className={INPUT}
            data-testid="input-fp-website"
          />
        </Field>
        <Field label="Domain">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className={INPUT}
            data-testid="input-fp-domain"
          />
        </Field>
        <Field label="Contact email">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className={INPUT}
            data-testid="input-fp-contact-email"
          />
        </Field>
        <Field label="Contact phone">
          <input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className={INPUT}
            data-testid="input-fp-contact-phone"
          />
        </Field>
      </div>
      <Field label="Shipping address">
        <AddressAutocompleteField
          value={shippingAddress}
          onChange={setShippingAddress}
          onAddress={(snap) => {
            setShippingAddress(snap.formatted || shippingAddress);
            setShippingAddressStruct({
              line1: snap.line1 || null,
              line2: snap.line2 || null,
              city: snap.city || null,
              state: snap.region || null,
              postalCode: snap.postalCode || null,
              country: snap.country || null,
            });
          }}
          placeholder="Receiving dock address, single line"
          testId="input-fp-shipping"
        />
      </Field>
      <Field label="Notes">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className={INPUT + " min-h-[80px] py-2"}
          data-testid="input-fp-bio"
        />
      </Field>
      <div className="flex justify-end">
        <SaveLink
          dirty={dirty && !saving}
          onClick={() => submit({ preventDefault: () => {} } as React.FormEvent)}
          saving={saving}
          testId="button-save-fulfillment"
        />
      </div>
    </form>
  );
}

// Quiet "Save" affordance. At rest: slate-400. When the form is dirty:
// brand-blue link + faint soft pill. Mirrors SellPanel's SaveLink so
// per-row Saves all read the same across admin.
function SaveLink({
  dirty,
  saving,
  onClick,
  testId,
}: {
  dirty: boolean;
  saving: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        e.preventDefault();
        if (dirty) onClick();
      }}
      disabled={!dirty || saving}
      className={
        "h-9 px-3 rounded-md text-sm font-semibold transition-colors " +
        (dirty
          ? "text-[color:var(--brand-blue)] hover:bg-[color:var(--brand-blue-soft)]"
          : "text-slate-400 cursor-default")
      }
      data-testid={testId}
    >
      {saving ? "Saving…" : "Save changes"}
    </button>
  );
}

const INPUT =
  "w-full h-9 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:border-[var(--brand-blue)] bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
