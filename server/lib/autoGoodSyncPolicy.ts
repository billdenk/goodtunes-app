// Auto-GoodSync™ write-decision policy (Task #2020).
//
// The orchestrator in server/routes.ts (runAutoGoodSync) transcribes a
// freshly-uploaded master and then decides WHICH song fields it is allowed
// to write. That decision is the subtle, easy-to-regress part of the
// feature: it must be FILL-BLANKS-ONLY on the automatic path (never clobber
// a field an operator already set) and FULL-OVERWRITE under `force` (the
// manual "Re-run GoodSync" button) — with one deliberate exception: even
// `force` never overwrites operator-typed Plain lyrics, because the
// transcription only ever back-populates Plain lyrics when the song had
// none to begin with (`plainDraft` is undefined when the operator already
// has Plain lyrics).
//
// This logic is extracted here as PURE functions (no DB, no network) so it
// can be unit-tested directly — see server/autoGoodSync.db.test.ts. The
// route layer computes the inputs (transcription cues, chorus timestamp,
// explicit scan) and applies the returned updates via storage.updateSong.

export interface AutoGoodSyncOperatorState {
  // Operator already has typed Plain lyrics on the song.
  hasLyrics: boolean;
  // Operator already has time-aligned (synced) cues on the song.
  hasSynced: boolean;
  // Operator already set a preview start point.
  previewSet: boolean;
  // Operator already flagged the track instrumental.
  instrumental: boolean;
  // Operator already flagged the track explicit.
  explicit: boolean;
}

export interface AutoGoodSyncTranscription<TCue = unknown> {
  // The refined/filtered time-aligned cues produced from the transcription.
  filtered: TCue[];
  // A Plain-lyrics draft — ONLY defined when the operator had no Plain
  // lyrics, so it can be safely back-populated. `undefined` means leave
  // Plain lyrics alone (even under force).
  plainDraft: string | undefined;
  // The explicit-content scan said this track is explicit.
  explicitDetected: boolean;
  // Resolved chorus start (ms) for the preview, or null when no chorus was
  // found. The caller only computes this under the preview-eligible gate to
  // avoid unnecessary AI cost.
  chorusMs: number | null;
}

export interface AutoGoodSyncUpdates {
  syncedLyrics?: unknown;
  lyrics?: string;
  isExplicit?: boolean;
  previewStartMs?: number;
}

export interface AutoGoodSyncPlan {
  updates: AutoGoodSyncUpdates;
  // Echoed back for the job-run summary so it stays in lockstep with what
  // was actually written.
  writeSynced: boolean;
  explicitSet: boolean;
  previewSet: number | null;
}

// Decide whether to flip the `instrumental` flag for a track that
// transcribed to (essentially) no sung words. Setting it is gated on the
// operator not having typed lyrics (a human who said the track HAS words
// wins) unless `force` overrides; and we never re-write a flag the operator
// already turned on.
export function decideInstrumental(
  force: boolean,
  operator: { hasLyrics: boolean; instrumental: boolean },
): { setInstrumental: boolean; write: boolean } {
  const setInstrumental = !operator.hasLyrics || force;
  return { setInstrumental, write: setInstrumental && !operator.instrumental };
}

// Decide the field writes for a track that transcribed to real lyrics.
// Fill-blanks-only unless `force`; Plain lyrics are only ever written from a
// back-populated draft (never overwriting operator copy, even under force).
export function planAutoGoodSyncUpdates<TCue>(
  force: boolean,
  operator: AutoGoodSyncOperatorState,
  t: AutoGoodSyncTranscription<TCue>,
): AutoGoodSyncPlan {
  const updates: AutoGoodSyncUpdates = {};

  // Synced cues: fill-blanks-only unless force.
  const writeSynced = !operator.hasSynced || force;
  if (writeSynced) updates.syncedLyrics = t.filtered;

  // Plain lyrics: only back-populate when blank. `plainDraft` is undefined
  // whenever the operator already had Plain lyrics, so this protects typed
  // lyrics EVEN under force.
  if (t.plainDraft !== undefined && !operator.hasLyrics) {
    updates.lyrics = t.plainDraft;
  }

  // Explicit: advisory flag, only ever proposed ON; fill-blanks-only unless
  // force.
  let explicitSet = false;
  if (t.explicitDetected && (force || !operator.explicit)) {
    updates.isExplicit = true;
    explicitSet = true;
  }

  // Preview start (chorus): fill-blanks-only unless force, and only when a
  // chorus timestamp was actually resolved.
  let previewSet: number | null = null;
  if ((force || !operator.previewSet) && t.chorusMs != null) {
    updates.previewStartMs = t.chorusMs;
    previewSet = t.chorusMs;
  }

  return { updates, writeSynced, explicitSet, previewSet };
}
