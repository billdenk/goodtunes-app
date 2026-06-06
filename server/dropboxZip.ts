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
        cb(null, chunk);
      },
    });
    await pipeline(file.stream(), cap, fs.createWriteStream(tmpPath));
    totalUncompressed += size;
    if (totalUncompressed > maxTotalBytes) {
      throw new Error(`That folder's total size is over ${Math.round(maxTotalBytes / (1024 * 1024 * 1024))} GB. Split it into two imports.`);
    }
    entries.push({ filename, tmpPath, size });
  }

  return { entries, skipped };
}
