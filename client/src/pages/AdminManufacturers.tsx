import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, Factory, Clock } from "lucide-react";
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
import type { Manufacturer } from "@shared/schema";

/**
 * Admin · Manufacturers (Task #69). One row per pressing plant. Each
 * manufacturer can be invited to bid on RFQs (see AdminAlbum.RFQ
 * section, follow-up) and is the awarded plant for any album whose
 * print run was assigned to them.
 *
 * Mirrors AdminLabels structurally but intentionally lighter: no
 * paste-URL scrape (operator-entered today), no logo curation lock
 * (these aren't fan-facing brands), no view-mode toggle (a manageable
 * 1-2 dozen partners doesn't need a grid view).
 */
export function AdminManufacturers() {
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

  const { data: rows = [], isLoading } = useQuery<Manufacturer[]>({
    queryKey: ["/api/manufacturers"],
    enabled: !!user?.isAdmin,
  });

  const create = useMutation({
    mutationFn: async (name: string) => {
      const r = await apiRequest("POST", "/api/admin/manufacturers", { name });
      return (await r.json()) as Manufacturer;
    },
    onSuccess: (m) => {
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      setAddOpen(false);
      setDraftName("");
      navigate(`/admin/manufacturers/${m.id}`);
    },
    onError: (e: any) =>
      toast({ title: "Couldn't add manufacturer", description: e?.message, variant: "destructive" }),
  });

  if (authLoading) {
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

  const filtered = rows.filter((r) =>
    search ? (r.name + " " + (r.location ?? "")).toLowerCase().includes(search.toLowerCase()) : true,
  );

  return (
    <AdminFrame active="manufacturers">
      <div className="space-y-5">
        <AdminPageHeader
          title="Manufacturers"
          subtitle="Pressing plants and duplication houses. Invite them to bid on print runs."
          actions={
            <AddEntityButton
              label="Add manufacturer"
              onClick={() => setAddOpen(true)}
              testId="button-add-manufacturer"
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
            data-testid="input-search-manufacturers"
          />
        </div>

        {isLoading ? (
          <div className="py-10 text-slate-500 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
            <Factory className="w-8 h-8 mx-auto text-slate-300 mb-2" strokeWidth={1.5} />
            <div className="text-slate-700 font-medium">No manufacturers yet</div>
            <div className="text-slate-500 text-[13px] mt-1">
              Add your first pressing plant to start collecting quotes.
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
            {filtered.map((m) => (
              <Link
                key={m.id}
                href={`/admin/manufacturers/${m.id}`}
                className="block px-4 py-3 hover:bg-slate-50 transition-colors"
                data-testid={`row-manufacturer-${m.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {m.logoUrl ? (
                      <img src={m.logoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Factory className="w-5 h-5 text-slate-400" strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-900 text-[14px] font-medium truncate">{m.name}</div>
                    <div className="text-slate-500 text-[12px] truncate">
                      {m.location || m.domain || "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[11.5px] text-slate-500">
                    {m.turnaroundDays != null && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {m.turnaroundDays}d
                      </span>
                    )}
                    {m.specialties.length > 0 && (
                      <span className="hidden sm:inline-flex gap-1">
                        {m.specialties.slice(0, 3).map((s) => (
                          <span key={s} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {s}
                          </span>
                        ))}
                      </span>
                    )}
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
            <DialogTitle>Add manufacturer</DialogTitle>
            <DialogDescription>
              Start with the plant's name — you can fill in the rest on the detail page.
            </DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="e.g. Pirates Press"
            className="w-full h-10 px-3 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
            data-testid="input-new-manufacturer-name"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => draftName.trim() && create.mutate(draftName.trim())}
              disabled={!draftName.trim() || create.isPending}
              data-testid="button-confirm-add-manufacturer"
            >
              {create.isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminFrame>
  );
}
