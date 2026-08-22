// Task #3260 — shared "mirror-at-save" fetch for pasted external file links.
//
// Platform rule (see .agents/memory/external-file-links-mirror-rule.md and the
// template-PDF precedent in templateSpecs.ts): any pasted/imported external
// file URL (Dropbox share, direct https link, …) must be downloaded into OUR
// object storage at save time — a raw external pointer is never persisted.
// This module owns the SSRF-safe download half of that rule: it validates the
// URL, resolves every redirect hop's host against a private-IP blocklist,
// enforces a per-kind byte cap + wall-clock deadline, rejects HTML error
// pages masquerading as files, and spools the bytes to a tempfile the caller
// then uploads/transcodes with the normal pipelines.
//
// Callers convert `ExternalFetchError` into a 422 that FAILS the save — never
// fall back to persisting the external URL.

import { randomUUID } from "node:crypto";
import * as net from "node:net";
import { Readable } from "node:stream";

export class ExternalFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalFetchError";
  }
}

export type MirrorKind = "audio" | "video" | "image";

/** True when the string is an absolute http(s) URL (i.e. an EXTERNAL file
 *  pointer that must be mirrored before save). `/objects/...` paths, blank
 *  values, and relative paths return false. */
export function isExternalFileUrl(u: string | null | undefined): boolean {
  return /^https?:\/\//i.test((u ?? "").trim());
}

/** Dropbox share links serve an HTML preview page at dl=0; flip to dl=1 so
 *  the fetch gets the raw file bytes. Non-Dropbox URLs pass through. */
export function normalizeExternalFetchUrl(raw: string): string {
  try {
    const p = new URL(raw);
    if (p.hostname === "www.dropbox.com" || p.hostname === "dropbox.com") {
      p.searchParams.set("dl", "1");
    }
    return p.toString();
  } catch {
    return raw;
  }
}

// Per-kind caps. Audio matches the 150MB multer master cap; video matches the
// 500MB from-URL import cap; images match the 8MB artwork cap.
const KIND_LIMITS: Record<MirrorKind, { maxBytes: number; timeoutMs: number; label: string }> = {
  audio: { maxBytes: 150 * 1024 * 1024, timeoutMs: 10 * 60 * 1000, label: "150MB" },
  video: { maxBytes: 500 * 1024 * 1024, timeoutMs: 20 * 60 * 1000, label: "500MB" },
  image: { maxBytes: 8 * 1024 * 1024, timeoutMs: 60 * 1000, label: "8MB" },
};

// MIME → extension tables per kind (mirror the per-route upload whitelists in
// routes.ts). Extension fallback comes from the URL path when the server
// returns a generic content-type.
const KIND_MIME_TO_EXT: Record<MirrorKind, Record<string, string>> = {
  audio: {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/aac": ".aac",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/wave": ".wav",
    "audio/flac": ".flac",
    "audio/x-flac": ".flac",
    "audio/ogg": ".ogg",
    "audio/aiff": ".aiff",
    "audio/x-aiff": ".aiff",
  },
  video: {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
  },
  image: {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
  },
};

const KIND_PATH_EXT: Record<MirrorKind, RegExp> = {
  audio: /\.(mp3|m4a|aac|wav|flac|ogg|aiff?|aif)$/i,
  video: /\.(mp4|mov|webm)$/i,
  image: /\.(jpe?g|png|gif|webp|avif)$/i,
};

const EXT_TO_MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".aiff": "audio/aiff",
  ".aif": "audio/aiff",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

const KIND_HUMAN: Record<MirrorKind, string> = {
  audio: "an audio file (MP3, M4A/AAC, WAV, FLAC, OGG, or AIFF)",
  video: "a video file (MP4, MOV, or WebM)",
  image: "an image (JPEG, PNG, GIF, WebP, or AVIF)",
};

// ── SSRF guard (mirror of the routes.ts safeFetch posture) ────────────────
function isPrivateIp(ip: string, net: typeof import("node:net")): boolean {
  return isPrivateIpAddr(ip);
}

/**
 * TRUE when an address is anything other than public global unicast.
 * Deny-by-default posture:
 * - IPv4: allowed unless it falls in a special-purpose/reserved range
 *   (RFC 6890 family): 0/8, 10/8, 100.64/10 (CGNAT shared), 127/8,
 *   169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24 + 198.51.100/24 +
 *   203.0.113/24 (documentation), 192.88.99/24 (6to4 relay), 192.168/16,
 *   198.18/15 (benchmarking), 224/4 (multicast), 240/4 (reserved incl.
 *   broadcast).
 * - IPv6: ONLY global unicast 2000::/3 is allowed, minus 2001:db8::/32
 *   (documentation), 2001::/32 (Teredo tunnels a v4 addr) and 2002::/16
 *   (6to4 embeds a v4 addr). IPv4-mapped/compat/NAT64 forms re-check the
 *   embedded IPv4. Everything else (loopback, unspecified, ULA fc00::/7,
 *   ALL of link-local fe80::/10, multicast ff00::/8, unassigned space) is
 *   non-public.
 * Unparseable input is treated as non-public. Exported for regression tests.
 */
export function isNonPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b, c] = parts;
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||           // 100.64.0.0/10 CGNAT
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||            // 192.0.0.0/24
      (a === 192 && b === 0 && c === 2) ||            // TEST-NET-1
      (a === 192 && b === 88 && c === 99) ||          // 6to4 relay anycast
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||        // benchmarking /15
      (a === 198 && b === 51 && c === 100) ||         // TEST-NET-2
      (a === 203 && b === 0 && c === 113) ||          // TEST-NET-3
      a >= 224                                        // multicast + reserved + broadcast
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
    // IPv4-embedded forms — judge the embedded IPv4.
    const dot = lower.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (dot) return isNonPublicAddress(dot[1]);
    const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return isNonPublicAddress(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`);
    }
    // First hextet decides the block. "::"-leading forms have hextet 0.
    const firstRaw = lower.startsWith("::") ? "0" : lower.split(":", 1)[0] || "0";
    const first = parseInt(firstRaw, 16);
    if (Number.isNaN(first)) return true;
    // Allow only global unicast 2000::/3 …
    if (first < 0x2000 || first > 0x3fff) return true;
    // … minus documentation, Teredo, and 6to4 space.
    if (first === 0x2002) return true;                 // 6to4 2002::/16
    if (first === 0x2001) {
      const secondRaw = lower.split(":")[1] ?? "0";
      const second = parseInt(secondRaw === "" ? "0" : secondRaw, 16) || 0;
      if (second === 0x0db8) return true;              // 2001:db8::/32 documentation
      if (second === 0) return true;                   // 2001::/32 Teredo
      if (second <= 0x01ff) return true;               // 2001:0000-01ff special-purpose
    }
    return false;
  }
  return true;
}

function isPrivateIpAddr(ip: string): boolean {
  return isNonPublicAddress(ip);
}

/**
 * Build a `lookup` function for http(s).request that validates the DNS
 * answer AT CONNECTION TIME — the socket only ever connects to an address
 * this guard has approved, so a DNS-rebinding host (public answer for a
 * pre-check, private answer for the real request) can't reach internal
 * services. A private answer or an underlying DNS failure surfaces as the
 * request's 'error' event, which the caller wraps into ExternalFetchError.
 * Exported for unit tests (injectable base lookup).
 */
export function makeGuardedLookup(
  baseLookup: typeof import("node:dns").lookup,
): (hostname: string, options: any, callback: any) => void {
  return function guardedLookup(hostname: string, options: any, callback: any) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    (baseLookup as any)(hostname, { ...options, all: true }, (err: any, addresses: any) => {
      if (err) return callback(err);
      const list: Array<{ address: string; family: number }> = Array.isArray(addresses)
        ? addresses
        : [{ address: addresses, family: options?.family ?? 4 }];
      if (!list.length) return callback(new Error(`No address found for ${hostname}`));
      for (const a of list) {
        if (isPrivateIpAddr(a.address)) {
          return callback(new ExternalFetchError("That link points at a private address and can't be imported."));
        }
      }
      if (options?.all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  };
}

/** Normalized per-hop response over the two transports below. */
interface HopResponse {
  status: number;
  header(name: string): string | null;
  nodeBody(): Readable | null;
  dismiss(): void;
}

/**
 * One redirect hop, SSRF-safely.
 * - IP-literal hosts (no DNS involved, so no rebinding surface) are checked
 *   against the private ranges and fetched with global fetch — this is also
 *   what lets the hermetic test stub intercept TEST-NET addresses offline.
 * - Hostname URLs go through node http(s).request with a connection-time
 *   guarded `lookup` (see makeGuardedLookup) — never global fetch, which
 *   would resolve DNS a second time (TOCTOU).
 * Every failure — DNS errors included — throws ExternalFetchError.
 */
async function requestHop(urlStr: string, signal: AbortSignal): Promise<HopResponse> {
  const u = new URL(urlStr);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new ExternalFetchError(`Only http(s) links can be imported (got ${u.protocol.replace(":", "")}).`);
  }
  // URL.hostname keeps the brackets on IPv6 literals ("[::1]"), which
  // net.isIP() doesn't recognize — strip them BEFORE classification, or a
  // bracketed private IPv6 literal would fall through to the hostname
  // path and connect directly without ever hitting the lookup guard.
  const bareHost = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(bareHost)) {
    if (isPrivateIpAddr(bareHost)) {
      throw new ExternalFetchError("That link points at a private address and can't be imported.");
    }
    let res: Response;
    try {
      res = await fetch(urlStr, { redirect: "manual", signal });
    } catch (e: any) {
      if (signal.aborted) throw new ExternalFetchError("That link took too long to respond.");
      throw new ExternalFetchError(`Couldn't reach that link (${e?.message ?? "network error"}).`);
    }
    return {
      status: res.status,
      header: (n) => res.headers.get(n),
      nodeBody: () => (res.body ? (Readable.fromWeb(res.body as any) as Readable) : null),
      dismiss: () => { try { void res.body?.cancel(); } catch { /* ignore */ } },
    };
  }
  const dns = await import("node:dns");
  const mod = u.protocol === "https:" ? await import("node:https") : await import("node:http");
  return await new Promise<HopResponse>((resolve, reject) => {
    const req = mod.request(
      u,
      { method: "GET", lookup: makeGuardedLookup(dns.lookup) as any, signal },
      (res) => {
        resolve({
          status: res.statusCode ?? 0,
          header: (n) => {
            const v = res.headers[n.toLowerCase()];
            return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
          },
          nodeBody: () => res,
          dismiss: () => { try { res.destroy(); } catch { /* ignore */ } },
        });
      },
    );
    req.on("error", (e: any) => {
      if (e instanceof ExternalFetchError) return reject(e);
      if (signal.aborted) return reject(new ExternalFetchError("That link took too long to respond."));
      reject(new ExternalFetchError(`Couldn't reach that link (${e?.message ?? "network error"}).`));
    });
    req.end();
  });
}

export interface FetchedExternalFile {
  /** Tempfile holding the downloaded bytes. Caller owns cleanup. */
  tmpPath: string;
  /** Resolved MIME for the bytes (from content-type, else URL extension). */
  mime: string;
  /** Extension including the dot (drives the transcode/upload naming). */
  ext: string;
  bytes: number;
}

/**
 * Download an external file URL to a tempfile, SSRF-safely, enforcing the
 * per-kind size cap + deadline and rejecting non-matching content types.
 * Throws `ExternalFetchError` with an operator-readable message on ANY
 * failure — the caller must fail the save, never persist the external URL.
 */
export async function fetchExternalFileToTmp(
  rawUrl: string,
  kind: MirrorKind,
): Promise<FetchedExternalFile> {
  const limits = KIND_LIMITS[kind];
  let parsed: URL;
  try {
    parsed = new URL(normalizeExternalFetchUrl(rawUrl.trim()));
  } catch {
    throw new ExternalFetchError("That doesn't look like a valid URL.");
  }

  const ac = new AbortController();
  const deadline = setTimeout(() => ac.abort(), limits.timeoutMs);
  try {
    // Manual redirect follower — every hop goes through requestHop, whose
    // transport validates the destination address at connection time.
    let current = parsed.toString();
    let response: HopResponse | null = null;
    for (let hop = 0; hop <= 5; hop++) {
      const res = await requestHop(current, ac.signal);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.header("location");
        if (!loc) throw new ExternalFetchError("That link redirected without a destination.");
        res.dismiss();
        try {
          current = new URL(loc, current).toString();
        } catch {
          // A malformed Location header must fail the SAVE (422), not
          // escape as a native TypeError → 500.
          throw new ExternalFetchError("That link redirected to an invalid destination.");
        }
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        res.dismiss();
        throw new ExternalFetchError(`Couldn't fetch that link (HTTP ${res.status}). Check the URL still works.`);
      }
      response = res;
      break;
    }
    if (!response) throw new ExternalFetchError("That link redirected too many times.");

    // Content-length fast reject (streamed cap below still enforces).
    const lenHeader = response.header("content-length");
    if (lenHeader && Number(lenHeader) > limits.maxBytes) {
      throw new ExternalFetchError(`That file is larger than the ${limits.label} import limit.`);
    }

    // Resolve MIME/ext: trust a recognized content-type first, else the URL
    // path extension. HTML/text is always a share-page or error page — the
    // classic Dropbox dl=0 trap — so reject it explicitly.
    const upstreamMime = (response.header("content-type") || "")
      .split(";")[0].trim().toLowerCase();
    if (upstreamMime === "text/html" || upstreamMime === "text/plain" || upstreamMime === "application/xhtml+xml") {
      throw new ExternalFetchError(
        `That link returned a web page, not ${KIND_HUMAN[kind]}. Use a direct-download link.`,
      );
    }
    let ext = KIND_MIME_TO_EXT[kind][upstreamMime];
    let mime = ext ? upstreamMime : "";
    if (!ext) {
      const pathMatch = new URL(current).pathname.match(KIND_PATH_EXT[kind]);
      if (pathMatch) {
        ext = `.${pathMatch[1].toLowerCase()}`;
        if (ext === ".jpeg") ext = ".jpg";
        if (ext === ".aif") ext = ".aiff";
        mime = EXT_TO_MIME[ext] ?? "";
      }
    }
    if (!ext || !mime) {
      throw new ExternalFetchError(`That link didn't return ${KIND_HUMAN[kind]}.`);
    }

    // Stream to a tempfile with the byte cap enforced mid-flight.
    const fs = await import("node:fs");
    const fsp = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { pipeline } = await import("node:stream/promises");
    const nodeReadable = response.nodeBody();
    if (!nodeReadable) throw new ExternalFetchError("That link returned an empty file.");
    const tmpPath = path.join(os.tmpdir(), `ext-mirror-${randomUUID()}${ext}`);
    let received = 0;
    let capped = false;
    nodeReadable.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > limits.maxBytes && !capped) {
        capped = true;
        nodeReadable.destroy(new Error("cap"));
      }
    });
    try {
      await pipeline(nodeReadable, fs.createWriteStream(tmpPath));
    } catch (e: any) {
      try { await fsp.unlink(tmpPath); } catch { /* ignore */ }
      if (capped) throw new ExternalFetchError(`That file is larger than the ${limits.label} import limit.`);
      if (ac.signal.aborted) throw new ExternalFetchError("That link took too long to download.");
      throw new ExternalFetchError(`Download failed mid-transfer (${e?.message ?? "stream error"}). Try again.`);
    }
    if (received === 0) {
      try { await fsp.unlink(tmpPath); } catch { /* ignore */ }
      throw new ExternalFetchError("That link returned an empty file.");
    }
    return { tmpPath, mime, ext, bytes: received };
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * Task #3260 — request-level orphan compensation for mirror-at-save routes.
 *
 * Arm BEFORE any mirroring: the mirror helpers push each object-storage
 * path onto the returned sink AS SOON AS its upload lands (partial
 * multi-stage uploads included). When the response finishes with any
 * 4xx/5xx — failed validation, nonexistent target id, a later-stage fetch
 * failure, or an unexpected 500 — every collected object is best-effort
 * deleted so a failed save can't strand orphans in object storage.
 *
 * `res` only needs `{ statusCode, on("finish") }` (Express Response
 * satisfies it); `deleter` is injectable for tests and defaults to the
 * shared mirrored-object deleter (which only touches /objects/uploads/).
 */
export function armMirrorOrphanCleanup(
  res: { statusCode: number; on(event: "finish", cb: () => void): unknown },
  deleter?: (path: string) => Promise<unknown>,
): string[] {
  const sink: string[] = [];
  res.on("finish", () => {
    if (res.statusCode >= 400 && sink.length) {
      const resolve = deleter
        ? Promise.resolve(deleter)
        : import("./templateSpecs").then((m) => m.deleteMirroredTemplateObject);
      void resolve
        .then((fn) => Promise.all(sink.map((p) => fn(p))))
        .catch(() => { /* best-effort */ });
    }
  });
  return sink;
}
