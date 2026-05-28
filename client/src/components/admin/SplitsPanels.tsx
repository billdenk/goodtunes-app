import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  AlertCircle,
  Search,
  Upload,
  X,
  PieChart,
  Loader2,
  Check,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/Spinner";

// Task #616 — Per-track Publishing + Master Recording splits.
//
// Two parallel matrices live behind the same editor: publishing
// (songwriter / lyricist / composer shares + PRO + publisher
// affiliation) and mechanical (a.k.a. "master recording" — the
// performance side of the royalty pie). Both are stored in basis
// points (percentBp 0–10000) so 33.33% is lossless.
//
// Master/mechanical splits are NEVER exposed to fans — the fan-side
// Player only reads writer NAMES from /api/songs/:id. The matrix
// here is the operator's source of truth for downstream PRO / sub-
// publisher / master-licensee handoffs.

type Person = { id: string; name: string; photoUrl?: string | null };
type Organization = { id: string; name: string; kind: string };
type SplitRow = {
  id: string;
  songId: string;
  personId: string | null;
  organizationId: string | null;
  name: string;
  role: string;
  percentBp: number;
  position: number;
  proAffiliation?: string | null;
  person: Person | null;
  organization: Organization | null;
};
type SplitTotals = { publishingBp: number; mechanicalBp: number };
type TrackSplits = { publishing: SplitRow[]; mechanical: SplitRow[]; totals?: SplitTotals };
type AlbumSplits = { bySongId: Record<string, TrackSplits & { totals?: SplitTotals }> };

function bpToPct(bp: number): string {
  return (bp / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}
function sumBp(rows: SplitRow[]): number {
  return rows.reduce((acc, r) => acc + (r.percentBp ?? 0), 0);
}

// ─── Album-tab matrix ────────────────────────────────────────────────
// Read-mostly summary across every track on the album. Each track
// renders two stacked progress bars (Publishing | Master) with a
// percent total + "Edit splits" link that scrolls the Tracks tab to
// the song row in Splits mode. Also exposes the "Import from sheet"
// affordance.

export function AlbumSplitsPanel({
  albumId,
  songs,
}: {
  albumId: string;
  songs: Array<{ id: string; title: string; trackNumber: number }>;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const { data, isLoading } = useQuery<AlbumSplits>({
    queryKey: ["/api/admin/albums", albumId, "splits"],
  });
  const ordered = useMemo(
    () => [...songs].sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0)),
    [songs],
  );

  return (
    <div className="space-y-6" data-testid="panel-album-splits">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-slate-500" />
            Splits
          </h2>
          <p className="text-[12.5px] text-slate-500 mt-0.5">
            Publishing + Master Recording per song. Master splits never leave the admin.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setImportOpen(true)}
          data-testid="button-import-splits"
        >
          <Upload className="w-3.5 h-3.5 mr-1.5" />
          Import from sheet
        </Button>
      </div>

      {isLoading ? (
        <div className="py-10 flex justify-center"><Spinner className="w-5 h-5" /></div>
      ) : ordered.length === 0 ? (
        <div className="text-[13px] text-slate-500">No tracks on this album yet.</div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-slate-600 text-[11.5px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2 w-10">#</th>
                <th className="text-left px-3 py-2">Track</th>
                <th className="text-left px-3 py-2 w-[28%]">Publishing</th>
                <th className="text-left px-3 py-2 w-[28%]">Master</th>
                <th className="px-3 py-2 w-24" />
              </tr>
            </thead>
            <tbody>
              {ordered.map((s) => {
                const row = data?.bySongId?.[s.id] ?? { publishing: [], mechanical: [] };
                const pubBp = row.totals?.publishingBp ?? sumBp(row.publishing);
                const mechBp = row.totals?.mechanicalBp ?? sumBp(row.mechanical);
                return (
                  <SplitsMatrixRow
                    key={s.id}
                    songId={s.id}
                    songTitle={s.title}
                    trackNumber={s.trackNumber}
                    splits={row}
                    pubBp={pubBp}
                    mechBp={mechBp}
                    onOpen={() => setActiveSongId(s.id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-track editor as a sheet — the same editor the Tracks tab
          opens inline. Sheet here saves a click for the operator
          working out of the Splits matrix. */}
      {activeSongId && (
        <Dialog open={true} onOpenChange={(v) => !v && setActiveSongId(null)}>
          <DialogContent
            className="max-w-3xl bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4 max-h-[85vh] overflow-y-auto"
            data-testid="dialog-track-splits"
          >
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="text-[17px] font-semibold text-slate-900">
                Splits — {ordered.find((s) => s.id === activeSongId)?.title ?? "Track"}
              </DialogTitle>
              <DialogDescription className="text-[13px] text-slate-500">
                Publishing splits feed fan-side "Written by …". Master splits stay admin-only.
              </DialogDescription>
            </DialogHeader>
            <TrackSplitsEditor
              songId={activeSongId}
              songTitle={ordered.find((s) => s.id === activeSongId)?.title ?? ""}
              albumId={albumId}
            />
          </DialogContent>
        </Dialog>
      )}

      {importOpen && (
        <SplitsImportSheet
          albumId={albumId}
          songs={ordered}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

function SplitsMatrixRow({
  songId,
  songTitle,
  trackNumber,
  splits,
  pubBp,
  mechBp,
  onOpen,
}: {
  songId: string;
  songTitle: string;
  trackNumber: number;
  splits: TrackSplits;
  pubBp: number;
  mechBp: number;
  onOpen: () => void;
}) {
  return (
    <tr className="border-t border-slate-200 hover:bg-slate-50" data-testid={`row-splits-${songId}`}>
      <td className="px-3 py-3 text-slate-400 text-[12px]">{trackNumber || "—"}</td>
      <td className="px-3 py-3">
        <button
          onClick={onOpen}
          className="text-left font-medium text-slate-900 hover:text-[var(--brand-blue)]"
          data-testid={`link-track-${songId}`}
        >
          {songTitle}
        </button>
        <div className="text-[11.5px] text-slate-400 mt-0.5">
          {splits.publishing.length} pub · {splits.mechanical.length} master
        </div>
      </td>
      <td className="px-3 py-3"><PercentBar bp={pubBp} rows={splits.publishing} /></td>
      <td className="px-3 py-3"><PercentBar bp={mechBp} rows={splits.mechanical} /></td>
      <td className="px-3 py-3 text-right">
        <button
          onClick={onOpen}
          className="text-[12.5px] font-medium text-[var(--brand-blue)] hover:underline"
          data-testid={`button-edit-splits-${songId}`}
        >
          Edit
        </button>
      </td>
    </tr>
  );
}

function PercentBar({ bp, rows }: { bp: number; rows: SplitRow[] }) {
  if (rows.length === 0) {
    return <span className="text-[12px] text-slate-400">Not set</span>;
  }
  const pct = bp / 100;
  const ok = bp === 10000;
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${ok ? "bg-emerald-500" : pct > 100 ? "bg-rose-500" : "bg-amber-400"}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <span className={`text-[12px] font-medium tabular-nums ${ok ? "text-emerald-700" : "text-slate-700"}`}>
          {bpToPct(bp)}%
        </span>
      </div>
      <div className="mt-1 text-[11.5px] text-slate-500 line-clamp-1">
        {rows.map((r) => r.name).join(", ")}
      </div>
    </div>
  );
}

// ─── Per-track editor ───────────────────────────────────────────────
// Two stacked sections (Publishing | Master). Each row inline-edits
// name / role / percent / PRO and resolves a Person OR Organization
// reference. The 100% check is informational — admin can save out of
// balance (sometimes a draft + a missing co-writer being tracked
// down). All writes go through the edit_metadata-gated routes; a
// 403 surfaces as an inline lock banner.

export function TrackSplitsEditor({
  songId,
  songTitle,
  albumId,
}: {
  songId: string;
  songTitle: string;
  albumId: string;
}) {
  const { data, isLoading } = useQuery<TrackSplits>({
    queryKey: ["/api/admin/songs", songId, "splits"],
  });
  if (isLoading || !data) {
    return <div className="py-8 flex justify-center"><Spinner className="w-5 h-5" /></div>;
  }
  return (
    <div className="space-y-6" data-testid={`editor-track-splits-${songId}`}>
      <SplitsSection
        kind="publishing"
        title="Publishing splits"
        hint="Songwriting share. Names + percentages here power the fan-side &quot;Written by …&quot; line."
        songId={songId}
        albumId={albumId}
        rows={data.publishing}
      />
      <SplitsSection
        kind="mechanical"
        title="Master recording splits"
        hint="Performance / master share. Never shown to fans — admin-only."
        songId={songId}
        albumId={albumId}
        rows={data.mechanical}
      />
    </div>
  );
}

function SplitsSection({
  kind,
  title,
  hint,
  songId,
  albumId,
  rows,
}: {
  kind: "publishing" | "mechanical";
  title: string;
  hint: string;
  songId: string;
  albumId: string;
  rows: SplitRow[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const totalBp = sumBp(rows);
  const balanced = totalBp === 10000;
  const empty = rows.length === 0;
  const rebalanceMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/songs/${songId}/splits/rebalance`, { kind });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/songs", songId, "splits"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "splits"] });
      toast({ title: "Rebalanced to 100%" });
    },
    onError: (e: any) => toast({ title: "Couldn't rebalance", description: e?.message ?? "", variant: "destructive" }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/songs", songId, "splits"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "splits"] });
  };

  const createMut = useMutation({
    mutationFn: async (body: Partial<SplitRow>) => {
      const path = kind === "publishing"
        ? `/api/admin/songs/${songId}/publishing-splits`
        : `/api/admin/songs/${songId}/mechanical-splits`;
      const r = await apiRequest("POST", path, body);
      return r.json();
    },
    // Auto-rebalance after add: if the new row pushed the section
    // off 100%, proportionally scale everyone so it lands at 100%
    // again. Operator can still edit individual percents afterwards.
    onSuccess: async () => {
      try {
        await apiRequest("POST", `/api/admin/songs/${songId}/splits/rebalance`, { kind });
      } catch {
        /* non-fatal — the row is in; Rebalance button still available. */
      }
      invalidate();
      setAdding(false);
    },
    onError: (e: any) => toast({ title: "Couldn't add split", description: e?.message ?? "" , variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SplitRow> }) => {
      const path = kind === "publishing"
        ? `/api/admin/publishing-splits/${id}`
        : `/api/admin/mechanical-splits/${id}`;
      const r = await apiRequest("PUT", path, patch);
      return r.json();
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Couldn't save split", description: e?.message ?? "", variant: "destructive" }),
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const path = kind === "publishing"
        ? `/api/admin/publishing-splits/${id}`
        : `/api/admin/mechanical-splits/${id}`;
      await apiRequest("DELETE", path);
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Couldn't delete split", description: e?.message ?? "", variant: "destructive" }),
  });

  return (
    <section className="border border-slate-200 rounded-lg p-4 space-y-3" data-testid={`section-splits-${kind}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-slate-900">{title}</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">{hint}</p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-[14px] font-semibold tabular-nums ${balanced ? "text-emerald-700" : empty ? "text-slate-400" : totalBp > 10000 ? "text-rose-600" : "text-amber-600"}`}>
            {empty ? "—" : `${bpToPct(totalBp)}%`}
          </div>
          <div className="text-[11px] text-slate-400">
            {balanced ? "Balanced" : empty ? "Empty" : totalBp > 10000 ? "Over 100%" : "Under 100%"}
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <SplitRowEditor
              key={r.id}
              row={r}
              kind={kind}
              onPatch={(patch) => updateMut.mutate({ id: r.id, patch })}
              onDelete={() => deleteMut.mutate(r.id)}
              busy={updateMut.isPending || deleteMut.isPending}
            />
          ))}
        </ul>
      )}

      {adding ? (
        <NewSplitForm
          kind={kind}
          onSubmit={(body) => createMut.mutate(body)}
          onCancel={() => setAdding(false)}
          busy={createMut.isPending}
        />
      ) : (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setAdding(true)}
            className="text-[13px] font-medium text-[var(--brand-blue)] hover:underline inline-flex items-center gap-1"
            data-testid={`button-add-split-${kind}`}
          >
            <Plus className="w-3.5 h-3.5" />
            Add split
          </button>
          {/* Rebalance proportionally scales every row so the section
              sums to exactly 100%. Hidden when balanced or empty —
              there's nothing to do. */}
          {!balanced && !empty && (
            <button
              onClick={() => rebalanceMut.mutate()}
              disabled={rebalanceMut.isPending}
              className="text-xs font-medium text-slate-500 hover:text-[var(--brand-blue)] hover:underline disabled:opacity-50"
              data-testid={`button-rebalance-${kind}`}
            >
              {rebalanceMut.isPending ? "Rebalancing…" : "Rebalance to 100%"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function SplitRowEditor({
  row,
  kind,
  onPatch,
  onDelete,
  busy,
}: {
  row: SplitRow;
  kind: "publishing" | "mechanical";
  onPatch: (patch: Partial<SplitRow>) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState(row.name);
  const [role, setRole] = useState(row.role);
  const [percent, setPercent] = useState(bpToPct(row.percentBp));
  const [pro, setPro] = useState(row.proAffiliation ?? "");
  useEffect(() => { setName(row.name); setRole(row.role); setPercent(bpToPct(row.percentBp)); setPro(row.proAffiliation ?? ""); }, [row.id]);

  const dirty =
    name !== row.name ||
    role !== row.role ||
    percent !== bpToPct(row.percentBp) ||
    (pro || "") !== (row.proAffiliation ?? "");

  const save = () => {
    const p = Number(percent);
    if (!isFinite(p) || p < 0) return;
    const percentBp = Math.round(p * 100);
    const patch: Partial<SplitRow> = { name, role, percentBp };
    if (kind === "publishing") (patch as any).proAffiliation = pro || null;
    onPatch(patch);
  };

  return (
    <li className="grid grid-cols-[1.6fr_1fr_70px_1fr_auto] gap-2 items-center" data-testid={`row-split-${row.id}`}>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="h-8 text-[13px]"
        data-testid={`input-split-name-${row.id}`}
      />
      <Input
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder={kind === "publishing" ? "Songwriter" : "Performer"}
        className="h-8 text-[13px]"
        data-testid={`input-split-role-${row.id}`}
      />
      <div className="flex items-center gap-1">
        <Input
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          inputMode="decimal"
          className="h-8 text-[13px] tabular-nums text-right"
          data-testid={`input-split-percent-${row.id}`}
        />
        <span className="text-[12px] text-slate-400">%</span>
      </div>
      {kind === "publishing" ? (
        <Input
          value={pro}
          onChange={(e) => setPro(e.target.value)}
          placeholder="PRO (ASCAP/BMI/SESAC)"
          className="h-8 text-[13px]"
          data-testid={`input-split-pro-${row.id}`}
        />
      ) : (
        <div />
      )}
      <div className="flex items-center gap-1 justify-end">
        {dirty && (
          <button
            onClick={save}
            disabled={busy}
            className="h-7 px-2 rounded-md text-[12px] font-medium bg-[var(--brand-blue)] text-white disabled:opacity-50"
            data-testid={`button-save-split-${row.id}`}
          >
            Save
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete split"
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          data-testid={`button-delete-split-${row.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}

function NewSplitForm({
  kind,
  onSubmit,
  onCancel,
  busy,
}: {
  kind: "publishing" | "mechanical";
  onSubmit: (body: Partial<SplitRow>) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState(kind === "publishing" ? "Songwriter" : "Performer");
  const [percent, setPercent] = useState("");
  const [pro, setPro] = useState("");
  const valid = name.trim().length > 0 && percent.trim().length > 0 && isFinite(Number(percent));
  return (
    <div className="border border-dashed border-slate-300 rounded-md p-3 space-y-2 bg-slate-50/60" data-testid={`form-new-split-${kind}`}>
      <div className="grid grid-cols-[1.6fr_1fr_90px_1fr] gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus className="h-8 text-[13px]" data-testid={`input-new-split-name-${kind}`} />
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className="h-8 text-[13px]" data-testid={`input-new-split-role-${kind}`} />
        <div className="flex items-center gap-1">
          <Input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="decimal" placeholder="%" className="h-8 text-[13px] tabular-nums text-right" data-testid={`input-new-split-percent-${kind}`} />
          <span className="text-[12px] text-slate-400">%</span>
        </div>
        {kind === "publishing" ? (
          <Input value={pro} onChange={(e) => setPro(e.target.value)} placeholder="PRO" className="h-8 text-[13px]" data-testid={`input-new-split-pro-${kind}`} />
        ) : <div />}
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="h-8 px-3 text-[13px] text-slate-600 hover:text-slate-900" data-testid={`button-cancel-new-split-${kind}`}>Cancel</button>
        <button
          onClick={() => {
            const body: any = {
              name: name.trim(),
              role: role.trim() || (kind === "publishing" ? "Songwriter" : "Performer"),
              percentBp: Math.round(Number(percent) * 100),
            };
            if (kind === "publishing" && pro.trim()) body.proAffiliation = pro.trim();
            onSubmit(body);
          }}
          disabled={!valid || busy}
          className="h-8 px-3 rounded-md text-[13px] font-medium bg-[var(--brand-blue)] text-white disabled:opacity-50"
          data-testid={`button-submit-new-split-${kind}`}
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

// ─── Import sheet (Google Sheet URL or CSV/XLSX) ─────────────────────
// NightBirde songsheet layout: columns are flexible — server's
// parseSheetRows looks for case-insensitive aliases (song/track,
// name/writer/composer, role, %/percent/split, pro, publisher,
// kind). Preview comes back from the server (sidesteps CORS on
// docs.google.com). Operator picks Publishing vs Master (or lets the
// per-row "kind" column override), then "Apply" runs the import.
// `replace: true` wipes existing rows on each affected (song, kind)
// pair before inserting — typical when re-pulling a published sheet.

function SplitsImportSheet({
  albumId,
  songs,
  onClose,
}: {
  albumId: string;
  songs: Array<{ id: string; title: string; trackNumber: number }>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sheetUrl, setSheetUrl] = useState("");
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<any[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [kind, setKind] = useState<"publishing" | "mechanical">("publishing");
  const [replace, setReplace] = useState(true);

  const parseMut = useMutation({
    mutationFn: async () => {
      const body: any = {};
      if (sheetUrl.trim()) body.sheetUrl = sheetUrl.trim();
      else if (csvText.trim()) body.csvText = csvText;
      else throw new Error("Paste a Google Sheet URL or CSV text first.");
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/splits/import-parse`, body);
      return r.json();
    },
    onSuccess: (data) => {
      setParsed(data.rows ?? []);
      setNotice(typeof data.notice === "string" && data.notice.length > 0 ? data.notice : null);
    },
    onError: (e: any) => toast({ title: "Couldn't read sheet", description: e?.message ?? "", variant: "destructive" }),
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/splits/import`, {
        kind,
        replace,
        rows: parsed,
      });
      return r.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "splits"] });
      toast({
        title: "Splits imported",
        description: `${data.createdCount} rows added${data.unmatchedCount ? `, ${data.unmatchedCount} unmatched (track title didn't match)` : ""}.`,
      });
      onClose();
    },
    onError: (e: any) => toast({ title: "Import failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const songTitleSet = useMemo(() => new Set(songs.map((s) => s.title.trim().toLowerCase())), [songs]);
  const unmatched = parsed ? parsed.filter((r) => !songTitleSet.has((r.songTitle ?? "").trim().toLowerCase())) : [];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4 max-h-[85vh] overflow-y-auto" data-testid="dialog-import-splits">
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-[17px] font-semibold text-slate-900">Import splits from a sheet</DialogTitle>
          <DialogDescription className="text-[13px] text-slate-500">
            Paste a Google Sheet URL (shared "Anyone with the link can view") or drop in CSV. The first row is the header — columns map by name (song / writer / role / % / pro / publisher / kind).
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <div className="space-y-4">
            <div>
              <Label className="text-[12.5px] font-medium text-slate-700">Google Sheet URL</Label>
              <Input
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="mt-1"
                data-testid="input-sheet-url"
              />
            </div>
            <div className="text-center text-[11px] text-slate-400 uppercase tracking-wider">or</div>
            <div>
              <Label className="text-[12.5px] font-medium text-slate-700">Paste CSV</Label>
              <Textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="song,name,role,percent,pro&#10;Wide Awake,NightBirde,Songwriter,50,BMI&#10;…"
                rows={6}
                className="mt-1 font-mono text-[12px]"
                data-testid="input-csv-text"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose} data-testid="button-cancel-import">Cancel</Button>
              <Button onClick={() => parseMut.mutate()} disabled={parseMut.isPending} data-testid="button-parse-sheet">
                {parseMut.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Reading…</> : "Read sheet"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <Label className="text-[12.5px] font-medium text-slate-700">Default kind</Label>
                <div className="mt-1 inline-flex border border-slate-200 rounded-md overflow-hidden text-[12.5px]">
                  <button
                    onClick={() => setKind("publishing")}
                    className={`px-3 py-1 ${kind === "publishing" ? "bg-[var(--brand-blue)] text-white" : "bg-white text-slate-700"}`}
                    data-testid="toggle-kind-publishing"
                  >Publishing</button>
                  <button
                    onClick={() => setKind("mechanical")}
                    className={`px-3 py-1 ${kind === "mechanical" ? "bg-[var(--brand-blue)] text-white" : "bg-white text-slate-700"}`}
                    data-testid="toggle-kind-mechanical"
                  >Master</button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Rows with a "kind" column override this.</p>
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-slate-700">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} data-testid="checkbox-replace" />
                Replace existing rows on affected tracks
              </label>
            </div>

            {notice && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2" data-testid="callout-import-notice">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>{notice}</div>
              </div>
            )}

            {unmatched.length > 0 && (
              <div className="text-[12.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  {unmatched.length} row{unmatched.length === 1 ? "" : "s"} reference track titles that don't match this album. They will be skipped.
                </div>
              </div>
            )}

            <div className="border border-slate-200 rounded-md max-h-72 overflow-y-auto">
              <table className="w-full text-[12.5px]">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                  <tr>
                    <th className="text-left px-2 py-1.5">Song</th>
                    <th className="text-left px-2 py-1.5">Name</th>
                    <th className="text-left px-2 py-1.5">Role</th>
                    <th className="text-right px-2 py-1.5">%</th>
                    <th className="text-left px-2 py-1.5">PRO</th>
                    <th className="text-left px-2 py-1.5">Kind</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((r, i) => {
                    const matched = songTitleSet.has((r.songTitle ?? "").trim().toLowerCase());
                    return (
                      <tr key={i} className={`border-t border-slate-100 ${matched ? "" : "opacity-40"}`} data-testid={`row-preview-${i}`}>
                        <td className="px-2 py-1.5">{r.songTitle}</td>
                        <td className="px-2 py-1.5">{r.name}</td>
                        <td className="px-2 py-1.5">{r.role}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.percent}</td>
                        <td className="px-2 py-1.5">{r.proAffiliation ?? ""}</td>
                        <td className="px-2 py-1.5">{r.kindHint ?? kind}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setParsed(null); setNotice(null); }} data-testid="button-back-import">Back</Button>
              <Button onClick={() => applyMut.mutate()} disabled={applyMut.isPending || parsed.length === 0} data-testid="button-apply-import">
                {applyMut.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Importing…</> : `Import ${parsed.length} row${parsed.length === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Read-only splits rail for Person + Organization admin sheets ───
// Used by AdminPerson and any future AdminOrganization view. Always
// read-only here — splits are owned by the parent album editor; this
// is just a "where does this person earn?" rollup with deep-links.

export function PersonSplitsRail({ personId }: { personId: string }) {
  const { data, isLoading } = useQuery<{
    publishing: Array<SplitRow & { song: { id: string; title: string; albumId: string; albumTitle: string } | null }>;
    mechanical: Array<SplitRow & { song: { id: string; title: string; albumId: string; albumTitle: string } | null }>;
  }>({
    queryKey: ["/api/admin/people", personId, "splits"],
  });
  return <SplitsReadOnlyRail data={data} isLoading={isLoading} />;
}
export function OrganizationSplitsRail({ orgId }: { orgId: string }) {
  const { data, isLoading } = useQuery<{
    publishing: Array<SplitRow & { song: { id: string; title: string; albumId: string; albumTitle: string } | null }>;
    mechanical: Array<SplitRow & { song: { id: string; title: string; albumId: string; albumTitle: string } | null }>;
  }>({
    queryKey: ["/api/admin/organizations", orgId, "splits"],
  });
  return <SplitsReadOnlyRail data={data} isLoading={isLoading} />;
}

function SplitsReadOnlyRail({
  data,
  isLoading,
}: {
  data?: {
    publishing: Array<SplitRow & { song: { id: string; title: string; albumId: string; albumTitle: string } | null }>;
    mechanical: Array<SplitRow & { song: { id: string; title: string; albumId: string; albumTitle: string } | null }>;
  };
  isLoading: boolean;
}) {
  if (isLoading) return <div className="py-6 flex justify-center"><Spinner className="w-5 h-5" /></div>;
  const pub = data?.publishing ?? [];
  const mech = data?.mechanical ?? [];
  if (pub.length === 0 && mech.length === 0) {
    return (
      <div className="text-[13px] text-slate-500 py-6">
        No splits recorded yet. Splits are added from the album's Splits tab.
      </div>
    );
  }
  return (
    <div className="space-y-6" data-testid="rail-splits-readonly">
      <ReadOnlyList title="Publishing" rows={pub} />
      <ReadOnlyList title="Master Recording" rows={mech} />
    </div>
  );
}
function ReadOnlyList({
  title,
  rows,
}: {
  title: string;
  rows: Array<SplitRow & { song: { id: string; title: string; albumId: string; albumTitle: string } | null }>;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="text-[13px] font-semibold text-slate-900 mb-2">{title} ({rows.length})</h3>
      <ul className="border border-slate-200 rounded-md divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.id} className="px-3 py-2 flex items-center justify-between gap-3 text-[13px]" data-testid={`readonly-split-${r.id}`}>
            <div className="min-w-0">
              <div className="font-medium text-slate-900 truncate">
                {r.song ? (
                  <Link
                    href={`/admin/albums/${r.song.albumId}?tab=splits&track=${r.song.id}`}
                    className="text-inherit hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
                  >
                    {r.song.title}
                  </Link>
                ) : "(song removed)"}
              </div>
              <div className="text-[11.5px] text-slate-500 truncate">
                {r.song?.albumTitle ?? ""} · {r.role}{r.proAffiliation ? ` · ${r.proAffiliation}` : ""}
              </div>
            </div>
            <div className="text-[13px] font-semibold tabular-nums text-slate-700 shrink-0">{bpToPct(r.percentBp)}%</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
