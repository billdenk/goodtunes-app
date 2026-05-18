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
import { Loader2, Upload, FileText, X, ChevronRight, UserPlus, Check, AlertCircle, User as UserIcon, SkipForward } from "lucide-react";
import { SiSpotify } from "react-icons/si";
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
import { apiRequest, getAuthToken, queryClient } from "@/lib/queryClient";
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
    albumCredits: Array<{ personTag: string; role: string }>;
    linerNotes: string;
  };
  matches: Record<string, { status: "exact" | "ambiguous" | "new"; candidates: PersonCandidate[] }>;
  songs: Array<{ id: string; title: string; trackNumber: number }>;
}

type PersonDecision =
  | { action: "use"; personId: string; name: string; email: string | null }
  | { action: "create"; name: string; email: string | null }
  | { action: "skip" };

interface SpotifyCandidate {
  id: string;
  name: string;
  spotifyUrl: string;
  photoUrl: string | null;
  popularity: number;
  followers: number;
  genres: string[];
}

interface SpotifyReportItem {
  personId: string;
  name: string;
  status: "matched" | "ambiguous" | "none" | "error";
  match?: SpotifyCandidate;
  candidates?: SpotifyCandidate[];
}

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

  const [step, setStep] = useState<"source" | "review" | "spotify">("source");
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResponse | null>(null);
  const [decisions, setDecisions] = useState<Record<string, PersonDecision>>({});
  const [linerNotes, setLinerNotes] = useState("");
  // Queue of newly-created people that couldn't be auto-matched on
  // Spotify (status "ambiguous" or "none"). Walked one at a time after
  // commit so the admin can pick a candidate or skip for later.
  const [spotifyQueue, setSpotifyQueue] = useState<SpotifyReportItem[]>([]);
  const [spotifyIndex, setSpotifyIndex] = useState(0);
  // Summary toast values stashed across the commit → spotify step so
  // we can show one final toast when the matching flow ends.
  const [commitSummary, setCommitSummary] = useState<string>("");

  const reset = () => {
    setStep("source");
    setSourceUrl("");
    setFile(null);
    setParsed(null);
    setDecisions({});
    setLinerNotes("");
    setSpotifyQueue([]);
    setSpotifyIndex(0);
    setCommitSummary("");
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
      const a = body.albumCreditCount ?? 0;
      const np = body.createdPeople?.length ?? 0;
      const summary = `${np} new ${np === 1 ? "person" : "people"} · ${w} writer ${w === 1 ? "row" : "rows"} · ${p} performer ${p === 1 ? "row" : "rows"} · ${a} album credit ${a === 1 ? "row" : "rows"}`;
      // Refresh every surface that pulls credits or the album itself.
      qc.invalidateQueries({ queryKey: ["/api/albums"] });
      qc.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      qc.invalidateQueries({ queryKey: ["/api/albums", albumId, "credits"] });
      qc.invalidateQueries({ queryKey: ["/api/people"] });
      qc.invalidateQueries({ queryKey: [`/api/admin/albums/${albumId}/credits`] });

      const report: SpotifyReportItem[] = Array.isArray(body.spotifyReport) ? body.spotifyReport : [];
      const matched = report.filter((r) => r.status === "matched").length;
      const queue = report.filter((r) => r.status === "ambiguous" || r.status === "none");
      const summaryWithSpotify = `${summary}${report.length ? ` · ${matched} auto-matched on Spotify` : ""}`;

      if (queue.length === 0) {
        toast({ title: "Credits imported", description: summaryWithSpotify });
        reset();
        onOpenChange(false);
        return;
      }
      // Walk the admin through the unmatched people before closing.
      setCommitSummary(summaryWithSpotify);
      setSpotifyQueue(queue);
      setSpotifyIndex(0);
      setStep("spotify");
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't save credits", description: err.message, variant: "destructive" });
    },
  });

  const counts = useMemo(() => {
    if (!parsed) return { activePeople: 0, writers: 0, performers: 0, albumCredits: 0 };
    const skipped = new Set(
      Object.entries(decisions)
        .filter(([, d]) => d.action === "skip")
        .map(([tag]) => tag),
    );
    const ac = parsed.proposal.albumCredits ?? [];
    return {
      activePeople: parsed.proposal.people.length - skipped.size,
      writers: parsed.proposal.writers.filter((w) => !skipped.has(w.personTag)).length,
      performers: parsed.proposal.performers.filter((p) => !skipped.has(p.personTag)).length,
      albumCredits: ac.filter((a) => !skipped.has(a.personTag)).length,
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
        className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col bg-white text-slate-900 rounded-xl border-slate-200 shadow-xl p-6 gap-4"
        data-testid="dialog-credits-import"
      >
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-[17px] font-semibold text-slate-900">
            Import credits
          </DialogTitle>
          <DialogDescription className="text-[13px] font-normal text-slate-500">
            {step === "source" &&
              "Paste a Dropbox link or drop a credits doc — we'll read it against this album's tracks and propose People + per-track writers + performers."}
            {step === "review" &&
              "Review the proposal. Match people to existing rows, drop ones you don't want, and edit the liner notes. Nothing is saved until you confirm."}
            {step === "spotify" &&
              "Credits saved. A few new people couldn't be matched on Spotify automatically — pick the right artist or skip to handle later."}
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
          ) : step === "review" && parsed ? (
            <ReviewStep
              parsed={parsed}
              decisions={decisions}
              setDecisions={setDecisions}
              linerNotes={linerNotes}
              setLinerNotes={setLinerNotes}
              counts={counts}
            />
          ) : step === "spotify" && spotifyQueue[spotifyIndex] ? (
            <SpotifyStep
              item={spotifyQueue[spotifyIndex]}
              index={spotifyIndex}
              total={spotifyQueue.length}
              onPicked={() => {
                // Advance past this person; finish when we walk off the end.
                const next = spotifyIndex + 1;
                if (next >= spotifyQueue.length) {
                  toast({ title: "Credits imported", description: commitSummary });
                  queryClient.invalidateQueries({ queryKey: ["/api/people"] });
                  reset();
                  onOpenChange(false);
                } else {
                  setSpotifyIndex(next);
                }
              }}
            />
          ) : null}
        </div>

        <DialogFooter className="border-t border-slate-200 pt-3 mt-2 gap-2">
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
          ) : step === "review" ? (
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
          ) : (
            // Spotify step footer: a quiet "Finish later" so the admin
            // can bail out at any point and resolve the rest manually
            // from each Person page later.
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                toast({ title: "Credits imported", description: commitSummary });
                queryClient.invalidateQueries({ queryKey: ["/api/people"] });
                reset();
                onOpenChange(false);
              }}
              data-testid="button-spotify-finish-later"
            >
              Finish later
            </Button>
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
      <div className="space-y-1.5">
        <Label htmlFor="credits-url" className="text-[12.5px] font-medium text-slate-700">
          Dropbox link
        </Label>
        <Input
          id="credits-url"
          type="url"
          placeholder="https://www.dropbox.com/scl/fi/…/credits.pdf?rlkey=…&dl=0"
          value={sourceUrl}
          onChange={(e) => {
            setSourceUrl(e.target.value);
            if (e.target.value && file) setFile(null);
          }}
          disabled={busy}
          autoFocus
          data-testid="input-credits-url"
          className="h-10 text-[14px] bg-white text-slate-900 border-slate-300 placeholder:text-slate-400"
        />
        <p className="text-xs text-slate-500">
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
  counts: { activePeople: number; writers: number; performers: number; albumCredits: number };
}) {
  // Per-person row counters so the operator can see how much each row
  // contributes before they decide to skip it.
  const perPersonStats = useMemo(() => {
    const m = new Map<string, { writers: number; performers: number; albumCredits: number }>();
    const ensure = (tag: string) => {
      const s = m.get(tag) || { writers: 0, performers: 0, albumCredits: 0 };
      m.set(tag, s);
      return s;
    };
    for (const w of parsed.proposal.writers) ensure(w.personTag).writers++;
    for (const p of parsed.proposal.performers) ensure(p.personTag).performers++;
    for (const a of parsed.proposal.albumCredits ?? []) ensure(a.personTag).albumCredits++;
    return m;
  }, [parsed]);

  // Resolve each albumCredit tag to its proposed name for the review list.
  const peopleByTag = useMemo(
    () => new Map(parsed.proposal.people.map((p) => [p.tag, p])),
    [parsed],
  );
  const albumCreditsRows = parsed.proposal.albumCredits ?? [];

  return (
    <div className="space-y-5 py-2">
      <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-sm flex items-center gap-3 flex-wrap">
        <span className="font-medium text-slate-700">{counts.activePeople} people</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-600">{counts.writers} writer rows</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-600">{counts.performers} performer rows</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-600">{counts.albumCredits} album credit rows</span>
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
              stats={perPersonStats.get(p.tag) || { writers: 0, performers: 0, albumCredits: 0 }}
              onChange={(d) => setDecisions((prev) => ({ ...prev, [p.tag]: d }))}
            />
          ))}
        </div>
      </section>

      {albumCreditsRows.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Album credits</h3>
          <p className="text-xs text-slate-500 mb-2">
            Produced by / Mixed by / Mastered by / engineering — applied to the whole album.
            Skipping a person above also drops their album credits.
          </p>
          <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
            {albumCreditsRows.map((row, i) => {
              const person = peopleByTag.get(row.personTag);
              const skipped = decisions[row.personTag]?.action === "skip";
              return (
                <div
                  key={`${row.personTag}-${row.role}-${i}`}
                  className={cn(
                    "flex items-center justify-between gap-3 px-3 py-2 text-sm",
                    skipped && "opacity-40 line-through",
                  )}
                  data-testid={`row-album-credit-${i}`}
                >
                  <span className="font-medium text-slate-700 truncate">
                    {person?.name ?? row.personTag}
                  </span>
                  <span className="text-xs text-slate-500">{row.role}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Liner notes</h3>
        <Textarea
          value={linerNotes}
          onChange={(e) => setLinerNotes(e.target.value)}
          rows={6}
          className="font-mono text-xs bg-white text-slate-900 border-slate-300 placeholder:text-slate-400"
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
  stats: { writers: number; performers: number; albumCredits: number };
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
            {stats.albumCredits > 0 ? ` · ${stats.albumCredits} album credit` : ""}
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
          <SelectTrigger
            className="h-8 text-xs bg-white text-slate-900 border-slate-300"
            data-testid={`select-person-${proposal.tag}`}
          >
            <SelectValue placeholder="Pick a person" />
          </SelectTrigger>
          <SelectContent className="bg-white text-slate-900 border-slate-200">
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
            className="h-8 text-xs bg-white text-slate-900 border-slate-300 placeholder:text-slate-400"
            data-testid={`input-person-name-${proposal.tag}`}
          />
          <Input
            value={email}
            placeholder="email (optional)"
            onChange={(e) =>
              onChange({ action: "create", name, email: e.target.value || null })
            }
            className="h-8 text-xs bg-white text-slate-900 border-slate-300 placeholder:text-slate-400"
            data-testid={`input-person-email-${proposal.tag}`}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Step 3: Spotify matching (post-commit) ─────────────────────────── */

function SpotifyStep({
  item,
  index,
  total,
  onPicked,
}: {
  item: SpotifyReportItem;
  index: number;
  total: number;
  onPicked: () => void;
}) {
  const { toast } = useToast();
  const candidates = item.candidates ?? [];

  const pickMut = useMutation({
    mutationFn: async (c: SpotifyCandidate) => {
      // Saves Spotify URL + portrait. Portrait write is unconditional
      // here because the person was just created moments ago in this
      // same flow, so we know it has no admin-uploaded photo yet.
      const res = await apiRequest("PUT", `/api/admin/people/${item.personId}`, {
        spotifyUrl: c.spotifyUrl,
        ...(c.photoUrl ? { photoUrl: c.photoUrl } : {}),
      });
      return res.json();
    },
    onSuccess: (_data, c) => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Linked", description: `${item.name} → ${c.name}` });
      onPicked();
    },
    onError: (err: any) =>
      toast({
        title: "Couldn't save",
        description: err?.message ?? "Try again.",
        variant: "destructive",
      }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11.5px] font-medium uppercase tracking-wide text-slate-500">
            {index + 1} of {total}
          </div>
          <div className="mt-0.5 text-[19px] font-semibold text-slate-900" data-testid="text-spotify-person-name">
            {item.name}
          </div>
        </div>
        <SiSpotify className="w-6 h-6 text-[#1DB954]" />
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
          <AlertCircle className="w-5 h-5 mx-auto text-slate-400 mb-1.5" />
          <div className="text-[13px] font-semibold text-slate-700">
            No Spotify artist found for "{item.name}"
          </div>
          <div className="text-[12px] text-slate-500 mt-0.5">
            You can search manually on this person's Streaming tab later.
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
          {candidates.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => pickMut.mutate(c)}
                disabled={pickMut.isPending}
                className="w-full flex items-center gap-3 py-3 px-3 text-left hover:bg-slate-50 disabled:opacity-60"
                data-testid={`button-pick-spotify-${c.id}`}
              >
                {c.photoUrl ? (
                  <img
                    src={c.photoUrl}
                    alt=""
                    className="w-14 h-14 rounded-full object-cover bg-slate-100"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-slate-200 inline-flex items-center justify-center text-slate-500">
                    <UserIcon className="w-6 h-6" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14.5px] text-slate-900 truncate">
                    {c.name}
                  </div>
                  <div className="text-[12px] text-slate-500 truncate">
                    {c.followers.toLocaleString()} followers
                    {c.genres.length > 0 && ` · ${c.genres.slice(0, 3).join(", ")}`}
                  </div>
                </div>
                <SiSpotify className="w-4 h-4 text-[#1DB954] shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="text-[11.5px] text-slate-500">
          {candidates.length > 0
            ? "Tap a candidate to link this person, or skip."
            : "Nothing to pick — skip to continue."}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onPicked}
          disabled={pickMut.isPending}
          data-testid="button-spotify-skip"
        >
          <SkipForward className="mr-1.5 h-3.5 w-3.5" />
          Skip
        </Button>
      </div>
    </div>
  );
}
