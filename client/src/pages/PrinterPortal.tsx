// Task #2047 — GoodDeed Quickprinter portal (vendor admin shell).
//
// Six-tab light partner shell for `is_quickprinter` vendors. Replaces the
// legacy GoodDeed-Services-only vendor shell when the signed-in vendor is
// flagged as a quickprinter (routed via VendorScopeRouter in VendorPortal).
//
//   Dashboard    — print-focused summary (queue counts + recent printed),
//                  scoped to the certs that route to THIS printer.
//   Print Queue  — the centerpiece. Mirrors the admin Print queue but
//                  scoped to /api/printer/:id/* — list certs by status,
//                  batch-download a merged PDF / ZIP (mixed or per-stock),
//                  override paper size + recipient name, preview a cert,
//                  and flip rows to printed on download.
//   Catalog      — the existing GoodDeed Services pricing editor, relabeled.
//   Albums       — derived, read-only: albums this printer prints for.
//   People & Labels — derived, read-only: who they print for. NOT a roster.
//   Settings     — Profile / Staff / Payouts / Notifications.
//
// This portal never changes cert routing, pricing, or press/reseller/
// fulfillment surfaces — it only reads the slice of work routed to it.

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Printer, Loader2, Disc3, Users } from "lucide-react";
import { apiRequest, queryClient, getAuthToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { OperatorShell } from "@/components/operator/OperatorShell";
import { modulesForRole } from "@/components/operator/registry";
import { DashboardPanel } from "@/components/partner/dashboard-controls";
import { GoodDeedServicesTab } from "@/components/admin/GoodDeedServicesTab";
import { OrganizationPeople } from "@/components/admin/OrganizationPeople";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type TabId = "dashboard" | "print-queue" | "catalog" | "albums" | "people" | "settings";

interface PrinterMe {
  id: string;
  name: string;
  logoUrl: string | null;
  isQuickprinter: boolean;
  canEdit?: boolean;
  isDefaultPrinter?: boolean;
  homeUrl?: string | null;
  tagline?: string | null;
  bio?: string | null;
  location?: string | null;
}

export function PrinterPortal({ vendorId, isSuperAdminView }: { vendorId: string; isSuperAdminView: boolean }) {
  const [tab, setTab] = useState<TabId>("dashboard");
  const { data: me, isLoading } = useQuery<PrinterMe>({
    queryKey: [`/api/printer/${vendorId}/me`],
  });

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[color:var(--brand-blue)] animate-spin" />
      </main>
    );
  }

  const tabs = modulesForRole("printer") as ReadonlyArray<{ id: TabId; label: string }>;

  return (
    <OperatorShell
      testId="printer-shell"
      roleLabel={isSuperAdminView ? "GoodDeed printer (super-admin view)" : "GoodDeed printer"}
      name={me?.name ?? "Your print shop"}
      logoUrl={me?.logoUrl ?? null}
      fallbackIcon={Printer}
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === "dashboard" && <DashboardTab vendorId={vendorId} onGoToQueue={() => setTab("print-queue")} />}
      {tab === "print-queue" && <PrintQueueTab vendorId={vendorId} />}
      {tab === "catalog" && (
        <div className="bg-white text-slate-900 rounded-2xl p-4 sm:p-6 ring-1 ring-slate-200" data-testid="printer-catalog-panel">
          <GoodDeedServicesTab vendorId={vendorId} />
        </div>
      )}
      {tab === "albums" && <AlbumsTab vendorId={vendorId} />}
      {tab === "people" && <PeopleTab vendorId={vendorId} />}
      {tab === "settings" && <SettingsTab vendorId={vendorId} printerName={me?.name ?? ""} />}
    </OperatorShell>
  );
}

// ─── Dashboard tab ──────────────────────────────────────────────────

interface DashboardData {
  isDefaultPrinter: boolean;
  counts: { awaiting: number; confirmed: number; locked_for_print: number; printed: number };
  totalInScope: number;
  recentPrinted: {
    id: string;
    goodDeedNumber: number | null;
    albumTitle: string;
    albumArtist: string;
    confirmedName: string | null;
    printedAt: string | null;
  }[];
}

function DashboardTab({ vendorId, onGoToQueue }: { vendorId: string; onGoToQueue: () => void }) {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: [`/api/printer/${vendorId}/dashboard`],
  });
  if (isLoading) return <PanelLoading />;
  const counts = data?.counts ?? { awaiting: 0, confirmed: 0, locked_for_print: 0, printed: 0 };
  const cards = [
    { label: "Ready to print", value: counts.confirmed, accent: "text-emerald-600" },
    { label: "Awaiting fan", value: counts.awaiting, accent: "text-amber-600" },
    { label: "Locked", value: counts.locked_for_print, accent: "text-indigo-600" },
    { label: "Printed", value: counts.printed, accent: "text-slate-700" },
  ];
  return (
    <div className="space-y-4" data-testid="printer-dashboard">
      {!data?.isDefaultPrinter && data?.totalInScope === 0 && (
        <DashboardPanel padding="md">
          <p className="text-sm text-slate-600" data-testid="text-no-routing">
            No GoodDeed certificates route to your shop yet. When GoodTunes assigns print jobs to you,
            they'll appear here and in your Print Queue automatically.
          </p>
        </DashboardPanel>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <DashboardPanel key={c.label} padding="md">
            <div className={`text-3xl font-bold ${c.accent}`} data-testid={`stat-${c.label.replace(/\s+/g, "-").toLowerCase()}`}>{c.value}</div>
            <div className="text-xs text-slate-500 mt-1">{c.label}</div>
          </DashboardPanel>
        ))}
      </div>
      {counts.confirmed > 0 && (
        <DashboardPanel padding="md">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              <strong className="text-slate-900">{counts.confirmed}</strong> certificate(s) are ready to print right now.
            </p>
            <Button onClick={onGoToQueue} className="rounded-full" data-testid="button-go-to-queue">
              Open Print Queue
            </Button>
          </div>
        </DashboardPanel>
      )}
      <DashboardPanel padding="md">
        <h3 className="text-base font-semibold mb-3">Recently printed</h3>
        {(data?.recentPrinted?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500" data-testid="text-no-recent-printed">Nothing printed yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data!.recentPrinted.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 text-sm" data-testid={`recent-printed-${r.id}`}>
                <div className="min-w-0">
                  <div className="text-slate-900 truncate">{r.confirmedName ?? "—"}</div>
                  <div className="text-slate-500 text-xs truncate">{r.albumTitle} — {r.albumArtist}</div>
                </div>
                <div className="text-slate-400 text-xs whitespace-nowrap">
                  {r.goodDeedNumber !== null ? `#${r.goodDeedNumber}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardPanel>
    </div>
  );
}

// ─── Print Queue tab (centerpiece) ──────────────────────────────────

type QueueRow = {
  id: string;
  nameStatus: "awaiting" | "confirmed" | "locked_for_print" | "printed";
  confirmedIdentityKind: "display" | "username" | "real" | null;
  confirmedName: string | null;
  paperSize: "letter" | "a4";
  paperSizeOverridden: boolean;
  albumTitle: string;
  albumArtist: string;
  albumArtwork: string | null;
  goodDeedNumber: number | null;
  customerEmail: string;
  customerDisplayName: string;
  shippingCountry: string | null;
  origin: string;
};

const QUEUE_TABS: { key: QueueRow["nameStatus"]; label: string }[] = [
  { key: "confirmed", label: "Ready to print" },
  { key: "awaiting", label: "Awaiting fan" },
  { key: "locked_for_print", label: "Locked" },
  { key: "printed", label: "Printed" },
];

const STATUS_PILL: Record<QueueRow["nameStatus"], string> = {
  awaiting: "bg-amber-100 text-amber-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  locked_for_print: "bg-indigo-100 text-indigo-700",
  printed: "bg-slate-100 text-slate-500",
};

function PrintQueueTab({ vendorId }: { vendorId: string }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<QueueRow["nameStatus"]>("confirmed");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const {
    data: rows,
    isLoading,
  } = useQuery<QueueRow[]>({
    queryKey: [`/api/printer/${vendorId}/print-queue`, { status: tab }],
    queryFn: async () => {
      const token = getAuthToken();
      const r = await fetch(`/api/printer/${vendorId}/print-queue?status=${tab}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) {
        let msg = `Request failed (${r.status})`;
        try {
          const body = await r.json();
          if (body?.message) msg = body.message;
        } catch {}
        throw new Error(msg);
      }
      return r.json();
    },
  });

  const visible = rows ?? [];

  const setPaper = useMutation({
    mutationFn: async (args: { certId: string; paperSize: "letter" | "a4" }) => {
      await apiRequest("PATCH", `/api/printer/${vendorId}/print-queue/cert/${args.certId}/paper-size`, { paperSize: args.paperSize });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/printer/${vendorId}/print-queue`] }),
  });

  const setName = useMutation({
    mutationFn: async (args: { certId: string; identityKind: string; name: string }) => {
      await apiRequest("PATCH", `/api/printer/${vendorId}/print-queue/cert/${args.certId}/name`, {
        identityKind: args.identityKind, name: args.name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/printer/${vendorId}/print-queue`] });
      toast({ title: "Name updated" });
    },
    onError: (e: any) => toast({ title: "Couldn't update name", description: e?.message ?? "", variant: "destructive" }),
  });

  const allSelectable = visible.filter((r) => r.nameStatus === "confirmed").map((r) => r.id);
  const allSelected = allSelectable.length > 0 && allSelectable.every((id) => selected.has(id));

  const selectedRows = visible.filter((r) => selected.has(r.id));
  const letterCount = selectedRows.filter((r) => r.paperSize === "letter").length;
  const a4Count = selectedRows.filter((r) => r.paperSize === "a4").length;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allSelectable));
  }

  async function batchDownload(format: "zip" | "merged_pdf", paperFilter?: "letter" | "a4") {
    const ids = Array.from(selected).filter((id) => {
      if (!paperFilter) return true;
      const row = visible.find((v) => v.id === id);
      return row?.paperSize === paperFilter;
    });
    if (ids.length === 0) {
      toast({ title: "Select at least one certificate", variant: "destructive" });
      return;
    }
    const token = getAuthToken();
    const r = await fetch(`/api/printer/${vendorId}/print-queue/batch-download`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ certIds: ids, format }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ message: "Failed" }));
      toast({ title: "Batch download failed", description: err.message, variant: "destructive" });
      return;
    }
    const blob = await r.blob();
    const cd = r.headers.get("Content-Disposition") ?? "";
    const m = /filename="([^"]+)"/.exec(cd);
    let filename = m?.[1] ?? (format === "zip" ? "gooddeed-batch.zip" : "gooddeed-batch.pdf");
    if (paperFilter) filename = `gooddeed-print-${paperFilter}.${format === "zip" ? "zip" : "pdf"}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    queryClient.invalidateQueries({ queryKey: [`/api/printer/${vendorId}/print-queue`] });
    queryClient.invalidateQueries({ queryKey: [`/api/printer/${vendorId}/dashboard`] });
    toast({ title: "Batch downloaded", description: `${filename} — ${ids.length} certificate(s) marked printed.` });
  }

  function promptOverrideName(row: QueueRow) {
    const name = window.prompt("Override printed name for this certificate", row.confirmedName ?? "")?.trim();
    if (!name) return;
    setName.mutate({ certId: row.id, identityKind: "display", name });
  }

  function previewUrl(certId: string) {
    return `/api/printer/${vendorId}/print-queue/cert/${certId}/pdf`;
  }

  const readyCount = useMemo(
    () => (rows ?? []).filter((r) => r.nameStatus === "confirmed").length,
    [rows],
  );

  return (
    <div className="bg-white text-slate-900 rounded-2xl p-4 sm:p-6 ring-1 ring-slate-200" data-testid="printer-print-queue">
      <h2 className="text-[20px] font-semibold text-slate-900 mb-1">Print queue</h2>
      <p className="text-slate-500 text-[13px] mb-5">
        GoodDeed certificates routed to your shop. Confirmed rows are ready to print — batch them into a ZIP of single-page PDFs,
        one merged PDF, or split into single-stock <span className="text-slate-900">US Letter</span> / <span className="text-slate-900">A4</span> files,
        then download. Downloading the batch flips those rows to <span className="text-slate-900">printed</span>.
      </p>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto">
        {QUEUE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); setSelected(new Set()); }}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold ${
              tab === t.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            data-testid={`tab-queue-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Batch toolbar */}
      {tab === "confirmed" && (
        <div className="flex items-center gap-2 mb-3 flex-wrap" data-testid="batch-toolbar">
          <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="accent-[color:var(--brand-blue)]"
              data-testid="checkbox-select-all"
            />
            Select all {allSelectable.length} ready
          </label>
          <div className="flex-1" />
          <button type="button" onClick={() => batchDownload("zip")} disabled={selected.size === 0}
            className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 disabled:opacity-40"
            data-testid="button-batch-zip">Download ZIP ({selected.size})</button>
          <button type="button" onClick={() => batchDownload("merged_pdf")} disabled={selected.size === 0}
            className="px-3 py-1.5 rounded-full bg-slate-900 text-white text-[12px] font-semibold hover:bg-slate-800 disabled:opacity-40"
            data-testid="button-batch-pdf">Download merged PDF ({selected.size})</button>
          <button type="button" onClick={() => batchDownload("merged_pdf", "letter")} disabled={letterCount === 0}
            className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 disabled:opacity-40"
            data-testid="button-batch-pdf-letter">US Letter PDF ({letterCount})</button>
          <button type="button" onClick={() => batchDownload("merged_pdf", "a4")} disabled={a4Count === 0}
            className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 disabled:opacity-40"
            data-testid="button-batch-pdf-a4">A4 PDF ({a4Count})</button>
          <button type="button" onClick={() => batchDownload("zip", "letter")} disabled={letterCount === 0}
            className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 disabled:opacity-40"
            data-testid="button-batch-zip-letter">US Letter ZIP ({letterCount})</button>
          <button type="button" onClick={() => batchDownload("zip", "a4")} disabled={a4Count === 0}
            className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 disabled:opacity-40"
            data-testid="button-batch-zip-a4">A4 ZIP ({a4Count})</button>
        </div>
      )}

      {isLoading && <div className="text-slate-500 text-sm" data-testid="loading">Loading…</div>}
      {!isLoading && visible.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500" data-testid="empty">
          {tab === "confirmed"
            ? "No certificates are ready to print right now."
            : "Nothing here."}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {visible.map((r) => {
          const sel = selected.has(r.id);
          const editable = r.nameStatus !== "printed";
          return (
            <div
              key={r.id}
              className={`rounded-2xl border p-3 flex items-center gap-3 ${
                sel ? "border-[color:var(--brand-blue)] bg-[color:var(--brand-blue-soft)]" : "border-slate-200 bg-white"
              }`}
              data-testid={`row-cert-${r.id}`}
            >
              {tab === "confirmed" && (
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => toggle(r.id)}
                  className="accent-[color:var(--brand-blue)] w-4 h-4"
                  data-testid={`checkbox-${r.id}`}
                />
              )}
              {r.albumArtwork && (
                <img src={r.albumArtwork} alt="" className="w-12 h-12 rounded-md object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${STATUS_PILL[r.nameStatus]}`}>
                    {r.nameStatus.replace("_", " ")}
                  </span>
                  {r.goodDeedNumber !== null && (
                    <span className="text-[11px] text-slate-500" data-testid={`gooddeed-${r.id}`}>#{r.goodDeedNumber}</span>
                  )}
                  <span className="text-[11px] text-slate-400">{r.shippingCountry ?? "?"}</span>
                  {r.origin === "legacy:gogoods" && (
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-amber-100 text-amber-700"
                      title="Imported from gogoods.com — fan already has the original physical certificate; don't re-print unless asked."
                      data-testid={`badge-legacy-${r.id}`}
                    >
                      Legacy
                    </span>
                  )}
                </div>
                <div className="text-[14px] font-medium text-slate-900 truncate mt-0.5">
                  {r.confirmedName ?? <span className="text-slate-400 italic">No name yet</span>}
                </div>
                <div className="text-[12px] text-slate-500 truncate">
                  {r.albumTitle} — {r.albumArtist} · {r.customerEmail}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <select
                  value={r.paperSize}
                  onChange={(e) => setPaper.mutate({ certId: r.id, paperSize: e.target.value as "letter" | "a4" })}
                  className="bg-white border border-slate-200 text-slate-700 text-[11px] rounded px-2 py-1"
                  data-testid={`select-paper-${r.id}`}
                >
                  <option value="letter">Letter</option>
                  <option value="a4">A4</option>
                </select>
                <div className="flex items-center gap-1">
                  <a
                    href={previewUrl(r.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-[color:var(--brand-blue)] hover:underline active:opacity-70"
                    data-testid={`link-preview-${r.id}`}
                  >
                    Preview
                  </a>
                  {editable && (
                    <>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => promptOverrideName(r)}
                        className="text-[11px] text-slate-600 hover:text-slate-900 active:opacity-70"
                        data-testid={`button-override-name-${r.id}`}
                      >
                        Override name
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {tab === "confirmed" && readyCount > 0 && (
        <div className="text-[11px] text-slate-400 mt-4" data-testid="ready-summary">
          {readyCount} ready certificate(s).
        </div>
      )}
    </div>
  );
}

// ─── Albums tab (derived, read-only) ────────────────────────────────

interface PrinterAlbum {
  title: string;
  artist: string;
  artwork: string | null;
  certCount: number;
  printedCount: number;
}

function AlbumsTab({ vendorId }: { vendorId: string }) {
  const { data, isLoading } = useQuery<PrinterAlbum[]>({
    queryKey: [`/api/printer/${vendorId}/albums`],
  });
  if (isLoading) return <PanelLoading />;
  const albums = data ?? [];
  return (
    <DashboardPanel padding="md">
      <h3 className="text-base font-semibold mb-1">Albums you print for</h3>
      <p className="text-xs text-slate-500 mb-4">Read-only. Every release with GoodDeed certificates routed to your shop.</p>
      {albums.length === 0 ? (
        <p className="text-sm text-slate-500" data-testid="text-no-albums">No albums route their GoodDeed prints to you yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {albums.map((a, i) => (
            <div key={`${a.title}-${i}`} className="flex items-center gap-3" data-testid={`album-row-${i}`}>
              <div className="w-11 h-11 rounded-md overflow-hidden bg-slate-100 ring-1 ring-slate-200 grid place-items-center flex-shrink-0">
                {a.artwork ? <img src={a.artwork} alt="" className="w-full h-full object-cover" /> : <Disc3 className="w-5 h-5 text-slate-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-900 truncate">{a.title}</div>
                <div className="text-xs text-slate-500 truncate">{a.artist}</div>
              </div>
              <div className="text-xs text-slate-500 whitespace-nowrap text-right">
                <div>{a.certCount} cert(s)</div>
                <div className="text-slate-400">{a.printedCount} printed</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}

// ─── People & Labels tab (derived, read-only) ───────────────────────

interface PrinterPeople {
  people: { id: string | null; name: string; photoUrl: string | null }[];
  labels: { id: string; name: string; logoUrl: string | null }[];
}

function PeopleTab({ vendorId }: { vendorId: string }) {
  const { data, isLoading } = useQuery<PrinterPeople>({
    queryKey: [`/api/printer/${vendorId}/people`],
  });
  if (isLoading) return <PanelLoading />;
  const people = data?.people ?? [];
  const labels = data?.labels ?? [];
  const empty = people.length === 0 && labels.length === 0;
  return (
    <DashboardPanel padding="md">
      <h3 className="text-base font-semibold mb-1">Who you print for</h3>
      <p className="text-xs text-slate-500 mb-4">Read-only reference of the artists and labels behind your print jobs.</p>
      {empty ? (
        <p className="text-sm text-slate-500" data-testid="text-no-people">No artists or labels route prints to you yet.</p>
      ) : (
        <div className="space-y-5">
          {people.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Artists</div>
              <div className="flex flex-col gap-2">
                {people.map((p, i) => (
                  <div key={p.id ?? `loose-${i}`} className="flex items-center gap-3" data-testid={`artist-row-${i}`}>
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-slate-100 ring-1 ring-slate-200 grid place-items-center flex-shrink-0">
                      {p.photoUrl ? <img src={p.photoUrl} alt="" className="w-full h-full object-cover" /> : <Users className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div className="text-sm text-slate-900 truncate">{p.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {labels.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Labels</div>
              <div className="flex flex-col gap-2">
                {labels.map((l) => (
                  <div key={l.id} className="flex items-center gap-3" data-testid={`label-row-${l.id}`}>
                    <div className="w-9 h-9 rounded-md overflow-hidden bg-slate-100 ring-1 ring-slate-200 grid place-items-center flex-shrink-0">
                      {l.logoUrl ? <img src={l.logoUrl} alt="" className="w-full h-full object-cover" /> : <Users className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div className="text-sm text-slate-900 truncate">{l.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </DashboardPanel>
  );
}

// ─── Settings tab ───────────────────────────────────────────────────

function SettingsTab({ vendorId, printerName }: { vendorId: string; printerName: string }) {
  const [sub, setSub] = useState<"profile" | "staff" | "payouts" | "notifications">("profile");
  const subTabs = [
    { id: "profile" as const, label: "Profile" },
    { id: "staff" as const, label: "Staff" },
    { id: "payouts" as const, label: "Payouts" },
    { id: "notifications" as const, label: "Notifications" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            className={`h-10 px-3 text-sm font-semibold whitespace-nowrap border-b-2 ${sub === t.id ? "border-[color:var(--brand-blue)] text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
            data-testid={`tab-settings-${t.id}`}
          >{t.label}</button>
        ))}
      </div>
      {sub === "profile" && <ProfileSubTab vendorId={vendorId} />}
      {sub === "staff" && (
        <DashboardPanel padding="md">
          <OrganizationPeople
            apiPath={`/api/vendors/${vendorId}/people`}
            testIdPrefix="printer-shell"
            entityKind="vendor"
            entityId={vendorId}
            entityName={printerName}
            title="Staff"
            blurb="Teammates at your print shop. GoodTunes adds and removes staff for you — reach out if this list needs a change."
            canInviteSubusers={false}
            canAddAdmins={false}
          />
        </DashboardPanel>
      )}
      {sub === "payouts" && <PayoutsSubTab vendorId={vendorId} />}
      {sub === "notifications" && <NotificationsSubTab vendorId={vendorId} />}
    </div>
  );
}

function ProfileSubTab({ vendorId }: { vendorId: string }) {
  const { data: me, isLoading } = useQuery<PrinterMe>({ queryKey: [`/api/printer/${vendorId}/me`] });
  const canEdit = me?.canEdit !== false;
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [homeUrl, setHomeUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [tagline, setTagline] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (!me) return;
    setName(me.name ?? "");
    setHomeUrl(me.homeUrl ?? "");
    setLogoUrl(me.logoUrl ?? "");
    setTagline(me.tagline ?? "");
    setLocation(me.location ?? "");
    setBio(me.bio ?? "");
  }, [me?.id]);

  const save = useMutation({
    mutationFn: (patch: Record<string, any>) => apiRequest("PATCH", `/api/printer/${vendorId}/profile`, patch),
    onSuccess: () => {
      toast({ title: "Profile saved" });
      queryClient.invalidateQueries({ queryKey: [`/api/printer/${vendorId}/me`] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? "", variant: "destructive" }),
  });

  if (isLoading) return <PanelLoading />;
  return (
    <DashboardPanel padding="md">
      <h3 className="text-base font-semibold mb-3">Print shop profile</h3>
      <p className="text-xs text-slate-500 mb-4">Details GoodTunes shows internally and uses for contact. Paste a logo image URL if you'd like one shown.</p>
      <div className="space-y-4 max-w-xl">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} data-testid="input-name" />
        </Field>
        <Field label="Logo image URL">
          <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} disabled={!canEdit} placeholder="https://…" data-testid="input-logo-url" />
        </Field>
        <Field label="Website">
          <Input value={homeUrl} onChange={(e) => setHomeUrl(e.target.value)} disabled={!canEdit} placeholder="https://…" data-testid="input-home-url" />
        </Field>
        <Field label="Tagline">
          <Input value={tagline} onChange={(e) => setTagline(e.target.value)} disabled={!canEdit} data-testid="input-tagline" />
        </Field>
        <Field label="Location">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} disabled={!canEdit} data-testid="input-location" />
        </Field>
        <Field label="About">
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} disabled={!canEdit} rows={3} data-testid="input-bio" />
        </Field>
        {canEdit && (
          <Button
            onClick={() => save.mutate({ name, logoUrl, homeUrl, tagline, location, bio })}
            disabled={save.isPending}
            className="rounded-full"
            data-testid="button-save-profile"
          >
            {save.isPending ? "Saving…" : "Save profile"}
          </Button>
        )}
      </div>
    </DashboardPanel>
  );
}

interface PayoutsStatus {
  connected: boolean;
  note?: string;
  payoutsEnabled?: boolean;
  chargesEnabled?: boolean;
  stripeAccountIdLast4?: string;
}

function PayoutsSubTab({ vendorId }: { vendorId: string }) {
  const { data, isLoading } = useQuery<PayoutsStatus>({ queryKey: [`/api/printer/${vendorId}/payouts`] });
  if (isLoading) return <PanelLoading />;
  return (
    <DashboardPanel padding="md">
      <h3 className="text-base font-semibold mb-3">Payouts</h3>
      {data?.connected ? (
        <div className="space-y-2 text-sm" data-testid="payouts-connected">
          <p className="text-slate-700">Stripe payout account connected (••••{data.stripeAccountIdLast4}).</p>
          <p className="text-slate-500 text-xs">Payouts {data.payoutsEnabled ? "enabled" : "pending"} · Charges {data.chargesEnabled ? "enabled" : "pending"}</p>
        </div>
      ) : (
        <p className="text-sm text-slate-600" data-testid="payouts-not-connected">{data?.note ?? "No payout account connected."}</p>
      )}
    </DashboardPanel>
  );
}

function NotificationsSubTab({ vendorId }: { vendorId: string }) {
  return (
    <DashboardPanel padding="md">
      <h3 className="text-base font-semibold mb-3">Notifications</h3>
      <p className="text-sm text-slate-600" data-testid="text-notifications">
        GoodTunes emails your print-shop contact when new GoodDeed certificates are routed to you and ready to print.
        To change which address gets these, update the contact email on your <span className="text-slate-900">Profile</span> tab.
      </p>
    </DashboardPanel>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function PanelLoading() {
  return (
    <DashboardPanel padding="md">
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    </DashboardPanel>
  );
}

export default PrinterPortal;
