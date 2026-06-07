import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";

import {
  extOf,
  basenameOf,
  fileLooksLikeZip,
  extractKeptZipEntries,
} from "./dropboxZip";

// The keep-filter the tracks importer uses: keep common audio extensions.
const AUDIO_EXTS = new Set([".wav", ".flac", ".mp3", ".aiff", ".m4a"]);
const keepAudio = (name: string) => AUDIO_EXTS.has(extOf(name));

const INVALID_MSG =
  "Couldn't open that .zip — it may be corrupted or only partly uploaded.";

let workDir: string;

before(async () => {
  workDir = await mkdtemp(join(tmpdir(), "dropboxzip-test-"));
});

after(async () => {
  await rm(workDir, { recursive: true, force: true });
});

// Build a zip on disk from a {name: contents} map and return its path.
async function makeZip(
  fileName: string,
  files: Record<string, Buffer | string>,
): Promise<string> {
  const zip = new AdmZip();
  for (const [name, contents] of Object.entries(files)) {
    zip.addFile(
      name,
      Buffer.isBuffer(contents) ? contents : Buffer.from(contents),
    );
  }
  const zipPath = join(workDir, fileName);
  await writeFile(zipPath, zip.toBuffer());
  return zipPath;
}

// A fresh empty extraction dir per call so entries don't collide.
async function freshSessionDir(): Promise<string> {
  const dir = join(workDir, `session-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe("fileLooksLikeZip", () => {
  test("returns true for a real PK-signature zip", async () => {
    const zipPath = await makeZip("sniff-real.zip", {
      "track.wav": "RIFFfake-audio",
    });
    assert.equal(await fileLooksLikeZip(zipPath), true);
  });

  test("returns true for a raw PK-prefixed file (zip magic only)", async () => {
    const p = join(workDir, "pk-prefixed.bin");
    await writeFile(p, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]));
    assert.equal(await fileLooksLikeZip(p), true);
  });

  test("returns false for a plain audio stub", async () => {
    const p = join(workDir, "plain.wav");
    await writeFile(p, Buffer.from("RIFF....WAVEfmt plain audio bytes"));
    assert.equal(await fileLooksLikeZip(p), false);
  });

  test("returns false for a missing file (open throws)", async () => {
    assert.equal(
      await fileLooksLikeZip(join(workDir, "does-not-exist.bin")),
      false,
    );
  });

  test("returns false for an empty file (fewer than 2 bytes)", async () => {
    const p = join(workDir, "empty.bin");
    await writeFile(p, Buffer.alloc(0));
    assert.equal(await fileLooksLikeZip(p), false);
  });
});

describe("extractKeptZipEntries", () => {
  test("a single-file .zip of audio imports every track", async () => {
    const zipPath = await makeZip("all-audio.zip", {
      "01 First.wav": "aaa",
      "02 Second.flac": "bbbb",
      "03 Third.mp3": "ccccc",
    });
    const sessionDir = await freshSessionDir();
    const { entries, skipped } = await extractKeptZipEntries(
      zipPath,
      sessionDir,
      keepAudio,
      INVALID_MSG,
    );

    assert.equal(entries.length, 3);
    assert.equal(skipped.length, 0);
    const names = entries.map((e) => e.filename).sort();
    assert.deepEqual(names, ["01 First.wav", "02 Second.flac", "03 Third.mp3"]);
    // Sizes reflect the decompressed bytes, and the tempfiles really exist.
    assert.deepEqual(
      entries.map((e) => e.size).sort((a, b) => a - b),
      [3, 4, 5],
    );
    for (const e of entries) {
      const onDisk = await readFile(e.tmpPath);
      assert.equal(onDisk.length, e.size);
    }
  });

  test("keeps only keep-filter matches and lists the rest as skipped", async () => {
    const zipPath = await makeZip("mixed.zip", {
      "song.wav": "a",
      "credits.pdf": "bb",
      "notes.txt": "ccc",
      "cover.flac": "dddd",
    });
    const sessionDir = await freshSessionDir();
    const { entries, skipped } = await extractKeptZipEntries(
      zipPath,
      sessionDir,
      keepAudio,
      INVALID_MSG,
    );

    assert.deepEqual(
      entries.map((e) => e.filename).sort(),
      ["cover.flac", "song.wav"],
    );
    assert.deepEqual(skipped.sort(), ["credits.pdf", "notes.txt"]);
  });

  test("hides metadata files (.DS_Store, ._*, Thumbs.db, desktop.ini) from skipped", async () => {
    const zipPath = await makeZip("with-metadata.zip", {
      "song.wav": "a",
      ".DS_Store": "x",
      "._liner.txt": "y",
      "Thumbs.db": "z",
      "desktop.ini": "w",
      "readme.txt": "real-skip",
    });
    const sessionDir = await freshSessionDir();
    const { entries, skipped } = await extractKeptZipEntries(
      zipPath,
      sessionDir,
      keepAudio,
      INVALID_MSG,
    );

    assert.deepEqual(entries.map((e) => e.filename), ["song.wav"]);
    // Only the genuine non-audio file surfaces; metadata noise is hidden.
    assert.deepEqual(skipped, ["readme.txt"]);
  });

  test("uses basename for nested zip entries (top-level path stripped)", async () => {
    const zipPath = await makeZip("nested-paths.zip", {
      "My Album/01 Track.wav": "a",
      "My Album/art/cover.jpg": "bb",
    });
    const sessionDir = await freshSessionDir();
    const { entries, skipped } = await extractKeptZipEntries(
      zipPath,
      sessionDir,
      keepAudio,
      INVALID_MSG,
    );

    assert.deepEqual(entries.map((e) => e.filename), ["01 Track.wav"]);
    assert.deepEqual(skipped, ["cover.jpg"]);
  });

  test("an audio-free zip keeps nothing and reports the non-audio files", async () => {
    const zipPath = await makeZip("no-audio.zip", {
      "liner-notes.pdf": "a",
      "tracklist.txt": "bb",
    });
    const sessionDir = await freshSessionDir();
    const { entries, skipped } = await extractKeptZipEntries(
      zipPath,
      sessionDir,
      keepAudio,
      INVALID_MSG,
    );

    assert.equal(entries.length, 0);
    assert.deepEqual(skipped.sort(), ["liner-notes.pdf", "tracklist.txt"]);
  });

  test("throws the supplied invalidZipMessage on a non-zip body", async () => {
    const notAZip = join(workDir, "not-a-zip.zip");
    await writeFile(notAZip, Buffer.from("this is plainly not a zip archive"));
    const sessionDir = await freshSessionDir();
    await assert.rejects(
      () => extractKeptZipEntries(notAZip, sessionDir, keepAudio, INVALID_MSG),
      (err: Error) => err.message === INVALID_MSG,
    );
  });

  test("throws the supplied invalidZipMessage on a truncated zip body", async () => {
    const zipPath = await makeZip("full.zip", { "song.wav": "abcdef" });
    const full = await readFile(zipPath);
    // Lop off the end-of-central-directory record so unzipper can't open it.
    const truncated = full.subarray(0, Math.floor(full.length / 2));
    const truncPath = join(workDir, "truncated.zip");
    await writeFile(truncPath, truncated);
    const sessionDir = await freshSessionDir();
    await assert.rejects(
      () =>
        extractKeptZipEntries(truncPath, sessionDir, keepAudio, INVALID_MSG),
      (err: Error) => err.message === INVALID_MSG,
    );
  });

  test("enforces the per-entry size cap (one oversized track rejected)", async () => {
    const zipPath = await makeZip("big-entry.zip", {
      "huge.wav": Buffer.alloc(4096, 7),
    });
    const sessionDir = await freshSessionDir();
    await assert.rejects(
      () =>
        extractKeptZipEntries(zipPath, sessionDir, keepAudio, INVALID_MSG, {
          maxEntryBytes: 1024,
        }),
      (err: Error) => /huge\.wav" is too large/.test(err.message),
    );
  });

  test("imports every entry when the total exceeds the per-entry cap but each entry is under it", async () => {
    // The bug this guards against: a zip of N masters whose COMBINED size
    // clears the per-file cap while every individual entry stays under it
    // must still import all entries. The per-entry cap applies per file,
    // not to the archive total; only the (much larger) total cap bounds
    // the sum.
    const zipPath = await makeZip("under-each-over-total.zip", {
      "01.wav": Buffer.alloc(800, 1),
      "02.wav": Buffer.alloc(800, 2),
      "03.wav": Buffer.alloc(800, 3),
    });
    const sessionDir = await freshSessionDir();
    const { entries, skipped } = await extractKeptZipEntries(
      zipPath,
      sessionDir,
      keepAudio,
      INVALID_MSG,
      // Each entry (800 B) is under the per-entry cap; the total (2400 B)
      // is well over the per-entry cap but under the total cap.
      { maxEntryBytes: 1024, maxTotalBytes: 1024 * 1024 },
    );

    assert.equal(entries.length, 3);
    assert.equal(skipped.length, 0);
    assert.deepEqual(
      entries.map((e) => e.filename).sort(),
      ["01.wav", "02.wav", "03.wav"],
    );
  });

  test("enforces the total-uncompressed cap across entries", async () => {
    const zipPath = await makeZip("big-total.zip", {
      "a.wav": Buffer.alloc(800, 1),
      "b.wav": Buffer.alloc(800, 2),
      "c.wav": Buffer.alloc(800, 3),
    });
    const sessionDir = await freshSessionDir();
    await assert.rejects(
      () =>
        // Each entry is under the per-entry cap, but together they blow
        // the total cap.
        extractKeptZipEntries(zipPath, sessionDir, keepAudio, INVALID_MSG, {
          maxEntryBytes: 1024,
          maxTotalBytes: 2000,
        }),
      (err: Error) => /total size is over/.test(err.message),
    );
  });

  test("fires the liveness onActivity callback as bytes are written", async () => {
    // The fix this guards: unpacking a big hi-res folder to disk can take
    // longer than the per-job stall watchdog, so extraction must emit
    // liveness per chunk written (not just once per file) to keep a
    // healthy import alive past 100% download.
    const zipPath = await makeZip("liveness.zip", {
      "01 First.wav": "aaa",
      "02 Second.flac": "bbbb",
      "credits.pdf": "ignored",
    });
    const sessionDir = await freshSessionDir();
    const seen: Array<{ filename: string; entryBytes: number; totalBytes: number }> = [];
    const { entries, skipped } = await extractKeptZipEntries(
      zipPath,
      sessionDir,
      keepAudio,
      INVALID_MSG,
      {},
      {
        onActivity: (info) => seen.push(info),
        // Generous idle window — a healthy unpack must never trip it.
        idleMs: 60_000,
        idleMessage: "stalled",
      },
    );

    // Extraction itself is unchanged: kept entries land, the rejected
    // non-audio file is reported skipped.
    assert.equal(entries.length, 2);
    assert.deepEqual(skipped, ["credits.pdf"]);

    // Activity fired, and ONLY for kept entries (the skipped pdf never
    // reaches the write pipeline).
    assert.ok(seen.length >= 2, "expected at least one activity ping per kept entry");
    const pinged = new Set(seen.map((s) => s.filename));
    assert.deepEqual([...pinged].sort(), ["01 First.wav", "02 Second.flac"]);
    assert.ok(!pinged.has("credits.pdf"));
    // entryBytes is monotonic per file and totalBytes accumulates across
    // files, so the last ping reflects the full unpacked size.
    assert.equal(seen[seen.length - 1].totalBytes, 3 + 4);
  });

  test("liveness is optional — extraction behaves identically when omitted", async () => {
    // The lyrics/bonus in-request callers pass no liveness object; that
    // path must stay byte-for-byte unchanged.
    const zipPath = await makeZip("no-liveness.zip", {
      "song.wav": "abcde",
    });
    const sessionDir = await freshSessionDir();
    const { entries, skipped } = await extractKeptZipEntries(
      zipPath,
      sessionDir,
      keepAudio,
      INVALID_MSG,
    );
    assert.deepEqual(entries.map((e) => e.filename), ["song.wav"]);
    assert.equal(entries[0].size, 5);
    assert.equal(skipped.length, 0);
  });

  test("the idle guard does not fire for a healthy (non-stalled) unpack", async () => {
    // A very small idle window combined with a tiny, instantly-written
    // file must still succeed: the file is written before the timer can
    // fire, and the guard is disarmed on completion. (We can't easily
    // simulate a true multi-second write stall in a unit test without a
    // fake clock; this asserts the happy path stays green even when the
    // window is aggressive.)
    const zipPath = await makeZip("healthy.zip", { "track.wav": "xyz" });
    const sessionDir = await freshSessionDir();
    const { entries } = await extractKeptZipEntries(
      zipPath,
      sessionDir,
      keepAudio,
      INVALID_MSG,
      {},
      { idleMs: 50, idleMessage: "should not fire" },
    );
    assert.deepEqual(entries.map((e) => e.filename), ["track.wav"]);
  });
});

describe("extOf / basenameOf helpers", () => {
  test("extOf lowercases and returns the dotted extension", () => {
    assert.equal(extOf("Track.WAV"), ".wav");
    assert.equal(extOf("a.b.FLAC"), ".flac");
    assert.equal(extOf("no-extension"), "");
    assert.equal(extOf(""), "");
  });

  test("basenameOf strips both POSIX and Windows directory prefixes", () => {
    assert.equal(basenameOf("My Album/01 Track.wav"), "01 Track.wav");
    assert.equal(basenameOf("a\\b\\c.flac"), "c.flac");
    assert.equal(basenameOf("loose.mp3"), "loose.mp3");
  });
});
