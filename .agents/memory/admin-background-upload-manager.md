---
name: Admin background upload manager
description: Convention + scope for the admin-shell global upload manager (audio multi-track + bonus video) that survives dialog close / navigation
---

# Admin background upload manager

Admin file uploads that used to run a per-file `sign → PUT → finalize → create` loop
*inside a dialog* now run through a **module-singleton store** in
`client/src/context/UploadManagerContext.tsx`, mounted once at the admin shell
(`App.tsx`) with a compact `GlobalUploadIndicator` widget. It keeps running after the
dialog closes and across admin navigation (only a full tab close stops it).

## Rules / decisions

- **Route NEW admin upload surfaces through the manager, don't add another in-dialog loop.**
  Dialogs should `enqueueAudioBatch(...)` / `enqueueVideoBatch(...)` and close immediately;
  the manager owns progress, per-file retry, the completion toast, and query invalidation.
  **Why:** the whole point of the refactor was to stop losing in-flight uploads when the
  operator closes the sheet or navigates away. A fresh in-dialog loop reintroduces that bug.

- **The store is a module singleton (not React-tree state).** It uses
  `useSyncExternalStore` for reads. That's deliberate — tree state would unmount with the
  dialog. Don't "lift it into a provider value" in a way that ties its lifetime to a route.

- **Network stage is concurrent (semaphore 3), server/finalize stage is serialized (semaphore 1).**
  **Why:** parallel PUTs saturate bandwidth fine, but the create/finalize step derives track
  row position / numbering and must not race. Keep the two semaphores separate.

- **Scope boundary — what was deliberately LEFT on the old in-dialog path (do not migrate without asking):**
  the single-track editor still calls the `uploadAudioFile` helper directly; the audio
  empty-rows and Dropbox-import paths, and the video URL-import + video edit paths, all stay
  in-sheet (URL import needs the server round-trip's suggested title/poster before the create).
  Only the audio **multi-track** picker and the bonus-video **file-upload** create were moved.

- **Endpoints are unchanged from the old helpers** (audio `sign`/`finalize` + POST
  `/api/admin/songs`; video `sign`/`finalize` + POST `/api/admin/albums/:id/videos`). The
  refactor was client-only — it did NOT touch the Sign→Upload→Finalize server pipeline.
