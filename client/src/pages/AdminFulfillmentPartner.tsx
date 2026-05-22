import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, Trash2 } from "lucide-react";
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

  const { data: f, isLoading } = useQuery<FulfillmentPartner>({
    queryKey: ["/api/fulfillment-partners", id],
    enabled: !!user?.isAdmin && !!id,
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<FulfillmentPartner>) => {
      const r = await apiRequest("PUT", `/api/admin/fulfillment-partners/${id}`, patch);
      return (await r.json()) as FulfillmentPartner;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fulfillment-partners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fulfillment-partners", id] });
      toast({ title: "Saved" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
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
      <AdminFrame active="fulfillment">
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
  if (!f) {
    return (
      <AdminFrame active="fulfillment">
        <div className="py-20 text-center">
          <h1 className="text-slate-900 text-lg font-semibold">Partner not found</h1>
          <Link href="/admin/fulfillment-partners" className="text-[var(--brand-blue)] text-sm hover:underline">
            Back to fulfillment partners
          </Link>
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="fulfillment" contentWidth="narrow">
      <div className="space-y-5">
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium">
          <Link href="/admin/fulfillment-partners" className="hover:text-slate-700">
            Fulfillment
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">{f.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[26px] font-bold text-slate-900 truncate" data-testid="heading-fulfillment-name">
            {f.name}
          </h1>
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
            <AlertDialogAction onClick={() => remove.mutate()} className="bg-rose-600 hover:bg-rose-700">
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
  const [bio, setBio] = useState(initial.bio ?? "");
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name: name.trim(),
      domain: domain.trim() || null,
      websiteUrl: websiteUrl.trim() || null,
      contactEmail: contactEmail.trim() || null,
      contactPhone: contactPhone.trim() || null,
      location: location.trim() || null,
      shippingAddress: shippingAddress.trim() || null,
      bio: bio.trim() || null,
      logoUrl: logoUrl.trim() || null,
    });
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} data-testid="input-fp-name" />
        </Field>
        <Field label="Location">
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={INPUT} data-testid="input-fp-location" />
        </Field>
        <Field label="Website">
          <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className={INPUT} data-testid="input-fp-website" />
        </Field>
        <Field label="Domain">
          <input value={domain} onChange={(e) => setDomain(e.target.value)} className={INPUT} data-testid="input-fp-domain" />
        </Field>
        <Field label="Contact email">
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={INPUT} data-testid="input-fp-contact-email" />
        </Field>
        <Field label="Contact phone">
          <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={INPUT} data-testid="input-fp-contact-phone" />
        </Field>
        <Field label="Logo URL">
          <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={INPUT} data-testid="input-fp-logo" />
        </Field>
      </div>
      <Field label="Shipping address">
        <input
          value={shippingAddress}
          onChange={(e) => setShippingAddress(e.target.value)}
          className={INPUT}
          placeholder="Receiving dock address, single line"
          data-testid="input-fp-shipping"
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
        <Button type="submit" disabled={saving} data-testid="button-save-fulfillment">
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
