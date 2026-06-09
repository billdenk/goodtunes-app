import { randomUUID } from "crypto";

// Per-entry and total-uncompressed caps. With streaming we don't need
// a wire-size cap any more (the previous 1 GB-on-the-wire bound was a
// RAM-safety bound for the buffer-everything design). Per-entry guards
// a single pathological file; total-uncompressed guards a zip-bomb that
// would otherwise fill the local disk one chunk at a time.
export const MAX_DROPBOX_UNCOMPRESSED_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB total inflated
export const MAX_DROPBOX_ENTRY_BYTES = 500 * 1024 * 1024; // 500 MB per file

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

export function basenameOf(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i === -1 ? p : p.slice(i + 1);
}

// Sniff a downloaded file's first bytes for a ZIP signature. All zip
// variants start with "PK" (0x50 0x4B) — local-file-header
// (PK\x03\x04), empty archive (PK\x05\x06), or spanned (PK\x07\x08).
// This is the fallback for single-file share links whose URL filename
// lost (or never carried) the `.zip` extension.
export async function fileLooksLikeZip(filePath: string): Promise<boolean> {
  const fsp = await import("node:fs/promises");
  try {
    const fd = await fsp.open(filePath, "r");
    try {
      const buf = Buffer.alloc(4);
      const { bytesRead } = await fd.read(buf, 0, 4, 0);
      return bytesRead >= 2 && buf[0] === 0x50 && buf[1] === 0x4b;
    } finally {
      await fd.close();
    }
  } catch {
    return false;
  }
}

// Open an already-downloaded zip via its central directory and extract
// only the entries the keep-filter accepts into `sessionDir`. Shared by
// BOTH the folder importer (which downloads Dropbox's generated folder
// zip) and the single-file importer (when the shared file IS a zip), so
// a shared `.zip` imports exactly like a shared folder.
//
// Why `unzipper.Open.file` (central directory) instead of streaming
// `unzipper.Parse`: see the long note on `streamDropboxFolderEntries`.
// The central directory is the authoritative entry list and immune to
// the nested-zip local-header confusion that breaks forward-scanning.
// We read only the TOP-LEVEL directory — no recursion into nested zips.
//
// Enforces the same per-entry (`MAX_DROPBOX_ENTRY_BYTES`) and total
// (`MAX_DROPBOX_UNCOMPRESSED_BYTES`) caps as the folder path. Does NOT
// clean up `sessionDir` on failure — the caller owns that so it can run
// its own cleanup on every error path. On an unopenable / truncated zip
// it throws `invalidZipMessage` so each caller can phrase it for its
// own context (folder vs. single-file).
export async function extractKeptZipEntries(
  zipPath: string,
  sessionDir: string,
  shouldKeep: (filename: string) => boolean,
  invalidZipMessage: string,
  // Test seam: shrink the caps so the size-limit paths can be exercised
  // without writing 500 MB / 10 GB of fixture data. Production callers
  // omit this and get the real `MAX_DROPBOX_*` constants.
  caps: { maxEntryBytes?: number; maxTotalBytes?: number } = {},
  // Liveness for the unpack phase. Unpacking a big hi-res folder to disk
  // can itself outlast the per-job stall watchdog, so we emit a heartbeat
  // (`onActivity`) on EVERY chunk written — not just once per file, since
  // a single 24-bit WAV can take longer than the watchdog window on its
  // own. `idleMs` arms a resettable idle guard (NOT a fixed deadline): a
  // slow-but-healthy unpack survives, but a truly wedged write — no bytes
  // for `idleMs` — aborts promptly with `idleMessage`. Omit entirely
  // (callers that don't care, e.g. the in-request lyrics/bonus paths) and
  // extraction behaves exactly as before.
  liveness: {
    onActivity?: (info: { filename: string; entryBytes: number; totalBytes: number }) => void;
    idleMs?: number;
    idleMessage?: string;
  } = {},
): Promise<{
  entries: Array<{ filename: string; tmpPath: string; size: number }>;
  skipped: string[];
}> {
  const maxEntryBytes = caps.maxEntryBytes ?? MAX_DROPBOX_ENTRY_BYTES;
  const maxTotalBytes = caps.maxTotalBytes ?? MAX_DROPBOX_UNCOMPRESSED_BYTES;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { Transform } = await import("node:stream");
  const { pipeline } = await import("node:stream/promises");
  const unzipper = (await import("unzipper")).default;

  // Resettable idle/stall guard for the unpack. Armed per chunk written;
  // if it fires we abort the in-flight pipeline and surface `idleMessage`.
  // Disabled (no timer, no AbortController) when no `idleMs` is supplied
  // so the lyrics/bonus callers stay byte-for-byte unchanged.
  const idleMs = liveness.idleMs ?? 0;
  const idleAc = idleMs > 0 ? new AbortController() : null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let idleFired = false;
  const armIdle = () => {
    if (!idleAc) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleFired = true;
      try { idleAc.abort(); } catch {}
    }, idleMs);
    // unref: this watchdog must not prevent the process from exiting once all
    // tests (or all requests) are done. A live import keeps the event loop
    // alive through its own I/O; only a truly stalled upload has no other
    // active handles, so the guard fires and we abort promptly.
    idleTimer.unref();
  };
  const disarmIdle = () => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  };

  let directory: Awaited<ReturnType<typeof unzipper.Open.file>>;
  try {
    directory = await unzipper.Open.file(zipPath);
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (/invalid signature|FILE_ENDED|end of central directory|END header|not a valid zip/i.test(msg)) {
      throw new Error(invalidZipMessage);
    }
    throw err;
  }

  const entries: Array<{ filename: string; tmpPath: string; size: number }> = [];
  // Filenames the keep-filter rejected (wrong extension, hidden files, etc.).
  // Reported back to the caller so admins can see exactly what the
  // importer ignored — turns "where did my tracks go?" into a glance.
  const skipped: string[] = [];
  let totalUncompressed = 0;

  for (const file of directory.files) {
    if (file.type === "Directory") continue;
    const entryPath: string = file.path || "";
    const filename = basenameOf(entryPath);
    if (!shouldKeep(filename)) {
      // Hide noise files admins never care about (Finder/Dropbox
      // metadata, resource forks). Real files that were rejected
      // still surface in the report.
      if (!/^\._|^\.DS_Store$|^Thumbs\.db$|^desktop\.ini$/i.test(filename)) {
        skipped.push(filename);
      }
      continue;
    }
    // Per-entry cap enforced by a counting Transform.
    const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const tmpPath = path.join(sessionDir, `${randomUUID()}-${safeName}`);
    let size = 0;
    const cap = new Transform({
      transform(chunk, _enc, cb) {
        size += chunk.length;
        if (size > maxEntryBytes) {
          cb(new Error(`"${filename}" is too large (over ${Math.round(maxEntryBytes / (1024 * 1024))} MB).`));
          return;
        }
        // Bytes are flowing — reset the idle countdown so a steady (even
        // slow) unpack of a huge WAV is never declared wedged, then ping
        // the caller so the per-job watchdog stays fresh and the dialog
        // can show an "unpacking" state.
        armIdle();
        try {
          liveness.onActivity?.({ filename, entryBytes: size, totalBytes: totalUncompressed + size });
        } catch {}
        cb(null, chunk);
      },
    });
    // Arm before the first chunk so a write that never starts (wedged
    // before any bytes) still trips the guard. Re-armed per chunk above.
    armIdle();
    try {
      await pipeline(
        file.stream(),
        cap,
        fs.createWriteStream(tmpPath),
        idleAc ? { signal: idleAc.signal } : {},
      );
    } catch (err: any) {
      disarmIdle();
      // A genuinely wedged unpack (no bytes for idleMs) surfaces a clear,
      // operator-actionable message instead of waiting on the coarse
      // 180s job watchdog. Everything else (size cap, corrupt stream)
      // propagates verbatim.
      if (idleFired) {
        throw new Error(
          liveness.idleMessage ??
            `Unpacking "${filename}" stalled — no data was written for ${Math.round(idleMs / 1000)}s. The Dropbox download may be incomplete; re-share the folder and try the import again.`,
        );
      }
      throw err;
    } finally {
      disarmIdle();
    }
    totalUncompressed += size;
    if (totalUncompressed > maxTotalBytes) {
      throw new Error(`That folder's total size is over ${Math.round(maxTotalBytes / (1024 * 1024 * 1024))} GB. Split it into two imports.`);
    }
    entries.push({ filename, tmpPath, size });
  }

  disarmIdle();
  return { entries, skipped };
}

// ── WeTransfer URL detection helpers ────────────────────────────────────────
// Pure functions — no HTTP, no SSRF validation (that lives in routes.ts with
// `isPrivateIp`). Kept here so they're unit-testable without booting the
// 21k-line routes.ts module (which opens DB/stripe handles).

// Canonical WeTransfer share links appear on both the bare apex
// (wetransfer.com) and the www. host (www.wetransfer.com), so collapse a
// leading www. before host comparisons. This keeps the apex/www variants in
// lockstep with the routes.ts WETRANSFER_SHARE_HOSTS allow-list (which already
// lists www.wetransfer.com).
function normalizeWeTransferHost(u: URL): string {
  return u.hostname.toLowerCase().replace(/^www\./, "");
}

// Returns true for any wetransfer.com, we.tl, OR *.wetransfer.com URL.
// The subdomain case captures account-specific pages like
// <name>.wetransfer.com/previews/... so the dispatcher routes them into
// the WeTransfer handling path instead of falling through to Dropbox
// (which would produce a confusing "not a Dropbox link" error).
// assertWeTransferShareHost then produces the accurate guidance message.
export function isWeTransferUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return (
      h === "wetransfer.com" ||
      h === "we.tl" ||
      /^[a-z0-9-]+\.wetransfer\.com$/.test(h)
    );
  } catch {
    return false;
  }
}

// Returns true specifically for preview-only links (the sender's view) that
// require a logged-in WeTransfer session and can't be resolved anonymously.
// Shape: wetransfer.com/previews/<id>/<hash>
export function isWeTransferPreviewUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (normalizeWeTransferHost(u) !== "wetransfer.com") return false;
    return /^\/previews\//i.test(u.pathname);
  } catch {
    return false;
  }
}

// Parse a canonical wetransfer.com/downloads/<transferId>/<securityHash> URL
// into the two identifiers the WeTransfer download API needs. Two path shapes
// are supported:
//   2-segment: /downloads/<transferId>/<securityHash>
//   3-segment: /downloads/<transferId>/<recipientId>/<securityHash>
// Both accept an optional trailing /download suffix (as shown on some
// WeTransfer share pages). Returns null for unsupported shapes (previews,
// we.tl short links — caller must expand those first, account pages, etc.).
export function parseWeTransferShareUrl(
  u: URL,
): { transferId: string; securityHash: string } | null {
  if (normalizeWeTransferHost(u) !== "wetransfer.com") return null;
  // 3-segment: /downloads/<id>/<recipient>/<hash>(/download)?
  // The negative lookahead (?!download\/?$) prevents misidentifying a
  // 2-segment+/download URL as a 3-segment one by ensuring the optional
  // middle segment is NOT the literal string "download".
  const m3 = u.pathname.match(
    /^\/downloads\/([^/]+)\/([^/]+)\/([^/]+?)(?:\/download)?\/?$/i,
  );
  if (m3 && m3[3].toLowerCase() !== "download") {
    return { transferId: m3[1], securityHash: m3[3] };
  }
  // 2-segment: /downloads/<id>/<hash>(/download)?
  const m2 = u.pathname.match(
    /^\/downloads\/([^/]+)\/([^/]+?)(?:\/download)?\/?$/i,
  );
  if (m2) return { transferId: m2[1], securityHash: m2[2] };
  return null;
}
