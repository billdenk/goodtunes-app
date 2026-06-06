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
