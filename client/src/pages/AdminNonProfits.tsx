import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

function humanizeApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = raw.match(/^\d{3}:\s*(.*)$/);
  if (m) {
    try {
      const body = JSON.parse(m[1]);
      if (body?.message) return String(body.message);
    } catch { /* fall through */ }
    return m[1];
  }
  return raw || "Something went wrong.";
}

// Task #230 — Lightweight NPO directory so the new "NPOs" sidebar entry
// has a meaningful landing page. The per-NPO detail surface
// (AdminNonProfit) already exists; this is just the index.
//
// "Add NPO" mirrors the paste-URL pattern used by AdminVendors — paste
// the NPO's main site, the server scraper prefills name + logo +
// website, we save immediately and navigate to the detail page where
// the operator attaches one or more People as contacts. Scraping reuses
// the generic vendor scraper (`/api/admin/vendors/scrape`) because it's
// site-agnostic page-metadata extraction; no NPO-specific shape.
type NonProfit = {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
};

type ScrapeResult = {
  name: string | null;
  domain: string | null;
  homeUrl: string | null;
  logoUrl: string | null;
};

export function AdminNonProfits() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: rows = [], isLoading } = useQuery<NonProfit[]>({
    queryKey: ["/api/non-profits"],
  });

  const [addOpen, setAddOpen] = useState(false);
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  const createNpo = useMutation({
    mutationFn: async (opts: { url?: string }) => {
      let payload: Record<string, unknown> = { name: "New NPO" };
      let scrapedName: string | null = null;
      const trimmed = (opts.url ?? "").trim();
      if (trimmed) {
        const sr = await apiRequest("POST", "/api/admin/vendors/scrape", { url: trimmed });
        const scraped = (await sr.json()) as ScrapeResult;
        scrapedName = scraped.name;
        payload = {
          name: scraped.name || "New NPO",
          ...(scraped.homeUrl ? { websiteUrl: scraped.homeUrl } : {}),
          ...(scraped.logoUrl ? { logoUrl: scraped.logoUrl } : {}),
        };
      }
      const res = await apiRequest("POST", "/api/non-profits", payload);
      const npo = (await res.json()) as NonProfit;
      return { npo, scrapedName };
    },
    onSuccess: ({ npo, scrapedName }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-profits"] });
      setAddOpen(false);
      setPasteUrl("");
      setPasteError(null);
      if (scrapedName) {
        toast({ title: `Pulled "${scrapedName}"`, description: "Review and add contacts on the detail page." });
      }
      navigate(`/admin/non-profits/${npo.id}`);
    },
    onError: (err) => setPasteError(humanizeApiError(err)),
  });

  function submitPaste(e: React.FormEvent) {
    e.preventDefault();
    if (createNpo.isPending) return;
    setPasteError(null);
    const url = pasteUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      setPasteError("Paste a full https:// URL.");
      return;
    }
    createNpo.mutate({ url: url || undefined });
  }

  return (
    <AdminFrame active="nonprofits">
      <div className="space-y-5" data-testid="page-admin-nonprofits">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">NPOs</h1>
            <p className="text-sm text-slate-500">
              Non-profit partners. Each referrer earns $1 per paid unit
              attributed to them.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 tabular-nums">
              {rows.length} {rows.length === 1 ? "partner" : "partners"}
            </span>
            <Button
              size="sm"
              onClick={() => { setPasteUrl(""); setPasteError(null); setAddOpen(true); }}
              data-testid="button-open-add-npo"
            >
              Add NPO
            </Button>
          </div>
        </header>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm text-slate-600">No NPO partners yet.</p>
            <p className="text-xs text-slate-500 mt-1">
              Click <span className="font-semibold">Add NPO</span> and paste the org's main website, or invite one from the Invites page.
            </p>
          </div>
        ) : (
          <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
            {rows.map((npo) => (
              <li key={npo.id}>
                <Link href={`/admin/non-profits/${npo.id}`} className="flex items-center gap-4 px-4 py-3 text-inherit hover:bg-slate-50 hover:text-[color:var(--brand-blue)] underline-offset-2 transition-colors" data-testid={`row-npo-${npo.id}`}>
                  {npo.logoUrl ? (
                    <img
                      src={npo.logoUrl}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover bg-slate-100 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-semibold text-slate-900 truncate"
                      data-testid={`text-npo-name-${npo.id}`}
                    >
                      {npo.name}
                    </p>
                    {npo.websiteUrl && (
                      <p className="text-xs text-slate-500 truncate">
                        {npo.websiteUrl.replace(/^https?:\/\//, "")}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={(o) => { if (!createNpo.isPending) setAddOpen(o); }}>
        <DialogContent data-testid="dialog-add-npo">
          <DialogHeader>
            <DialogTitle>Add an NPO</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitPaste} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">NPO website</label>
              <Input
                type="url"
                placeholder="https://example.org"
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
                disabled={createNpo.isPending}
                data-testid="input-add-npo-url"
                autoFocus
              />
              <p className="text-xs text-slate-500 mt-1">
                We'll pull the name, logo, and homepage from the site. You can attach contacts on the next page.
              </p>
            </div>
            {pasteError && (
              <p className="text-xs text-rose-700" data-testid="text-add-npo-error">{pasteError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => { if (!createNpo.isPending) { createNpo.mutate({}); } }}
                disabled={createNpo.isPending}
                data-testid="button-add-npo-skip"
              >
                Skip & create blank
              </Button>
              <Button
                type="submit"
                disabled={createNpo.isPending || !pasteUrl.trim()}
                data-testid="button-add-npo-pull"
              >
                {createNpo.isPending ? "Pulling…" : "Pull from URL"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminFrame>
  );
}
