import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, X, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";

/**
 * Admin home · People (Phase 6a — first non-Albums entity in the new frame).
 *
 * Mirrors AdminAlbums: AdminFrame chrome, search affordance, grid view.
 * People don't have a release lifecycle so there are no tabs — just one
 * scrollable grid of avatar cards. Click → deep-link into the classic
 * admin's per-person editor (same staged-migration pattern Albums used:
 * list page first, per-person detail page later).
 */
interface PersonLite {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  labelId: string | null;
}

interface LabelLite {
  id: string;
  name: string;
}

export function AdminPeople() {
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

  const { data: people = [], isLoading } = useQuery<PersonLite[]>({
    queryKey: ["/api/people"],
    enabled: !!user?.isAdmin,
  });
  const { data: labels = [] } = useQuery<LabelLite[]>({
    queryKey: ["/api/labels"],
    enabled: !!user?.isAdmin,
  });

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of labels) m.set(l.id, l.name);
    return m;
  }, [labels]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? people.filter((p) => p.name.toLowerCase().includes(q))
      : people.slice();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [people, search]);

  const openPerson = (id: string) => {
    navigate(`/admin/people/${id}`);
  };

  const openNewPerson = () => {
    try {
      localStorage.setItem("gt:admin:entity", "people");
      localStorage.setItem("gt:admin:new", "person");
    } catch {}
    navigate("/admin");
  };

  if (authLoading) {
    return (
      <AdminFrame active="people">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }

  if (!user?.isAdmin) {
    return (
      <AdminFrame active="people">
        <div className="py-20 text-center text-slate-500">
          You need to be signed in as an admin to view this page.
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="people">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1
            className="text-slate-900 text-2xl font-bold tracking-tight"
            data-testid="text-page-title"
          >
            People
          </h1>
          <p className="text-slate-500 text-[13px] mt-0.5">
            Artists, performers, writers, and producers — the SuperCredits™
            catalog.
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
                placeholder="Search people"
                className="w-44 text-[13px] bg-transparent outline-none placeholder:text-slate-400"
                data-testid="input-search-people"
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
              className="h-9 w-9 rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 inline-flex items-center justify-center"
              aria-label="Search"
              data-testid="button-open-search"
            >
              <Search className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={openNewPerson}
            className="h-9 px-3 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5"
            data-testid="button-new-person"
          >
            <Plus className="w-4 h-4" />
            New person
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
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6"
          data-testid="grid-people"
        >
          {filtered.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              labelName={p.labelId ? labelById.get(p.labelId) ?? null : null}
              onOpen={() => openPerson(p.id)}
            />
          ))}
        </div>
      )}

    </AdminFrame>
  );
}

function PersonCard({
  person,
  labelName,
  onOpen,
}: {
  person: PersonLite;
  labelName: string | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left flex flex-col items-center"
      data-testid={`card-person-${person.id}`}
    >
      <div className="relative w-full aspect-square rounded-full overflow-hidden bg-[#319ED8] ring-1 ring-slate-200 shadow-sm group-hover:shadow-md group-hover:ring-[#319ED8]/30 transition-all">
        {person.photoUrl ? (
          <img
            src={person.photoUrl}
            alt={person.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-white text-3xl font-bold">
              {initialFor(person.name)}
            </span>
          </div>
        )}
      </div>
      <div
        className="mt-3 w-full text-center text-slate-900 text-[13px] font-semibold truncate px-1"
        data-testid={`text-person-name-${person.id}`}
      >
        {person.name}
      </div>
      <div className="w-full text-center text-slate-400 text-[11.5px] truncate px-1">
        {labelName || "Independent"}
      </div>
    </button>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div
      className="py-16 flex flex-col items-center justify-center text-center"
      data-testid="empty-people"
    >
      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
        <UserIcon className="w-6 h-6" />
      </div>
      <p className="text-slate-700 text-[14px] font-semibold">
        {searching ? "No people match that search" : "No people yet"}
      </p>
      <p className="text-slate-400 text-[12.5px] mt-1 max-w-xs">
        {searching
          ? "Try a different name."
          : "Add an artist, performer, writer, or producer to start building the SuperCredits™ catalog."}
      </p>
    </div>
  );
}

function initialFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}
