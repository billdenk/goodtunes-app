// Browser-local draft of an in-progress live-test session (canon, Aug 15
// 2026): crash-safety comes from drafts, not auto-save. The draft is an
// automatic snapshot — template PDF + how it arrived — kept in IndexedDB on
// this computer only. Nothing saves to Templates until the operator presses
// Save; a draft never becomes a revision by itself. One draft per press
// (the newest session wins). All operations are best-effort: a storage
// failure must never break the instrument.

export type LiveTestDraftSlot = {
  format: string;
  componentKey: string;
  variantKey: string | null;
  discCount: number | null;
  title?: string;
} | null;

export type LiveTestDraft = {
  pressId: string;
  blob: Blob; // the template PDF itself
  fileName: string; // the file's own name
  name: string | null; // display name, when one was given
  component: string | null; // optional component pill from the upload sheet
  liveId: string | null; // set when the session reopened a saved shelf template
  slot: LiveTestDraftSlot; // slot-mode target (dashed tile / Replace)
  savedAt: number;
};

const DB_NAME = "gt-live-test-drafts";
const STORE = "drafts";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb()
    .then(
      (db) =>
        new Promise<T | null>((resolve) => {
          const t = db.transaction(STORE, mode);
          const req = run(t.objectStore(STORE));
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
          t.oncomplete = () => db.close();
          t.onabort = () => {
            db.close();
            resolve(null);
          };
        }),
    )
    .catch(() => null);
}

export async function saveLiveTestDraft(draft: LiveTestDraft): Promise<void> {
  await tx("readwrite", (s) => s.put(draft, draft.pressId));
}

export async function loadLiveTestDraft(pressId: string): Promise<LiveTestDraft | null> {
  const d = (await tx<LiveTestDraft>("readonly", (s) => s.get(pressId))) ?? null;
  return d && d.blob instanceof Blob ? d : null;
}

export async function clearLiveTestDraft(pressId: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(pressId));
}
