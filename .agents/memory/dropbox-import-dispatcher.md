---
name: Dropbox import dispatcher
description: Durable rules for the shared Dropbox share-link importer (folders + single-file zips) in server/routes.ts
---

# Dropbox import dispatcher

One dispatcher feeds ALL four Dropbox importers (tracks, lyrics, bonus video, bonus
photo). It branches folder share links (`/scl/fo/`) vs single-file links (`/scl/fi/`,
legacy `/s/`). A change to the dispatcher changes every importer at once.

## Rules / decisions

- **Folder zips and single-file `.zip` shares extract the SAME way** — via the central
  directory (`unzipper.Open.file`), never streaming `unzipper.Parse`.
  **Why:** Parse forward-scans for `PK` local-file-header signatures and walks INTO any
  nested zip (a `.docx`/`.xlsx` inside the archive), losing track of the real entries.
  The central directory is the authoritative top-level list. Read TOP-LEVEL only — no
  recursion into nested zips.

- **Single-file zip detection MUST be extension-gated.** `.zip` extension ⇒ extract.
  A raw `PK`-byte content sniff is allowed ONLY when the URL filename has no extension
  at all.
  **Why:** OOXML/ODF formats (`.docx`, `.xlsx`, `.pptx`, `.odt`) are themselves ZIP
  containers starting with the same `PK` bytes. Sniffing a file that already has a known
  extension would unpack a real single-file `.docx` lyric doc into its inner XML and
  break the lyrics importer. (This was a code-review regression — don't reintroduce it.)
  **How to apply:** gate as `ext === ".zip" || (ext === "" && pkSniff)`.

- **Single-file path downloads BEFORE deciding keep vs skip.**
  **Why:** a `.zip` can't pass an audio/lyrics keep-filter, so you can't short-circuit on
  the filename. Consequence: a non-zip, non-kept single file downloads fully (bounded by
  the per-entry cap) before being reported skipped — acceptable to support the zip case.

- **Invariants every edit must preserve:** SSRF host re-validation on every redirect hop,
  per-entry + total size caps, and temp-dir cleanup on EVERY failure path.

- **`signal.aborted` ≠ "took too long" — never infer a timeout from abort state.**
  **Why:** the download catch sites abort the controller themselves while cleaning up after
  an UNRELATED failure (HTTP error, too-large, dropped connection), so reading
  `ac.signal.aborted` in the catch mislabels every failure as "Dropbox took too long." The
  fix: a dedicated stall guard (`makeDropboxStallGuard`) sets its own `fired` flag ONLY when
  the idle timer actually trips; the catch reads `stall.fired` (capture it BEFORE calling
  `cancel()` on the folder path) and routes through `describeDropboxFailure(err, stalled)`,
  which passes our own operator-facing throws verbatim and maps ECONNRESET / connect-timeout
  / DNS / abort to real reasons. That message rides `state.errorMessage` into the toast AND
  the `job_runs` audit row.
  **How to apply:** large hi-res masters need a RESETTABLE idle/stall timeout (arm() per
  chunk), not a fixed overall deadline that kills a long-but-healthy transfer; pair it with a
  cached undici `Agent` dispatcher (`headersTimeout:0, bodyTimeout:0`, finite `connectTimeout`)
  so undici's default ~5min read timeout can't kill a steady-but-slow multi-GB download. Both
  download paths (single-file + folder) share these helpers — they live in `routes.ts` with
  the SSRF/dispatcher code, NOT `dropboxZip.ts` (download concerns, not pure zip helpers).

- **Per-track processing needs its OWN stall protection — the download stall guard does not cover it.**
  **Why:** even after the download was fixed, large hi-res imports still hung in the PER-TRACK
  phase (ffprobe → ffmpeg → uploads → spec probes), leaving the job `running` forever with a
  frozen dialog and no error. The freeze can be a wedged subprocess, a wedged network write, OR
  an OOM-kill from buffering a multi-hundred-MB master in one upload request.
  **How to apply:** protect at two levels and make liveness flow up.
  - Each blocking step gets a RESETTABLE idle guard (not a fixed deadline — a slow-but-healthy
    transcode must survive), and uploads must stay memory-bounded for big files (resumable above
    a small size threshold) or the OOM re-creates the "hang". A tripped step throws an
    operator-actionable message; spec probes stay best-effort (failure → null columns).
  - The job-level watchdog declares the whole job failed if NO step emits liveness for a bounded
    window, and its verdict must WIN over whatever the subsequently-aborted work throws (a flag,
    not just the abort). Abort is only checked BETWEEN tracks, so a long single step relies on its
    own step guard; cleanup() must still run on the abort path. One broken track fails only itself.
  - Client distinguishes a 404 seen AFTER the job was observed `running` (server restarted
    mid-import — some tracks may have landed, tell the operator to refresh & re-import missing)
    from a first-poll 404 (likely finished). Progress carries optional `file`+`step` so the dialog
    proves a long step is alive; keep the server and client progress shapes in sync.

- **The UNPACK phase between download and per-track processing needs its OWN liveness.**
  **Why:** download and per-track steps already keep the job watchdog fresh, but
  `extractKeptZipEntries` wrote each kept file to disk silently. A big hi-res folder /
  `.zip` of 24-bit WAVs unpacks for longer than the ~180s job-stall window, so the
  watchdog killed a healthy import right after the bar hit 100% ("stopped making progress
  for 180s"). **How to apply:** `extractKeptZipEntries` takes an optional 6th `liveness`
  arg (`onActivity` fires PER CHUNK — a single WAV can exceed the idle window on its own —
  plus a resettable `idleMs`/`idleMessage` guard, NOT a fixed deadline). The tracks
  importer wires `onActivity`→`heartbeat()` + throttled `setProgress({phase:"extracting"})`;
  in-request lyrics/bonus callers omit `liveness` and are byte-for-byte unchanged. Progress
  `phase` union is `download | extracting | process` and MUST stay in sync between server
  `ImportProgress` (routes.ts) and client (`AdminAlbum.tsx`).

- **WeTransfer share links still resolve server-side but are NOT advertised anywhere.**
  **Why:** Bill's call — WeTransfer import "never really worked" in practice, so all
  user-facing copy (client dialogs) and the investor `docs/capabilities.md` bullet were
  stripped to say **Dropbox-only**, while the server WeTransfer detection/resolution code
  in `server/routes.ts` + `server/dropboxZip.ts` was left intact on purpose.
  **How to apply:** don't "reconcile" the mismatch — do NOT delete the server WeTransfer
  handling because the docs say Dropbox-only, and do NOT re-add "WeTransfer" to any UI copy
  or capabilities bullet because the server still supports it. The gap is intentional.

- **Pure zip helpers live in `server/dropboxZip.ts`, not `routes.ts`.** `extOf`,
  `basenameOf`, `fileLooksLikeZip`, `extractKeptZipEntries` + the `MAX_DROPBOX_*` caps were
  hoisted out so they're unit-testable without booting the 21k-line `routes.ts` (which would
  open DB/stripe handles and leave lingering timers that hang `tsx --test`). `routes.ts`
  imports them; the SSRF/download/dispatcher code stays in `routes.ts`.
  **Why:** importing `routes.ts` in a test is infeasible. **How to apply:** add/keep zip
  tests against `dropboxZip.ts` (`server/dropboxZip.test.ts`); `extractKeptZipEntries` takes
  an optional 5th `caps:{maxEntryBytes,maxTotalBytes}` test seam so the size-limit paths can
  be exercised without 500 MB / 10 GB fixtures (prod callers omit it → real constants).
  Metadata-hiding (`._*`/.DS_Store/Thumbs.db/desktop.ini) only runs on the REJECTED branch,
  so an AppleDouble `._x.wav` is KEPT by an audio filter (use a non-audio `._x.txt` to test hiding).
