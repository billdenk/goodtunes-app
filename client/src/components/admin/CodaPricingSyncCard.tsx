// Task #3310 — operator-only Coda (Superhuman Docs) pricing connection
// panel for a press. Save token (one-time entry, never shown again) +
// doc ID, test the connection to list tables/columns, map columns onto
// our ladder concepts, then preview → commit pricing onto the press's
// ladders (same model as the Hellbender Shopify sync; runs land in the
// shared pricing-sync history with source "coda").
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type ColumnMapping = {
  tierColumnId: string;
  qtyColumnId: string;
  priceColumnId: string;
  priceKind: "unit" | "total";
  formatColumnId: string | null;
  defaultFormat: string | null;
};

type PublicConnection =
  | { configured: false }
  | {
      configured: true;
      docId: string;
      docName: string | null;
      tableId: string | null;
      tableName: string | null;
      columnMapping: ColumnMapping | null;
      lastTestedAt: string | null;
      lastError: string | null;
    };

type CodaTable = { id: string; name: string; rowCount?: number };
type CodaColumn = { id: string; name: string };

type ProposalWrite = {
  format: string;
  tierName: string;
  qty: number;
  unitCents: number;
  change: "new" | "updated" | "unchanged" | "locked" | "tier_missing";
  oldUnitCents: number | null;
  matchedTierName: string | null;
};
type Proposal = {
  rowsFetched: number;
  writes: ProposalWrite[];
  unmatched: { rowId: string; rowName: string | null; reason: string }[];
  tiersMissing: string[];
};

const FORMATS = ["12_lp", "12_double", "7_inch", "cassette", "cd"] as const;
const FORMAT_LABEL: Record<string, string> = {
  "12_lp": '12" LP',
  "12_double": "2LP",
  "7_inch": '7"',
  cassette: "Cassette",
  cd: "CD",
};
const CHANGE_STYLE: Record<ProposalWrite["change"], string> = {
  new: "text-emerald-600",
  updated: "text-[var(--apple-blue)]",
  unchanged: "text-[var(--apple-text-tertiary)]",
  locked: "text-amber-600",
  tier_missing: "text-red-500",
};
const CHANGE_LABEL: Record<ProposalWrite["change"], string> = {
  new: "New",
  updated: "Update",
  unchanged: "Same",
  locked: "Locked (kept)",
  tier_missing: "No tier",
};

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const inputCls =
  "w-full rounded-lg border border-[var(--apple-separator)] bg-[var(--apple-card)] px-2.5 py-1.5 text-sm text-[var(--apple-text)] outline-none focus:border-[var(--apple-blue)]";
const btnCls =
  "px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--apple-blue)] hover:bg-[var(--apple-blue)]/10 disabled:opacity-50 disabled:cursor-not-allowed";

export function CodaPricingSyncCard({ pressId }: { pressId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const base = `/api/admin/manufacturers/${pressId}`;
  const connKey = [base, "coda-connection"];

  const { data: conn, isLoading } = useQuery<PublicConnection>({
    queryKey: connKey,
    queryFn: async () => (await apiRequest("GET", `${base}/coda-connection`)).json(),
  });

  const [token, setToken] = useState("");
  const [docId, setDocId] = useState("");
  const [showTokenEntry, setShowTokenEntry] = useState(false);
  const [tables, setTables] = useState<CodaTable[] | null>(null);
  const [columns, setColumns] = useState<CodaColumn[] | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Partial<ColumnMapping> | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: connKey });

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await apiRequest("PUT", `${base}/coda-connection`, body)).json(),
    onSuccess: () => {
      setToken("");
      setShowTokenEntry(false);
      invalidate();
      toast({ title: "Coda connection saved" });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  const testConn = useMutation({
    mutationFn: async (tableId?: string) =>
      (await apiRequest("POST", `${base}/coda-connection/test`, tableId ? { tableId } : {})).json(),
    onSuccess: (r: { docName: string; tables: CodaTable[]; columns: CodaColumn[] | null }) => {
      setDocName(r.docName);
      setTables(r.tables);
      setColumns(r.columns);
      invalidate();
      toast({ title: "Connection OK", description: `${r.docName}: ${r.tables.length} table(s) found.` });
    },
    onError: (e: any) => {
      invalidate();
      toast({ title: "Connection test failed", description: e.message, variant: "destructive" });
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", `${base}/coda-connection`)).json(),
    onSuccess: () => {
      setTables(null);
      setColumns(null);
      setMapping(null);
      invalidate();
      toast({ title: "Coda connection removed" });
    },
  });

  const preview = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `${base}/pricing-sync/coda/preview`, {})).json(),
    onSuccess: (r: { proposal: Proposal }) => {
      setProposal(r.proposal);
      setPreviewOpen(true);
    },
    onError: (e: any) => toast({ title: "Preview failed", description: e.message, variant: "destructive" }),
  });

  const commit = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `${base}/pricing-sync/coda/commit`, {})).json(),
    onSuccess: (r: { rungsWritten: number; rungsSkipped: number }) => {
      setPreviewOpen(false);
      setProposal(null);
      qc.invalidateQueries({ queryKey: [base, "pricing-syncs"] });
      toast({
        title: "Coda pricing committed",
        description: `${r.rungsWritten} rung(s) written, ${r.rungsSkipped} skipped (locked or no matching tier).`,
      });
    },
    onError: (e: any) => toast({ title: "Commit failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !conn) return null;
  const configured = conn.configured;
  const storedMapping = configured ? conn.columnMapping : null;
  const m: Partial<ColumnMapping> = mapping ?? storedMapping ?? { priceKind: "unit", formatColumnId: null, defaultFormat: null };
  const mappingReady = !!(m.tierColumnId && m.qtyColumnId && m.priceColumnId && (m.formatColumnId || m.defaultFormat));
  const syncReady = configured && conn.tableId && !!storedMapping;

  return (
    <div className="max-w-3xl rounded-2xl border border-[var(--apple-separator)] bg-[var(--apple-card)] p-4 space-y-3" data-testid="card-coda-pricing-sync">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--apple-text)]">Coda pricing sync</div>
          <p className="text-xs text-[var(--apple-text-secondary)] mt-0.5">
            Link this press's Coda (Superhuman Docs) pricing doc, map its columns, then preview and
            commit onto the pricing ladders. Operator-locked rungs are never overwritten.
          </p>
        </div>
        {configured && (
          <button
            type="button"
            className="text-xs text-red-500 hover:underline shrink-0"
            data-testid="button-coda-disconnect"
            onClick={() => {
              if (window.confirm("Remove this Coda connection? The saved token is deleted.")) disconnect.mutate();
            }}
          >
            Disconnect
          </button>
        )}
      </div>

      {!configured || showTokenEntry ? (
        <div className="space-y-2">
          <input
            type="password"
            className={inputCls}
            placeholder="Coda API token (stored encrypted — you won't see it again)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            data-testid="input-coda-token"
            autoComplete="off"
          />
          {!configured && (
            <input
              className={inputCls}
              placeholder="Doc ID (from the doc URL, e.g. AbCDeFgH)"
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              data-testid="input-coda-doc-id"
            />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btnCls}
              disabled={save.isPending || !token || (!configured && !docId)}
              onClick={() => save.mutate(configured ? { apiToken: token } : { apiToken: token, docId })}
              data-testid="button-coda-save-connection"
            >
              {save.isPending ? "Saving…" : configured ? "Replace token" : "Save connection"}
            </button>
            {configured && (
              <button type="button" className="text-xs text-[var(--apple-text-tertiary)] hover:underline" onClick={() => setShowTokenEntry(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="text-xs text-[var(--apple-text-secondary)] space-y-0.5">
            <div>
              Doc: <span className="text-[var(--apple-text)] font-medium">{docName ?? conn.docName ?? conn.docId}</span>
              {conn.tableName && <> · Table: <span className="text-[var(--apple-text)] font-medium">{conn.tableName}</span></>}
            </div>
            {conn.lastError ? (
              <div className="text-red-500" data-testid="text-coda-last-error">{conn.lastError}</div>
            ) : conn.lastTestedAt ? (
              <div>Last tested {new Date(conn.lastTestedAt).toLocaleString()}</div>
            ) : (
              <div>Not tested yet.</div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnCls} disabled={testConn.isPending} onClick={() => testConn.mutate(undefined)} data-testid="button-coda-test">
              {testConn.isPending ? "Testing…" : "Test connection"}
            </button>
            <button type="button" className="text-xs text-[var(--apple-text-tertiary)] hover:underline" onClick={() => setShowTokenEntry(true)}>
              Replace token
            </button>
            {syncReady && (
              <button type="button" className={btnCls} disabled={preview.isPending} onClick={() => preview.mutate()} data-testid="button-coda-preview">
                {preview.isPending ? "Fetching…" : "Preview sync"}
              </button>
            )}
          </div>

          {tables && (
            <div className="space-y-2 pt-1">
              <label className="block text-xs font-medium text-[var(--apple-text-secondary)]">
                Pricing table
                <select
                  className={`${inputCls} mt-1`}
                  value={conn.tableId ?? ""}
                  data-testid="select-coda-table"
                  onChange={(e) => {
                    const t = tables.find((x) => x.id === e.target.value);
                    if (!t) return;
                    save.mutate({ tableId: t.id, tableName: t.name });
                    testConn.mutate(t.id); // fetch its columns for mapping
                  }}
                >
                  <option value="" disabled>Pick the table with pricing…</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{typeof t.rowCount === "number" ? ` (${t.rowCount} rows)` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {columns && (
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["tierColumnId", "Tier / color column"],
                      ["qtyColumnId", "Quantity column"],
                      ["priceColumnId", "Price column"],
                      ["formatColumnId", "Format column (optional)"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block text-xs font-medium text-[var(--apple-text-secondary)]">
                      {label}
                      <select
                        className={`${inputCls} mt-1`}
                        value={(m[key] as string | null) ?? ""}
                        data-testid={`select-coda-${key}`}
                        onChange={(e) => setMapping({ ...m, [key]: e.target.value || null })}
                      >
                        <option value="">{key === "formatColumnId" ? "None — use default format" : "Pick a column…"}</option>
                        {columns.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <label className="block text-xs font-medium text-[var(--apple-text-secondary)]">
                    Price is
                    <select
                      className={`${inputCls} mt-1`}
                      value={m.priceKind ?? "unit"}
                      data-testid="select-coda-price-kind"
                      onChange={(e) => setMapping({ ...m, priceKind: e.target.value as "unit" | "total" })}
                    >
                      <option value="unit">Per unit</option>
                      <option value="total">Run total (÷ quantity)</option>
                    </select>
                  </label>
                  {!m.formatColumnId && (
                    <label className="block text-xs font-medium text-[var(--apple-text-secondary)]">
                      Default format
                      <select
                        className={`${inputCls} mt-1`}
                        value={m.defaultFormat ?? ""}
                        data-testid="select-coda-default-format"
                        onChange={(e) => setMapping({ ...m, defaultFormat: e.target.value || null })}
                      >
                        <option value="">Pick a format…</option>
                        {FORMATS.map((f) => (
                          <option key={f} value={f}>{FORMAT_LABEL[f]}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="col-span-2">
                    <button
                      type="button"
                      className={btnCls}
                      disabled={!mappingReady || save.isPending}
                      data-testid="button-coda-save-mapping"
                      onClick={() =>
                        save.mutate({
                          columnMapping: {
                            tierColumnId: m.tierColumnId,
                            qtyColumnId: m.qtyColumnId,
                            priceColumnId: m.priceColumnId,
                            priceKind: m.priceKind ?? "unit",
                            formatColumnId: m.formatColumnId ?? null,
                            defaultFormat: m.formatColumnId ? null : m.defaultFormat ?? null,
                          },
                        })
                      }
                    >
                      Save column mapping
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Coda pricing preview</DialogTitle>
            <DialogDescription>
              {proposal
                ? `${proposal.rowsFetched} row(s) fetched. Nothing is written until you commit.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {proposal && (
            <div className="space-y-3 text-xs">
              {proposal.tiersMissing.length > 0 && (
                <div className="text-red-500">
                  No matching catalog tier for: {proposal.tiersMissing.join(", ")} — these rows are skipped.
                </div>
              )}
              <table className="w-full text-left">
                <thead className="text-xs uppercase text-[var(--apple-text-tertiary)]">
                  <tr>
                    <th className="py-1 pr-2">Format</th>
                    <th className="py-1 pr-2">Tier</th>
                    <th className="py-1 pr-2 text-right">Qty</th>
                    <th className="py-1 pr-2 text-right">Unit price</th>
                    <th className="py-1">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.writes.map((w, i) => (
                    <tr key={i} className="border-t border-[var(--apple-separator)]">
                      <td className="py-1 pr-2">{FORMAT_LABEL[w.format] ?? w.format}</td>
                      <td className="py-1 pr-2">{w.matchedTierName ?? w.tierName}</td>
                      <td className="py-1 pr-2 text-right">{w.qty.toLocaleString()}</td>
                      <td className="py-1 pr-2 text-right">
                        {w.change === "updated" && w.oldUnitCents != null && (
                          <span className="line-through text-[var(--apple-text-tertiary)] mr-1.5">{usd(w.oldUnitCents)}</span>
                        )}
                        {usd(w.unitCents)}
                      </td>
                      <td className={`py-1 font-medium ${CHANGE_STYLE[w.change]}`}>{CHANGE_LABEL[w.change]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {proposal.unmatched.length > 0 && (
                <div>
                  <div className="font-medium text-[var(--apple-text)]">Unmatched rows ({proposal.unmatched.length})</div>
                  <ul className="mt-1 space-y-0.5 text-[var(--apple-text-secondary)]">
                    {proposal.unmatched.slice(0, 20).map((u) => (
                      <li key={u.rowId}>{u.rowName ? `${u.rowName}: ` : ""}{u.reason}</li>
                    ))}
                    {proposal.unmatched.length > 20 && <li>…and {proposal.unmatched.length - 20} more.</li>}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="text-xs text-[var(--apple-text-tertiary)] hover:underline" onClick={() => setPreviewOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={btnCls}
                  disabled={commit.isPending || proposal.writes.every((w) => w.change === "unchanged" || w.change === "tier_missing" || w.change === "locked")}
                  onClick={() => commit.mutate()}
                  data-testid="button-coda-commit"
                >
                  {commit.isPending ? "Committing…" : "Commit to ladders"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
