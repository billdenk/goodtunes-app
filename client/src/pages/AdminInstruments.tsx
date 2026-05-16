import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, X, Guitar, Store } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";

/**
 * Admin home · Gear (Phase 6c).
 *
 * Mirrors AdminPeople / AdminAlbums: AdminFrame chrome + search +
 * grid of cards. Each instrument has its photo, name, short category,
 * and a small vendor count chip (the connective tissue to
 * SuperCredits™ Micro-Sponsorships — see roadmap).
 *
 * Click → opens the per-instrument detail page (next phase). Today the
 * detail page also defers full vendor editing to the classic admin —
 * same staged-migration cadence Albums + People used.
 */
interface InstrumentLite {
  id: string;
  name: string;
  category: string;
  shortCategory: string | null;
  photoUrl: string | null;
  vendors: unknown[];
}

export function AdminInstruments() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const { data: instruments = [], isLoading } = useQuery<InstrumentLite[]>({
    queryKey: ["/api/instruments"],
    enabled: !!user?.isAdmin,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? instruments.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.category.toLowerCase().includes(q),
        )
      : instruments.slice();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [instruments, search]);

  const openInstrument = (id: string) => {
    navigate(`/admin/instruments/${id}`);
  };

  const openNewInstrument = () => {
    try {
      localStorage.setItem("gt:admin:entity", "gear");
      localStorage.setItem("gt:admin:new", "instrument");
    } catch {}
    navigate("/admin");
  };

  if (authLoading) {
    return (
      <AdminFrame active="gear">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }

  if (!user?.isAdmin) {
    return (
      <AdminFrame active="gear">
        <div className="py-20 text-center text-slate-500">
          You need to be signed in as an admin to view this page.
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="gear">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1
            className="text-slate-900 text-2xl font-bold tracking-tight"
            data-testid="text-page-title"
          >
            Gear
          </h1>
          <p className="text-slate-500 text-[13px] mt-0.5">
            Gear + per-gear vendor links — the SuperCredits™
            Micro-Sponsorship surface.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {searchOpen ? (
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2.5 h-9">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search gear"
                className="w-44 text-[13px] bg-transparent outline-none placeholder:text-slate-400"
                data-testid="input-search-instruments"
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
          <button
            type="button"
            onClick={openNewInstrument}
            className="h-9 px-3 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5"
            data-testid="button-new-instrument"
          >
            <Plus className="w-4 h-4" />
            New gear
          </button>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState searching={search.trim().length > 0} />
      ) : (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6"
          data-testid="grid-instruments"
        >
          {filtered.map((i) => (
            <InstrumentCard
              key={i.id}
              instrument={i}
              onOpen={() => openInstrument(i.id)}
            />
          ))}
        </div>
      )}
    </AdminFrame>
  );
}

function InstrumentCard({
  instrument,
  onOpen,
}: {
  instrument: InstrumentLite;
  onOpen: () => void;
}) {
  const vendorCount = instrument.vendors?.length ?? 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left flex flex-col"
      data-testid={`card-instrument-${instrument.id}`}
    >
      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-100 ring-1 ring-slate-200 shadow-sm group-hover:shadow-md group-hover:ring-[#319ED8]/30 transition-all">
        {instrument.photoUrl ? (
          <img
            src={instrument.photoUrl}
            alt={instrument.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <Guitar className="w-10 h-10" />
          </div>
        )}
        {vendorCount > 0 && (
          <div
            className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/90 backdrop-blur-sm text-slate-700 text-[10.5px] font-bold shadow"
            data-testid={`badge-vendor-count-${instrument.id}`}
          >
            <Store className="w-3 h-3" />
            {vendorCount}
          </div>
        )}
      </div>
      <div
        className="mt-2 text-slate-900 text-[13px] font-semibold leading-snug line-clamp-2"
        data-testid={`text-instrument-name-${instrument.id}`}
      >
        {instrument.name}
      </div>
      <div className="text-slate-400 text-[11.5px] truncate">
        {instrument.shortCategory || instrument.category}
      </div>
    </button>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div
      className="py-16 flex flex-col items-center justify-center text-center"
      data-testid="empty-instruments"
    >
      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
        <Guitar className="w-6 h-6" />
      </div>
      <p className="text-slate-700 text-[14px] font-semibold">
        {searching ? "No gear matches that search" : "No gear yet"}
      </p>
      <p className="text-slate-400 text-[12.5px] mt-1 max-w-xs">
        {searching
          ? "Try a different name or category."
          : "Add a guitar, amp, mic, or anything else artists play on — each can carry its own vendor links."}
      </p>
    </div>
  );
}
