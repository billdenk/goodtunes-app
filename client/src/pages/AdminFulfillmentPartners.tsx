import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, Truck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AddEntityButton } from "@/components/admin/AddEntityButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { FulfillmentPartner } from "@shared/schema";

/**
 * Admin · Fulfillment partners (Task #69). Warehouses that receive
 * finished units from a manufacturer and ship them to fans. Each
 * manufacturer can declare a default fulfillment partner; per-album
 * overrides are possible (follow-up).
 */
export function AdminFulfillmentPartners() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const { toast } = useToast();

  const { data: rows = [], isLoading } = useQuery<FulfillmentPartner[]>({
    queryKey: ["/api/fulfillment-partners"],
    enabled: !!user?.isAdmin,
  });

  const create = useMutation({
    mutationFn: async (name: string) => {
      const r = await apiRequest("POST", "/api/admin/fulfillment-partners", { name });
      return (await r.json()) as FulfillmentPartner;
    },
    onSuccess: (f) => {
      queryClient.invalidateQueries({ queryKey: ["/api/fulfillment-partners"] });
      setAddOpen(false);
      setDraftName("");
      navigate(`/admin/fulfillment-partners/${f.id}`);
    },
    onError: (e: any) =>
      toast({ title: "Couldn't add partner", description: e?.message, variant: "destructive" }),
  });

  if (authLoading) {
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

  const filtered = rows.filter((r) =>
    search ? (r.name + " " + (r.location ?? "")).toLowerCase().includes(search.toLowerCase()) : true,
  );

  return (
    <AdminFrame active="fulfillment">
      <div className="space-y-5">
        <AdminPageHeader
          title="Fulfillment partners"
          subtitle="Warehouses that ship finished records to fans."
          actions={
            <AddEntityButton
              label="Add partner"
              onClick={() => setAddOpen(true)}
              testId="button-add-fulfillment"
            />
          }
        />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or location"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
            data-testid="input-search-fulfillment"
          />
        </div>

        {isLoading ? (
          <div className="py-10 text-slate-500 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
            <Truck className="w-8 h-8 mx-auto text-slate-300 mb-2" strokeWidth={1.5} />
            <div className="text-slate-700 font-medium">No fulfillment partners yet</div>
            <div className="text-slate-500 text-[13px] mt-1">
              Add a warehouse to ship orders from.
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
            {filtered.map((f) => (
              <Link
                key={f.id}
                href={`/admin/fulfillment-partners/${f.id}`}
                className="block px-4 py-3 hover:bg-slate-50 transition-colors"
                data-testid={`row-fulfillment-${f.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {f.logoUrl ? (
                      <img src={f.logoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Truck className="w-5 h-5 text-slate-400" strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-900 text-[14px] font-medium truncate">{f.name}</div>
                    <div className="text-slate-500 text-[12px] truncate">
                      {f.location || f.shippingAddress || f.domain || "—"}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add fulfillment partner</DialogTitle>
            <DialogDescription>
              Start with the warehouse name — fill in the rest on the detail page.
            </DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="e.g. Northern Music Fulfillment"
            className="w-full h-10 px-3 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
            data-testid="input-new-fulfillment-name"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => draftName.trim() && create.mutate(draftName.trim())}
              disabled={!draftName.trim() || create.isPending}
              data-testid="button-confirm-add-fulfillment"
            >
              {create.isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminFrame>
  );
}
