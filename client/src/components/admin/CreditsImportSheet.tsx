// Credits importer — sheet on the admin Album page. Three-step flow:
//   1. Source. Paste a Dropbox link or drop a PDF / .docx / .txt.
//   2. Review. AI proposal is shown with per-person match pickers
//      (existing vs. create new vs. skip), and a counts summary.
//      The original prose is editable in a textarea (saved to
//      albums.linerNotes verbatim).
//   3. Commit. Writes People + per-track writers + per-track performers
//      and stores the liner notes. Invalidates relevant queries.
//
// Server contract lives in server/routes.ts:
//   POST /api/admin/albums/:id/import-credits/parse    → { proposal, matches, songs }
//   POST /api/admin/albums/:id/import-credits/commit   → { ok, createdPeople, writerCount, performerCount }

import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, FileText, X, ChevronRight, UserPlus, Check, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface PersonCandidate {
  id: string;
  name: string;
  photoUrl?: string | null;
}

interface ParseResponse {
  proposal: {
    people: Array<{ tag: string; name: string; email?: string | null }>;
    writers: Array<{ personTag: string; songTitle: string; role: string }>;
    performers: Array<{
      personTag: string;
      songTitle: string;
      role: string;
      instrumentHint?: string | null;
    }>;
    linerNotes: string;
  };
  matches: Record<string, { status: "exact" | "ambiguous" | "new"; candidates: PersonCandidate[] }>;
  songs: Array<{ id: string; title: string; trackNumber: number }>;
}

type PersonDecision =
  | { action: "use"; personId: string; name: string; email: string | null }
  | { action: "create"; name: string; email: string | null }
  | { action: "skip" };

export function CreditsImportSheet({
  albumId,
  open,
  onOpenChange,
}: {
  albumId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"source" | "review">("source");
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResponse | null>(null);
  const [decisions, setDecisions] = useState<Record<string, PersonDecision>>({});
  const [linerNotes, setLinerNotes] = useState("");

  const reset = () => {
    setStep("source");
    setSourceUrl("");
    setFile(null);
    setParsed(null);
    setDecisions({});
    setLinerNotes("");
  };

  const parseMutation = useMutation({
    mutationFn: async () => {
      const token = getAuthToken();
      const form = new FormData();
      if (file) form.append("file", file);
      if (sourceUrl.trim()) form.append("sourceUrl", sourceUrl.trim());
      const res = await fetch(`/api/admin/albums/${albumId}/import-credits/parse`, {
        method: "POST",
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Parse failed (${res.status})`);
      }
      return (await res.json()) as ParseResponse;
    },
    onSuccess: (data) => {
      setParsed(data);
      // Seed default decisions from matches.
      const initial: Record<string, PersonDecision> = {};
      for (const p of data.proposal.people) {
        const m = data.matches[p.tag];
        if (m?.status === "exact" && m.candidates[0]) {
          initial[p.tag] = {
            action: "use",
            personId: m.candidates[0].id,
            name: p.name,
            email: p.email ?? null,
          };
        } else {
          initial[p.tag] = { action: "create", name: p.name, email: p.email ?? null };
        }
      }
      setDecisions(initial);
      setLinerNotes(data.proposal.linerNotes);
      setStep("review");
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't parse credits", description: err.message, variant: "destructive" });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error("Nothing to commit.");
      return apiRequest("POST", `/api/admin/albums/${albumId}/import-credits/commit`, {
        proposal: parsed.proposal,
        personDecisions: decisions,
        linerNotes,
      });
    },
    onSuccess: async (resp: any) => {
      const body = await resp.json().catch(() => ({}));
      const w = body.writerCount ?? 0;
      const p = body.performerCount ?? 0;
      const np = body.createdPeople?.length ?? 0;
      toast({
        title: "Credits imported",
        description: `${np} new ${np === 1 ? "person" : "people"} · ${w} writer ${w === 1 ? "row" : "rows"} · ${p} performer ${p === 1 ? "row" : "rows"}`,
      });
      // Refresh every surface that pulls credits or the album itself.
      qc.invalidateQueries({ queryKey: ["/api/albums"] });
      qc.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      qc.invalidateQueries({ queryKey: ["/api/albums", albumId, "credits"] });
      qc.invalidateQueries({ queryKey: ["/api/people"] });
      qc.invalidateQueries({ queryKey: [`/api/admin/albums/${albumId}/credits`] });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't save credits", description: err.message, variant: "destructive" });
    },
  });

  const counts = useMemo(() => {
    if (!parsed) return { activePeople: 0, writers: 0, performers: 0 };
    const skipped = new Set(
      Object.entries(decisions)
        .filter(([, d]) => d.action === "skip")
        .map(([tag]) => tag),
    );
    return {
      activePeople: parsed.proposal.people.length - skipped.size,
      writers: parsed.proposal.writers.filter((w) => !skipped.has(w.personTag)).length,
      performers: parsed.proposal.performers.filter((p) => !skipped.has(p.personTag)).length,
    };
  }, [parsed, decisions]);

  const canSubmit = !!file || !!sourceUrl.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent
        className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col"
        data-testid="dialog-credits-import"
      >
        <DialogHeader>
          <DialogTitle>Import credits</DialogTitle>
          <DialogDescription>
            {step === "source"
              ? "Paste a Dropbox link or drop a credits doc — we'll read it against this album's tracks and propose People + per-track writers + performers."
              : "Review the proposal. Match people to existing rows, drop ones you don't want, and edit the liner notes. Nothing is saved until you confirm."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1">
          {step === "source" ? (
            <SourceStep
              sourceUrl={sourceUrl}
              setSourceUrl={setSourceUrl}
              file={file}
              setFile={setFile}
              fileInputRef={fileInputRef}
              busy={parseMutation.isPending}
            />
          ) : parsed ? (
            <ReviewStep
              parsed={parsed}
              decisions={decisions}
              setDecisions={setDecisions}
              linerNotes={linerNotes}
              setLinerNotes={setLinerNotes}
              counts={counts}
            />
          ) : null}
        </div>

        <DialogFooter className="border-t pt-3 mt-2 gap-2">
          {step === "source" ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={parseMutation.isPending}
                data-testid="button-credits-cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => parseMutation.mutate()}
                disabled={!canSubmit || parseMutation.isPending}
                data-testid="button-credits-analyze"
              >
                {parseMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Reading credits…
                  </>
                ) : (
                  <>
                    Analyze
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep("source")}
                disabled={commitMutation.isPending}
                data-testid="button-credits-back"
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={() => commitMutation.mutate()}
                disabled={commitMutation.isPending || counts.activePeople === 0}
                data-testid="button-credits-commit"
              >
                {commitMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Save credits
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Step 1: pick a source ─────────────────────────────────────────── */

function SourceStep({
  sourceUrl,
  setSourceUrl,
  file,
  setFile,
  fileInputRef,
  busy,
}: {
  sourceUrl: string;
  setSourceUrl: (v: string) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  busy: boolean;
}) {
  return (
    <div className="space-y-5 py-2">
      <div>
        <Label htmlFor="credits-url">Dropbox link</Label>
        <Input
          id="credits-url"
          type="url"
          placeholder="https://www.dropbox.com/scl/fi/…/credits.pdf?rlkey=…&dl=0"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          disabled={busy || !!file}
          data-testid="input-credits-url"
        />
        <p className="text-xs text-slate-500 mt-1">
          Paste a Dropbox shareable link to a single PDF, Word doc, or .txt file.
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" />
        <span>OR</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <div>
        <Label>Upload a file</Label>
        <div
          className={cn(
            "mt-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6",
            "flex flex-col items-center justify-center gap-2 text-center cursor-pointer hover:bg-slate-100",
            file && "border-solid border-emerald-300 bg-emerald-50/40",
          )}
          onClick={() => !busy && fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) {
              setFile(f);
              setSourceUrl("");
            }
          }}
          data-testid="dropzone-credits-file"
        >
          {file ? (
            <>
              <FileText className="h-7 w-7 text-emerald-600" />
              <div className="text-sm font-medium text-slate-800">{file.name}</div>
              <div className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB</div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                data-testid="button-credits-clear-file"
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Remove
              </Button>
            </>
          ) : (
            <>
              <Upload className="h-7 w-7 text-slate-400" />
              <div className="text-sm font-medium text-slate-700">Drop a credits doc here</div>
              <div className="text-xs text-slate-500">PDF, Word (.docx), or .txt — max 25 MB</div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(f);
                setSourceUrl("");
              }
            }}
            data-testid="input-credits-file"
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Step 2: review the proposal ────────────────────────────────────── */

function ReviewStep({
  parsed,
  decisions,
  setDecisions,
  linerNotes,
  setLinerNotes,
  counts,
}: {
  parsed: ParseResponse;
  decisions: Record<string, PersonDecision>;
  setDecisions: React.Dispatch<React.SetStateAction<Record<string, PersonDecision>>>;
  linerNotes: string;
  setLinerNotes: (v: string) => void;
  counts: { activePeople: number; writers: number; performers: number };
}) {
  // Per-person row counters so the operator can see how much each row
  // contributes before they decide to skip it.
  const perPersonStats = useMemo(() => {
    const m = new Map<string, { writers: number; performers: number }>();
    for (const w of parsed.proposal.writers) {
      const s = m.get(w.personTag) || { writers: 0, performers: 0 };
      s.writers++;
      m.set(w.personTag, s);
    }
    for (const p of parsed.proposal.performers) {
      const s = m.get(p.personTag) || { writers: 0, performers: 0 };
      s.performers++;
      m.set(p.personTag, s);
    }
    return m;
  }, [parsed]);

  return (
    <div className="space-y-5 py-2">
      <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-sm flex items-center gap-4">
        <span className="font-medium text-slate-700">{counts.activePeople} people</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-600">{counts.writers} writer rows</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-600">{counts.performers} performer rows</span>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">People</h3>
        <div className="space-y-2">
          {parsed.proposal.people.map((p) => (
            <PersonRow
              key={p.tag}
              proposal={p}
              match={parsed.matches[p.tag]}
              decision={decisions[p.tag]}
              stats={perPersonStats.get(p.tag) || { writers: 0, performers: 0 }}
              onChange={(d) => setDecisions((prev) => ({ ...prev, [p.tag]: d }))}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Liner notes</h3>
        <Textarea
          value={linerNotes}
          onChange={(e) => setLinerNotes(e.target.value)}
          rows={6}
          className="font-mono text-xs"
          data-testid="textarea-credits-liner-notes"
        />
        <p className="text-xs text-slate-500 mt-1">
          Saved verbatim to the album so anything we couldn't slot into a row stays readable.
        </p>
      </section>
    </div>
  );
}

function PersonRow({
  proposal,
  match,
  decision,
  stats,
  onChange,
}: {
  proposal: { tag: string; name: string; email?: string | null };
  match?: { status: "exact" | "ambiguous" | "new"; candidates: PersonCandidate[] };
  decision: PersonDecision | undefined;
  stats: { writers: number; performers: number };
  onChange: (d: PersonDecision) => void;
}) {
  const action = decision?.action ?? "create";
  const name = (decision && decision.action !== "skip" ? decision.name : null) ?? proposal.name;
  const email =
    (decision && decision.action !== "skip" ? decision.email ?? "" : proposal.email ?? "") ?? "";

  const showPicker = !!match && match.candidates.length > 0;
  const initialPersonId =
    decision?.action === "use" ? decision.personId : match?.candidates[0]?.id;

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 p-3 space-y-3 bg-white",
        action === "skip" && "opacity-60",
      )}
      data-testid={`row-credits-person-${proposal.tag}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium text-slate-800 truncate" data-testid={`text-person-name-${proposal.tag}`}>
              {proposal.name}
            </div>
            {match?.status === "exact" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] px-2 py-0.5">
                <Check className="h-3 w-3" /> Matched
              </span>
            )}
            {match?.status === "ambiguous" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 text-[11px] px-2 py-0.5">
                <AlertCircle className="h-3 w-3" /> {match.candidates.length} possible matches
              </span>
            )}
            {match?.status === "new" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 text-[11px] px-2 py-0.5">
                <UserPlus className="h-3 w-3" /> New
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {stats.writers} writer · {stats.performers} performer
            {proposal.email ? ` · ${proposal.email}` : ""}
          </div>
        </div>
      </div>

      <RadioGroup
        value={action}
        onValueChange={(val) => {
          if (val === "skip") return onChange({ action: "skip" });
          if (val === "use") {
            return onChange({
              action: "use",
              personId: initialPersonId || "",
              name,
              email: email || null,
            });
          }
          return onChange({ action: "create", name, email: email || null });
        }}
        className="grid grid-cols-3 gap-2"
      >
        <label
          className={cn(
            "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs cursor-pointer",
            action === "use" ? "border-sky-300 bg-sky-50" : "border-slate-200",
            !showPicker && "opacity-50 cursor-not-allowed",
          )}
        >
          <RadioGroupItem
            value="use"
            disabled={!showPicker}
            data-testid={`radio-person-use-${proposal.tag}`}
          />
          Use existing
        </label>
        <label
          className={cn(
            "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs cursor-pointer",
            action === "create" ? "border-sky-300 bg-sky-50" : "border-slate-200",
          )}
        >
          <RadioGroupItem value="create" data-testid={`radio-person-create-${proposal.tag}`} />
          Create new
        </label>
        <label
          className={cn(
            "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs cursor-pointer",
            action === "skip" ? "border-rose-300 bg-rose-50" : "border-slate-200",
          )}
        >
          <RadioGroupItem value="skip" data-testid={`radio-person-skip-${proposal.tag}`} />
          Skip
        </label>
      </RadioGroup>

      {action === "use" && showPicker && (
        <Select
          value={decision?.action === "use" ? decision.personId : ""}
          onValueChange={(v) =>
            onChange({ action: "use", personId: v, name, email: email || null })
          }
        >
          <SelectTrigger className="h-8 text-xs" data-testid={`select-person-${proposal.tag}`}>
            <SelectValue placeholder="Pick a person" />
          </SelectTrigger>
          <SelectContent>
            {match!.candidates.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {action === "create" && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={name}
            placeholder="Name"
            onChange={(e) =>
              onChange({ action: "create", name: e.target.value, email: email || null })
            }
            className="h-8 text-xs"
            data-testid={`input-person-name-${proposal.tag}`}
          />
          <Input
            value={email}
            placeholder="email (optional)"
            onChange={(e) =>
              onChange({ action: "create", name, email: e.target.value || null })
            }
            className="h-8 text-xs"
            data-testid={`input-person-email-${proposal.tag}`}
          />
        </div>
      )}
    </div>
  );
}
