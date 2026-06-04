import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Disc3,
  GripVertical,
  RotateCcw,
  Undo2,
  Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  VINYL_FORMAT_RULES,
  type VinylFormat,
  type VinylSide,
} from "@shared/vinylFormatRules";
import {
  balancedLayout,
  computeVinylSuggestion,
  type VinylSongInput,
} from "@shared/vinylSideSolver";
import { cn } from "@/lib/utils";

// Task #541 — Vinyl-order view. Sits inside the Tracks panel under a
// segmented toggle (Digital | Vinyl). Drag-and-drop is grouped by
// physical side; the artist can move tracks within a side or across
// sides, see live per-side runtime, and gets a non-prescriptive
// warning when a side runs over the safe-length threshold for the
// chosen press format. Persists `vinylSide` + `vinylOrder` on each
// song independently of the digital `trackNumber` so streaming +
// library reads keep using the digital order.
//
// Task #594 — Tightened drag-activation + drop semantics so a tiny
// nudge no longer reorders; added Undo / Redo / Reset-to-original
// toolbar at the top of the panel so an accidental drop is always
// recoverable.

export interface VinylSongLite {
  id: string;
  title: string;
  trackNumber: number;
  duration: number;
  vinylSide?: VinylSide | null;
  vinylOrder?: number | null;
}

interface Props {
  albumId: string;
  songs: VinylSongLite[];
  vinylFormat: VinylFormat | null;
  // Sell-tab format pick — used as a sensible default when the artist
  // hasn't picked a vinyl-cut format yet.
  physicalFormat?: "single_lp" | "double_lp" | "seven_inch" | "cassette" | null;
}

// Translate the Sell-panel format (Single LP / Double LP / 7" / Cassette)
// into a default vinyl-cut format. Cassette has no vinyl mapping — the
// panel falls back to single-LP for the default warning thresholds, but
// the format selector lets the artist pick the actual cut anyway.
function defaultFormatFor(physical: Props["physicalFormat"]): VinylFormat {
  switch (physical) {
    case "double_lp":
      return "12_33_double";
    case "seven_inch":
      return "7_45";
    case "single_lp":
    case "cassette":
    case null:
    case undefined:
    default:
      return "12_33_single";
  }
}

function formatRuntime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// Two-row interpretation of "side":
//   - Working state (per-side ordered arrays) drives the UI.
//   - Persisted state (vinylSide + vinylOrder on each song) is what
//     the server stores; we re-derive working state from it on mount
//     and after a successful save.
type WorkingState = Record<VinylSide, string[]>;

function deriveWorkingState(
  songs: VinylSongLite[],
  sides: readonly VinylSide[],
): WorkingState {
  const state: WorkingState = { A: [], B: [], C: [], D: [] };
  // Bucket songs by their persisted side; unassigned songs go to the
  // first side so the artist sees the full tracklist on first open.
  const unassigned: VinylSongLite[] = [];
  for (const s of songs) {
    if (s.vinylSide && sides.includes(s.vinylSide as VinylSide)) {
      state[s.vinylSide as VinylSide].push(s.id);
    } else {
      unassigned.push(s);
    }
  }
  // Sort each side by persisted `vinylOrder`, falling back to digital
  // `trackNumber` (with id as a final tiebreaker for determinism).
  for (const side of sides) {
    state[side].sort((a, b) => {
      const sa = songs.find((s) => s.id === a)!;
      const sb = songs.find((s) => s.id === b)!;
      const oa = sa.vinylOrder ?? sa.trackNumber;
      const ob = sb.vinylOrder ?? sb.trackNumber;
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });
  }
  // Drop unassigned songs into the first side in digital-order. First-
  // open seeding: matches the spec ("Default vinyl_order from digital
  // order on first edit").
  if (unassigned.length > 0) {
    unassigned.sort((a, b) => a.trackNumber - b.trackNumber);
    state[sides[0]].push(...unassigned.map((s) => s.id));
  }
  // Task #593 — rebalance when the format gives us more sides than the
  // persisted layout actually uses (e.g. the operator just bumped from
  // Single LP to Double LP and Sides C/D would otherwise be empty), or
  // on first open when nothing has been assigned yet. Greedy longest-
  // first into the currently-shortest side, deterministic by digital
  // trackNumber within a side. Once the artist has put something on
  // every available side we leave their layout alone.
  if (songs.length > 0 && sides.length > 1) {
    const usedSides = new Set<VinylSide>();
    for (const s of songs) {
      if (s.vinylSide && sides.includes(s.vinylSide as VinylSide)) {
        usedSides.add(s.vinylSide as VinylSide);
      }
    }
    if (usedSides.size === 0 || usedSides.size < sides.length) {
      const input: VinylSongInput[] = songs.map((s) => ({
        id: s.id,
        title: s.title,
        duration: s.duration,
        trackNumber: s.trackNumber,
      }));
      return balancedLayout(input, sides);
    }
  }
  return state;
}

function workingToAssignments(
  state: WorkingState,
  sides: readonly VinylSide[],
): { songId: string; vinylSide: VinylSide; vinylOrder: number }[] {
  const out: { songId: string; vinylSide: VinylSide; vinylOrder: number }[] =
    [];
  for (const side of sides) {
    state[side].forEach((songId, i) => {
      out.push({ songId, vinylSide: side, vinylOrder: i + 1 });
    });
  }
  return out;
}

function workingsEqual(a: WorkingState, b: WorkingState): boolean {
  for (const side of ["A", "B", "C", "D"] as VinylSide[]) {
    const xa = a[side];
    const xb = b[side];
    if (xa.length !== xb.length) return false;
    for (let i = 0; i < xa.length; i++) {
      if (xa[i] !== xb[i]) return false;
    }
  }
  return true;
}

// Pointer movement under this threshold (px) is treated as a "drop on
// yourself" — no reorder, no save. Apple Music tolerates roughly this
// much wiggle before committing a row drag; keeps a misclick from
// shifting everything below.
const DRAG_THRESHOLD_PX = 6;

export function VinylOrderPanel({
  albumId,
  songs,
  vinylFormat,
  physicalFormat,
}: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  // Task #583 — format derives exclusively from the Sell-panel
  // `physicalFormat` pick now that the per-surface format dropdown is
  // gone. We intentionally ignore the persisted `album.vinylFormat`
  // here so a stale 2xLP value can't render four sides on a single-LP
  // album. The DB column stays untouched.
  void vinylFormat;
  const effectiveFormat: VinylFormat = defaultFormatFor(physicalFormat);
  const rule = VINYL_FORMAT_RULES[effectiveFormat];
  const sides = rule.sides;

  const initialDerived = useMemo(
    () => deriveWorkingState(songs, sides),
    // We deliberately only re-derive when the format or server fingerprint
    // changes — see the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [working, setWorking] = useState<WorkingState>(initialDerived);
  // Task #594 — per-mount Undo / Redo history. `snapshots[0]` is the
  // "original" the Reset button reverts to; every successful commit
  // appends. The cursor moves forward on commit, backward on undo,
  // forward again on redo. Reset truncates the stack back to [0].
  const [snapshots, setSnapshots] = useState<WorkingState[]>([initialDerived]);
  const [cursor, setCursor] = useState(0);
  // Refs let the serverFingerprint effect read the latest history
  // without taking it as a dependency (which would loop).
  const snapshotsRef = useRef(snapshots);
  const cursorRef = useRef(cursor);
  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  // Fingerprint the server's view of vinyl ordering so failed saves or
  // any external mutation (not just track-count changes) re-syncs the
  // local working state. We key on the persisted shape rather than on
  // `songs` identity — TanStack rebuilds the array reference on every
  // refetch and would otherwise stomp an in-flight edit when nothing
  // actually moved on the server.
  const serverFingerprint = useMemo(() => {
    return songs
      .map(
        (s) =>
          `${s.id}:${s.vinylSide ?? ""}:${s.vinylOrder ?? ""}:${s.trackNumber}`,
      )
      .sort()
      .join("|");
  }, [songs]);
  useEffect(() => {
    const derived = deriveWorkingState(songs, sides);
    const currentCursorSnap = snapshotsRef.current[cursorRef.current];
    // If the server already matches whatever the cursor is pointing at
    // (the common case after a successful save settles), leave the
    // working state + history alone — otherwise we'd stomp an in-flight
    // Undo/Redo whose write hasn't round-tripped yet.
    if (currentCursorSnap && workingsEqual(derived, currentCursorSnap)) {
      return;
    }
    // Server genuinely changed under us (rollback after error, or a
    // sibling tab edited the album). Treat as a fresh baseline.
    setWorking(derived);
    setSnapshots([derived]);
    setCursor(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFormat, serverFingerprint]);

  const [dragId, setDragId] = useState<string | null>(null);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<
    | { kind: "row"; id: string; position: "before" | "after" }
    | { kind: "side"; side: VinylSide }
    | null
  >(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  const songsById = useMemo(() => {
    const m = new Map<string, VinylSongLite>();
    for (const s of songs) m.set(s.id, s);
    return m;
  }, [songs]);

  // Vinyl ordering writes through `edit_metadata` on the same gate as
  // every other album mutation. When the caller can't save — out-of-scope
  // partner, post-sale lock without an override, or approval-only mode
  // (the route treats divert as a 403 here) — the panel goes read-only so
  // drag AND Undo/Redo/Reset never fire a speculative 403. Optimistically
  // writable while the probe is in flight (operators are the common case).
  const { data: editAccess } = useQuery<{
    canEdit: boolean;
    requiresApproval: boolean;
  }>({
    queryKey: ["/api/admin/albums", albumId, "edit-access"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/albums/${albumId}/edit-access`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });
  const readOnly =
    !!editAccess && (!editAccess.canEdit || editAccess.requiresApproval);

  const saveMut = useMutation({
    mutationFn: async (next: WorkingState) => {
      await apiRequest("POST", `/api/admin/albums/${albumId}/vinyl-order`, {
        assignments: workingToAssignments(next, sides),
      });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't save vinyl order",
        description: e?.message ?? "Try again in a moment.",
        variant: "destructive",
      });
      // Roll back to the server's last-known state.
      qc.invalidateQueries({ queryKey: ["/api/albums", albumId] });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["/api/albums", albumId] });
    },
  });

  // The single write path for every state change (drag, undo, redo,
  // reset). `record` controls whether the new state pushes onto the
  // history stack — drags push, undo/redo/reset jump the cursor and
  // skip pushing.
  const applyState = (
    next: WorkingState,
    opts: { record: boolean; resetStack?: boolean },
  ) => {
    if (readOnly) return;
    if (workingsEqual(next, working)) return;
    setWorking(next);
    if (opts.resetStack) {
      setSnapshots([next]);
      setCursor(0);
    } else if (opts.record) {
      // Truncate any redo tail before appending — the new branch
      // invalidates the prior redo history.
      setSnapshots((prev) => [...prev.slice(0, cursor + 1), next]);
      setCursor((c) => c + 1);
    }
    saveMut.mutate(next);
  };

  // ── DnD ───────────────────────────────────────────────────────────
  const onDragStart = (id: string) => (e: React.DragEvent) => {
    if (readOnly) return;
    setDragId(id);
    dragStartPointRef.current = { x: e.clientX, y: e.clientY };
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    } catch {
      /* setData can throw if called too late in some browsers */
    }
  };
  const onDragEnd = () => {
    setDragId(null);
    setDropTarget(null);
    dragStartPointRef.current = null;
  };

  // Did the pointer actually move far enough to count as a real drag?
  // Micro-movements within DRAG_THRESHOLD_PX are treated as a no-op so
  // a stray nudge can't shift the row below.
  const isMeaningfulMovement = (e: React.DragEvent): boolean => {
    const start = dragStartPointRef.current;
    if (!start) return true;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
  };

  const onRowDragOver =
    (id: string) => (e: React.DragEvent<HTMLLIElement>) => {
      if (!dragId || dragId === id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = e.currentTarget.getBoundingClientRect();
      const position: "before" | "after" =
        e.clientY < rect.top + rect.height / 2 ? "before" : "after";
      setDropTarget((prev) => {
        if (
          prev?.kind === "row" &&
          prev.id === id &&
          prev.position === position
        ) {
          return prev;
        }
        return { kind: "row", id, position };
      });
    };
  const onSideDragOver = (side: VinylSide) => (e: React.DragEvent) => {
    if (!dragId) return;
    // Padding hover on a side that already has rows is a no-op — the
    // ring shouldn't light up and a drop here shouldn't snap the row
    // to the bottom. Only an empty side accepts a side-level drop.
    if (working[side].length > 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget((prev) =>
      prev?.kind === "row" ? prev : { kind: "side", side },
    );
  };
  const onRowDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragId;
    const target = dropTarget;
    const meaningful = isMeaningfulMovement(e);
    setDragId(null);
    setDropTarget(null);
    dragStartPointRef.current = null;
    if (!src || src === targetId) return;
    if (!meaningful) return;
    const position: "before" | "after" =
      target?.kind === "row" && target.id === targetId
        ? target.position
        : "before";
    moveSong(src, { kind: "row", id: targetId, position });
  };
  const onSideDrop = (side: VinylSide) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragId;
    const meaningful = isMeaningfulMovement(e);
    setDragId(null);
    setDropTarget(null);
    dragStartPointRef.current = null;
    if (!src) return;
    if (!meaningful) return;
    // Only an empty side accepts the drop; padding on a non-empty side
    // already short-circuited in onSideDragOver but guard here too in
    // case a stale dragOver landed us in this branch.
    if (working[side].length > 0) return;
    moveSong(src, { kind: "side", side });
  };

  const moveSong = (
    songId: string,
    target:
      | { kind: "row"; id: string; position: "before" | "after" }
      | { kind: "side"; side: VinylSide },
  ) => {
    const next: WorkingState = {
      A: [...working.A],
      B: [...working.B],
      C: [...working.C],
      D: [...working.D],
    };
    // Remove from current side.
    let sourceSide: VinylSide | null = null;
    for (const side of sides) {
      const idx = next[side].indexOf(songId);
      if (idx >= 0) {
        sourceSide = side;
        next[side].splice(idx, 1);
        break;
      }
    }
    if (!sourceSide) return;
    if (target.kind === "side") {
      next[target.side].push(songId);
    } else {
      // Find the target row in the post-removal arrays so before/after
      // resolves against the right index even when the source sat
      // earlier on the same side.
      let targetSide: VinylSide | null = null;
      let targetIdx = -1;
      for (const side of sides) {
        const idx = next[side].indexOf(target.id);
        if (idx >= 0) {
          targetSide = side;
          targetIdx = idx;
          break;
        }
      }
      if (!targetSide) return;
      const insertAt =
        target.position === "after" ? targetIdx + 1 : targetIdx;
      next[targetSide].splice(insertAt, 0, songId);
    }
    // applyState's workingsEqual guard catches the "dropped exactly
    // where you came from" case — e.g. drop on the row directly below
    // your own with pointer in the top half = "before nextRow" = same
    // index = no change.
    applyState(next, { record: true });
  };

  // ── History controls ──────────────────────────────────────────────
  const canUndo = cursor > 0;
  const canRedo = cursor < snapshots.length - 1;
  const canReset = snapshots.length > 1 || cursor !== 0;

  const onUndo = () => {
    if (readOnly || !canUndo) return;
    const next = snapshots[cursor - 1];
    setCursor(cursor - 1);
    if (!workingsEqual(next, working)) {
      setWorking(next);
      saveMut.mutate(next);
    }
  };
  const onRedo = () => {
    if (readOnly || !canRedo) return;
    const next = snapshots[cursor + 1];
    setCursor(cursor + 1);
    if (!workingsEqual(next, working)) {
      setWorking(next);
      saveMut.mutate(next);
    }
  };
  const onResetRequest = () => {
    if (readOnly || !canReset) return;
    setResetConfirm(true);
  };
  const onResetCancel = () => setResetConfirm(false);
  const onResetConfirm = () => {
    setResetConfirm(false);
    const original = snapshots[0];
    applyState(original, { record: false, resetStack: true });
  };

  // ── Render helpers ────────────────────────────────────────────────
  const sideTotalSeconds = (side: VinylSide): number =>
    working[side].reduce((sum, id) => {
      const s = songsById.get(id);
      return sum + (s?.duration ?? 0);
    }, 0);

  // Task #593 — solver lives in `shared/vinylSideSolver.ts`. The panel
  // only renders copy here; every suggestion the helper returns, if
  // accepted, leaves every side under its cap. Preference order is
  // move → swap → format-bump → won't-fit.
  const suggestion = useMemo<string | null>(() => {
    const input: VinylSongInput[] = songs.map((s) => ({
      id: s.id,
      title: s.title,
      duration: s.duration,
      trackNumber: s.trackNumber,
    }));
    const res = computeVinylSuggestion(working, input, effectiveFormat);
    if (!res) return null;
    switch (res.kind) {
      case "move":
        return `Side ${res.fromSide} is over the safe length. Consider moving “${res.songTitle}” (${formatRuntime(res.songDuration)}) to Side ${res.toSide}.`;
      case "swap":
        return `Swap “${res.aTitle}” (${formatRuntime(res.aDuration)}) on Side ${res.aSide} with “${res.bTitle}” (${formatRuntime(res.bDuration)}) on Side ${res.bSide}.`;
      case "bump-format":
        return `This runtime won't fit on ${rule.label}. Consider bumping to ${res.toLabel} — change the physical format in the Sell panel.`;
      case "wont-fit": {
        const mins = Math.round(res.totalSeconds / 60);
        return `This album runs ${mins} minutes — it won't fit on ${res.largestLabel}. Consider trimming a track or splitting the release.`;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working, songs, effectiveFormat, rule]);

  return (
    <div className="space-y-4" data-testid="panel-vinyl-order">
      {/* Task #594 — Undo / Redo / Reset toolbar. Keeps the chrome
          quiet (ghost buttons, h-8) so it sits above the side list
          without competing with the per-side cards. */}
      <div
        className="flex items-center gap-1.5"
        data-testid="toolbar-vinyl-history"
      >
        {!resetConfirm ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-slate-700"
              disabled={!canUndo || readOnly}
              onClick={onUndo}
              data-testid="button-vinyl-undo"
            >
              <Undo2 className="w-3.5 h-3.5 mr-1" />
              Undo
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-slate-700"
              disabled={!canRedo || readOnly}
              onClick={onRedo}
              data-testid="button-vinyl-redo"
            >
              <Redo2 className="w-3.5 h-3.5 mr-1" />
              Redo
            </Button>
            <div className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-slate-600"
              disabled={!canReset || readOnly}
              onClick={onResetRequest}
              data-testid="button-vinyl-reset"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reset to original
            </Button>
          </>
        ) : (
          <div
            className="flex items-center gap-2 text-xs text-slate-700 w-full"
            data-testid="confirm-vinyl-reset"
          >
            <span>Revert to the saved vinyl order?</span>
            <div className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={onResetCancel}
              data-testid="button-vinyl-reset-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 px-3"
              onClick={onResetConfirm}
              data-testid="button-vinyl-reset-confirm"
            >
              Reset
            </Button>
          </div>
        )}
      </div>

      {readOnly && (
        <div
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
          data-testid="banner-vinyl-readonly"
        >
          You don't have edit access for this album's vinyl order — the
          sequence below is read-only.
        </div>
      )}

      {/* Task #583 — the format dropdown was retired with the move into
          the Physical tab; cut format derives from the album's
          Sell-panel `physicalFormat` pick. The disclaimer stays so the
          operator remembers vinyl order is independent of the digital
          order used for plays in the app. */}
      <p className="text-xs text-slate-500">
        Plays in the app keep using the digital order. Side caps follow
        the album's physical format ({VINYL_FORMAT_RULES[effectiveFormat].label}).
      </p>

      {suggestion && (
        <div
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
          data-testid="banner-vinyl-suggestion"
        >
          <Disc3 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div>{suggestion}</div>
        </div>
      )}

      {/* Per-side groups */}
      <div className="space-y-4">
        {sides.map((side) => {
          const totalSec = sideTotalSeconds(side);
          const overBudget = totalSec / 60 > rule.maxMinutesPerSide;
          const ids = working[side];
          return (
            <div
              key={side}
              className={cn(
                "rounded-xl border bg-white",
                overBudget ? "border-amber-300" : "border-slate-200",
                dropTarget?.kind === "side" && dropTarget.side === side
                  ? "ring-2 ring-[var(--brand-blue)]/30"
                  : "",
              )}
              onDragOver={onSideDragOver(side)}
              onDrop={onSideDrop(side)}
              data-testid={`vinyl-side-${side}`}
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "w-7 h-7 inline-flex items-center justify-center rounded-full text-[12px] font-bold",
                      overBudget
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-700",
                    )}
                  >
                    {side}
                  </div>
                  <div className="text-[12.5px] font-semibold text-slate-900">
                    Side {side}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  <span
                    className={cn(
                      "tabular-nums",
                      overBudget ? "text-amber-800 font-semibold" : "text-slate-600",
                    )}
                    data-testid={`text-side-runtime-${side}`}
                  >
                    {formatRuntime(totalSec)} / {rule.maxMinutesPerSide}:00 max
                  </span>
                  {overBudget && (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  )}
                </div>
              </div>

              {ids.length === 0 ? (
                <div className="px-4 py-6 text-center text-[11.5px] text-slate-400">
                  Drop a track here to put it on Side {side}.
                </div>
              ) : (
                <ol>
                  {ids.map((id, i) => {
                    const song = songsById.get(id);
                    if (!song) return null;
                    const isDragging = dragId === id;
                    const isDropTarget =
                      dropTarget?.kind === "row" && dropTarget.id === id;
                    const dropPosition =
                      isDropTarget && dropTarget?.kind === "row"
                        ? dropTarget.position
                        : null;
                    return (
                      <li
                        key={id}
                        draggable={!readOnly}
                        onDragStart={onDragStart(id)}
                        onDragEnd={onDragEnd}
                        onDragOver={onRowDragOver(id)}
                        onDrop={onRowDrop(id)}
                        className={cn(
                          "relative flex items-center gap-3 px-4 py-2.5 border-t border-slate-100 select-none",
                          readOnly
                            ? "cursor-default"
                            : "cursor-grab active:cursor-grabbing",
                          i === 0 && "border-t-0",
                          isDragging && "opacity-40",
                        )}
                        data-testid={`vinyl-row-${id}`}
                      >
                        {/* Insertion indicator — a thin brand-blue rule
                            on the top or bottom edge of the hovered
                            row so the artist sees exactly where the
                            drop will land. */}
                        {dropPosition === "before" && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute left-3 right-3 top-0 h-[2px] bg-[var(--brand-blue)] rounded-full"
                          />
                        )}
                        {dropPosition === "after" && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute left-3 right-3 bottom-0 h-[2px] bg-[var(--brand-blue)] rounded-full"
                          />
                        )}
                        <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
                        <div className="w-6 text-center text-[11.5px] tabular-nums text-slate-400">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0 text-[13px] text-slate-900 truncate">
                          <span
                            className="mr-1.5 tabular-nums text-[11.5px] text-slate-400 font-medium"
                            title="Digital album track number"
                            data-testid={`vinyl-row-digital-track-${id}`}
                          >
                            #{song.trackNumber}
                          </span>
                          {song.title}
                        </div>
                        <div className="text-[11.5px] tabular-nums text-slate-500">
                          {formatRuntime(song.duration)}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-400">
        Thresholds are industry defaults — Bill will confirm the exact
        safe-length per format with the press vendors. The digital order
        on the main Tracks list is unchanged.
      </p>
    </div>
  );
}
