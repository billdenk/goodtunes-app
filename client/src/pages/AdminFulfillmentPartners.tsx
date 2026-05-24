import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, Truck, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AddEntityButton } from "@/components/admin/AddEntityButton";
import { ViewModeToggle, useViewMode } from "@/components/admin/ViewModeToggle";
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
 *
 * Task #283 brings the index page in line with the admin styleguide:
 * search-toggle + ViewModeToggle next to the existing AddEntityButton,
 * and a grid renderer mirroring Makers/Resellers.
 */
export function AdminFulfillmentPartners() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useViewMode("fulfillment");
  const [addOpen, setAddOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const { toast } = useToast();

  const {
    data: rows = [],
    isLoading,
    isError: rowsError,
    error: rowsErrorObj,
    refetch: refetchRows,
  } = useQuery<FulfillmentPartner[]>({
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

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? rows.filter((r) =>
          (r.name + " " + (r.location ?? "") + " " + (r.domain ?? ""))
            .toLowerCase()
            .includes(q),
        )
      : rows.slice();
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [rows, search]);

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
      <AdminFrame active="fulfillment">
        <div className="py-20 text-center text-slate-500">
          You need to be signed in as an admin to view this page.
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="fulfillment">
      <div className="space-y-5">
        <AdminPageHeader
          title="Fulfillment partners"
          subtitle="Warehouses that ship finished records to fans."
          actions={
            <>
              {searchOpen ? (
                <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2.5 h-9">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search partners"
                    className="w-44 text-sm bg-transparent outline-none placeholder:text-slate-400"
                    data-testid="input-search-fulfillment"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setSearchOpen(false);
                    }}
                    className="text-slate-400 hover:text-slate-700"
                    aria-label="Close search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="h-9 w-9 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center justify-center transition-colors"
                  aria-label="Search"
                  data-testid="button-open-search"
                >
                  <Search className="w-4 h-4" />
                </button>
              )}
              <ViewModeToggle
                value={view}
                onChange={setView}
                testIdPrefix="view-mode-fulfillment"
              />
              <AddEntityButton
                label="Add partner"
                onClick={() => setAddOpen(true)}
                testId="button-add-fulfillment"
              />
            </>
          }
        />

        {isLoading ? (
          <div className="py-10 text-slate-500 text-sm">Loading…</div>
        ) : rowsError ? (
          <ErrorState
            error={rowsErrorObj}
            onRetry={() => refetchRows()}
            title="Couldn't load fulfillment partners"
            testId="admin-fulfillment-error"
          />
        ) : filtered.length === 0 ? (
          <div
            className="py-16 flex flex-col items-center justify-center text-center"
            data-testid="empty-fulfillment"
          >
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
              <Truck className="w-6 h-6" />
            </div>
            <p className="text-slate-700 text-sm font-semibold">
              {search.trim() ? "No matches" : "No fulfillment partners yet"}
            </p>
            <p className="text-slate-400 text-xs mt-1 max-w-xs">
              {search.trim()
                ? "Try a different name or location."
                : "Add a warehouse to ship orders from."}
            </p>
          </div>
        ) : view === "grid" ? (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            data-testid="grid-fulfillment"
          >
            {filtered.map((f) => (
              <PartnerCard key={f.id} partner={f} />
            ))}
          </div>
        ) : (
          <div
            className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden"
            data-testid="list-fulfillment"
          >
            {filtered.map((f) => (
              <PartnerRow key={f.id} partner={f} />
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
            className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:border-[var(--brand-blue)]"
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

function PartnerCard({ partner }: { partner: FulfillmentPartner }) {
  return (
    <Link
      href={`/admin/fulfillment-partners/${partner.id}`}
      className="group text-left rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-[var(--brand-blue)]/30 transition-all p-4 flex items-center gap-3.5"
      data-testid={`card-fulfillment-${partner.id}`}
    >
      <div className="w-14 h-14 rounded-xl overflow-hidden bg-white ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
        {partner.logoUrl ? (
          <img src={partner.logoUrl} alt={partner.name} className="w-full h-full object-cover" />
        ) : (
          <Truck className="w-6 h-6 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-slate-900 text-sm font-semibold leading-tight truncate"
          data-testid={`text-fulfillment-name-${partner.id}`}
        >
          {partner.name}
        </div>
        <div className="text-slate-400 text-xs truncate mt-0.5">
          {partner.location || partner.shippingAddress || partner.domain || "—"}
        </div>
      </div>
    </Link>
  );
}

function PartnerRow({ partner }: { partner: FulfillmentPartner }) {
  return (
    <Link
      href={`/admin/fulfillment-partners/${partner.id}`}
      className="block px-4 py-3 hover:bg-slate-50 transition-colors"
      data-testid={`row-fulfillment-${partner.id}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-white ring-1 ring-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
          {partner.logoUrl ? (
            <img src={partner.logoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <Truck className="w-5 h-5 text-slate-400" strokeWidth={1.5} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-slate-900 text-sm font-medium truncate"
            data-testid={`text-fulfillment-name-${partner.id}`}
          >
            {partner.name}
          </div>
          <div className="text-slate-500 text-xs truncate">
            {partner.location || partner.shippingAddress || partner.domain || "—"}
          </div>
        </div>
      </div>
    </Link>
  );
}
