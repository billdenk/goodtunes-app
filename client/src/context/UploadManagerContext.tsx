import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { getAuthToken, apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

/* ─── Global background upload manager ───────────────────────────────
   Task #2459 — the multi-track audio dialog and the bonus-video sheet
   used to run their per-file sign→PUT→finalize→create loop INSIDE the
   dialog, so closing the dialog (or navigating away) killed the upload.

   This store hoists that loop to the admin shell. Dialogs `enqueue*` a
   batch and close immediately; the engine here keeps pushing bytes to
   GCS and creating rows in the background, surviving dialog close and
   page navigation (the store is a module singleton; App never unmounts
   it). A compact always-visible indicator (GlobalUploadIndicator) reads
   this store, and a toast fires when each batch settles.

   Out of scope (unchanged): surviving a full tab close, the server-side
   sign/finalize pipeline itself, and the server-job Dropbox imports
   (those already return a jobId and poll). */

export type UploadItemStatus =
  | "queued"
  | "uploading"
  | "saving"
  | "done"
  | "error";

// Which stage a still-unfinished item is parked at. Retry resumes from
// here rather than re-running the whole pipeline, so a failure AFTER the
// bytes landed doesn't re-upload a multi-GB master, and a failure after
// the row was created doesn't duplicate it.
type UploadStage = "sign" | "put" | "finalize" | "create" | "done";

export interface UploadItem {
  id: string;
  name: string;
  status: UploadItemStatus;
  pct: number; // 0-100 byte-level PUT progress
  error?: string;
  // ── engine internals (not for display) ──
  file: File;
  stage: UploadStage;
  // audio
  trackNumber?: number;
  // video
  title?: string;
  description?: string | null;
  posterUrl?: string | null;
  // staged-retry artifacts
  signedUploadUrl?: string;
  finalPath?: string;
  signedContentType?: string;
  finalizeResult?: any;
  // set once a create POST has been fired — retry then dedups before
  // re-POSTing so an ambiguous network timeout can't duplicate a row.
  createStarted?: boolean;
}

export interface UploadBatch {
  id: string;
  kind: "audio" | "video";
  albumId: string;
  items: UploadItem[];
  startedAt: number;
}

interface StoreState {
  batches: UploadBatch[];
}

/* ── Module-singleton store (survives navigation; App never unmounts) ── */
let state: StoreState = { batches: [] };
const listeners = new Set<() => void>();

function emit() {
  // New top-level object each mutation so useSyncExternalStore sees a
  // changed snapshot reference.
  state = { batches: state.batches.map((b) => ({ ...b, items: [...b.items] })) };
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): StoreState {
  return state;
}

// Per-album high-water mark for track numbering. The dialog computes a
// "next track number" from the (possibly stale) query cache, which does
// NOT include tracks still uploading in a prior background batch — so a
// second batch enqueued mid-flight would collide. We take the max of the
// caller's suggestion and our own high-water + 1, then advance it as we
// allocate. songs.trackNumber has no DB unique constraint, so a
// collision silently creates duplicate track numbers; this prevents it.
const trackHighWater = new Map<string, number>();

/* ── Concurrency ──────────────────────────────────────────────────────
   Byte transfer to GCS is network-bound → allow a few in parallel.
   The server-side critical section (audio finalize runs ffmpeg on
   multi-GB masters; row creation derives track/video position from the
   current row count) is serialized so transcodes don't stack and
   concurrent creates can't race to the same position / ordering. */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];
  constructor(permits: number) {
    this.permits = permits;
  }
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
  }
  release() {
    this.permits++;
    const next = this.queue.shift();
    if (next) {
      this.permits--;
      next();
    }
  }
}

const netSem = new Semaphore(3); // sign + PUT
const serverSem = new Semaphore(1); // finalize + create-row

/* ── Item mutation helpers ── */
function findItem(batchId: string, itemId: string): UploadItem | undefined {
  return state.batches.find((b) => b.id === batchId)?.items.find((i) => i.id === itemId);
}

function patchItem(batchId: string, itemId: string, patch: Partial<UploadItem>) {
  const item = findItem(batchId, itemId);
  if (!item) return;
  Object.assign(item, patch);
  emit();
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ── Low-level upload steps (self-contained; no dialog dependency) ── */
async function signUpload(
  kind: "audio" | "video",
  file: File,
): Promise<{ uploadUrl: string; finalPath: string; contentType: string }> {
  const endpoint =
    kind === "audio" ? "/api/admin/upload-audio/sign" : "/api/admin/upload-video/sign";
  const contentType = file.type || (kind === "audio" ? "audio/mpeg" : "video/mp4");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "include",
    body: JSON.stringify({ contentType }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Upload failed (${res.status})`);
  }
  return (await res.json()) as {
    uploadUrl: string;
    finalPath: string;
    contentType: string;
  };
}

function putToGcs(
  uploadUrl: string,
  contentType: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — network error"));
    xhr.send(file);
  });
}

async function finalizeAudio(finalPath: string, contentType: string) {
  const res = await fetch("/api/admin/upload-audio/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "include",
    body: JSON.stringify({ finalPath, contentType }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Finalize failed (${res.status})`);
  }
  return (await res.json()) as {
    url: string;
    sourceUrl: string | null;
    transcoded: boolean;
    duration?: number | null;
    servedSpecs?: any;
    sourceSpecs?: any;
    leadingSilenceSecs?: number | null;
  };
}

async function finalizeVideo(finalPath: string) {
  const res = await fetch("/api/admin/upload-video/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "include",
    body: JSON.stringify({ finalPath }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Finalize failed (${res.status})`);
  }
  return (await res.json()) as { url: string; posterUrl?: string | null };
}

/* ── Per-item pipeline (stage-resumable for retry) ── */
async function runItem(batch: UploadBatch, itemId: string) {
  const get = () => findItem(batch.id, itemId);
  let item = get();
  if (!item) return;

  try {
    // Network stage: sign + PUT. Skip if we already have the bytes up
    // (stage advanced past "put"), so a finalize/create retry doesn't
    // re-upload.
    if (item.stage === "sign" || item.stage === "put") {
      await netSem.acquire();
      try {
        patchItem(batch.id, itemId, { status: "uploading", pct: 0, error: undefined });
        item = get()!;
        if (!item.signedUploadUrl || !item.finalPath || !item.signedContentType) {
          const signed = await signUpload(batch.kind, item.file);
          patchItem(batch.id, itemId, {
            signedUploadUrl: signed.uploadUrl,
            finalPath: signed.finalPath,
            signedContentType: signed.contentType,
            stage: "put",
          });
          item = get()!;
        }
        await putToGcs(
          item.signedUploadUrl!,
          item.signedContentType!,
          item.file,
          (pct) => patchItem(batch.id, itemId, { pct }),
        );
        patchItem(batch.id, itemId, { pct: 100, stage: "finalize" });
      } finally {
        netSem.release();
      }
    }

    item = get()!;

    // Server stage: finalize + create row. Serialized so heavy audio
    // transcodes don't stack and row-position/ordering can't race.
    await serverSem.acquire();
    try {
      patchItem(batch.id, itemId, { status: "saving" });
      item = get()!;

      if (item.stage === "finalize") {
        const finalizeResult =
          batch.kind === "audio"
            ? await finalizeAudio(item.finalPath!, item.signedContentType!)
            : await finalizeVideo(item.finalPath!);
        patchItem(batch.id, itemId, { finalizeResult, stage: "create" });
        item = get()!;
      }

      if (item.stage === "create") {
        await createRow(batch, item);
        patchItem(batch.id, itemId, { stage: "done", status: "done" });
      }
    } finally {
      serverSem.release();
    }

    // Let a viewer see the new row land incrementally (invalidate is a
    // no-op when the album isn't currently on screen).
    invalidateForBatch(batch);
  } catch (e: any) {
    patchItem(batch.id, itemId, {
      status: "error",
      error: e?.message || "Upload failed",
    });
  } finally {
    maybeSettleBatch(batch.id);
  }
}

async function createRow(batch: UploadBatch, item: UploadItem) {
  if (batch.kind === "audio") {
    const r = item.finalizeResult as Awaited<ReturnType<typeof finalizeAudio>>;
    // Retry-after-ambiguous-timeout guard: if a create was already
    // fired, confirm the row isn't already there before re-POSTing.
    if (item.createStarted) {
      const exists = await audioRowExists(batch.albumId, item.trackNumber!, item.title || item.name);
      if (exists) return;
    }
    patchItem(batch.id, item.id, { createStarted: true });
    await apiRequest("POST", "/api/admin/songs", {
      albumId: batch.albumId,
      title: item.title || item.name,
      trackNumber: item.trackNumber,
      duration: r.duration ?? 0,
      audioUrl: r.url,
      ...(r.sourceUrl ? { audioSourceUrl: r.sourceUrl } : {}),
      ...(r.servedSpecs ? { servedSpecs: r.servedSpecs } : {}),
      ...(r.sourceSpecs ? { sourceSpecs: r.sourceSpecs } : {}),
      ...(r.leadingSilenceSecs != null ? { leadingSilenceSecs: r.leadingSilenceSecs } : {}),
    });
  } else {
    const r = item.finalizeResult as Awaited<ReturnType<typeof finalizeVideo>>;
    const posterUrl = item.posterUrl ?? r.posterUrl ?? null;
    if (item.createStarted) {
      const exists = await videoRowExists(batch.albumId, r.url);
      if (exists) return;
    }
    patchItem(batch.id, item.id, { createStarted: true });
    await apiRequest("POST", `/api/admin/albums/${batch.albumId}/videos`, {
      videoUrl: r.url,
      title: item.title || item.name,
      description: item.description ?? null,
      posterUrl,
      sourceUrl: null,
    });
  }
}

async function audioRowExists(
  albumId: string,
  trackNumber: number,
  title: string,
): Promise<boolean> {
  try {
    const res = await apiRequest("GET", `/api/albums/${albumId}`);
    const data = await res.json();
    const songs: Array<{ trackNumber?: number; title?: string }> = data?.songs ?? [];
    return songs.some(
      (s) => s.trackNumber === trackNumber && (s.title ?? "") === title,
    );
  } catch {
    return false; // can't confirm → let the create proceed
  }
}

async function videoRowExists(albumId: string, videoUrl: string): Promise<boolean> {
  try {
    const res = await apiRequest("GET", `/api/albums/${albumId}/videos`);
    const rows: Array<{ videoUrl?: string }> = await res.json();
    return Array.isArray(rows) && rows.some((v) => v.videoUrl === videoUrl);
  } catch {
    return false;
  }
}

function invalidateForBatch(batch: UploadBatch) {
  if (batch.kind === "audio") {
    queryClient.invalidateQueries({ queryKey: ["/api/albums", batch.albumId] });
    queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
  } else {
    queryClient.invalidateQueries({ queryKey: ["/api/albums", batch.albumId, "videos"] });
    queryClient.invalidateQueries({ queryKey: ["/api/albums", batch.albumId] });
  }
}

// Track which batches have already toasted so a retry finishing later
// doesn't fire a second completion toast for the same batch.
const settledBatches = new Set<string>();

function maybeSettleBatch(batchId: string) {
  const batch = state.batches.find((b) => b.id === batchId);
  if (!batch) return;
  const pending = batch.items.some(
    (i) => i.status === "queued" || i.status === "uploading" || i.status === "saving",
  );
  if (pending) return;
  if (settledBatches.has(batchId)) return;
  settledBatches.add(batchId);

  const ok = batch.items.filter((i) => i.status === "done").length;
  const failed = batch.items.filter((i) => i.status === "error").length;
  invalidateForBatch(batch);

  const noun = batch.kind === "audio" ? "track" : "video";
  if (ok === 0 && failed > 0) {
    toast({
      title: `No ${noun}s were added`,
      description: `${failed} file${failed === 1 ? "" : "s"} failed — retry from the uploads panel.`,
      variant: "destructive",
    });
  } else {
    toast({
      title: `${ok} ${ok === 1 ? noun : `${noun}s`} added`,
      description:
        failed > 0
          ? `${failed} file${failed === 1 ? "" : "s"} failed — retry from the uploads panel.`
          : undefined,
    });
  }
}

/* ── Public actions ── */
export function enqueueAudioBatch(input: {
  albumId: string;
  files: Array<{ file: File; title: string }>;
  suggestedStartNumber: number;
}): string {
  const { albumId, files, suggestedStartNumber } = input;
  if (files.length === 0) return "";
  const prevHigh = trackHighWater.get(albumId) ?? 0;
  let next = Math.max(suggestedStartNumber, prevHigh + 1);
  const batchId = crypto.randomUUID();
  const items: UploadItem[] = files.map(({ file, title }) => {
    const trackNumber = next++;
    return {
      id: crypto.randomUUID(),
      name: file.name,
      status: "queued",
      pct: 0,
      file,
      stage: "sign",
      title,
      trackNumber,
    };
  });
  trackHighWater.set(albumId, next - 1);
  const batch: UploadBatch = {
    id: batchId,
    kind: "audio",
    albumId,
    items,
    startedAt: Date.now(),
  };
  state.batches = [...state.batches, batch];
  emit();
  for (const item of items) void runItem(batch, item.id);
  return batchId;
}

export function enqueueVideoBatch(input: {
  albumId: string;
  items: Array<{
    file: File;
    title: string;
    description?: string | null;
    posterUrl?: string | null;
  }>;
}): string {
  const { albumId, items: inItems } = input;
  if (inItems.length === 0) return "";
  const batchId = crypto.randomUUID();
  const items: UploadItem[] = inItems.map((v) => ({
    id: crypto.randomUUID(),
    name: v.file.name,
    status: "queued",
    pct: 0,
    file: v.file,
    stage: "sign",
    title: v.title,
    description: v.description ?? null,
    posterUrl: v.posterUrl ?? null,
  }));
  const batch: UploadBatch = {
    id: batchId,
    kind: "video",
    albumId,
    items,
    startedAt: Date.now(),
  };
  state.batches = [...state.batches, batch];
  emit();
  for (const item of items) void runItem(batch, item.id);
  return batchId;
}

export function retryItem(batchId: string, itemId: string) {
  const batch = state.batches.find((b) => b.id === batchId);
  const item = findItem(batchId, itemId);
  if (!batch || !item || item.status !== "error") return;
  // Re-open the batch's completion so it can toast again once this
  // resumed item settles.
  settledBatches.delete(batchId);
  patchItem(batchId, itemId, { status: "queued", error: undefined });
  void runItem(batch, itemId);
}

export function retryBatchFailures(batchId: string) {
  const batch = state.batches.find((b) => b.id === batchId);
  if (!batch) return;
  for (const item of batch.items) {
    if (item.status === "error") retryItem(batchId, item.id);
  }
}

export function dismissBatch(batchId: string) {
  state.batches = state.batches.filter((b) => b.id !== batchId);
  settledBatches.delete(batchId);
  emit();
}

export function clearCompletedBatches() {
  state.batches = state.batches.filter((b) =>
    b.items.some(
      (i) => i.status === "queued" || i.status === "uploading" || i.status === "saving",
    ),
  );
  emit();
}

export function batchIsActive(batch: UploadBatch): boolean {
  return batch.items.some(
    (i) => i.status === "queued" || i.status === "uploading" || i.status === "saving",
  );
}

/* ── React binding ── */
export interface UploadManagerValue {
  batches: UploadBatch[];
  enqueueAudioBatch: typeof enqueueAudioBatch;
  enqueueVideoBatch: typeof enqueueVideoBatch;
  retryItem: typeof retryItem;
  retryBatchFailures: typeof retryBatchFailures;
  dismissBatch: typeof dismissBatch;
  clearCompletedBatches: typeof clearCompletedBatches;
}

const UploadManagerContext = createContext<UploadManagerValue | null>(null);

export function useUploadStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const snapshot = useUploadStore();

  // Warn before a full tab close while bytes are still in flight — the
  // engine can't survive a real navigation-away/refresh (out of scope),
  // so at least don't let it happen silently.
  useEffect(() => {
    const hasActive = snapshot.batches.some(batchIsActive);
    if (!hasActive) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [snapshot.batches]);

  const value: UploadManagerValue = {
    batches: snapshot.batches,
    enqueueAudioBatch,
    enqueueVideoBatch,
    retryItem,
    retryBatchFailures,
    dismissBatch,
    clearCompletedBatches,
  };
  return (
    <UploadManagerContext.Provider value={value}>
      {children}
    </UploadManagerContext.Provider>
  );
}

export function useUploadManager(): UploadManagerValue {
  const ctx = useContext(UploadManagerContext);
  if (!ctx) {
    throw new Error("useUploadManager must be used within UploadManagerProvider");
  }
  return ctx;
}
