import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, X, Tag } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ViewModeToggle,
  useViewMode,
} from "@/components/admin/ViewModeToggle";
import { AddEntityButton } from "@/components/admin/AddEntityButton";

/**
 * Admin home · Labels (Phase 6f).
 *
 * One row per record label / imprint. Each album.labelId points at one
 * of these (SET NULL on delete, so removing a label leaves releases
 * intact with cleared credit). Edit once and it propagates to every
 * album that references this label.
 */
interface LabelLite {
  id: string;
  name: string;
  logoUrl: string | null;
  location: string | null;
}

export function AdminLabels() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useViewMode("labels");
  const { toast } = useToast();

  // Create-then-route, mirroring AdminAlbums. Backend only requires
  // `name`, so we POST a placeholder the admin renames on the detail page.
  const createLabel = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/labels", {
        name: "New label",
      });
      return res.json() as Promise<LabelLite>;
    },
    onSuccess: (l) => {
      queryClient.setQueryData<LabelLite[]>(["/api/labels"], (old) =>
        old ? (old.some((x) => x.id === l.id) ? old : [...old, l]) : [l],
      );
      queryClient.invalidateQueries({ queryKey: ["/api/labels"] });
      navigate(`/admin/labels/${l.id}`);
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't create label",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const { data: labels = [], isLoading } = useQuery<LabelLite[]>({
    queryKey: ["/api/labels"],
    enabled: !!user?.isAdmin,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? labels.filter(
          (l) =>
            l.name.toLowerCase().includes(q) ||
            (l.location ?? "").toLowerCase().includes(q),
        )
      : labels.slice();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [labels, search]);

  const openLabel = (id: string) => navigate(`/admin/labels/${id}`);

  const openNewLabel = () => {
    if (createLabel.isPending) return;
    createLabel.mutate();
  };

  if (authLoading) {
    return (
      <AdminFrame active="labels">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }

  if (!user?.isAdmin) {
    return (
      <AdminFrame active="labels">
        <div className="py-20 text-center text-slate-500">
          You need to be signed in as an admin to view this page.
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="labels">
      <div className="space-y-5">
      <AdminPageHeader
        title="Labels"
        subtitle="Record labels + imprints. Albums link here, so edit once and it reads through everywhere."
        actions={(<>
          {searchOpen ? (
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2.5 h-9">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search labels"
                className="w-44 text-[13px] bg-transparent outline-none placeholder:text-slate-400"
                data-testid="input-search-labels"
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
            testIdPrefix="view-mode-labels"
          />
          <AddEntityButton
            label="Add Label"
            onClick={openNewLabel}
            disabled={createLabel.isPending}
            testId="button-new-label"
          />
        </>)}
      />

      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState searching={search.trim().length > 0} />
      ) : view === "grid" ? (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          data-testid="grid-labels"
        >
          {filtered.map((l) => (
            <LabelCard key={l.id} label={l} onOpen={() => openLabel(l.id)} />
          ))}
        </div>
      ) : (
        <div
          className="rounded-lg border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100"
          data-testid="list-labels"
        >
          {filtered.map((l) => (
            <LabelRow key={l.id} label={l} onOpen={() => openLabel(l.id)} />
          ))}
        </div>
      )}
      </div>
    </AdminFrame>
  );
}

function LabelCard({
  label,
  onOpen,
}: {
  label: LabelLite;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-[#319ED8]/30 transition-all p-4 flex items-center gap-3.5"
      data-testid={`card-label-${label.id}`}
    >
      <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
        {label.logoUrl ? (
          <img
            src={label.logoUrl}
            alt={label.name}
            className="w-full h-full object-contain p-1.5"
          />
        ) : (
          <Tag className="w-6 h-6 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-slate-900 text-[14px] font-semibold leading-tight truncate"
          data-testid={`text-label-name-${label.id}`}
        >
          {label.name}
        </div>
        {label.location && (
          <div className="text-slate-400 text-[11.5px] truncate mt-0.5">
            {label.location}
          </div>
        )}
      </div>
    </button>
  );
}

function LabelRow({
  label,
  onOpen,
}: {
  label: LabelLite;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-slate-50 transition-colors"
      data-testid={`row-label-${label.id}`}
    >
      <div className="w-10 h-10 rounded-md overflow-hidden bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
        {label.logoUrl ? (
          <img
            src={label.logoUrl}
            alt={label.name}
            className="w-full h-full object-contain p-1"
          />
        ) : (
          <Tag className="w-4 h-4 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-slate-900 text-[13.5px] font-semibold truncate group-hover:text-[#319ED8] transition-colors"
          data-testid={`text-label-name-${label.id}`}
        >
          {label.name}
        </div>
      </div>
      {label.location && (
        <div className="text-slate-400 text-[11.5px] truncate flex-shrink-0">
          {label.location}
        </div>
      )}
    </button>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div
      className="py-16 flex flex-col items-center justify-center text-center"
      data-testid="empty-labels"
    >
      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
        <Tag className="w-6 h-6" />
      </div>
      <p className="text-slate-700 text-[14px] font-semibold">
        {searching ? "No labels match that search" : "No labels yet"}
      </p>
      <p className="text-slate-400 text-[12.5px] mt-1 max-w-xs">
        {searching
          ? "Try a different name or location."
          : "Add a label the first time you assign one to an album."}
      </p>
    </div>
  );
}
