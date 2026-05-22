import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, Factory, Clock, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
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

// apiRequest throws errors shaped like `"502: {\"message\":\"…\"}"` — strip
// the status prefix and unwrap the JSON `message` so inline dialog errors
// read like English. Mirrors AdminLabels / AdminVendors.
function humanizeApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (!raw) {
    return "Couldn't read that page. Try the URL again, or use a plant name to create a blank entry.";
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

// Recover the duplicate-manufacturer payload the backend returns on 409
// so the "already added" inline notice can deep-link to the existing
// plant instead of just showing a generic error. Mirrors AdminLabels.
function extractDuplicateManufacturer(err: unknown): Manufacturer | null {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = raw.match(/^409:\s*(.*)$/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (parsed && parsed.manufacturer && typeof parsed.manufacturer.id === "string") {
      return parsed.manufacturer as Manufacturer;
    }
  } catch {
    /* not JSON — fall through */
  }
  return null;
}

/**
 * Admin · Manufacturers (Task #69). One row per pressing plant. Each
 * manufacturer can be invited to bid on RFQs (see AdminAlbum.RFQ
 * section, follow-up) and is the awarded plant for any album whose
 * print run was assigned to them.
 *
 * "Add manufacturer" accepts either a plant name *or* a website URL —
 * pasting a URL triggers the server scraper (mirrors Labels/Vendors/Gear)
 * so the record lands with name, domain, logo, cover, bio, and location
 * already filled in.
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
  const [draftInput, setDraftInput] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Manufacturer | null>(null);
  const { toast } = useToast();

  const {
    data: rows = [],
    isLoading,
    isError: rowsError,
    error: rowsErrorObj,
    refetch: refetchRows,
  } = useQuery<Manufacturer[]>({
    queryKey: ["/api/manufacturers"],
    enabled: !!user?.isAdmin,
  });

  const create = useMutation({
    mutationFn: async (input: string) => {
      const trimmed = input.trim();
      let payload: Record<string, unknown> = { name: trimmed };
      let scrapedName: string | null = null;
      if (/^https?:\/\//i.test(trimmed)) {
        const sr = await apiRequest("POST", "/api/admin/manufacturers/scrape", { url: trimmed });
        const scraped = (await sr.json()) as {
          name: string | null;
          domain: string | null;
          logoUrl: string | null;
          coverUrl: string | null;
          bio: string | null;
          location: string | null;
          websiteUrl: string | null;
        };
        scrapedName = scraped.name;
        payload = {
          name: scraped.name || new URL(trimmed).hostname.replace(/^www\./, ""),
          ...(scraped.domain ? { domain: scraped.domain } : {}),
          ...(scraped.logoUrl ? { logoUrl: scraped.logoUrl } : {}),
          ...(scraped.coverUrl ? { coverUrl: scraped.coverUrl } : {}),
          ...(scraped.bio ? { bio: scraped.bio } : {}),
          ...(scraped.location ? { location: scraped.location } : {}),
          ...(scraped.websiteUrl ? { websiteUrl: scraped.websiteUrl } : {}),
        };
      }
      const r = await apiRequest("POST", "/api/admin/manufacturers", payload);
      const m = (await r.json()) as Manufacturer;
      return { m, scrapedName };
    },
    onSuccess: ({ m, scrapedName }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      setAddOpen(false);
      setDraftInput("");
      setPasteError(null);
      setDuplicate(null);
      if (scrapedName) {
        toast({
          title: `Pulled "${scrapedName}"`,
          description: "Review and edit on the detail page.",
        });
      }
      navigate(`/admin/manufacturers/${m.id}`);
    },
    onError: (err: any) => {
      const dup = extractDuplicateManufacturer(err);
      if (dup) {
        setDuplicate(dup);
        setPasteError(null);
      } else {
        setDuplicate(null);
        setPasteError(humanizeApiError(err));
      }
    },
  });

  const submit = () => {
    if (create.isPending) return;
    const trimmed = draftInput.trim();
    if (!trimmed) {
      setPasteError("Enter a plant name or paste their website URL.");
      return;
    }
    setPasteError(null);
    setDuplicate(null);
    create.mutate(trimmed);
  };

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

  const inputLooksLikeUrl = /^https?:\/\//i.test(draftInput.trim());

  return (
    <AdminFrame active="manufacturers">
      <div className="space-y-5">
        <AdminPageHeader
          title="Presses"
          subtitle="Vinyl pressing plants and duplication houses. Invite them to bid on print runs."
          actions={
            <AddEntityButton
              label="Add press"
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
        ) : rowsError ? (
          <ErrorState
            error={rowsErrorObj}
            onRetry={() => refetchRows()}
            title="Couldn't load presses"
            testId="admin-manufacturers-error"
          />
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
            <Factory className="w-8 h-8 mx-auto text-slate-300 mb-2" strokeWidth={1.5} />
            <div className="text-slate-700 font-medium">No presses yet</div>
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

      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (create.isPending) return;
          setAddOpen(o);
          if (!o) {
            setDraftInput("");
            setPasteError(null);
            setDuplicate(null);
          }
        }}
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-add-manufacturer"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900">
              Add press
            </DialogTitle>
            <DialogDescription className="text-[13px] text-slate-500 leading-relaxed">
              Paste the plant's website — we'll prefill name, domain, logo,
              cover, and bio from the page's Open Graph metadata. Or just
              type the name to create a blank entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-1">
            <input
              autoFocus
              value={draftInput}
              onChange={(e) => {
                setDraftInput(e.target.value);
                if (pasteError) setPasteError(null);
                if (duplicate) setDuplicate(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="https://memphisrecordpressing.com  or  Pirates Press"
              disabled={create.isPending}
              className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-[13.5px] outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20 disabled:opacity-50"
              data-testid="input-new-manufacturer-name"
            />
            {duplicate && (
              <div
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900"
                data-testid="text-add-manufacturer-duplicate"
              >
                <span className="font-semibold">{duplicate.name}</span> is
                already in your Presses list.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    navigate(`/admin/manufacturers/${duplicate.id}`);
                  }}
                  className="underline underline-offset-2 hover:text-[var(--brand-blue)] transition-colors font-semibold"
                  data-testid="button-open-existing-manufacturer"
                >
                  Open it →
                </button>
              </div>
            )}
            {pasteError && (
              <p
                className="text-[12px] text-red-600"
                data-testid="text-add-manufacturer-error"
              >
                {pasteError}
              </p>
            )}
            <p className="text-[11.5px] text-slate-400">
              {inputLooksLikeUrl
                ? "Reads the page's Open Graph metadata and rehosts the logo + cover."
                : "Paste an https:// URL to auto-fill, or enter a name to create blank."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={!draftInput.trim() || create.isPending}
              data-testid="button-confirm-add-manufacturer"
            >
              {create.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {create.isPending
                ? inputLooksLikeUrl
                  ? "Reading…"
                  : "Adding…"
                : inputLooksLikeUrl
                  ? "Pull from URL"
                  : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminFrame>
  );
}
