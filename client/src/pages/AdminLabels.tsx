import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, X, Tag, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionDashboard } from "@/components/admin/AdminSectionDashboard";
import {
  ViewModeToggle,
  useViewMode,
} from "@/components/admin/ViewModeToggle";
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

// apiRequest throws errors shaped like `"502: {\"message\":\"…\"}"` — strip
// the status prefix and unwrap the JSON `message` so inline dialog errors
// read like English instead of like a stack trace. Mirrors AdminVendors.
function humanizeApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (!raw) {
    return "Couldn't read that page. Try the URL again, or Skip to create a blank entry.";
  }
  const m = raw.match(/^\d{3}:\s*(.*)$/);
  const body = m ? m[1] : raw;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    /* not JSON — fall through */
  }
  return body.trim() || raw;
}

// Parse an apiRequest error and recover the duplicate-label payload the
// backend returns on 409, so the "already added" inline notice can deep-
// link to the existing label instead of just showing a generic error.
function extractDuplicateLabel(err: unknown): LabelLite | null {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = raw.match(/^409:\s*(.*)$/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (parsed && parsed.label && typeof parsed.label.id === "string") {
      return parsed.label as LabelLite;
    }
  } catch {
    /* not JSON — fall through */
  }
  return null;
}

/**
 * Admin home · Labels (Phase 6f).
 *
 * One row per record label / imprint. Each album.labelId points at one
 * of these (SET NULL on delete, so removing a label leaves releases
 * intact with cleared credit). Edit once and it propagates to every
 * album that references this label.
 *
 * "Add Label" opens a paste-URL dialog (mirrors AdminVendors). Paste a
 * label's website and the server scraper prefills name / domain / logo
 * / bio. "Skip — create blank" still works for hand entry.
 */
interface LabelLite {
  id: string;
  name: string;
  domain: string | null;
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

  // Paste-URL "Add Label" dialog state. Mirrors AdminVendors so the
  // operator's muscle memory carries over between Vendors and Labels.
  const [addOpen, setAddOpen] = useState(false);
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [duplicateLabel, setDuplicateLabel] = useState<LabelLite | null>(null);

  const createLabel = useMutation({
    mutationFn: async (opts: { url?: string }) => {
      let payload: Record<string, unknown> = { name: "New label" };
      let scrapedName: string | null = null;
      const trimmedUrl = (opts.url ?? "").trim();
      if (trimmedUrl) {
        const sr = await apiRequest("POST", "/api/admin/labels/scrape", {
          url: trimmedUrl,
        });
        const scraped = (await sr.json()) as {
          name: string | null;
          domain: string | null;
          logoUrl: string | null;
          bio: string | null;
          websiteUrl: string | null;
        };
        scrapedName = scraped.name;
        payload = {
          name: scraped.name || "New label",
          ...(scraped.domain ? { domain: scraped.domain } : {}),
          ...(scraped.logoUrl ? { logoUrl: scraped.logoUrl } : {}),
          ...(scraped.bio ? { bio: scraped.bio } : {}),
          ...(scraped.websiteUrl ? { websiteUrl: scraped.websiteUrl } : {}),
        };
      }
      const res = await apiRequest("POST", "/api/admin/labels", payload);
      const label = (await res.json()) as LabelLite;
      return { label, scrapedName };
    },
    onSuccess: ({ label, scrapedName }) => {
      queryClient.setQueryData<LabelLite[]>(["/api/labels"], (old) =>
        old ? (old.some((x) => x.id === label.id) ? old : [...old, label]) : [label],
      );
      queryClient.invalidateQueries({ queryKey: ["/api/labels"] });
      setAddOpen(false);
      setPasteUrl("");
      setPasteError(null);
      setDuplicateLabel(null);
      if (scrapedName) {
        toast({
          title: `Pulled "${scrapedName}"`,
          description: "Review and edit on the detail page.",
        });
      }
      navigate(`/admin/labels/${label.id}`);
    },
    onError: (err: any) => {
      const dup = extractDuplicateLabel(err);
      if (dup) {
        setDuplicateLabel(dup);
        setPasteError(null);
      } else {
        setDuplicateLabel(null);
        setPasteError(humanizeApiError(err));
      }
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

  const {
    data: labels = [],
    isLoading,
    isError: labelsError,
    error: labelsErrorObj,
    refetch: refetchLabels,
  } = useQuery<LabelLite[]>({
    queryKey: ["/api/labels"],
    enabled: !!user?.isAdmin,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? labels.filter(
          (l) =>
            l.name.toLowerCase().includes(q) ||
            (l.location ?? "").toLowerCase().includes(q) ||
            (l.domain ?? "").toLowerCase().includes(q),
        )
      : labels.slice();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [labels, search]);

  const openLabel = (id: string) => navigate(`/admin/labels/${id}`);

  const openNewLabel = () => {
    if (createLabel.isPending) return;
    setPasteError(null);
    setDuplicateLabel(null);
    setPasteUrl("");
    setAddOpen(true);
  };

  const submitPaste = () => {
    if (createLabel.isPending) return;
    const u = pasteUrl.trim();
    if (!u) {
      setPasteError("Paste a label URL, or click Skip to create a blank entry.");
      return;
    }
    if (!/^https?:\/\//i.test(u)) {
      setPasteError("URL must start with http:// or https://");
      return;
    }
    setPasteError(null);
    setDuplicateLabel(null);
    createLabel.mutate({ url: u });
  };

  const skipPaste = () => {
    if (createLabel.isPending) return;
    setPasteError(null);
    setDuplicateLabel(null);
    createLabel.mutate({});
  };

  if (authLoading) {
    return (
      <AdminFrame active="labels">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
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
      <AdminSectionDashboard section="labels" />
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
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : labelsError ? (
        <ErrorState
          error={labelsErrorObj}
          onRetry={() => refetchLabels()}
          title="Couldn't load labels"
          testId="admin-labels-error"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          searching={search.trim().length > 0}
          onAdd={openNewLabel}
        />
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

      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (createLabel.isPending) return;
          setAddOpen(o);
          if (!o) {
            setPasteUrl("");
            setPasteError(null);
            setDuplicateLabel(null);
          }
        }}
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-add-label"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900">
              Add label
            </DialogTitle>
            <DialogDescription className="text-[13px] text-slate-500 leading-relaxed">
              Paste a label's website — we'll prefill name, domain, logo,
              and bio from the page's Open Graph metadata.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-1">
            <input
              type="url"
              value={pasteUrl}
              onChange={(e) => {
                setPasteUrl(e.target.value);
                if (pasteError) setPasteError(null);
                if (duplicateLabel) setDuplicateLabel(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitPaste();
                }
              }}
              placeholder="https://www.bluenote.com/"
              autoFocus
              disabled={createLabel.isPending}
              className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-[13.5px] outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20 disabled:opacity-50"
              data-testid="input-add-label-url"
            />
            {duplicateLabel && (
              <div
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900"
                data-testid="text-add-label-duplicate"
              >
                <span className="font-semibold">{duplicateLabel.name}</span> is
                already in your Labels list.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    openLabel(duplicateLabel.id);
                  }}
                  className="underline underline-offset-2 hover:text-[var(--brand-blue)] transition-colors font-semibold"
                  data-testid="button-open-existing-label"
                >
                  Open it →
                </button>
              </div>
            )}
            {pasteError && (
              <p
                className="text-[12px] text-red-600"
                data-testid="text-add-label-error"
              >
                {pasteError}
              </p>
            )}
            <p className="text-[11.5px] text-slate-400">
              Reads the page's Open Graph metadata. Instagram and Facebook
              pages aren't supported — paste the label's own website
              instead.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={skipPaste}
              disabled={createLabel.isPending}
              className="px-3 py-1.5 rounded-md text-[12.5px] font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              data-testid="button-add-label-skip"
            >
              Skip — create blank
            </button>
            <Button
              type="button"
              onClick={submitPaste}
              disabled={createLabel.isPending || !pasteUrl.trim()}
              size="sm"
              className="text-[12.5px] font-semibold"
              data-testid="button-add-label-pull"
            >
              {createLabel.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              {createLabel.isPending ? "Reading…" : "Pull from URL"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
      className="group text-left rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-[var(--brand-blue)]/30 transition-all p-4 flex items-center gap-3.5"
      data-testid={`card-label-${label.id}`}
    >
      <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
        {label.logoUrl ? (
          <img
            src={label.logoUrl}
            alt={label.name}
            className="w-full h-full object-cover"
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
        {(label.domain || label.location) && (
          <div className="text-slate-400 text-[11.5px] truncate mt-0.5">
            {label.domain || label.location}
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
            className="w-full h-full object-cover"
          />
        ) : (
          <Tag className="w-4 h-4 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-slate-900 text-[13.5px] font-semibold truncate group-hover:text-[var(--brand-blue)] transition-colors"
          data-testid={`text-label-name-${label.id}`}
        >
          {label.name}
        </div>
        {label.domain && (
          <div className="text-slate-400 text-[11.5px] truncate">
            {label.domain}
          </div>
        )}
      </div>
      {label.location && (
        <div className="text-slate-400 text-[11.5px] truncate flex-shrink-0">
          {label.location}
        </div>
      )}
    </button>
  );
}

function EmptyState({
  searching,
  onAdd,
}: {
  searching: boolean;
  onAdd: () => void;
}) {
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
          ? "Try a different name or domain."
          : "Paste a label's website and we'll do the rest — name, logo, and bio in one click."}
      </p>
      {!searching && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 inline-flex items-center justify-center h-9 px-3.5 rounded-md text-[12.5px] font-semibold bg-[var(--brand-blue)] text-white hover:bg-[#2789bf] transition-colors"
          data-testid="button-empty-add-label"
        >
          Add your first label
        </button>
      )}
    </div>
  );
}
