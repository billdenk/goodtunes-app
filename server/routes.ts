import type { Express, Request, Response } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { pool } from "./db";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { z } from "zod";
import { insertTrackWriterSchema, insertTrackPerformerSchema, insertAlbumVideoSchema, insertAlbumPhotoSchema, insertCreditRoleSchema } from "@shared/schema";
import { ascapStatus, lookupTitle, searchWriter } from "./ascap";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

async function getUserIdFromRequest(req: Request): Promise<string | undefined> {
  if (req.session.userId) return req.session.userId;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    return storage.getUserIdByAuthToken(token);
  }
  return undefined;
}

async function requireAuth(req: Request, res: Response, next: Function) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  req.session.userId = userId;
  next();
}

async function requireAdmin(req: Request, res: Response, next: Function) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const user = await storage.getUser(userId);
  if (!user?.isAdmin) return res.status(403).json({ message: "Admin only" });
  req.session.userId = userId;
  next();
}

// Non-blocking admin check for routes that are admin-aware (return more data
// when the caller is an admin) without being admin-only. Used by the public
// catalog routes so `?includeHidden=1` is honored for admins and silently
// dropped for everyone else.
async function isAdminUser(req: Request): Promise<boolean> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return false;
  const user = await storage.getUser(userId);
  return !!user?.isAdmin;
}

// Maps any incoming album-type string to the three values the player + admin
// know about. Accepts legacy "album" payloads from older clients and rewrites
// them to "LP" so we don't have to do a coordinated client rollout.
function normalizeAlbumType(value: unknown): "Single" | "EP" | "LP" {
  const s = typeof value === "string" ? value.trim() : "";
  if (s === "Single") return "Single";
  if (s === "EP") return "EP";
  if (s === "LP") return "LP";
  if (s.toLowerCase() === "single") return "Single";
  if (s.toLowerCase() === "ep") return "EP";
  if (s.toLowerCase() === "lp" || s.toLowerCase() === "album") return "LP";
  return "LP";
}

// Resolves a primaryArtistId payload: null / empty → null, otherwise looks
// up the People row to confirm it exists. Unknown ids are silently dropped
// to null so the admin save can't 500 on a stale picker selection.
async function resolvePrimaryArtistId(value: unknown): Promise<string | null> {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const p = await storage.getPersonById(s);
  return p ? s : null;
}

// Coerces a release-date input into a `YYYY-MM-DD` string or null. Accepts:
// empty string / null / undefined → null; otherwise trims and validates the
// shape (10 chars, ISO-like). Anything malformed is stored as null rather
// than throwing — the admin form is the only writer today.
function normalizeReleaseDate(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const PgSession = connectPgSimple(session);
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set in production");
    }
    console.warn("[auth] SESSION_SECRET not set — using a dev-only fallback. Set it before deploy.");
  }
  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      secret: sessionSecret || "goodtunes-dev-only-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: true,
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: "none",
      },
    })
  );

  // Photo uploads are data URLs up to ~5MB image + base64 overhead. Default
  // express.json() limit (~100KB) would reject them; mount a wider parser
  // just for the photo route so other endpoints stay locked down.
  const photoJson = (await import("express")).default.json({ limit: "8mb" });

  app.post("/api/register", async (req, res) => {
    const { username, email, displayName, realName, password } = req.body;
    if (!username || !email || !displayName || !password) {
      return res.status(400).json({ message: "Display name, email, username, and password are required" });
    }
    const emailNorm = String(email).trim().toLowerCase();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(emailNorm)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }
    const usernameNorm = String(username).trim().replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (usernameNorm.length < 3) {
      return res.status(400).json({ message: "Username must be at least 3 characters (letters, numbers, underscore)" });
    }
    const [existingUsername, existingEmail] = await Promise.all([
      storage.getUserByUsername(usernameNorm),
      storage.getUserByEmail(emailNorm),
    ]);
    if (existingUsername && existingEmail) {
      return res.status(400).json({ message: "That username and email are both already taken" });
    }
    if (existingUsername) {
      return res.status(400).json({ message: `Username "@${usernameNorm}" is already taken` });
    }
    if (existingEmail) {
      return res.status(400).json({ message: "An account with that email already exists — try signing in" });
    }
    const hashed = await hashPassword(password);
    const user = await storage.createUser({ username: usernameNorm, email: emailNorm, displayName, realName: realName ?? null, password: hashed });
    req.session.userId = user.id;
    const token = generateToken();
    await storage.createAuthToken(token, user.id);
    return res.status(201).json({ id: user.id, username: user.username, email: user.email, displayName: user.displayName, realName: user.realName, token });
  });

  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username or email and password are required" });
    }
    const raw = String(username).trim();
    const ident = (raw.startsWith("@") ? raw.slice(1) : raw).toLowerCase();
    const looksLikeEmail = ident.includes("@");
    const lookup = looksLikeEmail
      ? await storage.getUserByEmail(ident)
      : await storage.getUserByUsername(ident);
    const user = lookup ?? (looksLikeEmail ? undefined : await storage.getUserByEmail(ident));
    if (!user || !(await comparePasswords(password, user.password))) {
      return res.status(401).json({ message: "Invalid username/email or password" });
    }
    req.session.userId = user.id;
    const token = generateToken();
    await storage.createAuthToken(token, user.id);
    return res.json({ id: user.id, username: user.username, email: user.email, displayName: user.displayName, realName: user.realName, token });
  });

  app.post("/api/logout", async (req, res) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ")) {
      await storage.deleteAuthToken(auth.slice(7));
    }
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/me", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ message: "User not found" });
    const photoUrl = await storage.getProfilePhoto(user.id);
    return res.json({ id: user.id, username: user.username, email: user.email, displayName: user.displayName, realName: user.realName, photoUrl, isAdmin: user.isAdmin });
  });

  app.put("/api/me", requireAuth, async (req, res) => {
    const { displayName, username, realName } = req.body;
    const updates: any = {};
    if (displayName) updates.displayName = displayName;
    if (realName !== undefined) updates.realName = realName || null;
    if (username) {
      const usernameNorm = String(username).trim().replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (usernameNorm.length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters (letters, numbers, underscore)" });
      }
      const existing = await storage.getUserByUsername(usernameNorm);
      if (existing && existing.id !== req.session.userId) {
        return res.status(400).json({ message: "Username already taken" });
      }
      updates.username = usernameNorm;
    }
    const updated = await storage.updateUser(req.session.userId!, updates);
    if (!updated) return res.status(404).json({ message: "User not found" });
    const photoUrl = await storage.getProfilePhoto(updated.id);
    return res.json({ id: updated.id, username: updated.username, email: updated.email, displayName: updated.displayName, realName: updated.realName, photoUrl, isAdmin: updated.isAdmin });
  });

  // ----- Admin bootstrap + CMS -------------------------------------------
  // First authenticated caller becomes admin if no admin exists yet. After
  // that, only existing admins can promote (or you set is_admin=true in DB
  // directly). Cheap to build, easy to revoke.
  app.post("/api/admin/bootstrap", requireAuth, async (req, res) => {
    // Race-free: a single conditional UPDATE only promotes if no admin
    // currently exists. Two concurrent first-callers can't both win.
    const claimed = await storage.tryClaimFirstAdmin(req.session.userId!);
    if (claimed) return res.json({ isAdmin: true });
    const me = await storage.getUser(req.session.userId!);
    if (me?.isAdmin) return res.json({ isAdmin: true });
    return res.status(403).json({ message: "An admin already exists. Ask an existing admin to promote you." });
  });

  // CSRF guard for the new admin mutation endpoints. Session cookies are
  // sameSite:"none" so a cross-site form POST could ride an admin's
  // session — requiring a Bearer header that lives in localStorage (and
  // is therefore unreachable cross-origin) closes that path. Bootstrap
  // and the older /api/admin/* mutations remain on the existing
  // requireAdmin contract; we only harden the routes added here.
  function requireAdminBearer(req: Request, res: Response, next: Function) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Bearer token required for admin writes" });
    }
    return requireAdmin(req, res, next);
  }

  // Promote an existing user to admin by their @username. Admin-only.
  // No revoke endpoint by design — keeps the surface tight and matches the
  // pricing-page rule that the bootstrap admin can't be locked out of the
  // CMS by another admin. Use the DB directly if you need to demote.
  app.post("/api/admin/promote", requireAdminBearer, async (req, res) => {
    const raw = String(req.body?.username ?? "").trim();
    const username = (raw.startsWith("@") ? raw.slice(1) : raw).toLowerCase();
    if (!username) return res.status(400).json({ message: "Username is required" });
    const target = await storage.getUserByUsername(username);
    if (!target) return res.status(404).json({ message: `No user found with username "@${username}"` });
    if (target.isAdmin) {
      return res.status(200).json({ id: target.id, username: target.username, displayName: target.displayName, isAdmin: true, alreadyAdmin: true });
    }
    await storage.setUserAdmin(target.id, true);
    return res.json({ id: target.id, username: target.username, displayName: target.displayName, isAdmin: true });
  });

  // Image upload for album artwork / vendor logos / person photos. Streams
  // the file into Replit Object Storage (bucket from $DEFAULT_OBJECT_STORAGE_BUCKET_ID)
  // and returns a stable "/objects/uploads/<uuid>" URL served by the
  // registerObjectStorageRoutes handler. Local FS is ephemeral on Autoscale
  // deploys — Object Storage survives redeploys.
  const multer = (await import("multer")).default;
  const { randomUUID } = await import("node:crypto");
  const { ObjectStorageService, objectStorageClient, ObjectNotFoundError } =
    await import("./replit_integrations/object_storage/objectStorage");
  const { setObjectAclPolicy, getObjectAclPolicy } = await import(
    "./replit_integrations/object_storage/objectAcl"
  );
  const objectStorage = new ObjectStorageService();
  // Serve uploaded images. Scoped to /objects/uploads/<id> only — we do NOT
  // mount the blueprint's registerObjectStorageRoutes() helpers because they
  // also expose an unauthenticated POST /api/uploads/request-url that would
  // let anyone mint signed PUT URLs into our bucket, and they serve any
  // object under PRIVATE_OBJECT_DIR without checking ACL. Here we resolve
  // strictly through /objects/uploads/* and refuse anything whose ACL isn't
  // explicitly public.
  app.get("/objects/uploads/:id", async (req, res) => {
    const id = req.params.id;
    // Block traversal / weird ids; uuid+ext only.
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
      return res.status(404).json({ message: "Not found" });
    }
    try {
      const file = await objectStorage.getObjectEntityFile(`/objects/uploads/${id}`);
      const acl = await getObjectAclPolicy(file);
      if (!acl || acl.visibility !== "public") {
        return res.status(404).json({ message: "Not found" });
      }
      await objectStorage.downloadObject(file, res, 31536000);
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        return res.status(404).json({ message: "Not found" });
      }
      console.error("Object serve failed", err);
      return res.status(500).json({ message: "Serve failed" });
    }
  });
  // MIME → extension map. We DERIVE the extension from the validated
  // mimetype instead of trusting `file.originalname`, so an attacker can't
  // upload "evil.html" with mimetype "image/png" and have us save+serve
  // an HTML payload from a same-origin URL. SVG is excluded by design
  // because it can carry executable script.
  const MIME_TO_EXT: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
  };
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB cap — matches the photo route
    fileFilter: (_req, file, cb) => {
      if (!(file.mimetype in MIME_TO_EXT)) {
        return cb(new Error("Only PNG, JPEG, GIF, WebP, or AVIF images are allowed"));
      }
      cb(null, true);
    },
  });

  // Helper: write a buffer to Object Storage under `.private/uploads/<uuid><ext>`
  // and mark it public so anyone hitting /objects/uploads/<uuid><ext> can read.
  async function uploadBufferToObjectStorage(
    buf: Buffer,
    mime: string,
  ): Promise<string> {
    const ext = MIME_TO_EXT[mime] || ".bin";
    const id = `${randomUUID()}${ext}`;
    const privateDir = objectStorage.getPrivateObjectDir().replace(/\/$/, "");
    // privateDir is like "/<bucket>/.private" — strip leading slash, then
    // split bucket vs object key.
    const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
    const firstSlash = trimmed.indexOf("/");
    const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
    const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
    const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    await file.save(buf, {
      contentType: mime,
      metadata: { cacheControl: "public, max-age=31536000, immutable" },
      resumable: false,
    });
    await setObjectAclPolicy(file, { owner: "admin", visibility: "public" });
    return `/objects/uploads/${id}`;
  }

  // Paste-from-URL — admin pastes an image URL (Dropbox, Cloudinary,
  // Imgur, any public host) into the artwork editor; we fetch it
  // server-side so cross-origin CORS doesn't block the browser, and so
  // the bytes land in our own object storage instead of being hot-linked
  // to a third party that could rotate the URL.
  //
  // SSRF guard: https-only, manual redirect-following (5 hops), every
  // hop re-validated against `isPrivateIp` so a redirect can't trick us
  // into hitting 127.0.0.1 / 169.254.169.254 / RFC1918 / ULA. We don't
  // DNS-resolve here (matches the rest of the codebase's posture) — the
  // hostname check catches bare-IP URLs.
  app.post("/api/admin/fetch-image-from-url", requireAdmin, async (req, res) => {
    try {
      const raw = String(req.body?.url || "").trim();
      if (!raw) return res.status(400).json({ message: "Paste a URL." });

      let url: URL;
      try { url = new URL(raw); }
      catch { return res.status(400).json({ message: "That doesn't look like a valid URL." }); }

      // Dropbox share links default to dl=0 (HTML preview page). Flip to
      // dl=1 so we get the actual image bytes back instead of a web page.
      const isDropbox =
        url.hostname === "www.dropbox.com" ||
        url.hostname === "dropbox.com" ||
        url.hostname === "dl.dropboxusercontent.com" ||
        /\.dl\.dropboxusercontent\.com$/i.test(url.hostname);
      if (isDropbox) url.searchParams.set("dl", "1");

      const MAX_BYTES = 8 * 1024 * 1024; // matches dropzone cap
      const timeoutMs = 30_000;
      const startMs = Date.now();
      let response: Awaited<ReturnType<typeof fetch>> | null = null;

      for (let hop = 0; hop <= 5; hop++) {
        if (Date.now() - startMs > timeoutMs) {
          return res.status(504).json({ message: "Fetching that image took too long." });
        }
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          return res.status(400).json({ message: "Image URLs must use http:// or https://." });
        }
        if (isPrivateIp(url.hostname)) {
          return res.status(400).json({ message: "Refusing to fetch from a private/internal address." });
        }
        const r = await fetch(url.toString(), {
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
          headers: { "User-Agent": "GoodTunesBot/1.0" },
        });
        if (r.status >= 300 && r.status < 400) {
          const loc = r.headers.get("location");
          if (!loc) return res.status(502).json({ message: "Redirect with no target." });
          try { url = new URL(loc, url); }
          catch { return res.status(502).json({ message: "Invalid redirect URL." }); }
          try { await r.arrayBuffer(); } catch { /* drain */ }
          continue;
        }
        response = r;
        break;
      }
      if (!response) return res.status(502).json({ message: "Too many redirects." });
      if (!response.ok) {
        return res.status(502).json({ message: `Couldn't fetch (HTTP ${response.status}). Make sure the link is public.` });
      }

      const ct = (response.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
      if (!(ct in MIME_TO_EXT)) {
        return res.status(415).json({
          message: ct.includes("text/html")
            ? "That link returned a web page, not an image. For Dropbox, use the file's direct image URL."
            : `That URL didn't return a supported image (got "${ct || "unknown"}"). Use JPG, PNG, WebP, GIF, or AVIF.`,
        });
      }

      // Stream the body, abort the moment we exceed the cap.
      const reader = response.body?.getReader();
      if (!reader) return res.status(502).json({ message: "Empty response." });
      const chunks: Buffer[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX_BYTES) {
            try { await reader.cancel(); } catch { /* ignore */ }
            return res.status(413).json({ message: "Image is larger than 8 MB." });
          }
          chunks.push(Buffer.from(value));
        }
      }
      const buf = Buffer.concat(chunks);
      const storedUrl = await uploadBufferToObjectStorage(buf, ct);
      return res.json({ url: storedUrl });
    } catch (err: any) {
      console.error("fetch-image-from-url failed", err);
      return res.status(500).json({ message: err?.message || "Couldn't fetch that image." });
    }
  });

  // Video upload — separate route + multer instance because videos need
  // a much larger size cap and a different MIME whitelist than artwork.
  // We still derive extension from validated mimetype (never from
  // originalname) and still gate behind requireAdminBearer.
  const VIDEO_MIME_TO_EXT: Record<string, string> = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
  };
  const uploadVideo = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 }, // 200MB cap — short music videos
    fileFilter: (_req, file, cb) => {
      if (!(file.mimetype in VIDEO_MIME_TO_EXT)) {
        return cb(new Error("Only MP4, MOV, or WebM videos are allowed"));
      }
      cb(null, true);
    },
  });
  app.post(
    "/api/admin/upload-video",
    requireAdminBearer,
    uploadVideo.single("file"),
    async (req, res) => {
      const f = (req as any).file as Express.Multer.File | undefined;
      if (!f) return res.status(400).json({ message: "No file uploaded" });
      try {
        const ext = VIDEO_MIME_TO_EXT[f.mimetype] || ".mp4";
        const id = `${randomUUID()}${ext}`;
        const privateDir = objectStorage.getPrivateObjectDir().replace(/\/$/, "");
        const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
        const firstSlash = trimmed.indexOf("/");
        const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
        const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
        const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
        const file = objectStorageClient.bucket(bucketName).file(objectName);
        await file.save(f.buffer, {
          contentType: f.mimetype,
          metadata: { cacheControl: "public, max-age=31536000, immutable" },
          resumable: false,
        });
        await setObjectAclPolicy(file, { owner: "admin", visibility: "public" });
        return res.json({ url: `/objects/uploads/${id}` });
      } catch (err) {
        console.error("Video upload failed", err);
        return res.status(500).json({ message: "Upload failed" });
      }
    },
  );

  // --- Direct-to-Object-Storage video upload ----------------------------
  //
  // Replit's HTTP proxy caps inbound request bodies well below our 200MB
  // multer limit (around 32MB on Autoscale + the dev preview proxy), so
  // anything larger than that returns a hard 413 before our handler runs.
  // For music-video uploads we hand the browser a signed PUT URL pointing
  // straight at Google Cloud Storage and let it stream the bytes directly,
  // skipping the proxy entirely. The server only mints the URL and, after
  // the PUT completes, flips the ACL to public so /objects/uploads/<id>
  // can serve the file like every other upload.
  //
  // Helper: ask the Replit object-storage sidecar to sign a URL. Same
  // request shape as the private `signObjectURL` inside the integration
  // blueprint; inlined here so we don't have to fork that file.
  async function signGcsUrl(
    bucketName: string,
    objectName: string,
    method: "GET" | "PUT" | "DELETE" | "HEAD",
    ttlSec: number,
  ): Promise<string> {
    const response = await fetch(
      "http://127.0.0.1:1106/object-storage/signed-object-url",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket_name: bucketName,
          object_name: objectName,
          method,
          expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to sign object URL: ${response.status}`);
    }
    const { signed_url } = (await response.json()) as { signed_url: string };
    return signed_url;
  }
  // Resolve PRIVATE_OBJECT_DIR ("/<bucket>/.private") into the bucket name
  // + the "uploads/" object-key prefix used by every upload path. Pulled
  // out of the two upload handlers above so the direct-upload flow shares
  // the same destination layout.
  function uploadDestination(id: string): { bucketName: string; objectName: string } {
    const privateDir = objectStorage.getPrivateObjectDir().replace(/\/$/, "");
    const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
    const firstSlash = trimmed.indexOf("/");
    const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
    const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
    const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
    return { bucketName, objectName };
  }

  // Step 1: mint a signed PUT URL. The client picks a MIME from the
  // allow-list, we generate an id (uuid + matching extension), sign a
  // 15-minute PUT URL, and return both the URL and the eventual public
  // path the file will be served from once finalized.
  app.post(
    "/api/admin/upload-video/sign",
    requireAdminBearer,
    async (req, res) => {
      try {
        const contentType = String(req.body?.contentType || "");
        if (!(contentType in VIDEO_MIME_TO_EXT)) {
          return res
            .status(400)
            .json({ message: "Only MP4, MOV, or WebM videos are allowed" });
        }
        const id = `${randomUUID()}${VIDEO_MIME_TO_EXT[contentType]}`;
        const { bucketName, objectName } = uploadDestination(id);
        const uploadUrl = await signGcsUrl(bucketName, objectName, "PUT", 900);
        return res.json({
          uploadUrl,
          finalPath: `/objects/uploads/${id}`,
          contentType,
        });
      } catch (err) {
        console.error("Video sign failed", err);
        return res.status(500).json({ message: "Could not start upload" });
      }
    },
  );

  // Step 2: after the browser's PUT succeeds, the client calls finalize so
  // we can verify the object actually landed and flip its ACL to public.
  // We accept the `/objects/uploads/<id>` path the sign step returned and
  // refuse anything else to keep this route from being used to publicize
  // arbitrary objects in the bucket.
  app.post(
    "/api/admin/upload-video/finalize",
    requireAdminBearer,
    async (req, res) => {
      try {
        const finalPath = String(req.body?.finalPath || "");
        if (!/^\/objects\/uploads\/[a-zA-Z0-9._-]+$/.test(finalPath)) {
          return res.status(400).json({ message: "Invalid upload path" });
        }
        const file = await objectStorage.getObjectEntityFile(finalPath);
        await setObjectAclPolicy(file, {
          owner: "admin",
          visibility: "public",
        });
        return res.json({ url: finalPath });
      } catch (err) {
        if (err instanceof ObjectNotFoundError) {
          return res.status(404).json({ message: "Upload not found" });
        }
        console.error("Video finalize failed", err);
        return res.status(500).json({ message: "Could not finalize upload" });
      }
    },
  );

  // Ingest a video from a remote URL (Dropbox, S3, plain HTTPS, etc).
  // Streams the bytes server-side into Object Storage so the admin doesn't
  // have to download a multi-hundred-MB file to their laptop just to
  // re-upload it. We:
  //   1. Normalize known share-link patterns (Dropbox `?dl=0` → `?dl=1`).
  //   2. Issue a GET, inspect the response Content-Type / extension.
  //   3. Pick a server-validated extension from the VIDEO_MIME_TO_EXT
  //      allow-list. If the upstream returns `application/octet-stream`
  //      (Dropbox sometimes does), fall back to inferring from the URL
  //      path's extension — never from a user-supplied filename.
  //   4. Stream response.body → GCS via createWriteStream() so we never
  //      buffer the whole file in memory.
  //   5. Cap at 500MB to keep abuse / runaway streams bounded.
  //   6. Flip the ACL to public and return the `/objects/uploads/<id>`
  //      path the existing /api/admin/albums/:id/videos POST can store.
  app.post(
    "/api/admin/upload-video/from-url",
    requireAdminBearer,
    async (req, res) => {
      const MAX_BYTES = 500 * 1024 * 1024;
      try {
        const raw = String(req.body?.url || "").trim();
        if (!raw) return res.status(400).json({ message: "URL is required" });
        let parsed: URL;
        try {
          parsed = new URL(raw);
        } catch {
          return res.status(400).json({ message: "That doesn't look like a valid URL" });
        }
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          return res.status(400).json({ message: "Only http(s) URLs are allowed" });
        }

        // Normalize Dropbox share links. `dl=0` shows the preview page;
        // `dl=1` (or the `dl.dropboxusercontent.com` host) serves the raw
        // file. Works for both legacy /s/ links and the newer /scl/ links.
        if (
          parsed.hostname === "www.dropbox.com" ||
          parsed.hostname === "dropbox.com"
        ) {
          parsed.searchParams.set("dl", "1");
        }
        const fetchUrl = parsed.toString();

        const upstream = await fetch(fetchUrl, { redirect: "follow" });
        if (!upstream.ok || !upstream.body) {
          return res
            .status(400)
            .json({ message: `Couldn't fetch that URL (${upstream.status})` });
        }
        const lenHeader = upstream.headers.get("content-length");
        if (lenHeader && Number(lenHeader) > MAX_BYTES) {
          return res
            .status(400)
            .json({ message: "Video is larger than the 500MB import limit" });
        }
        // Pick an extension from the validated MIME, else from the URL path.
        const upstreamMime = (upstream.headers.get("content-type") || "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        let ext: string | undefined = VIDEO_MIME_TO_EXT[upstreamMime];
        let storedMime = upstreamMime;
        if (!ext) {
          const pathExt = parsed.pathname.toLowerCase().match(/\.(mp4|mov|webm)(?:$|[?#])/);
          if (pathExt) {
            const map: Record<string, [string, string]> = {
              mp4: [".mp4", "video/mp4"],
              mov: [".mov", "video/quicktime"],
              webm: [".webm", "video/webm"],
            };
            [ext, storedMime] = map[pathExt[1]];
          }
        }
        if (!ext) {
          return res.status(400).json({
            message: "That URL didn't return an MP4, MOV, or WebM video",
          });
        }

        const id = `${randomUUID()}${ext}`;
        const { bucketName, objectName } = uploadDestination(id);
        const file = objectStorageClient.bucket(bucketName).file(objectName);

        // Stream upstream → GCS. Abort if we cross the size cap mid-stream.
        let received = 0;
        const writeStream = file.createWriteStream({
          contentType: storedMime,
          metadata: { cacheControl: "public, max-age=31536000, immutable" },
          resumable: false,
        });
        const { Readable } = await import("stream");
        const nodeReadable = Readable.fromWeb(upstream.body as any);

        let aborted = false;
        await new Promise<void>((resolve, reject) => {
          nodeReadable.on("data", (chunk: Buffer) => {
            received += chunk.length;
            if (received > MAX_BYTES && !aborted) {
              aborted = true;
              nodeReadable.destroy();
              writeStream.destroy(new Error("Video exceeded 500MB import cap"));
            }
          });
          nodeReadable.on("error", reject);
          writeStream.on("error", reject);
          writeStream.on("finish", resolve);
          nodeReadable.pipe(writeStream);
        });

        await setObjectAclPolicy(file, { owner: "admin", visibility: "public" });

        // Try to recover a sensible default title from the URL path —
        // ("Video Name.mp4" → "Video Name"). The client can still
        // override before save.
        const lastSeg = decodeURIComponent(parsed.pathname.split("/").pop() || "");
        const suggestedTitle = lastSeg.replace(/\.[^.]+$/, "") || "Imported video";

        return res.json({
          url: `/objects/uploads/${id}`,
          suggestedTitle,
          bytes: received,
        });
      } catch (err: any) {
        console.error("Video from-URL ingest failed", err);
        return res.status(500).json({
          message: err?.message || "Could not import video from that URL",
        });
      }
    },
  );

  // Audio upload — same pattern as video. We deliberately keep audio on
  // its own route + multer instance so we can cap size differently (full
  // tracks can be 30–80MB lossless, way beyond the 8MB artwork limit)
  // and gate the MIME whitelist to actual playable audio. Extension is
  // still derived from the validated mimetype, never from originalname.
  const AUDIO_MIME_TO_EXT: Record<string, string> = {
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
    "audio/webm": ".weba",
  };
  const uploadAudio = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 150 * 1024 * 1024 }, // 150MB cap — covers WAV/FLAC masters
    fileFilter: (_req, file, cb) => {
      if (!(file.mimetype in AUDIO_MIME_TO_EXT)) {
        return cb(new Error("Only MP3, M4A/AAC, WAV, FLAC, or OGG audio is allowed"));
      }
      cb(null, true);
    },
  });
  app.post(
    "/api/admin/upload-audio",
    requireAdminBearer,
    uploadAudio.single("file"),
    async (req, res) => {
      const f = (req as any).file as Express.Multer.File | undefined;
      if (!f) return res.status(400).json({ message: "No file uploaded" });
      try {
        const ext = AUDIO_MIME_TO_EXT[f.mimetype] || ".mp3";
        const id = `${randomUUID()}${ext}`;
        const privateDir = objectStorage.getPrivateObjectDir().replace(/\/$/, "");
        const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
        const firstSlash = trimmed.indexOf("/");
        const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
        const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
        const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
        const file = objectStorageClient.bucket(bucketName).file(objectName);
        await file.save(f.buffer, {
          contentType: f.mimetype,
          metadata: { cacheControl: "public, max-age=31536000, immutable" },
          resumable: false,
        });
        await setObjectAclPolicy(file, { owner: "admin", visibility: "public" });
        return res.json({ url: `/objects/uploads/${id}` });
      } catch (err) {
        console.error("Audio upload failed", err);
        return res.status(500).json({ message: "Upload failed" });
      }
    },
  );

  app.post(
    "/api/admin/upload",
    requireAdminBearer,
    upload.single("file"),
    async (req, res) => {
      const f = (req as any).file as Express.Multer.File | undefined;
      if (!f) return res.status(400).json({ message: "No file uploaded" });
      try {
        const url = await uploadBufferToObjectStorage(f.buffer, f.mimetype);
        return res.json({ url });
      } catch (err) {
        console.error("Object Storage upload failed", err);
        return res.status(500).json({ message: "Upload failed" });
      }
    },
  );

  // --- Vendor URL scraper (paste-a-link → prefilled instrument + vendor) ---
  // Reads Open Graph + Schema.org Product JSON-LD from a public product page
  // and rehosts the hero image locally so the admin can review/save without
  // any manual copy-paste. Works on every modern shop (Shopify, BigCommerce,
  // WooCommerce, Reverb, vendor sites with SEO) because those formats are
  // a published standard — not a per-site scraper. When we strike a real
  // partnership we swap individual hosts for their official API (Reverb has
  // OAuth + listings); the public route stays the catch-all.
  //
  // NOT comprehensive product data — just enough to prefill the editor.
  // The admin still reviews + saves manually.
  // SSRF guard: resolve every hostname to its IPs and reject anything that
  // points at our own infrastructure (loopback, link-local, RFC1918, cloud
  // metadata 169.254.169.254, ULA fc00::/7, etc). Applied before each fetch
  // AND after every redirect — undici's default `redirect:'follow'` would
  // happily chase a public URL into 127.0.0.1.
  const dnsLookup = (await import("node:dns/promises")).default;
  const netMod = (await import("node:net")).default;
  function isPrivateIp(ip: string): boolean {
    if (netMod.isIPv4(ip)) {
      const [a, b] = ip.split(".").map(Number);
      return (
        a === 0 || a === 10 || a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a >= 224
      );
    }
    if (netMod.isIPv6(ip)) {
      const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
      if (lower === "::1" || lower === "::") return true;
      if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
      if (lower.startsWith("fe80:")) return true;
      const m = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
      if (m) return isPrivateIp(m[1]);
      return false;
    }
    return false;
  }
  async function assertPublic(u: URL) {
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error(`Disallowed protocol: ${u.protocol}`);
    }
    const all = await dnsLookup.lookup(u.hostname, { all: true });
    for (const { address } of all) {
      if (isPrivateIp(address)) throw new Error(`Refusing to fetch private/loopback host (${address})`);
    }
  }
  // Manual redirect follower so we can re-run the SSRF check on every hop.
  // NB: `Response` is imported at the top of this file as Express's response
  // type. We explicitly want the fetch/web `Response` here, so we reach for
  // the global. Without this, callers see Express's Response and lose
  // `.ok` / `.text()` / `.arrayBuffer()` etc.
  async function safeFetch(url: string, init?: RequestInit, maxHops = 5): Promise<globalThis.Response> {
    let current = url;
    for (let i = 0; i <= maxHops; i++) {
      await assertPublic(new URL(current));
      const res = await fetch(current, { ...(init || {}), redirect: "manual" });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error("Redirect with no Location header");
        current = new URL(loc, current).toString();
        continue;
      }
      return res;
    }
    throw new Error("Too many redirects");
  }

  const KNOWN_VENDORS: Record<string, string> = {
    "cartervintage.com": "Carter Vintage Guitars",
    "normansrareguitars.com": "Norman's Rare Guitars",
    "reverb.com": "Reverb",
    "sweetwater.com": "Sweetwater",
    "chicagomusicexchange.com": "Chicago Music Exchange",
    "elderly.com": "Elderly Instruments",
    "wildwoodguitars.com": "Wildwood Guitars",
    "davesguitar.com": "Dave's Guitar Shop",
    "rudysmusic.com": "Rudy's Music",
    "gibson.com": "Gibson",
    "martinguitar.com": "Martin Guitar",
    "fender.com": "Fender",
    "gretschguitars.com": "Gretsch Guitars",
    "gretschdrums.com": "Gretsch Drums",
    "taylorguitars.com": "Taylor Guitars",
    "prsguitars.com": "PRS Guitars",
    "ricksmusicworld.com": "Rick's Music World",
    "steinway.com": "Steinway & Sons",
    "yamaha.com": "Yamaha",
    "kawai.com": "Kawai",
    "boesendorfer.com": "Bösendorfer",
    "fazioli.com": "Fazioli",
    "nordkeyboards.com": "Nord",
    "ludwig-drums.com": "Ludwig",
    "dwdrums.com": "DW Drums",
    "pearldrum.com": "Pearl Drums",
    "tama.com": "Tama",
    "sonor.com": "Sonor",
    "zildjian.com": "Zildjian",
    "sabian.com": "Sabian",
    "paiste.com": "Paiste",
    "meinl.de": "Meinl",
    "marshall.com": "Marshall",
    "mesaboogie.com": "Mesa/Boogie",
    "voxamps.com": "Vox",
    "orangeamps.com": "Orange Amps",
    "two-rock.com": "Two-Rock",
    "matchlessamplifiers.com": "Matchless",
    "friedmanamplification.com": "Friedman",
    "drzamps.com": "Dr. Z",
    "daddario.com": "D'Addario",
    "ernieball.com": "Ernie Ball",
    "elixirstrings.com": "Elixir",
    "rotosound.com": "Rotosound",
    // Europe / UK / international staples
    "thomann.de": "Thomann",
    "andertons.co.uk": "Andertons",
    "guitarguitar.co.uk": "GuitarGuitar",
    // Boutique pedals / amps
    "strymon.net": "Strymon",
    "chasebliss.com": "Chase Bliss Audio",
    "earthquakerdevices.com": "EarthQuaker Devices",
    // Keys
    "roland.com": "Roland",
    "casio.com": "Casio",
    "korg.com": "Korg",
    "moogmusic.com": "Moog",
    "sequential.com": "Sequential",
  };

  function decodeEntities(s: string) {
    return s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&#x27;/gi, "'");
  }

  // JSON-LD blocks can be a Product directly, an array of nodes, or a
  // `@graph` wrapper. Walk everything and return the first Product.
  // Depth-bounded so a maliciously-nested blob can't blow the stack.
  function findProduct(node: any, depth = 0): any {
    if (depth > 8 || !node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const n of node) { const r = findProduct(n, depth + 1); if (r) return r; }
      return null;
    }
    const t = node["@type"];
    if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) return node;
    // Walk every object value, not just @graph. Manufacturer sites
    // (Martin, Gibson) wrap the Product inside a WebPage node via
    // `mainEntity`, so a strict @graph-only walk misses it entirely and
    // we fall back to OG/Twitter for everything — losing the JSON-LD
    // image array, description, brand, etc. Bounded by depth so a
    // maliciously deep blob can't blow the stack.
    for (const key of Object.keys(node)) {
      const v = (node as any)[key];
      if (v && typeof v === "object") {
        const r = findProduct(v, depth + 1);
        if (r) return r;
      }
    }
    return null;
  }

  async function rehostRemoteImage(src: string): Promise<string> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const r = await safeFetch(src, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GoodTunesBot/1.0)" },
    }).finally(() => clearTimeout(t));
    if (!r.ok) throw new Error(`image fetch ${r.status}`);
    const mime = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const ext = MIME_TO_EXT[mime];
    if (!ext) throw new Error(`unsupported image mime: ${mime || "unknown"}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength > 8 * 1024 * 1024) throw new Error("image larger than 8MB");
    return await uploadBufferToObjectStorage(buf, mime);
  }

  app.post("/api/admin/instruments/scrape", requireAdminBearer, async (req, res) => {
    const url = String(req.body?.url ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ message: "A full https:// product URL is required" });
    }
    let parsed: URL;
    try { parsed = new URL(url); } catch { return res.status(400).json({ message: "Malformed URL" }); }
    const host = parsed.hostname.replace(/^www\./, "");

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const html = await safeFetch(url, {
        signal: ctrl.signal,
        headers: {
          // Some shops 403 the default undici UA. A polite browser-like UA
          // gets through Carter Vintage, Reverb, Gibson, Martin, etc.
          "User-Agent": "Mozilla/5.0 (compatible; GoodTunesBot/1.0; +https://goodtunes.app)",
          "Accept": "text/html,application/xhtml+xml",
        },
      }).then((r) => {
        if (!r.ok) throw new Error(`Vendor page returned ${r.status}`);
        return r.text();
      }).finally(() => clearTimeout(t));

      // Collect every meta tag. Two regexes because property/name can come
      // before or after content depending on the shop's template.
      const meta: Record<string, string> = {};
      // Prefer the first occurrence found in document order for both regex
      // orderings; some templates emit dupes for FB/Twitter compatibility.
      const re1 = /<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
      const re2 = /<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']([^"']+)["'][^>]*>/gi;
      let m: RegExpExecArray | null;
      while ((m = re1.exec(html))) {
        const key = m[1].toLowerCase();
        if (!(key in meta)) meta[key] = decodeEntities(m[2]);
      }
      while ((m = re2.exec(html))) {
        const key = m[2].toLowerCase();
        if (!(key in meta)) meta[key] = decodeEntities(m[1]);
      }

      let product: any = null;
      const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      while ((m = ldRe.exec(html))) {
        try {
          const node = JSON.parse(m[1].trim());
          const found = findProduct(node);
          if (found) { product = found; break; }
        } catch { /* malformed JSON-LD — keep walking */ }
      }

      const name = product?.name || meta["og:title"] || meta["twitter:title"] || null;
      const brand = (typeof product?.brand === "object" ? product.brand?.name : product?.brand) || null;
      const category = product?.category || null;
      // Description: prefer Product.description (richer/longer) over OG.
      // Strip HTML tags — Shopify often embeds <p> / <br> in description.
      let descriptionRaw: string | null =
        product?.description ||
        meta["og:description"] ||
        meta["twitter:description"] ||
        meta["description"] ||
        null;
      if (descriptionRaw) {
        descriptionRaw = descriptionRaw
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
          .replace(/<[^>]+>/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }
      // Offer price (useful context for the admin even though we don't
      // store it yet — keeps the door open for "from $X" in the future).
      const offer = product?.offers && (Array.isArray(product.offers) ? product.offers[0] : product.offers);
      const price = offer?.price ? `${offer.priceCurrency || "USD"} ${offer.price}` : null;

      // Spec table extraction — the part that actually matters for guitar
      // shops. Carter Vintage, Reverb, Norman's etc. put 20+ rows of real
      // gear data (Year, Top, Back/Sides, Tuners, Scale Length, Pickups…)
      // in plain HTML tables that never appear in OG or JSON-LD root. Try
      // three sources in priority order; keep the first value seen.
      const specs: Record<string, string> = {};
      const cleanCell = (s: string) =>
        decodeEntities(
          s.replace(/<script[\s\S]*?<\/script>/gi, "")
           .replace(/<style[\s\S]*?<\/style>/gi, "")
           .replace(/<[^>]+>/g, " ")
           .replace(/\s+/g, " ")
           .trim(),
        );
      const looksLikeSpec = (label: string, value: string) =>
        label.length > 0 && label.length <= 50 &&
        value.length > 0 && value.length <= 200 &&
        // Reject obvious nav / button / chrome rows.
        !/^(add to cart|buy now|sign in|search|menu|cart|checkout|home|shop)$/i.test(label) &&
        !/^(add to cart|buy now)$/i.test(value);

      // 1) Schema.org additionalProperty — Shopify themes increasingly emit this.
      const addProps = (product as any)?.additionalProperty;
      if (Array.isArray(addProps)) {
        for (const p of addProps) {
          const lbl = p?.name && String(p.name).trim();
          const val = p?.value != null && String(p.value).trim();
          if (lbl && val && looksLikeSpec(lbl, val) && !(lbl in specs)) specs[lbl] = val;
        }
      }
      // 2) Two-column <table> rows — Carter Vintage's main format.
      const rowRe = /<tr[^>]*>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/gi;
      let sm: RegExpExecArray | null;
      while ((sm = rowRe.exec(html)) && Object.keys(specs).length < 40) {
        const label = cleanCell(sm[1]);
        const value = cleanCell(sm[2]);
        if (looksLikeSpec(label, value) && !(label in specs)) specs[label] = value;
      }
      // 3) Definition lists — Reverb, some Shopify themes.
      const dlRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
      while ((sm = dlRe.exec(html)) && Object.keys(specs).length < 40) {
        const label = cleanCell(sm[1]);
        const value = cleanCell(sm[2]);
        if (looksLikeSpec(label, value) && !(label in specs)) specs[label] = value;
      }

      // JSON-LD Product.image can also be a wrapped { "@type": "ImageObject",
      // "url": "..." } instead of a bare URL string — handle both shapes.
      const pickImage = (img: any): string | null => {
        if (!img) return null;
        if (typeof img === "string") return img;
        if (Array.isArray(img)) {
          for (const x of img) { const v = pickImage(x); if (v) return v; }
          return null;
        }
        if (typeof img === "object") return img.url || img.contentUrl || null;
        return null;
      };
      let rawImage: string | null =
        pickImage(product?.image) ||
        meta["og:image:secure_url"] || meta["og:image"] || meta["twitter:image"] ||
        // Manufacturer sites (Martin uses Salesforce Commerce Cloud / Demandware)
        // emit a bare `<meta property="image">` instead of `og:image`. Falling
        // back to it lets us still rehost the hero shot when no OG tag exists.
        meta["image"] || null;
      if (rawImage?.startsWith("//")) rawImage = `https:${rawImage}`;
      if (rawImage?.startsWith("/")) rawImage = `${parsed.origin}${rawImage}`;

      let photoUrl: string | null = null;
      if (rawImage) {
        try { photoUrl = await rehostRemoteImage(rawImage); }
        catch { photoUrl = rawImage; /* fall back to hot-link, admin can re-upload */ }
      }

      const vendorName =
        KNOWN_VENDORS[host] ||
        meta["og:site_name"] ||
        host.split(".").slice(0, -1).join(".").replace(/\b\w/g, (c) => c.toUpperCase());

      res.json({
        name,
        brand,
        category,
        description: descriptionRaw,
        specs,
        price,
        photoUrl,
        sourceImage: rawImage,
        vendor: {
          name: vendorName,
          affiliateUrl: url,
          aboutUrl: `${parsed.origin}/`,
          logoUrl: `https://www.google.com/s2/favicons?sz=128&domain=${host}`,
          domain: host,
          known: host in KNOWN_VENDORS,
        },
      });
    } catch (e: any) {
      const msg = e?.name === "AbortError" ? "Vendor site took too long to respond." : (e?.message || "Unable to read that page");
      res.status(502).json({ message: msg });
    }
  });

  app.post("/api/admin/albums", requireAdmin, async (req, res) => {
    const { id, title, artist, artwork, year, type, description, appleMusicUrl, spotifyUrl, labelId, genre } = req.body ?? {};
    if (!title || !artist || !artwork) {
      return res.status(400).json({ message: "title, artist, artwork are required" });
    }
    // Validate the FK up front so an unknown label id returns a clean 400
    // rather than a generic 500 from the underlying foreign-key violation.
    // Empty string is normalized to null (no label).
    const normalizedLabelId = labelId ? String(labelId) : null;
    if (normalizedLabelId && !(await storage.getLabelById(normalizedLabelId))) {
      return res.status(400).json({ message: "Unknown labelId" });
    }
    const album = await storage.createAlbum({
      id: id || undefined,
      title: String(title),
      artist: String(artist),
      artwork: String(artwork),
      year: year != null ? Number(year) : null,
      type: normalizeAlbumType(type),
      description: description ? String(description) : null,
      labelId: normalizedLabelId,
      appleMusicUrl: appleMusicUrl ? String(appleMusicUrl) : null,
      spotifyUrl: spotifyUrl ? String(spotifyUrl) : null,
      genre: genre ? String(genre).trim() : null,
      goodTunesReleaseDate: normalizeReleaseDate(req.body?.goodTunesReleaseDate),
      streamingReleaseDate: normalizeReleaseDate(req.body?.streamingReleaseDate),
      primaryArtistId: await resolvePrimaryArtistId(req.body?.primaryArtistId),
      // Discography "+ Add" + Apple-URL seed paths leave this off; admin
      // flips it on once an album is actually being released by GoodTunes.
      isGoodTunesRelease: !!req.body?.isGoodTunesRelease,
    } as any);
    return res.status(201).json(album);
  });

  // One-shot backfill: flips `isGoodTunesRelease=true` on the small,
  // hard-coded list of original GoodTunes releases. Exists because the
  // boolean column shipped to prod with a `false` default, leaving the
  // curated Albums sidebar empty until each original is flagged. Title
  // match is case-insensitive and tolerant of small variants ("Love Spell"
  // vs "Love Spell EP" vs "Lovespell"). Safe to re-run — no-op when the
  // flag is already on. Returns the rows that changed.
  app.post("/api/admin/albums/backfill-originals", requireAdmin, async (_req, res) => {
    const targets = [
      "guitar as a voice",
      "when the world stops",
      "california way",
      "love spell",
      "love spell ep",
      "lovespell",
      "love life tragedy",
    ];
    const all = await storage.getAlbums({ includeHidden: true });
    const updated: { id: string; title: string }[] = [];
    for (const a of all) {
      if (a.isGoodTunesRelease) continue;
      const norm = String(a.title || "").trim().toLowerCase();
      if (!targets.includes(norm)) continue;
      await storage.updateAlbum(a.id, { isGoodTunesRelease: true } as any);
      updated.push({ id: a.id, title: a.title });
    }
    return res.json({ updated, count: updated.length });
  });

  // Seed a new album from an Apple Music album URL. Mirrors how the
  // artist scrape pulls a discography, but tighter: one URL → one album +
  // its complete tracklist (title, track #, duration) created in a single
  // round-trip so the admin lands in a near-complete album editor.
  // URL shape: https://music.apple.com/<country>/album/<slug>/<collectionId>
  // The numeric collectionId at the end is the only piece we actually need
  // for iTunes Lookup. Falls back to "us" storefront if the URL omits one.
  app.post("/api/admin/albums/from-apple-url", requireAdmin, async (req, res) => {
    const url = String(req.body?.url ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ message: "A full https:// Apple Music album URL is required" });
    }
    let parsed: URL;
    try { parsed = new URL(url); } catch { return res.status(400).json({ message: "Malformed URL" }); }
    const host = parsed.hostname.replace(/^www\./, "");
    if (!/(^|\.)music\.apple\.com$/.test(host)) {
      return res.status(400).json({ message: "Only music.apple.com album URLs are supported here. (Spotify album scrape coming next.)" });
    }
    // Pull the trailing numeric segment from the path — Apple Music album
    // URLs always end in /<collectionId> (the ?i=<trackId> query param,
    // if present, is the song id within the album which we don't need).
    const m = parsed.pathname.match(/\/album\/[^/]+\/(\d+)/);
    const collectionId = m?.[1];
    if (!collectionId) {
      return res.status(400).json({ message: "Couldn't find an album id in that URL. Expecting …/album/<slug>/<id>." });
    }
    const country = (parsed.pathname.split("/").filter(Boolean)[0] || "us").toLowerCase();

    type ItunesResult = any;
    let payload: { results?: ItunesResult[] };
    try {
      const r = await safeFetch(
        `https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=200&country=${encodeURIComponent(country)}`,
        { headers: { Accept: "application/json" } },
      );
      payload = await r.json();
    } catch (e: any) {
      return res.status(502).json({ message: `iTunes lookup failed: ${e?.message ?? "network error"}` });
    }
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const collection = results.find((r) => r.wrapperType === "collection");
    if (!collection) {
      return res.status(404).json({ message: "Apple didn't return an album for that id." });
    }
    const tracks = results
      .filter((r) => r.wrapperType === "track" && r.kind === "song")
      .sort((a, b) => (Number(a.trackNumber) || 0) - (Number(b.trackNumber) || 0));

    // Bump the artwork from the default 100×100 thumb to a 600×600 master
    // — same trick used by the artist discography scraper above.
    const art100: string = collection.artworkUrl100 || collection.artworkUrl60 || "";
    const artwork = art100.replace(/\/(\d+)x(\d+)bb\.(jpg|png)$/i, "/600x600bb.$3") || "/album-placeholder.svg";
    const releaseDate: string | null = collection.releaseDate || null;
    const year = releaseDate ? Number(releaseDate.slice(0, 4)) || null : null;
    const trackCount = Number(collection.trackCount) || tracks.length || null;
    // iTunes calls everything "Album"; lean on track count to bucket EPs +
    // singles, matching the rule already in `normalizeAlbumType`'s spirit.
    const type: "Single" | "EP" | "LP" =
      trackCount === 1 ? "Single" : trackCount && trackCount <= 6 ? "EP" : "LP";

    // Resolve the artist text → Person rows. Apple uses two very different
    // conventions in the same `artistName` field:
    //   • Band/duo names — "Tim Snider & Wolfgang Timber", "Simon & Garfunkel",
    //     "Crosby, Stills & Nash". These are ONE artist entity, not several.
    //   • Featured guests — "Drake feat. Rihanna", "X ft. Y", "A with B".
    //     The first name is the primary, the rest are guests.
    // We can't tell the two apart from punctuation alone, so we only split
    // on the explicit guest markers (feat./ft./with). Anything with just
    // "&", ",", or "and" is treated as a single artist name — preserving
    // band identity. Worst case the admin renames or splits later; better
    // than silently shattering "Tim Snider & Wolfgang Timber" into three
    // rows. If the artist string is empty we still create one Person from
    // whatever text Apple gave us, so every imported album lands with at
    // least one Person attached.
    const artistName: string = String(collection.artistName || "").trim();
    let primaryArtistId: string | null = null;
    if (artistName) {
      const pieces = artistName
        .split(/\s+(?:\bfeat\.?\b|\bft\.?\b|\bwith\b)\s+/i)
        .map((s) => s.trim())
        .filter(Boolean);
      const names = pieces.length > 0 ? pieces : [artistName];
      const allPeople = await storage.getPeople();
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const existing = allPeople.find(
          (p) => p.name.toLowerCase() === name.toLowerCase(),
        );
        let personId: string;
        if (existing) {
          personId = existing.id;
        } else {
          const created = await storage.createPerson({ name } as any);
          personId = created.id;
          allPeople.push(created);
        }
        if (i === 0) primaryArtistId = personId;
      }
    }

    const album = await storage.createAlbum({
      title: String(collection.collectionName || "Untitled album"),
      artist: artistName || "Unknown artist",
      artwork,
      year,
      type,
      description: null,
      labelId: null,
      isHidden: false,
      appleMusicUrl: String(collection.collectionViewUrl || url),
      spotifyUrl: null,
      goodTunesReleaseDate: null,
      streamingReleaseDate: releaseDate ? releaseDate.slice(0, 10) : null,
      primaryArtistId,
      // Apple's `primaryGenreName` on the collection row maps cleanly to
      // our free-text `genre` column ("Indie Rock", "Hip-Hop/Rap", etc.).
      // Admins can still rename it later from the About tab.
      genre: collection.primaryGenreName
        ? String(collection.primaryGenreName).trim() || null
        : null,
      // Apple-URL seed only runs from the Albums column's "Seed an album"
      // button — admin is explicitly curating a GoodTunes release here.
      isGoodTunesRelease: true,
    } as any);

    // Bulk-create the tracks. iTunes durations are in ms; songs.duration
    // is stored as integer seconds (per shared/schema.ts).
    let created = 0;
    for (const t of tracks) {
      try {
        await storage.createSong({
          albumId: album.id,
          title: String(t.trackName || `Track ${t.trackNumber ?? created + 1}`),
          trackNumber: Number(t.trackNumber) || created + 1,
          duration: Math.round(Number(t.trackTimeMillis || 0) / 1000),
          lyrics: null,
          audioUrl: null,
        } as any);
        created += 1;
      } catch { /* skip the rare bad row rather than aborting the whole import */ }
    }

    return res.status(201).json({ album, trackCount: created });
  });

  app.put("/api/admin/albums/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const { title, artist, artwork, year, type, description } = req.body ?? {};
    const updates: any = {};
    if (title !== undefined) updates.title = String(title);
    if (artist !== undefined) updates.artist = String(artist);
    if (artwork !== undefined) updates.artwork = String(artwork);
    if (year !== undefined) updates.year = year === null || year === "" ? null : Number(year);
    if (type !== undefined) updates.type = normalizeAlbumType(type);
    if (description !== undefined) updates.description = description ? String(description) : null;
    if (req.body?.goodTunesReleaseDate !== undefined)
      updates.goodTunesReleaseDate = normalizeReleaseDate(req.body.goodTunesReleaseDate);
    if (req.body?.streamingReleaseDate !== undefined)
      updates.streamingReleaseDate = normalizeReleaseDate(req.body.streamingReleaseDate);
    if (req.body?.primaryArtistId !== undefined)
      updates.primaryArtistId = await resolvePrimaryArtistId(req.body.primaryArtistId);
    if (req.body?.labelId !== undefined) {
      const normalizedLabelId = req.body.labelId ? String(req.body.labelId) : null;
      if (normalizedLabelId && !(await storage.getLabelById(normalizedLabelId))) {
        return res.status(400).json({ message: "Unknown labelId" });
      }
      updates.labelId = normalizedLabelId;
    }
    if (req.body?.isHidden !== undefined) updates.isHidden = !!req.body.isHidden;
    if (req.body?.isGoodTunesRelease !== undefined)
      updates.isGoodTunesRelease = !!req.body.isGoodTunesRelease;
    if (req.body?.appleMusicUrl !== undefined) updates.appleMusicUrl = req.body.appleMusicUrl ? String(req.body.appleMusicUrl) : null;
    if (req.body?.spotifyUrl !== undefined) updates.spotifyUrl = req.body.spotifyUrl ? String(req.body.spotifyUrl) : null;
    if (req.body?.genre !== undefined)
      updates.genre = req.body.genre ? String(req.body.genre).trim() : null;
    const updated = await storage.updateAlbum(id, updates);
    if (!updated) return res.status(404).json({ message: "Album not found" });
    return res.json(updated);
  });

  app.delete("/api/admin/albums/:id", requireAdmin, async (req, res) => {
    await storage.deleteAlbum(String(req.params.id));
    return res.json({ message: "Deleted" });
  });

  app.post("/api/admin/songs", requireAdmin, async (req, res) => {
    const { albumId, title, trackNumber, duration, lyrics, audioUrl } = req.body ?? {};
    if (!albumId || !title || trackNumber == null) {
      return res.status(400).json({ message: "albumId, title, trackNumber are required" });
    }
    const song = await storage.createSong({
      albumId: String(albumId),
      title: String(title),
      trackNumber: Number(trackNumber),
      duration: duration != null ? Number(duration) : 180,
      lyrics: lyrics ? String(lyrics) : null,
      audioUrl: audioUrl ? String(audioUrl) : null,
    } as any);
    return res.status(201).json(song);
  });

  app.put("/api/admin/songs/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const { title, trackNumber, duration, lyrics, audioUrl, syncedLyrics, instrumental, previewStartMs, previewEndMs } = req.body ?? {};
    const updates: any = {};
    if (title !== undefined) updates.title = String(title);
    if (trackNumber !== undefined) updates.trackNumber = Number(trackNumber);
    if (duration !== undefined) updates.duration = Number(duration);
    if (lyrics !== undefined) updates.lyrics = lyrics ? String(lyrics) : null;
    if (audioUrl !== undefined) updates.audioUrl = audioUrl ? String(audioUrl) : null;
    if (instrumental !== undefined) updates.instrumental = Boolean(instrumental);
    // Preview window is atomic: either both fields null (auto-derived
    // from the master, default) or both finite non-negative integers
    // with end > start. We reject partial/NaN updates with a 400 so
    // the dot meter and the editor can never disagree about state.
    if (previewStartMs !== undefined || previewEndMs !== undefined) {
      const sIn = previewStartMs;
      const eIn = previewEndMs;
      if (sIn === null && eIn === null) {
        updates.previewStartMs = null;
        updates.previewEndMs = null;
      } else {
        const sN = Number(sIn);
        const eN = Number(eIn);
        if (
          !Number.isFinite(sN) ||
          !Number.isFinite(eN) ||
          sN < 0 ||
          eN <= sN
        ) {
          return res.status(400).json({
            error:
              "previewStartMs and previewEndMs must be finite non-negative integers with end > start (or both null).",
          });
        }
        updates.previewStartMs = Math.round(sN);
        updates.previewEndMs = Math.round(eN);
      }
    }
    // Synced lyrics: an array of { timeMs, text } cues parsed client-side
    // from a .vtt file. Validate the shape defensively — anything that
    // doesn't look like a non-empty cue array is stored as null so the
    // Player falls back to the auto-distributed timing.
    if (syncedLyrics !== undefined) {
      if (
        Array.isArray(syncedLyrics) &&
        syncedLyrics.length > 0 &&
        syncedLyrics.every(
          (c: any) =>
            c &&
            typeof c.timeMs === "number" &&
            Number.isFinite(c.timeMs) &&
            c.timeMs >= 0 &&
            typeof c.text === "string",
        )
      ) {
        updates.syncedLyrics = syncedLyrics.map((c: any) => ({
          timeMs: Math.round(c.timeMs),
          text: String(c.text),
        }));
      } else {
        updates.syncedLyrics = null;
      }
    }
    const updated = await storage.updateSong(id, updates);
    if (!updated) return res.status(404).json({ message: "Song not found" });
    return res.json(updated);
  });

  app.delete("/api/admin/songs/:id", requireAdmin, async (req, res) => {
    await storage.deleteSong(String(req.params.id));
    return res.json({ message: "Deleted" });
  });

  // ─── Waveform generation ─────────────────────────────────────────────
  // Streams the song's master through ffmpeg → mono 8 kHz PCM → reduces
  // to ~200 normalized peaks, then persists them on `songs.waveform`.
  // The peaks drive the Preview Slider™ window picker and the consumer
  // scrubber so both render the actual loudness shape of the audio.
  // Per-song (used by the admin "Regenerate waveform" button + the
  // master-upload finalize step) and per-album bulk (used to backfill
  // an existing catalog like album-5).
  app.post(
    "/api/admin/songs/:id/waveform",
    requireAdminBearer,
    async (req, res) => {
      const id = String(req.params.id);
      const song = await storage.getSongById(id);
      if (!song) return res.status(404).json({ message: "Song not found" });
      if (!song.audioUrl)
        return res.status(400).json({ message: "Song has no master file yet" });
      try {
        const { waveformFromAudioUrl } = await import("./waveform");
        const peaks = await waveformFromAudioUrl(song.audioUrl);
        const updated = await storage.updateSong(id, {
          waveform: peaks,
        } as any);
        return res.json({ id, bars: peaks.length, song: updated });
      } catch (err: any) {
        console.error("Waveform extraction failed", id, err?.message);
        return res
          .status(500)
          .json({ message: err?.message || "Waveform extraction failed" });
      }
    },
  );

  app.post(
    "/api/admin/albums/:id/waveforms",
    requireAdminBearer,
    async (req, res) => {
      const albumId = String(req.params.id);
      const all = await storage.getSongsByAlbum(albumId);
      if (!all.length)
        return res.status(404).json({ message: "Album has no songs" });
      const { waveformFromAudioUrl } = await import("./waveform");
      const results: Array<{ id: string; ok: boolean; error?: string }> = [];
      // Sequential — ffmpeg + 24-bit/96 kHz WAV downloads are memory-heavy;
      // parallel runs would risk OOM on Autoscale.
      for (const s of all) {
        if (!s.audioUrl) {
          results.push({ id: s.id, ok: false, error: "no master" });
          continue;
        }
        try {
          const peaks = await waveformFromAudioUrl(s.audioUrl);
          await storage.updateSong(s.id, { waveform: peaks } as any);
          results.push({ id: s.id, ok: true });
        } catch (err: any) {
          console.error("Waveform failed for", s.id, err?.message);
          results.push({ id: s.id, ok: false, error: err?.message });
        }
      }
      return res.json({
        albumId,
        total: results.length,
        succeeded: results.filter((r) => r.ok).length,
        results,
      });
    },
  );

  // Auto-sync lyrics to audio via ElevenLabs Forced Alignment.
  //
  // Flow: load song → fetch master audio bytes from object storage → POST
  // multipart {file, text} to https://api.elevenlabs.io/v1/forced-alignment
  // → convert the returned word-level alignment into the per-line
  // {timeMs, text}[] shape the Player already understands → save to
  // songs.syncedLyrics. Player.tsx prefers this array over the round-second
  // auto-distribution when it's present.
  //
  // Cost ~$0.03 / 4-min song; 95%+ accurate on clean vocals. Admin-only.
  // Hard caps for the paid ElevenLabs call. 150MB covers a 24-bit/96kHz WAV
  // of ~13 minutes; longer songs should be re-uploaded as compressed FLAC.
  // 30k chars is well below ElevenLabs's 675k limit but plenty for lyrics.
  const FA_MAX_AUDIO_BYTES = 150 * 1024 * 1024;
  const FA_MAX_LYRIC_CHARS = 30_000;
  const FA_TIMEOUT_MS = 120_000; // alignments rarely exceed 60s; double for headroom

  // ─── refineCuesAgainstPlain ──────────────────────────────────────
  // Run AFTER STT produces line-grouped cues. Aligns each cue to a
  // matching window of the typed Plain lyrics by exact word-position
  // match (window length locked to cue length), then swaps the words
  // STT clearly got wrong. Conservative on purpose:
  //   - requires ≥65% of the cue's words to already match Plain at
  //     the same positions before any swap (else cue is left alone),
  //   - skips stylistic-variant pairs (cuz/cause, yeah/ya, till/until…),
  //   - at the very first or last position, requires ≥2 shared
  //     consecutive chars (blocks "So" → "Over" boundary artifacts),
  //   - preserves STT's natural casing + trailing punctuation so the
  //     cue still reads like dictation, not a copy-paste from Plain.
  function refineCuesAgainstPlain(
    cues: Array<{ timeMs: number; endMs?: number; text: string }>,
    plainLyrics: string,
  ) {
    if (!plainLyrics) return cues;
    const headerRe = /^(v\d+|pre\d+|chorus\d*|bridge\d*|outro|intro|hook|tag|verse\d*)$/i;
    const decorRe = /^[.…\-_·•]+$/;
    const plainTokens: string[] = [];
    for (const raw of plainLyrics.split(/\s+/)) {
      const t = raw.trim();
      if (!t) continue;
      const bare = t.replace(/[^\w]/g, "");
      if (headerRe.test(bare)) continue;
      if (decorRe.test(t)) continue;
      plainTokens.push(t);
    }
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const pn = plainTokens.map(norm);
    if (pn.length === 0) return cues;

    const EQUIV_GROUPS = [
      ["cuz", "cause", "because", "cos", "coz"],
      ["yeah", "yea", "ya"],
      ["til", "till", "until"],
      ["em", "them"],
      ["wanna", "want", "wanta"],
      ["gonna", "going"],
      ["gotta", "got"],
      ["kinda", "kind"],
      ["aint", "isnt", "arent"],
      ["ok", "okay"],
    ];
    const eqClass = new Map<string, number>();
    EQUIV_GROUPS.forEach((g, i) => g.forEach((w) => eqClass.set(w, i)));
    const sameClass = (a: string, b: string) => {
      if (a === b) return true;
      const ca = eqClass.get(a), cb = eqClass.get(b);
      return ca !== undefined && ca === cb;
    };
    const lcsLen = (a: string, b: string) => {
      let best = 0;
      for (let i = 0; i < a.length; i++)
        for (let j = 0; j < b.length; j++) {
          let k = 0;
          while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
          if (k > best) best = k;
        }
      return best;
    };
    const stripPunct = (s: string) => s.replace(/[^\p{L}\p{N}'’]/gu, "");
    const matchCase = (cueWord: string, plainWord: string) => {
      const p = stripPunct(plainWord);
      const c = cueWord;
      const lead = /^[A-Z]/.test(c);
      const allCaps = /^[A-Z]+$/.test(c.replace(/[^A-Za-z]/g, ""));
      let out = p.toLowerCase();
      if (allCaps && c.length > 1) out = p.toUpperCase();
      else if (lead) out = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      const trail = c.match(/[^\p{L}\p{N}'’]+$/u);
      if (trail) out += trail[0];
      return out;
    };

    return cues.map((cue) => {
      const cueTokens = cue.text.split(/\s+/).filter(Boolean);
      const cn = cueTokens.map(norm);
      const n = cn.length;
      if (n < 3) return cue;
      let bestScore = 0, bestStart = -1;
      const L = n;
      for (let i = 0; i + L <= pn.length; i++) {
        let matches = 0;
        for (let k = 0; k < L; k++) if (pn[i + k] === cn[k]) matches++;
        const score = matches / n;
        if (score > bestScore) { bestScore = score; bestStart = i; }
      }
      if (bestScore < 0.65 || bestStart < 0) return cue;
      const newTokens = cueTokens.slice();
      let changed = false;
      for (let k = 0; k < n; k++) {
        const cWord = cueTokens[k];
        const pWord = plainTokens[bestStart + k];
        const cN = cn[k], pN = pn[bestStart + k];
        if (cN === pN) continue;
        if (sameClass(cN, pN)) continue;
        if ((k === 0 || k === n - 1) && lcsLen(cN, pN) < 2) continue;
        newTokens[k] = matchCase(cWord, pWord);
        changed = true;
      }
      if (!changed) return cue;
      return { ...cue, text: newTokens.join(" ") };
    });
  }

  // ── Dropbox folder import ─────────────────────────────────────────────
  // Bill drops his whole-album masters into a Dropbox folder; this lets
  // him paste the share URL once and we fan-out per-track. Same idea
  // for lyrics PDFs/DOCXs. No Dropbox OAuth needed — appending `?dl=1`
  // to a public folder share URL returns a ZIP of every file inside.
  // We cap downloads at 1 GB to keep memory sane; for a typical album
  // (10×30 MB WAVs) we're nowhere near that.
  const AUDIO_MIME_BY_EXT: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".aiff": "audio/aiff",
    ".aif": "audio/aiff",
    ".ogg": "audio/ogg",
  };
  const LYRIC_EXTENSIONS = new Set([".pdf", ".docx", ".doc", ".txt"]);
  // Compressed-stream cap and total-inflated cap. Compressed is what we
  // pull off the wire (streamed, aborted the moment we exceed it).
  // Uncompressed bounds defend against ZIP-bomb behavior where a tiny
  // file inflates into a multi-gigabyte payload that fits in RAM only
  // briefly before OOM-killing the process.
  const MAX_DROPBOX_COMPRESSED_BYTES = 1024 * 1024 * 1024; // 1 GB on the wire
  const MAX_DROPBOX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB total inflated
  const MAX_DROPBOX_ENTRY_BYTES = 500 * 1024 * 1024; // 500 MB per file
  // Hosts Dropbox uses for share-link content. dl.dropboxusercontent.com
  // is the actual CDN host that `?dl=1` redirects to. Anything else
  // (corporate Dropbox shortcuts, attacker-controlled subdomains like
  // evil-dropbox.com) must be rejected. Suffix matching is unsafe;
  // require an exact hostname match.
  const DROPBOX_ALLOWED_HOSTS = new Set([
    "www.dropbox.com",
    "dropbox.com",
    "dl.dropboxusercontent.com",
    "ucb01a3.dl.dropboxusercontent.com", // some accounts hit a per-bucket subdomain — see note below
  ]);
  // We reuse the file-level `isPrivateIp` declared higher up (it also
  // covers IPv6 + IPv4-mapped-IPv6, which a fresh dotted-quad regex
  // would miss). For non-IP hostnames it returns false, so calling it
  // on something like "www.dropbox.com" is a no-op.
  function assertDropboxHost(u: URL): void {
    if (u.protocol !== "https:") {
      throw new Error("Dropbox links must use https://.");
    }
    const host = u.hostname.toLowerCase();
    if (isPrivateIp(host)) {
      throw new Error("Refusing to fetch from a private/internal address.");
    }
    // Allow the literal allowlist OR any `<sub>.dl.dropboxusercontent.com`
    // bucket subdomain (Dropbox shards downloads across these). We DON'T
    // use generic suffix matching — that's exactly the SSRF hole the
    // architect flagged. The bucket-subdomain pattern is narrow enough
    // that `evil-dropboxusercontent.com` still gets rejected.
    if (DROPBOX_ALLOWED_HOSTS.has(host)) return;
    if (/^[a-z0-9-]+\.dl\.dropboxusercontent\.com$/i.test(host)) return;
    throw new Error("That host isn't a Dropbox download URL.");
  }

  function extOf(name: string): string {
    const i = name.lastIndexOf(".");
    return i === -1 ? "" : name.slice(i).toLowerCase();
  }
  function basenameOf(p: string): string {
    const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return i === -1 ? p : p.slice(i + 1);
  }
  function normalizeDropboxFolderUrl(raw: string): URL {
    let u: URL;
    try { u = new URL(raw); } catch { throw new Error("That doesn't look like a URL."); }
    assertDropboxHost(u);
    // Force dl=1; on a folder link this returns a ZIP of the whole folder.
    u.searchParams.set("dl", "1");
    return u;
  }

  // Follow redirects manually so we can re-validate the host at every
  // hop. Native fetch's `redirect: "follow"` will happily send the
  // request to whatever Location the response specifies, which is
  // exactly the SSRF vector we have to close.
  async function fetchDropboxFolderZip(folderUrl: string): Promise<Buffer> {
    let url = normalizeDropboxFolderUrl(folderUrl);
    const maxHops = 5;
    const startMs = Date.now();
    const timeoutMs = 60_000;
    let response: Awaited<ReturnType<typeof fetch>> | null = null;

    for (let hop = 0; hop <= maxHops; hop++) {
      if (Date.now() - startMs > timeoutMs) {
        throw new Error("Dropbox took too long to respond.");
      }
      const r = await fetch(url.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) throw new Error("Dropbox redirect with no target.");
        let next: URL;
        try { next = new URL(loc, url); } catch { throw new Error("Dropbox sent an invalid redirect URL."); }
        assertDropboxHost(next);
        url = next;
        // Drain the redirect body so the socket can be reused.
        try { await r.arrayBuffer(); } catch { /* ignore */ }
        continue;
      }
      response = r;
      break;
    }
    if (!response) throw new Error("Too many Dropbox redirects.");
    if (!response.ok) {
      throw new Error(`Couldn't reach Dropbox (HTTP ${response.status}). Make sure the link is shareable.`);
    }
    const ct = (response.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html")) {
      throw new Error("Dropbox returned a web page instead of files. Check that the link is set to 'Anyone with the link'.");
    }
    // Stream the body and stop the moment we exceed our compressed cap.
    // We don't trust Content-Length because Dropbox doesn't always send
    // one for chunked transfers.
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Dropbox sent an empty response.");
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_DROPBOX_COMPRESSED_BYTES) {
          try { await reader.cancel(); } catch { /* ignore */ }
          throw new Error("That folder is too large to import (over 1 GB on the wire).");
        }
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
  }

  // ZIP-bomb guard: walk entries' uncompressed sizes BEFORE inflating
  // any of them. Reject the whole import if any single entry, or the
  // sum across entries, exceeds our bounds.
  function assertZipWithinBounds(zip: any): void {
    let total = 0;
    for (const e of zip.getEntries()) {
      if (e.isDirectory) continue;
      const size = Number(e.header?.size) || 0;
      if (size > MAX_DROPBOX_ENTRY_BYTES) {
        throw new Error(`One file in that folder is too large (${Math.round(size / (1024 * 1024))} MB).`);
      }
      total += size;
      if (total > MAX_DROPBOX_UNCOMPRESSED_BYTES) {
        throw new Error("That folder's contents are too large to import once unzipped (over 2 GB).");
      }
    }
  }
  // Strip leading track-number prefixes ("01 - ", "01. ", "01_") and
  // the file extension. Falls back to the bare basename if the strip
  // leaves us with nothing.
  function deriveTitleFromFilename(name: string): string {
    const base = name.replace(/\.[^.]+$/, "");
    const stripped = base.replace(/^\s*\d{1,3}\s*[-_.\s]+\s*/, "").trim();
    return stripped || base.trim() || "Untitled";
  }
  function fuzzy(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  app.post("/api/admin/albums/:id/import-tracks-from-dropbox", requireAdminBearer, async (req, res) => {
    try {
      const albumId = String(req.params.id);
      const folderUrl = String(req.body?.folderUrl || "").trim();
      if (!folderUrl) return res.status(400).json({ message: "Paste a Dropbox folder link." });

      const album = await storage.getAlbumById(albumId, { includeHidden: true });
      if (!album) return res.status(404).json({ message: "Album not found." });

      // Derive trackNumber server-side. Don't trust a client-supplied
      // start — a stale dialog could otherwise create rows that collide
      // with the tail of the existing tracklist.
      const existingSongs = await storage.getSongsByAlbum(albumId);
      let trackNumber = existingSongs.length === 0
        ? 1
        : Math.max(...existingSongs.map(s => s.trackNumber ?? 0)) + 1;

      const zipBuf = await fetchDropboxFolderZip(folderUrl);
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(zipBuf);
      assertZipWithinBounds(zip);

      // Sort with numeric+base awareness so "Track 2" comes before
      // "Track 10" — matches Finder / Dropbox web ordering, which is
      // how Bill thinks about track sequence.
      const entries = zip.getEntries()
        .filter((e: any) => !e.isDirectory && (extOf(e.entryName) in AUDIO_MIME_BY_EXT))
        .sort((a: any, b: any) =>
          basenameOf(a.entryName).localeCompare(basenameOf(b.entryName), undefined, { numeric: true, sensitivity: "base" })
        );

      if (entries.length === 0) {
        return res.status(400).json({ message: "No audio files in that folder. Supported: .mp3, .wav, .flac, .m4a, .aac, .aif/.aiff, .ogg." });
      }

      const created: Array<{ id: string; trackNumber: number; title: string; filename: string; duration: number }> = [];
      const errors: Array<{ filename: string; error: string }> = [];
      // `trackNumber` already initialized above from existing max+1.

      for (const entry of entries) {
        const filename = basenameOf(entry.entryName);
        try {
          const ext = extOf(filename);
          const mime = AUDIO_MIME_BY_EXT[ext];
          const buf: Buffer = entry.getData();

          const audioUrl = await uploadBufferToObjectStorage(buf, mime);

          // Duration is best-effort — non-fatal. ElevenLabs auto-sync
          // doesn't need it, but the player UI and lyrics distributor do.
          let duration = 0;
          try {
            const mm = await import("music-metadata");
            const meta = await mm.parseBuffer(buf, mime);
            duration = Math.round(meta.format.duration || 0);
          } catch { /* leave at 0; admin can set it manually */ }

          const song = await storage.createSong({
            albumId,
            title: deriveTitleFromFilename(filename),
            trackNumber,
            duration,
            audioUrl,
            lyrics: "",
            instrumental: false,
            syncedLyrics: null as any,
            previewStartMs: null as any,
            previewEndMs: null as any,
            waveform: null as any,
          } as any);
          created.push({ id: song.id, trackNumber, title: song.title, filename, duration });
          trackNumber++;
        } catch (e: any) {
          errors.push({ filename, error: e?.message || "Failed to import" });
        }
      }
      return res.json({ created, errors });
    } catch (e: any) {
      return res.status(400).json({ message: e?.message || "Dropbox import failed." });
    }
  });

  app.post("/api/admin/albums/:id/import-lyrics-from-dropbox", requireAdminBearer, async (req, res) => {
    try {
      const albumId = String(req.params.id);
      const folderUrl = String(req.body?.folderUrl || "").trim();
      if (!folderUrl) return res.status(400).json({ message: "Paste a Dropbox folder link." });

      const songs = await storage.getSongsByAlbum(albumId);
      if (songs.length === 0) {
        return res.status(400).json({ message: "Add tracks before importing lyrics." });
      }

      const zipBuf = await fetchDropboxFolderZip(folderUrl);
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(zipBuf);
      assertZipWithinBounds(zip);

      const entries = zip.getEntries()
        .filter((e: any) => !e.isDirectory && LYRIC_EXTENSIONS.has(extOf(e.entryName)))
        .sort((a: any, b: any) =>
          basenameOf(a.entryName).localeCompare(basenameOf(b.entryName), undefined, { numeric: true, sensitivity: "base" })
        );

      if (entries.length === 0) {
        return res.status(400).json({ message: "No PDF, Word, or text files in that folder." });
      }

      const matched: Array<{ songId: string; title: string; filename: string; charCount: number }> = [];
      const unmatched: Array<{ filename: string; suggestedTitle: string; charCount: number; reason: string }> = [];
      const errors: Array<{ filename: string; error: string }> = [];

      // Precompute fuzzy keys for every song once.
      const songKeys = songs.map(s => ({ song: s, key: fuzzy(s.title) }));
      // Track which songs have already been claimed in this run so two
      // lyric files don't silently overwrite the same track's lyrics.
      const claimed = new Set<string>();

      for (const entry of entries) {
        const filename = basenameOf(entry.entryName);
        const ext = extOf(filename);
        try {
          const buf: Buffer = entry.getData();
          let text = "";
          if (ext === ".pdf") {
            // Import the inner module directly — the package's default
            // index.js tries to load a bundled test PDF when imported
            // without explicit data, which blows up in production builds.
            // @ts-ignore — no types for the inner module path; we import
            // it directly so the package's index.js doesn't try to load
            // its bundled test PDF at module-init time.
            const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (b: Buffer) => Promise<{ text: string }>;
            const parsed = await pdfParse(buf);
            text = parsed.text || "";
          } else if (ext === ".docx" || ext === ".doc") {
            const mammoth = await import("mammoth");
            const result = await mammoth.extractRawText({ buffer: buf });
            text = result.value || "";
          } else if (ext === ".txt") {
            text = buf.toString("utf8");
          }
          // Light cleanup: collapse 3+ blank lines, trim trailing whitespace
          // per line. Don't reformat aggressively — Bill's PDFs already
          // have intentional [Chorus]/blank-line structure.
          text = text
            .split("\n")
            .map(l => l.replace(/\s+$/, ""))
            .join("\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
          if (!text) {
            errors.push({ filename, error: "No text found in file." });
            continue;
          }

          const fkey = fuzzy(deriveTitleFromFilename(filename));
          // Tier 1: exact fuzzy match (always wins, no ambiguity check
          // because a perfect match is unambiguous by definition).
          let hit = songKeys.find(sk => sk.key === fkey);
          // Tier 2: substring either direction. Collect ALL candidates;
          // if more than one song could plausibly match, refuse rather
          // than guess — silently picking the first match is exactly
          // how the wrong song's lyrics get overwritten.
          if (!hit && fkey) {
            const candidates = songKeys.filter(sk => sk.key && (sk.key.includes(fkey) || fkey.includes(sk.key)));
            if (candidates.length === 1) {
              hit = candidates[0];
            } else if (candidates.length > 1) {
              unmatched.push({
                filename,
                suggestedTitle: deriveTitleFromFilename(filename),
                charCount: text.length,
                reason: `Ambiguous — could be ${candidates.map(c => `"${c.song.title}"`).join(" or ")}.`,
              });
              continue;
            }
          }
          if (!hit) {
            unmatched.push({ filename, suggestedTitle: deriveTitleFromFilename(filename), charCount: text.length, reason: "No matching track." });
            continue;
          }
          // Don't let a second file silently clobber lyrics we set
          // earlier in this same run. Bill can rename and re-run if
          // he actually wanted the later file.
          if (claimed.has(hit.song.id)) {
            unmatched.push({
              filename,
              suggestedTitle: deriveTitleFromFilename(filename),
              charCount: text.length,
              reason: `Another file already matched "${hit.song.title}".`,
            });
            continue;
          }
          claimed.add(hit.song.id);
          await storage.updateSong(hit.song.id, { lyrics: text });
          matched.push({ songId: hit.song.id, title: hit.song.title, filename, charCount: text.length });
        } catch (e: any) {
          errors.push({ filename, error: e?.message || "Failed to extract text" });
        }
      }
      return res.json({ matched, unmatched, errors });
    } catch (e: any) {
      return res.status(400).json({ message: e?.message || "Dropbox import failed." });
    }
  });

  app.post("/api/admin/songs/:id/auto-sync-lyrics", requireAdminBearer, async (req, res) => {
    const id = String(req.params.id);
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "ELEVENLABS_API_KEY not configured" });
    }
    const song = await storage.getSongById(id);
    if (!song) return res.status(404).json({ message: "Song not found" });
    if (!song.audioUrl) {
      return res.status(400).json({ message: "Song has no master audio uploaded — upload a master first." });
    }
    if (!song.lyrics || !song.lyrics.trim()) {
      return res.status(400).json({ message: "Song has no lyrics to align — add lyrics first." });
    }
    if (song.lyrics.length > FA_MAX_LYRIC_CHARS) {
      return res.status(413).json({ message: `Lyrics too long (${song.lyrics.length} chars; cap ${FA_MAX_LYRIC_CHARS}).` });
    }

    // Pull the master audio bytes. Two sources are supported:
    //   1) Object Storage paths (`/objects/uploads/<id>`) — uploaded
    //      via the admin master uploader. Preflight via metadata so
    //      an oversized file doesn't cost us an ElevenLabs call.
    //   2) External HTTPS URLs (Dropbox, S3, etc.) — Nick's catalog
    //      lives on Dropbox today; we stream those directly. No
    //      metadata preflight available; we rely on a streaming size
    //      cap to bail out if the body grows past FA_MAX_AUDIO_BYTES.
    let audioMime = "audio/wav";
    let audioBuf: Buffer;
    const isExternalUrl = /^https?:\/\//i.test(song.audioUrl);
    try {
      if (isExternalUrl) {
        const upstream = await fetch(song.audioUrl);
        if (!upstream.ok || !upstream.body) {
          return res.status(502).json({
            message: `Could not fetch master from external URL (HTTP ${upstream.status})`,
          });
        }
        const ct = upstream.headers.get("content-type");
        if (ct) audioMime = ct.split(";")[0].trim();
        // Honor Content-Length preflight when the server provides it.
        const cl = Number(upstream.headers.get("content-length") ?? 0);
        if (cl && cl > FA_MAX_AUDIO_BYTES) {
          return res.status(413).json({
            message: `Master is too large for auto-sync (${(cl / 1024 / 1024).toFixed(0)}MB; cap ${FA_MAX_AUDIO_BYTES / 1024 / 1024}MB). Try a FLAC.`,
          });
        }
        const ab = await upstream.arrayBuffer();
        if (ab.byteLength > FA_MAX_AUDIO_BYTES) {
          return res.status(413).json({
            message: `Master is too large for auto-sync (${(ab.byteLength / 1024 / 1024).toFixed(0)}MB; cap ${FA_MAX_AUDIO_BYTES / 1024 / 1024}MB). Try a FLAC.`,
          });
        }
        audioBuf = Buffer.from(ab);
      } else {
        const file = await objectStorage.getObjectEntityFile(song.audioUrl);
        const [meta] = await file.getMetadata();
        if (meta?.contentType) audioMime = String(meta.contentType);
        const size = Number(meta?.size ?? 0);
        if (size && size > FA_MAX_AUDIO_BYTES) {
          return res.status(413).json({
            message: `Master is too large for auto-sync (${(size / 1024 / 1024).toFixed(0)}MB; cap ${FA_MAX_AUDIO_BYTES / 1024 / 1024}MB). Try a FLAC.`,
          });
        }
        const [buf] = await file.download();
        audioBuf = buf;
      }
    } catch (err) {
      console.error("auto-sync: failed to fetch master audio", err);
      return res.status(502).json({ message: "Could not read master audio from storage" });
    }

    // Call ElevenLabs Speech-to-Text (Scribe v1). We deliberately do NOT
    // pass our `song.lyrics` as a hint — forced alignment kept failing
    // because the writers' shorthand (bare `CHORUS`, `Hook x2 OUT`, etc.)
    // doesn't match the actual sung word count. Transcribing what was
    // actually sung gives us bulletproof word-level cues, and Bill can
    // visually compare the transcription against his written lyrics.
    let stt: {
      text?: string;
      words?: Array<{ text: string; start?: number; end?: number; type?: string }>;
    };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FA_TIMEOUT_MS);
    try {
      const form = new FormData();
      const ext = (song.audioUrl.match(/\.(\w+)$/)?.[1] || "wav").toLowerCase();
      form.append("file", new Blob([audioBuf], { type: audioMime }), `song-${id}.${ext}`);
      form.append("model_id", "scribe_v1");
      form.append("timestamps_granularity", "word");
      form.append("language_code", "en");

      const upstream = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
        signal: ctl.signal,
      });
      if (!upstream.ok) {
        const errBody = await upstream.text().catch(() => "");
        console.error("ElevenLabs STT failed", upstream.status, errBody);
        return res.status(502).json({
          message: `Transcription failed (${upstream.status})`,
          detail: errBody.slice(0, 500),
        });
      }
      stt = (await upstream.json()) as typeof stt;
    } catch (err: any) {
      if (err?.name === "AbortError") {
        console.error("auto-sync: ElevenLabs STT timed out");
        return res.status(504).json({ message: "Transcription timed out" });
      }
      console.error("auto-sync: ElevenLabs STT threw", err);
      return res.status(502).json({ message: "Transcription service unreachable" });
    } finally {
      clearTimeout(timer);
    }

    // Keep only real word events (drop spacing/audio_event entries) and
    // require usable timestamps. Scribe occasionally returns words without
    // an end time on the very last token — synthesize one from start.
    const rawWords = Array.isArray(stt?.words) ? stt.words : [];
    const words = rawWords
      .filter(
        (w) =>
          w &&
          (w.type === undefined || w.type === "word") &&
          typeof w.text === "string" &&
          w.text.trim().length > 0 &&
          typeof w.start === "number",
      )
      .map((w) => ({
        text: w.text!.trim(),
        start: w.start as number,
        end: typeof w.end === "number" ? w.end : (w.start as number) + 0.2,
      }));
    if (words.length === 0) {
      return res.status(502).json({ message: "Transcription returned no words" });
    }

    // Group transcribed words into lines. Heuristic: a new line begins
    // when the silence between words exceeds LINE_GAP_S, OR when the
    // previous word ends with sentence-final punctuation in the source
    // text (Scribe returns commas/periods attached to the word text).
    // Cap line length so a quiet section without breath doesn't produce
    // a 30-word run-on.
    const LINE_GAP_S = 0.55;
    const MAX_WORDS_PER_LINE = 12;
    const out: { timeMs: number; endMs: number; text: string }[] = [];
    let curWords: string[] = [];
    let curStart = words[0].start;
    let curEnd = words[0].end;
    let prevEnd = -1;
    let prevEndedSentence = false;
    const sentenceEnd = /[.!?]\s*$/;
    for (const w of words) {
      const gap = prevEnd < 0 ? 0 : w.start - prevEnd;
      const shouldBreak =
        curWords.length > 0 &&
        (gap >= LINE_GAP_S || prevEndedSentence || curWords.length >= MAX_WORDS_PER_LINE);
      if (shouldBreak) {
        out.push({
          timeMs: Math.round(curStart * 1000),
          endMs: Math.round(curEnd * 1000),
          text: curWords.join(" "),
        });
        curWords = [];
        curStart = w.start;
      }
      curWords.push(w.text);
      curEnd = w.end;
      prevEnd = w.end;
      prevEndedSentence = sentenceEnd.test(w.text);
    }
    if (curWords.length) {
      out.push({
        timeMs: Math.round(curStart * 1000),
        endMs: Math.round(curEnd * 1000),
        text: curWords.join(" "),
      });
    }

    // ─── Final pass: refine cue text against the typed Plain lyrics ───
    // STT mishears the occasional word ("till the end" vs "to the
    // edge", "what we wanted" vs "but we wanted"). When the admin has
    // typed Plain lyrics, we run a conservative word-level diff and
    // swap only the words that clearly differ — preserving STT's
    // natural sentence-casing and punctuation, and skipping stylistic
    // variants (cuz/cause, yeah/ya, till/until, etc.).
    //
    // If Plain is empty, back-populate it from the STT cues (one cue
    // per line). That gives the artist a one-click first draft to
    // correct, instead of staring at a blank Lyrics box.
    const hasPlain = !!(song.lyrics && song.lyrics.trim());
    const refined = hasPlain
      ? refineCuesAgainstPlain(out, song.lyrics!)
      : out;
    const plainDraft = hasPlain
      ? undefined
      : out.map((c) => c.text).join("\n");

    const updated = await storage.updateSong(id, {
      syncedLyrics: refined,
      ...(plainDraft !== undefined ? { lyrics: plainDraft } : {}),
    });
    return res.json({
      song: updated,
      lineCount: out.length,
      wordCount: words.length,
      transcript: stt.text ?? "",
    });
  });

  // Mirror a song's external audio URL (Dropbox share link, etc.) into
  // our Object Storage bucket so playback isn't bottlenecked by Dropbox's
  // throttled CDN and so ElevenLabs forced alignment reads from a fast,
  // owned origin. Streams upstream → GCS without buffering, caps at
  // FA_MAX_AUDIO_BYTES, flips ACL to public, and updates the song row.
  // Idempotent-ish: if audioUrl already points at `/objects/`, returns
  // early with `{ alreadyMirrored: true }`.
  app.post(
    "/api/admin/songs/:id/mirror-audio-to-storage",
    requireAdminBearer,
    async (req, res) => {
      const id = String(req.params.id);
      const song = await storage.getSongById(id);
      if (!song) return res.status(404).json({ message: "Song not found" });
      const src = song.audioUrl;
      if (!src) return res.status(400).json({ message: "Song has no audioUrl" });
      if (src.startsWith("/objects/")) {
        return res.json({ alreadyMirrored: true, url: src });
      }
      if (!/^https?:\/\//i.test(src)) {
        return res.status(400).json({ message: "audioUrl is not an http(s) URL" });
      }
      try {
        // Dropbox share-link normalization: ?dl=0 → ?dl=1 to get raw bytes.
        const normalized = src.replace(/([?&])dl=0(\b)/, "$1dl=1$2");
        const upstream = await fetch(normalized, { redirect: "follow" });
        if (!upstream.ok || !upstream.body) {
          return res.status(502).json({
            message: `Upstream fetch failed: ${upstream.status}`,
          });
        }
        const upstreamMime = (upstream.headers.get("content-type") || "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        let ext: string | undefined = AUDIO_MIME_TO_EXT[upstreamMime];
        let storedMime = upstreamMime;
        if (!ext) {
          const parsed = new URL(normalized);
          const m = parsed.pathname.toLowerCase().match(/\.(mp3|m4a|aac|wav|flac|ogg)(?:$|[?#])/);
          if (m) {
            const map: Record<string, [string, string]> = {
              mp3: [".mp3", "audio/mpeg"],
              m4a: [".m4a", "audio/mp4"],
              aac: [".aac", "audio/aac"],
              wav: [".wav", "audio/wav"],
              flac: [".flac", "audio/flac"],
              ogg: [".ogg", "audio/ogg"],
            };
            [ext, storedMime] = map[m[1]];
          }
        }
        if (!ext) {
          return res.status(400).json({
            message: "Upstream did not return a recognized audio type",
          });
        }
        const newId = `${randomUUID()}${ext}`;
        const { bucketName, objectName } = uploadDestination(newId);
        const file = objectStorageClient.bucket(bucketName).file(objectName);
        let received = 0;
        const writeStream = file.createWriteStream({
          contentType: storedMime,
          metadata: { cacheControl: "public, max-age=31536000, immutable" },
          resumable: false,
        });
        const { Readable } = await import("stream");
        const nodeReadable = Readable.fromWeb(upstream.body as any);
        let aborted = false;
        await new Promise<void>((resolve, reject) => {
          nodeReadable.on("data", (chunk: Buffer) => {
            received += chunk.length;
            if (received > FA_MAX_AUDIO_BYTES && !aborted) {
              aborted = true;
              nodeReadable.destroy();
              writeStream.destroy(new Error("Audio exceeded size cap"));
            }
          });
          nodeReadable.on("error", reject);
          writeStream.on("error", reject);
          writeStream.on("finish", resolve);
          nodeReadable.pipe(writeStream);
        });
        await setObjectAclPolicy(file, { owner: "admin", visibility: "public" });
        const newUrl = `/objects/uploads/${newId}`;
        const updated = await storage.updateSong(id, { audioUrl: newUrl });
        return res.json({
          url: newUrl,
          bytes: received,
          contentType: storedMime,
          song: updated,
        });
      } catch (err: any) {
        console.error("Audio mirror failed for", id, err);
        return res.status(500).json({
          message: err?.message || "Could not mirror audio",
        });
      }
    },
  );

  // Bulk reorder the tracklist. Accepts the album's song IDs in their new
  // display order and rewrites each song's trackNumber to its index+1.
  // No unique constraint on (albumId, trackNumber) so we can update in any
  // order without intermediate-state conflicts. We don't enforce that the
  // submitted IDs match the album's full song set on the server — the
  // admin UI sends the complete list — but a wrong-album song will simply
  // get a stray trackNumber that the admin can fix on next open.
  app.post(
    "/api/admin/albums/:id/tracks/reorder",
    requireAdmin,
    async (req, res) => {
      const albumId = String(req.params.id);
      const { songIds } = req.body ?? {};
      if (!Array.isArray(songIds) || songIds.some((x) => typeof x !== "string")) {
        return res.status(400).json({ message: "songIds must be an array of strings" });
      }
      for (let i = 0; i < songIds.length; i++) {
        await storage.updateSong(songIds[i], { trackNumber: i + 1 });
      }
      return res.json({ albumId, count: songIds.length });
    },
  );

  // ----- Bonus album content: Videos + Photos ------------------------------
  // Reads mirror the album-detail visibility model: requireAuth + an admin
  // check unlocks hidden albums, fans get a 404 for hidden/nonexistent ids
  // so bonus media can't leak via direct ID guessing. Writes use the
  // bearer-only admin guard to match `/api/admin/upload` and dodge the
  // CSRF risk that `sameSite: "none"` session cookies otherwise carry.
  // Zod insert schemas validate bodies up front so unknown albumIds /
  // malformed payloads surface as deterministic 4xx.
  async function loadAlbumForBonusRead(req: Request, res: Response) {
    const includeHidden = await isAdminUser(req);
    const album = await storage.getAlbumById(String(req.params.id), { includeHidden });
    if (!album) {
      res.status(404).json({ message: "Album not found" });
      return null;
    }
    return album;
  }
  async function ensureAlbumExists(albumId: string, res: Response) {
    const album = await storage.getAlbumById(albumId, { includeHidden: true });
    if (!album) {
      res.status(404).json({ message: "Album not found" });
      return false;
    }
    return true;
  }
  // Update schemas: every field optional + posterUrl/caption nullable so
  // "remove poster" can post explicit null without tripping the required
  // checks on the insert schema.
  const updateAlbumVideoSchema = insertAlbumVideoSchema.partial().extend({
    posterUrl: insertAlbumVideoSchema.shape.posterUrl.nullable().optional(),
  });
  const updateAlbumPhotoSchema = insertAlbumPhotoSchema.partial().extend({
    caption: insertAlbumPhotoSchema.shape.caption.nullable().optional(),
  });

  // Public read — bonus videos/photos are listener-facing content, surfaced
  // on the fan AlbumDetail page below the tracklist. Anonymous fans hit this,
  // so no auth gate. `loadAlbumForBonusRead` separately checks isAdminUser
  // to decide whether to include hidden albums, so admins still see drafts.
  app.get("/api/albums/:id/videos", async (req, res) => {
    const album = await loadAlbumForBonusRead(req, res);
    if (!album) return;
    const rows = await storage.listAlbumVideos(album.id);
    return res.json(rows);
  });
  app.get("/api/albums/:id/photos", async (req, res) => {
    const album = await loadAlbumForBonusRead(req, res);
    if (!album) return;
    const rows = await storage.listAlbumPhotos(album.id);
    return res.json(rows);
  });

  app.post("/api/admin/albums/:id/videos", requireAdminBearer, async (req, res) => {
    const albumId = String(req.params.id);
    if (!(await ensureAlbumExists(albumId, res))) return;
    const existing = await storage.listAlbumVideos(albumId);
    const parsed = insertAlbumVideoSchema.safeParse({
      albumId,
      title: req.body?.title ?? "Untitled video",
      description: req.body?.description ?? null,
      videoUrl: req.body?.videoUrl,
      posterUrl: req.body?.posterUrl ?? null,
      position: typeof req.body?.position === "number" ? req.body.position : existing.length,
    });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const v = await storage.createAlbumVideo(parsed.data);
    return res.status(201).json(v);
  });
  app.put("/api/admin/album-videos/:id", requireAdminBearer, async (req, res) => {
    const parsed = updateAlbumVideoSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    // `albumId` is immutable from this endpoint — strip it if a client sends it.
    const { albumId: _i, ...patch } = parsed.data as any;
    const v = await storage.updateAlbumVideo(String(req.params.id), patch);
    if (!v) return res.status(404).json({ message: "Video not found" });
    return res.json(v);
  });
  app.delete("/api/admin/album-videos/:id", requireAdminBearer, async (req, res) => {
    await storage.deleteAlbumVideo(String(req.params.id));
    return res.json({ message: "Deleted" });
  });
  app.post("/api/admin/albums/:id/photos", requireAdminBearer, async (req, res) => {
    const albumId = String(req.params.id);
    if (!(await ensureAlbumExists(albumId, res))) return;
    const existing = await storage.listAlbumPhotos(albumId);
    const parsed = insertAlbumPhotoSchema.safeParse({
      albumId,
      photoUrl: req.body?.photoUrl,
      caption: req.body?.caption ?? null,
      position: typeof req.body?.position === "number" ? req.body.position : existing.length,
    });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const p = await storage.createAlbumPhoto(parsed.data);
    return res.status(201).json(p);
  });
  app.put("/api/admin/album-photos/:id", requireAdminBearer, async (req, res) => {
    const parsed = updateAlbumPhotoSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const { albumId: _i, ...patch } = parsed.data as any;
    const p = await storage.updateAlbumPhoto(String(req.params.id), patch);
    if (!p) return res.status(404).json({ message: "Photo not found" });
    return res.json(p);
  });
  app.delete("/api/admin/album-photos/:id", requireAdminBearer, async (req, res) => {
    await storage.deleteAlbumPhoto(String(req.params.id));
    return res.json({ message: "Deleted" });
  });

  // ----- SuperCredits™ catalog: People -------------------------------------
  // Read is public (the in-app credits surface fetches these); writes are admin.
  app.get("/api/people", async (_req, res) => {
    const rows = await storage.getPeople();
    return res.json(rows);
  });
  app.get("/api/people/:id", async (req, res) => {
    const p = await storage.getPersonById(String(req.params.id));
    if (!p) return res.status(404).json({ message: "Person not found" });
    return res.json(p);
  });
  app.post("/api/admin/people", requireAdmin, async (req, res) => {
    const b = req.body ?? {};
    if (!b.name) return res.status(400).json({ message: "name is required" });
    const opt = (v: any) => (v ? String(v) : null);
    const p = await storage.createPerson({
      name: String(b.name),
      photoUrl: opt(b.photoUrl),
      coverUrl: opt(b.coverUrl),
      bio: opt(b.bio),
      appleMusicUrl: opt(b.appleMusicUrl),
      spotifyUrl: opt(b.spotifyUrl),
      itunesArtistId: opt(b.itunesArtistId),
      instagramUrl: opt(b.instagramUrl),
      tiktokUrl: opt(b.tiktokUrl),
      twitterUrl: opt(b.twitterUrl),
      blueskyUrl: opt(b.blueskyUrl),
      facebookUrl: opt(b.facebookUrl),
      websiteUrl: opt(b.websiteUrl),
      labelId: opt(b.labelId),
    } as any);
    return res.status(201).json(p);
  });
  app.put("/api/admin/people/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const b = req.body ?? {};
    const updates: any = {};
    const opt = (v: any) => (v ? String(v) : null);
    if (b.name !== undefined) updates.name = String(b.name);
    if (b.photoUrl !== undefined) updates.photoUrl = opt(b.photoUrl);
    if (b.coverUrl !== undefined) updates.coverUrl = opt(b.coverUrl);
    if (b.bio !== undefined) updates.bio = opt(b.bio);
    if (b.appleMusicUrl !== undefined) updates.appleMusicUrl = opt(b.appleMusicUrl);
    if (b.spotifyUrl !== undefined) updates.spotifyUrl = opt(b.spotifyUrl);
    if (b.itunesArtistId !== undefined) updates.itunesArtistId = opt(b.itunesArtistId);
    if (b.instagramUrl !== undefined) updates.instagramUrl = opt(b.instagramUrl);
    if (b.tiktokUrl !== undefined) updates.tiktokUrl = opt(b.tiktokUrl);
    if (b.twitterUrl !== undefined) updates.twitterUrl = opt(b.twitterUrl);
    if (b.blueskyUrl !== undefined) updates.blueskyUrl = opt(b.blueskyUrl);
    if (b.facebookUrl !== undefined) updates.facebookUrl = opt(b.facebookUrl);
    if (b.websiteUrl !== undefined) updates.websiteUrl = opt(b.websiteUrl);
    if (b.labelId !== undefined) updates.labelId = opt(b.labelId);
    const p = await storage.updatePerson(id, updates);
    if (!p) return res.status(404).json({ message: "Person not found" });
    return res.json(p);
  });
  // Apple Music discography (cached iTunes Lookup result). Public reads
  // power the fan-side artist page's "Streaming" section; admin writes
  // happen automatically after a Pull in PersonEditor.
  app.get("/api/people/:id/discography", async (req, res) => {
    const rows = await storage.getDiscographyByPerson(String(req.params.id));
    return res.json(rows);
  });
  // Fan-side ArtistDetail is keyed by display-name slug today (not by
  // person.id), so this convenience endpoint does the name → person
  // resolution server-side and returns the same payload shape.
  app.get("/api/discography/by-artist-name", async (req, res) => {
    const name = String(req.query.name ?? "").trim();
    if (!name) return res.json([]);
    const rows = await storage.getDiscographyByArtistName(name);
    return res.json(rows);
  });
  app.put("/api/admin/people/:id/discography", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const body = req.body ?? {};
    const items = Array.isArray(body.items) ? body.items : [];
    // Normalize the loose ScrapedArtistAlbum shape from the admin client
    // into the strict insert shape. Anything missing collectionId/name/type
    // is dropped — we'd rather skip a malformed row than crash the whole pull.
    const norm = items
      .filter((r: any) => r && r.collectionId && r.name && r.type)
      .map((r: any, idx: number) => ({
        collectionId: String(r.collectionId),
        name: String(r.name),
        artworkUrl: r.artworkUrl ? String(r.artworkUrl) : null,
        year: typeof r.year === "number" ? r.year : null,
        type: String(r.type),
        trackCount: typeof r.trackCount === "number" ? r.trackCount : null,
        appleMusicUrl: r.appleMusicUrl ? String(r.appleMusicUrl) : null,
        spotifyUrl: r.spotifyUrl ? String(r.spotifyUrl) : null,
        position: typeof r.position === "number" ? r.position : idx,
      }));
    const rows = await storage.replaceDiscographyForPerson(id, norm);
    return res.json(rows);
  });

  app.delete("/api/admin/people/:id", requireAdmin, async (req, res) => {
    await storage.deletePerson(String(req.params.id));
    return res.json({ message: "Deleted" });
  });

  // --- Artist URL scraper (Apple Music / Spotify → prefilled person + discography) ---
  // Mirror of the instrument scraper. Two sources:
  //   1. The artist page itself: OG meta for image + bio snippet (and canonical
  //      name from <title> / og:title). Works on both services.
  //   2. iTunes Lookup API (free, no auth) — Apple Music URLs end in a numeric
  //      artist id, which we feed to lookup?id=...&entity=album to get the
  //      artist's complete discography with artwork + year + track count. We
  //      surface that as a "Discography" panel so the admin can one-click
  //      add real albums (with real artwork) to the GoodTunes catalog.
  // Per replit.md: we host the song in-app for ~2 weeks then send fans back
  // to Apple/Spotify via these same URLs ("referring them to give them
  // business"). One paste fills both jobs.
  app.post("/api/admin/people/scrape", requireAdminBearer, async (req, res) => {
    const url = String(req.body?.url ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ message: "A full https:// artist URL is required" });
    }
    let parsed: URL;
    try { parsed = new URL(url); } catch { return res.status(400).json({ message: "Malformed URL" }); }
    const host = parsed.hostname.replace(/^www\./, "");

    // Detect service. Apple Music artist URLs look like
    //   /<country>/artist/<slug>/<numeric-id>(?i=...)?
    // Spotify artist URLs look like /artist/<base62>
    let source: "apple" | "spotify" | "unknown" = "unknown";
    let itunesArtistId: string | null = null;
    if (/(^|\.)music\.apple\.com$/.test(host)) {
      source = "apple";
      const m = parsed.pathname.match(/\/artist\/(?:[^/]+\/)?(\d+)/i);
      if (m) itunesArtistId = m[1];
    } else if (/(^|\.)open\.spotify\.com$/.test(host) || /(^|\.)spotify\.com$/.test(host)) {
      source = "spotify";
    }

    try {
      // ----- 1) Scrape the artist page for OG image + bio snippet -----
      let metaName: string | null = null;
      let bio: string | null = null;
      let rawImage: string | null = null;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10_000);
        const html = await safeFetch(url, {
          signal: ctrl.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; GoodTunesBot/1.0; +https://goodtunes.app)",
            "Accept": "text/html,application/xhtml+xml",
          },
        }).then((r) => {
          if (!r.ok) throw new Error(`Page returned ${r.status}`);
          return r.text();
        }).finally(() => clearTimeout(t));

        const meta: Record<string, string> = {};
        const re1 = /<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
        const re2 = /<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']([^"']+)["'][^>]*>/gi;
        let m: RegExpExecArray | null;
        while ((m = re1.exec(html))) {
          const key = m[1].toLowerCase();
          if (!(key in meta)) meta[key] = decodeEntities(m[2]);
        }
        while ((m = re2.exec(html))) {
          const key = m[2].toLowerCase();
          if (!(key in meta)) meta[key] = decodeEntities(m[1]);
        }

        // Apple titles its og:title as "Artist Name on Apple Music" — strip
        // the trailing service tag. Spotify is "Artist Name | Spotify".
        let ogTitle = meta["og:title"] || meta["twitter:title"] || null;
        if (ogTitle) {
          ogTitle = ogTitle
            .replace(/\s+on Apple Music\s*$/i, "")
            .replace(/\s*[|·]\s*Spotify\s*$/i, "")
            .trim();
        }
        metaName = ogTitle;
        bio = meta["og:description"] || meta["twitter:description"] || meta["description"] || null;
        // Spotify's OG description for every artist page is boilerplate —
        // "Artist · 40.8K monthly listeners." — not the actual About text
        // (which they lazy-load via internal GraphQL and is unavailable in
        // the initial HTML). Reject the pattern so we don't pollute the
        // admin's BIO field with a listener count. Apple Music's
        // og:description is usually the real artist blurb, so we keep it.
        if (bio && /^artist\s*[·•|-]\s*[\d.,]+\s*[kmb]?\s*monthly listeners\.?$/i.test(bio.trim())) {
          bio = null;
        }
        rawImage = meta["og:image:secure_url"] || meta["og:image"] || meta["twitter:image"] || null;
        if (rawImage?.startsWith("//")) rawImage = `https:${rawImage}`;
        if (rawImage?.startsWith("/")) rawImage = `${parsed.origin}${rawImage}`;
        // Apple Music's og:image is the wide 1200×630 share card — a small
        // circular portrait centered on a white background. Dropped into a
        // circular avatar (PersonPreviewCard, PerformerSheet) it shows up
        // as a tiny photo ringed by a huge white border. Apple's image CDN
        // (mzstatic.com) re-encodes the same source at any size + crop
        // suffix encoded in the final path segment: e.g.
        //   .../1200x630cw.jpg  (crop-wide, white padded)
        //   .../600x600bb.png   (bounding box, no padding)
        //   .../400x400cc.jpg   (center crop)
        //   .../800x800sr.jpg   (stretch)
        //   .../1200x1200fc.jpg (face crop)
        // Normalize *any* recognized size+suffix variant to a square
        // 1200×1200bb so we always get a tight, padding-free portrait.
        // We match on `WxHxx.ext` (2 letters before the extension) instead
        // of a hard-coded suffix so future Apple suffixes still get
        // normalized. The query string is preserved.
        if (
          source === "apple" &&
          rawImage &&
          /mzstatic\.com\//.test(rawImage)
        ) {
          rawImage = rawImage.replace(
            /\/\d+x\d+[a-z]{2}\.(jpg|jpeg|png|webp)(\?.*)?$/i,
            "/1200x1200bb.$1$2",
          );
        }
      } catch {
        /* OG scrape is best-effort — Apple sometimes 403s the bot. We still
           have iTunes Lookup below to fill name + first album art. */
      }

      // ----- 2) Apple-only: pull the canonical artist + full discography -----
      let canonicalName: string | null = null;
      let albums: Array<{
        collectionId: number;
        name: string;
        artworkUrl: string;
        year: number | null;
        trackCount: number | null;
        type: "album" | "EP";
        releaseDate: string | null;
      }> = [];
      if (source === "apple" && itunesArtistId) {
        try {
          const lookup = await safeFetch(
            `https://itunes.apple.com/lookup?id=${itunesArtistId}&entity=album&limit=200&country=us`,
            { headers: { "Accept": "application/json" } },
          ).then((r) => r.json() as Promise<{ results: any[] }>);
          const results = Array.isArray(lookup?.results) ? lookup.results : [];
          const artistRow = results.find((r) => r.wrapperType === "artist");
          canonicalName = artistRow?.artistName || null;
          albums = results
            .filter((r) => r.wrapperType === "collection")
            .map((r) => {
              // iTunes returns 100×100 thumbs by default — swap to 600×600
              // which is what Apple Music UI actually uses.
              const art100: string = r.artworkUrl100 || r.artworkUrl60 || "";
              const artworkUrl = art100.replace(/\/(\d+)x(\d+)bb\.(jpg|png)$/i, "/600x600bb.$3");
              const releaseDate: string | null = r.releaseDate || null;
              const year = releaseDate ? Number(releaseDate.slice(0, 4)) || null : null;
              const trackCount = Number(r.trackCount) || null;
              return {
                collectionId: Number(r.collectionId),
                name: String(r.collectionName || ""),
                artworkUrl,
                year,
                trackCount,
                type: (trackCount && trackCount <= 6 ? "EP" : "album") as "album" | "EP",
                releaseDate,
                // Canonical Apple Music album URL — the "Listen on Apple
                // Music" handoff target. Spotify equivalent has to be set
                // manually for now (no free cross-service mapping).
                appleMusicUrl: (r.collectionViewUrl as string) || null,
              };
            })
            // newest first — matches the canvas order of an Apple Music artist page
            .sort((a, b) => (b.releaseDate || "").localeCompare(a.releaseDate || ""));
        } catch {
          /* discography is a bonus — don't fail the whole scrape if iTunes
             is down or rate-limits us */
        }
      }

      // ----- 3) Rehost photo so we don't depend on Apple's CDN long-term -----
      let photoUrl: string | null = null;
      if (rawImage) {
        try { photoUrl = await rehostRemoteImage(rawImage); }
        catch { photoUrl = rawImage; }
      }

      const name = canonicalName || metaName || null;
      res.json({
        source,
        name,
        photoUrl,
        bio,
        itunesArtistId,
        appleMusicUrl: source === "apple" ? url : null,
        spotifyUrl: source === "spotify" ? url : null,
        albums,
      });
    } catch (e: any) {
      const msg = e?.name === "AbortError" ? "Streaming page took too long to respond." : (e?.message || "Unable to read that page");
      res.status(502).json({ message: msg });
    }
  });

  // ----- SuperCredits™ catalog: Instruments + vendors ----------------------
  app.get("/api/instruments", async (req, res) => {
    // Admins (CMS) see every vendor — hidden ones still need to be editable.
    // Fans see the public set only.
    const includeHiddenVendors = await isAdminUser(req);
    return res.json(await storage.getInstruments({ includeHiddenVendors }));
  });
  app.get("/api/instruments/:id", async (req, res) => {
    const includeHiddenVendors = await isAdminUser(req);
    const i = await storage.getInstrumentById(String(req.params.id), { includeHiddenVendors });
    if (!i) return res.status(404).json({ message: "Instrument not found" });
    return res.json(i);
  });
  app.post("/api/admin/instruments", requireAdmin, async (req, res) => {
    const { name, category, shortCategory, photoUrl, about, artistNote } = req.body ?? {};
    if (!name || !category) return res.status(400).json({ message: "name and category are required" });
    const i = await storage.createInstrument({
      name: String(name),
      category: String(category),
      shortCategory: shortCategory ? String(shortCategory) : null,
      photoUrl: photoUrl ? String(photoUrl) : null,
      about: about ? String(about) : null,
      artistNote: artistNote ? String(artistNote) : null,
    } as any);
    return res.status(201).json(i);
  });
  app.put("/api/admin/instruments/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const { name, category, shortCategory, photoUrl, about, artistNote } = req.body ?? {};
    const updates: any = {};
    if (name !== undefined) updates.name = String(name);
    if (category !== undefined) updates.category = String(category);
    if (shortCategory !== undefined) updates.shortCategory = shortCategory ? String(shortCategory) : null;
    if (photoUrl !== undefined) updates.photoUrl = photoUrl ? String(photoUrl) : null;
    if (about !== undefined) updates.about = about ? String(about) : null;
    if (artistNote !== undefined) updates.artistNote = artistNote ? String(artistNote) : null;
    const i = await storage.updateInstrument(id, updates);
    if (!i) return res.status(404).json({ message: "Instrument not found" });
    return res.json(i);
  });
  app.delete("/api/admin/instruments/:id", requireAdmin, async (req, res) => {
    await storage.deleteInstrument(String(req.params.id));
    return res.json({ message: "Deleted" });
  });

  // ----- Vendor entity CRUD ----------------------------------------------
  // A `vendor` is one real-world shop (Carter, Reverb, Sweetwater, …).
  // ----- Label ENTITY routes ----------------------------------------------
  // Public reads + admin CRUD. Each album.labelId points at one of these.
  app.get("/api/labels", async (_req, res) => {
    return res.json(await storage.getLabels());
  });
  app.get("/api/labels/:id", async (req, res) => {
    const l = await storage.getLabelById(String(req.params.id));
    if (!l) return res.status(404).json({ message: "Label not found" });
    return res.json(l);
  });
  app.post("/api/admin/labels", requireAdmin, async (req, res) => {
    const { name, logoUrl, bio, location, websiteUrl, instagramUrl, coverUrl } = req.body ?? {};
    if (!name) return res.status(400).json({ message: "name is required" });
    const l = await storage.createLabel({
      name: String(name),
      logoUrl: logoUrl ? String(logoUrl) : null,
      bio: bio ? String(bio) : null,
      location: location ? String(location) : null,
      websiteUrl: websiteUrl ? String(websiteUrl) : null,
      instagramUrl: instagramUrl ? String(instagramUrl) : null,
      coverUrl: coverUrl ? String(coverUrl) : null,
    });
    return res.status(201).json(l);
  });
  app.put("/api/admin/labels/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const { name, logoUrl, bio, location, websiteUrl, instagramUrl, coverUrl } = req.body ?? {};
    const updates: any = {};
    if (name !== undefined) updates.name = String(name);
    if (logoUrl !== undefined) updates.logoUrl = logoUrl ? String(logoUrl) : null;
    if (bio !== undefined) updates.bio = bio ? String(bio) : null;
    if (location !== undefined) updates.location = location ? String(location) : null;
    if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl ? String(websiteUrl) : null;
    if (instagramUrl !== undefined) updates.instagramUrl = instagramUrl ? String(instagramUrl) : null;
    if (coverUrl !== undefined) updates.coverUrl = coverUrl ? String(coverUrl) : null;
    const l = await storage.updateLabel(id, updates);
    if (!l) return res.status(404).json({ message: "Label not found" });
    return res.json(l);
  });
  app.delete("/api/admin/labels/:id", requireAdmin, async (req, res) => {
    // SET NULL on albums.label_id — releases stay, label credit clears.
    await storage.deleteLabel(String(req.params.id));
    return res.json({ message: "Deleted" });
  });

  // Label page scraper. Paste the label's own website URL and we pull
  // og:title (name), og:description (bio), and the best square logo we
  // can find — preferring apple-touch-icon (usually a clean 180×180+
  // logo) over og:image (typically a wide hero/banner). Instagram URLs
  // are rejected up front: Meta serves a login shell to non-authenticated
  // server fetches, so we tell the admin to paste the website instead.
  app.post("/api/admin/labels/scrape", requireAdminBearer, async (req, res) => {
    const url = String(req.body?.url ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ message: "A full https:// label URL is required" });
    }
    let parsed: URL;
    try { parsed = new URL(url); } catch { return res.status(400).json({ message: "Malformed URL" }); }
    const host = parsed.hostname.replace(/^www\./, "");
    if (/(^|\.)instagram\.com$/.test(host) || /(^|\.)facebook\.com$/.test(host)) {
      return res.status(400).json({
        message: "Instagram/Facebook pages can't be scraped — paste the label's website instead, then put the social URL into the Instagram field manually.",
      });
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const html = await safeFetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GoodTunesBot/1.0; +https://goodtunes.app)",
          "Accept": "text/html,application/xhtml+xml",
        },
      }).then((r) => {
        if (!r.ok) throw new Error(`Page returned ${r.status}`);
        return r.text();
      }).finally(() => clearTimeout(t));

      const meta: Record<string, string> = {};
      const re1 = /<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
      const re2 = /<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']([^"']+)["'][^>]*>/gi;
      let m: RegExpExecArray | null;
      while ((m = re1.exec(html))) {
        const key = m[1].toLowerCase();
        if (!(key in meta)) meta[key] = decodeEntities(m[2]);
      }
      while ((m = re2.exec(html))) {
        const key = m[2].toLowerCase();
        if (!(key in meta)) meta[key] = decodeEntities(m[1]);
      }

      // Prefer apple-touch-icon — almost always a clean square logo. Fall
      // back to og:image (often a wide hero, but still useful), then
      // <link rel="icon"> (favicon — last resort, usually tiny).
      let logoUrl: string | null = null;
      const touchA = /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(html);
      const touchB = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*>/i.exec(html);
      if (touchA) logoUrl = touchA[1];
      else if (touchB) logoUrl = touchB[1];
      if (!logoUrl) {
        logoUrl = meta["og:image:secure_url"] || meta["og:image"] || meta["twitter:image"] || null;
      }
      if (!logoUrl) {
        const iconA = /<link[^>]+rel=["'][^"']*(?:shortcut )?icon[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(html);
        const iconB = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*(?:shortcut )?icon[^"']*["'][^>]*>/i.exec(html);
        if (iconA) logoUrl = iconA[1];
        else if (iconB) logoUrl = iconB[1];
      }
      if (logoUrl?.startsWith("//")) logoUrl = `https:${logoUrl}`;
      if (logoUrl?.startsWith("/")) logoUrl = `${parsed.origin}${logoUrl}`;

      // og:title is usually "Label Name | Official Site" or "Label Name —
      // Records" — strip common trailing service tags so the admin sees a
      // clean name they don't have to re-edit.
      let name = meta["og:title"] || meta["twitter:title"] || null;
      if (name) {
        name = name
          .replace(/\s*[|·–—-]\s*(?:home|official\s+site|official|records|music|label|the\s+official\s+site).*$/i, "")
          .trim();
      }
      const bio =
        meta["og:description"] ||
        meta["twitter:description"] ||
        meta["description"] ||
        null;

      return res.json({
        name,
        logoUrl,
        bio,
        websiteUrl: meta["og:url"] || url,
      });
    } catch (e: any) {
      return res.status(502).json({ message: e?.message || "Failed to read page" });
    }
  });

  // Editing here propagates to every instrument attached to this vendor.
  // The join row (attachment) is a separate resource — see /instrument-vendors below.
  app.get("/api/vendors", async (_req, res) => {
    return res.json(await storage.getVendors());
  });
  app.get("/api/vendors/:id", async (req, res) => {
    const v = await storage.getVendorById(String(req.params.id));
    if (!v) return res.status(404).json({ message: "Vendor not found" });
    return res.json(v);
  });
  // Vendor profile bundle — powers the fan-facing VendorSheet tabs in one
  // round trip. `artists` is derived from SuperCredits (track_performers
  // playing any of the vendor's instruments). `instruments` lists every
  // non-hidden instrument attached to the vendor.
  // Person profile bundle — powers the fan-facing PerformerSheet tabs
  // (About / Music / Gear) in one round trip. Tracks are sorted by album
  // year then album title then track number on the storage side.
  app.get("/api/people/:id/profile", async (req, res) => {
    const id = String(req.params.id);
    const person = await storage.getPersonById(id);
    if (!person) return res.status(404).json({ message: "Person not found" });
    const tracks = await storage.getPersonTracks(id);
    return res.json({ person, tracks });
  });
  // Admin-only: tracks the gear flow can attach this person to + any
  // existing performer rows for them on each track. See storage's
  // getPersonGearContext for the inclusion rules.
  app.get("/api/admin/people/:id/gear-context", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const person = await storage.getPersonById(id);
    if (!person) return res.status(404).json({ message: "Person not found" });
    return res.json(await storage.getPersonGearContext(id));
  });
  app.get("/api/instruments/:id/profile", async (req, res) => {
    const id = String(req.params.id);
    const instrument = await storage.getInstrumentById(id);
    if (!instrument) return res.status(404).json({ message: "Instrument not found" });
    const [artists, tracks] = await Promise.all([
      storage.getInstrumentSuperCreditArtists(id),
      storage.getInstrumentTracks(id),
    ]);
    return res.json({ instrument, artists, tracks });
  });
  app.get("/api/vendors/:id/profile", async (req, res) => {
    const id = String(req.params.id);
    const vendor = await storage.getVendorById(id);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const [insts, artists] = await Promise.all([
      storage.getVendorInstruments(id),
      storage.getVendorSuperCreditArtists(id),
    ]);
    return res.json({ vendor, instruments: insts, artists });
  });
  app.post("/api/admin/vendors", requireAdmin, async (req, res) => {
    const { name, domain, homeUrl, aboutUrl, logoUrl, tagline, bio, location, coverUrl } = req.body ?? {};
    if (!name || !domain) return res.status(400).json({ message: "name and domain are required" });
    const normDomain = String(domain).toLowerCase().replace(/^www\./, "");
    const existing = await storage.getVendorByDomain(normDomain);
    if (existing) return res.status(409).json({ message: "A vendor with that domain already exists", vendor: existing });
    const v = await storage.createVendor({
      name: String(name),
      domain: normDomain,
      homeUrl: homeUrl ? String(homeUrl) : null,
      aboutUrl: aboutUrl ? String(aboutUrl) : null,
      logoUrl: logoUrl ? String(logoUrl) : null,
      tagline: tagline ? String(tagline) : null,
      bio: bio ? String(bio) : null,
      location: location ? String(location) : null,
      coverUrl: coverUrl ? String(coverUrl) : null,
    });
    return res.status(201).json(v);
  });
  app.put("/api/admin/vendors/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const { name, domain, homeUrl, aboutUrl, logoUrl, tagline, bio, location, coverUrl } = req.body ?? {};
    const updates: any = {};
    if (name !== undefined) updates.name = String(name);
    if (domain !== undefined) updates.domain = String(domain).toLowerCase().replace(/^www\./, "");
    if (homeUrl !== undefined) updates.homeUrl = homeUrl ? String(homeUrl) : null;
    if (aboutUrl !== undefined) updates.aboutUrl = aboutUrl ? String(aboutUrl) : null;
    if (logoUrl !== undefined) updates.logoUrl = logoUrl ? String(logoUrl) : null;
    if (tagline !== undefined) updates.tagline = tagline ? String(tagline) : null;
    if (bio !== undefined) updates.bio = bio ? String(bio) : null;
    if (location !== undefined) updates.location = location ? String(location) : null;
    if (coverUrl !== undefined) updates.coverUrl = coverUrl ? String(coverUrl) : null;
    try {
      const v = await storage.updateVendor(id, updates);
      if (!v) return res.status(404).json({ message: "Vendor not found" });
      return res.json(v);
    } catch (err: any) {
      // Map the postgres unique-violation on `vendors.domain` to a real 409
      // so the admin client can surface "another vendor already uses this
      // domain" instead of a generic 500.
      if (err?.code === "23505") {
        return res.status(409).json({ message: "Another vendor is already using that domain" });
      }
      throw err;
    }
  });
  app.delete("/api/admin/vendors/:id", requireAdmin, async (req, res) => {
    // Cascades to every instrument_vendors row pointing at this vendor.
    await storage.deleteVendor(String(req.params.id));
    return res.json({ message: "Deleted" });
  });

  // ----- Vendor↔Instrument attachment CRUD -------------------------------
  // Attach a vendor to an instrument. Two body shapes are accepted:
  //   1) { vendorId, affiliateUrl, position?, isHidden? }
  //      → attach an existing vendor entity.
  //   2) { domain, name, affiliateUrl, homeUrl?, aboutUrl?, logoUrl?, ... }
  //      → find-or-create vendor by domain, then attach. Used by the admin
  //        scrape flow ("paste a product URL → backend scrapes → attach").
  //        If a vendor with that domain already exists, its metadata is
  //        preserved (existing entity wins); we just create the attachment.
  app.post("/api/admin/instruments/:id/vendors", requireAdmin, async (req, res) => {
    const instrumentId = String(req.params.id);
    const parent = await storage.getInstrumentById(instrumentId);
    if (!parent) return res.status(404).json({ message: "Instrument not found" });
    const body = req.body ?? {};
    const affiliateUrl = body.affiliateUrl ? String(body.affiliateUrl) : "";
    if (!affiliateUrl) return res.status(400).json({ message: "affiliateUrl is required" });

    let vendorId: string | null = body.vendorId ? String(body.vendorId) : null;

    if (vendorId) {
      // Validate the supplied vendor exists up front so we return a clean
      // 400 instead of letting the FK constraint blow up as a generic 500.
      const existingVendor = await storage.getVendorById(vendorId);
      if (!existingVendor) {
        return res.status(400).json({ message: "vendorId does not match any vendor" });
      }
    } else {
      // Find-or-create branch — derive domain from explicit body or the URL.
      const rawDomain = body.domain
        ? String(body.domain)
        : (() => {
            try { return new URL(affiliateUrl).hostname; } catch { return ""; }
          })();
      const normDomain = rawDomain.toLowerCase().replace(/^www\./, "");
      if (!normDomain) return res.status(400).json({ message: "domain or a parseable affiliateUrl is required" });
      const existing = await storage.getVendorByDomain(normDomain);
      if (existing) {
        vendorId = existing.id;
      } else {
        if (!body.name) return res.status(400).json({ message: "name is required when creating a new vendor" });
        const created = await storage.createVendor({
          name: String(body.name),
          domain: normDomain,
          homeUrl: body.homeUrl ? String(body.homeUrl) : `https://${normDomain}/`,
          aboutUrl: body.aboutUrl ? String(body.aboutUrl) : null,
          logoUrl: body.logoUrl ? String(body.logoUrl) : null,
          tagline: body.tagline ? String(body.tagline) : null,
          bio: body.bio ? String(body.bio) : null,
          location: body.location ? String(body.location) : null,
          coverUrl: body.coverUrl ? String(body.coverUrl) : null,
        });
        vendorId = created.id;
      }
    }

    const attachment = await storage.attachVendorToInstrument({
      instrumentId,
      vendorId,
      affiliateUrl,
      position: body.position != null ? Number(body.position) : parent.vendors.length,
      isHidden: !!body.isHidden,
    });
    // Return the enriched (vendor-joined) shape so the admin client doesn't
    // briefly render a partial row between create response and refetch.
    const refreshed = await storage.getInstrumentById(instrumentId, { includeHiddenVendors: true });
    const enriched = refreshed?.vendors.find((v) => v.id === attachment.id);
    return res.status(201).json(enriched ?? attachment);
  });

  // Edit attachment-only fields (per-instrument product URL, position, demo
  // visibility). Vendor-level metadata edits go to /api/admin/vendors/:id.
  app.put("/api/admin/instrument-vendors/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const { affiliateUrl, position, isHidden } = req.body ?? {};
    const updates: { affiliateUrl?: string; position?: number; isHidden?: boolean } = {};
    if (affiliateUrl !== undefined) updates.affiliateUrl = String(affiliateUrl);
    if (position !== undefined) updates.position = Number(position);
    if (isHidden !== undefined) updates.isHidden = !!isHidden;
    const v = await storage.updateInstrumentVendorAttachment(id, updates);
    if (!v) return res.status(404).json({ message: "Attachment not found" });
    return res.json(v);
  });
  // Detach a vendor from an instrument. The vendor entity is preserved
  // (it may still be attached to other instruments). To delete the vendor
  // entity itself, use DELETE /api/admin/vendors/:id.
  app.delete("/api/admin/instrument-vendors/:id", requireAdmin, async (req, res) => {
    await storage.detachInstrumentVendor(String(req.params.id));
    return res.json({ message: "Detached" });
  });

  // ----- SuperCredits™ song credits (writers + performers) -----------------
  // Public read so the fan-facing credits sheet can fetch by song id.
  app.get("/api/songs/:id/credits", async (req, res) => {
    // Resolve the song → its parent album so we can honor the album's
    // hidden flag here too. Without this check, fans could pull credits
    // for a song whose album we've already removed from the catalog.
    const songId = String(req.params.id);
    const song = await storage.getSongById(songId);
    if (!song) return res.status(404).json({ message: "Song not found" });
    const includeHidden = await isAdminUser(req);
    const album = await storage.getAlbumById(song.albumId, { includeHidden });
    if (!album) return res.status(404).json({ message: "Song not found" });
    return res.json(await storage.getSongCredits(songId));
  });
  // Album-wide credits in one round-trip. Used by the fan-side AlbumDetail
  // page so CreditsSheet + PerformerSheet ("Also on this album" rail) both
  // render from a single fetch.
  app.get("/api/albums/:id/credits", async (req, res) => {
    const albumId = String(req.params.id);
    const includeHidden = await isAdminUser(req);
    const album = await storage.getAlbumById(albumId, { includeHidden });
    if (!album) return res.status(404).json({ message: "Album not found" });
    return res.json(await storage.getAlbumCredits(albumId));
  });
  // Writers (nested under song for create; flat for update/delete by id).
  // POST body validated via insertTrackWriterSchema (songId injected from
  // path, position auto-appended to end if not supplied). PUT uses a
  // .partial() of the same schema. FK violations (e.g. unknown personId)
  // surface as 400s rather than 500s.
  const writerCreateBody = insertTrackWriterSchema.omit({ songId: true, position: true }).extend({
    position: z.number().int().nonnegative().optional(),
  });
  const writerUpdateBody = insertTrackWriterSchema.omit({ songId: true }).partial();
  const performerCreateBody = insertTrackPerformerSchema.omit({ songId: true, position: true }).extend({
    position: z.number().int().nonnegative().optional(),
  });
  const performerUpdateBody = insertTrackPerformerSchema.omit({ songId: true }).partial();

  function isFkViolation(e: unknown): boolean {
    return !!(e && typeof e === "object" && (e as any).code === "23503");
  }

  app.post("/api/admin/songs/:id/writers", requireAdmin, async (req, res) => {
    const parsed = writerCreateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid writer", issues: parsed.error.issues });
    const songId = String(req.params.id);
    const existing = await storage.getSongCredits(songId);
    try {
      const w = await storage.createTrackWriter({
        ...parsed.data,
        songId,
        position: parsed.data.position ?? existing.writers.length,
      } as any);
      return res.status(201).json(w);
    } catch (e) {
      if (isFkViolation(e)) return res.status(400).json({ message: "Unknown song or person reference" });
      throw e;
    }
  });
  app.put("/api/admin/writers/:id", requireAdmin, async (req, res) => {
    const parsed = writerUpdateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid writer", issues: parsed.error.issues });
    try {
      const w = await storage.updateTrackWriter(String(req.params.id), parsed.data as any);
      if (!w) return res.status(404).json({ message: "Writer not found" });
      return res.json(w);
    } catch (e) {
      if (isFkViolation(e)) return res.status(400).json({ message: "Unknown person reference" });
      throw e;
    }
  });
  app.delete("/api/admin/writers/:id", requireAdmin, async (req, res) => {
    await storage.deleteTrackWriter(String(req.params.id));
    return res.json({ message: "Deleted" });
  });

  app.post("/api/admin/songs/:id/performers", requireAdmin, async (req, res) => {
    const parsed = performerCreateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid performer", issues: parsed.error.issues });
    const songId = String(req.params.id);
    const existing = await storage.getSongCredits(songId);
    try {
      const p = await storage.createTrackPerformer({
        ...parsed.data,
        songId,
        position: parsed.data.position ?? existing.performers.length,
      } as any);
      return res.status(201).json(p);
    } catch (e) {
      if (isFkViolation(e)) return res.status(400).json({ message: "Unknown song, person, or instrument reference" });
      throw e;
    }
  });
  app.put("/api/admin/performers/:id", requireAdmin, async (req, res) => {
    const parsed = performerUpdateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid performer", issues: parsed.error.issues });
    try {
      const p = await storage.updateTrackPerformer(String(req.params.id), parsed.data as any);
      if (!p) return res.status(404).json({ message: "Performer not found" });
      return res.json(p);
    } catch (e) {
      if (isFkViolation(e)) return res.status(400).json({ message: "Unknown person or instrument reference" });
      throw e;
    }
  });
  app.delete("/api/admin/performers/:id", requireAdmin, async (req, res) => {
    await storage.deleteTrackPerformer(String(req.params.id));
    return res.json({ message: "Deleted" });
  });

  app.get("/api/admin/credit-roles", requireAdmin, async (_req, res) => {
    const rows = await storage.listCreditRoles();
    return res.json(rows);
  });
  app.post("/api/admin/credit-roles", requireAdmin, async (req, res) => {
    const parsed = insertCreditRoleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid role", issues: parsed.error.issues });
    const row = await storage.findOrCreateCreditRole(parsed.data);
    return res.status(201).json(row);
  });

  // ----- Profile photo ----------------------------------------------------
  // Stored inline as a data URL (5MB hard cap). Swap for object-storage URL
  // once GT's AWS bucket lands.
  app.put("/api/me/photo", photoJson, requireAuth, async (req, res) => {
    const { dataUrl } = req.body as { dataUrl?: string };
    if (!dataUrl || typeof dataUrl !== "string") {
      return res.status(400).json({ message: "dataUrl is required" });
    }
    // Allowlist real raster formats only — no SVG (script execution), no
    // arbitrary application/* payloads dressed as images.
    const allowed = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/;
    const m = dataUrl.match(allowed);
    if (!m) {
      return res.status(400).json({ message: "Only PNG, JPEG, WEBP, or GIF data URLs are accepted" });
    }
    if (dataUrl.length > 7_500_000) {
      return res.status(413).json({ message: "Image too large (max ~5MB)" });
    }
    // Sanity-check base64 decodes and magic bytes match the declared mime.
    let buf: Buffer;
    try {
      buf = Buffer.from(m[2], "base64");
    } catch {
      return res.status(400).json({ message: "Image data is not valid base64" });
    }
    if (buf.length < 8) return res.status(400).json({ message: "Image data is empty" });
    const looksLikePng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const looksLikeJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const looksLikeWebp = buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP";
    const looksLikeGif = buf.slice(0, 6).toString("ascii").startsWith("GIF8");
    if (!(looksLikePng || looksLikeJpeg || looksLikeWebp || looksLikeGif)) {
      return res.status(400).json({ message: "Image data does not match a supported format" });
    }
    await storage.setProfilePhoto(req.session.userId!, dataUrl);
    return res.json({ photoUrl: dataUrl });
  });

  app.delete("/api/me/photo", requireAuth, async (req, res) => {
    await storage.deleteProfilePhoto(req.session.userId!);
    return res.json({ photoUrl: null });
  });

  app.get("/api/albums", requireAuth, async (req, res) => {
    // Admins see hidden albums so the CMS list stays complete; fans don't.
    const includeHidden = await isAdminUser(req);
    const albums = await storage.getAlbums({ includeHidden });
    return res.json(albums);
  });

  app.get("/api/albums/:id", requireAuth, async (req, res) => {
    const includeHidden = await isAdminUser(req);
    const album = await storage.getAlbumById(String(req.params.id), { includeHidden });
    if (!album) return res.status(404).json({ message: "Album not found" });
    const songs = await storage.getSongsByAlbum(album.id);
    return res.json({ ...album, songs });
  });

  // Catalog-wide song list. PlayerContext fetches this once and builds an
  // id→DB-song map used to hydrate any song handed to playSong/playNext/
  // playLast/addToQueue. That way entry points still built off the static
  // `SONGS` seed (artist page, Songs tab in Collection) automatically pick
  // up real DB fields — syncedLyrics for GoodSync, audioUrl for streaming,
  // and the canonical lyrics text. Public read; songs are catalog content.
  app.get("/api/songs", requireAuth, async (req, res) => {
    const includeHidden = await isAdminUser(req);
    const all = await storage.getAllSongs({ includeHidden });
    return res.json(all);
  });

  app.get("/api/my-albums", requireAuth, async (req, res) => {
    const userAlbums = await storage.getUserAlbums(req.session.userId!);
    return res.json(userAlbums);
  });

  app.get("/api/playlists", requireAuth, async (req, res) => {
    const playlists = await storage.getPlaylists(req.session.userId!);
    return res.json(playlists);
  });

  app.post("/api/playlists", requireAuth, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });
    const playlist = await storage.createPlaylist(req.session.userId!, name);
    return res.status(201).json(playlist);
  });

  app.put("/api/playlists/:id", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const playlist = await storage.getPlaylistById(id);
    if (!playlist) return res.status(404).json({ message: "Playlist not found" });
    if (playlist.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
    const updated = await storage.updatePlaylist(id, req.body.name);
    return res.json(updated);
  });

  app.delete("/api/playlists/:id", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const playlist = await storage.getPlaylistById(id);
    if (!playlist) return res.status(404).json({ message: "Not found" });
    if (playlist.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
    await storage.deletePlaylist(id);
    return res.json({ message: "Deleted" });
  });

  app.get("/api/playlists/:id/songs", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const playlist = await storage.getPlaylistById(id);
    if (!playlist) return res.status(404).json({ message: "Not found" });
    if (playlist.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
    const songs = await storage.getPlaylistSongs(id);
    return res.json(songs);
  });

  app.post("/api/playlists/:id/songs", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const playlist = await storage.getPlaylistById(id);
    if (!playlist) return res.status(404).json({ message: "Not found" });
    if (playlist.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
    const { songId, position } = req.body;
    if (!songId) return res.status(400).json({ message: "songId required" });
    const ps = await storage.addSongToPlaylist(id, String(songId), position ?? 0);
    return res.status(201).json(ps);
  });

  app.delete("/api/playlists/:id/songs/:songId", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const songId = String(req.params.songId);
    const playlist = await storage.getPlaylistById(id);
    if (!playlist) return res.status(404).json({ message: "Not found" });
    if (playlist.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
    await storage.removeSongFromPlaylist(id, songId);
    return res.json({ message: "Removed" });
  });

  // ----- Play analytics ---------------------------------------------------
  // Backed by `analytics_events` table now (was in-memory ring buffer). Same
  // shape on the wire.
  app.post("/api/events", async (req, res) => {
    const userId = await getUserIdFromRequest(req);
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    const now = Date.now();
    const rows = events
      .filter((e: any) => e && typeof e.name === "string")
      .map((e: any) => ({
        clientId: e.id ? String(e.id) : undefined,
        name: String(e.name),
        payload: e.payload && typeof e.payload === "object" ? e.payload : {},
        ts: new Date(typeof e.ts === "number" ? e.ts : now),
        sessionId: e.sessionId ? String(e.sessionId) : undefined,
        userId,
      }));
    if (rows.length) {
      try {
        await storage.insertAnalyticsEvents(rows);
      } catch (err) {
        console.error("[analytics] insert failed", err);
      }
    }
    return res.status(204).end();
  });

  app.delete("/api/events", requireAuth, async (req, res) => {
    await storage.deleteAnalyticsForUser(req.session.userId!);
    return res.json({ message: "Listening history deleted" });
  });

  app.get("/api/events/recent", requireAuth, async (req, res) => {
    const rows = await storage.getRecentAnalyticsForUser(req.session.userId!, 100);
    return res.json(rows);
  });

  // Public OpenGraph share page for a GoodDeed certificate.
  // No auth required — link is meant to be unfurled by social platforms.
  app.get("/share/cert", (req, res) => {
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const album = esc(String(req.query.album ?? "GoodDeed Certificate"));
    const artist = esc(String(req.query.artist ?? ""));
    const owner = esc(String(req.query.owner ?? ""));
    const numRaw = String(req.query.num ?? "1");
    const numClean = /^\d+$/.test(numRaw) ? numRaw : "1";
    const num = esc(numClean.padStart(2, "0"));
    const artParam = String(req.query.art ?? "");
    const albumIdRaw = String(req.query.albumId ?? "");
    const albumId = /^[a-zA-Z0-9_-]+$/.test(albumIdRaw) ? albumIdRaw : "";

    const origin = `${req.protocol}://${req.get("host")}`;
    const ogImage = artParam.startsWith("http")
      ? artParam
      : artParam
        ? `${origin}${artParam.startsWith("/") ? "" : "/"}${artParam}`
        : `${origin}/goodtunes-logo-color.png`;

    const title = `${owner || "I"} own${owner ? "s" : ""} No. ${num} of "${album}" — GoodDeed®`;
    const description = `${album}${artist ? ` by ${artist}` : ""}. Verified ownership by GoodTunes® GoodDeed®.`;
    const url = `${origin}${req.originalUrl}`;
    const ctaHref = albumId ? `/album/${esc(albumId)}` : "/login";

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${esc(ogImage)}" />
  <meta property="og:url" content="${esc(url)}" />
  <meta property="og:site_name" content="GoodTunes" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${esc(ogImage)}" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin:0; background:#00062B; color:#fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; min-height:100dvh; }
    .wrap { min-height:100dvh; display:flex; flex-direction:column; align-items:center; padding:20px 16px calc(168px + env(safe-area-inset-bottom, 0px)); padding-top: calc(20px + env(safe-area-inset-top, 0px)); }
    .eyebrow { font-size:13px; color:rgba(255,255,255,0.6); text-align:center; margin:0 0 14px; letter-spacing:0.01em; }
    .card { width:100%; max-width:360px; border-radius:24px; overflow:hidden; box-shadow:0 30px 80px rgba(0,0,0,.7); background:#0D2060; }
    .art { width:100%; aspect-ratio: 1 / 1; object-fit:cover; display:block; }
    .panel { padding:24px; background:linear-gradient(135deg,#1B3A8C 0%,#4A1E8F 60%,#2A1670 100%); text-align:center; }
    .album { font-size:20px; font-weight:700; }
    .artist { font-size:14px; opacity:.7; margin-top:4px; }
    .cert { margin-top:18px; font-size:13px; opacity:.8; }
    .owner { font-size:22px; font-weight:700; margin:6px 0 4px; }
    .num { font-size:28px; font-weight:700; margin-top:18px; }
    .cta-bar { position:fixed; left:0; right:0; bottom:0; padding: 28px 16px calc(16px + env(safe-area-inset-bottom, 0px)); background:linear-gradient(to top, rgba(0,6,43,1) 55%, rgba(0,6,43,0)); z-index:50; }
    .cta-inner { max-width:360px; margin:0 auto; }
    .cta-title { text-align:center; color:#fff; font-size:15px; font-weight:600; margin:0 0 4px; }
    .cta-sub { text-align:center; color:rgba(255,255,255,0.6); font-size:12px; margin:0 0 14px; }
    .cta-btn { display:flex; align-items:center; justify-content:center; gap:6px; width:100%; height:50px; border-radius:9999px; color:#fff; font-size:15px; font-weight:600; text-decoration:none; background:linear-gradient(90deg, #319ED8 0%, #7F10A7 100%); box-shadow:0 8px 24px rgba(127,16,167,0.35); transition:transform .12s ease, opacity .12s ease; -webkit-tap-highlight-color:transparent; }
    .cta-btn:active { opacity:.85; transform:scale(0.98); }
    .cta-btn .arrow { font-size:18px; line-height:1; transform:translateY(-1px); }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="eyebrow">${owner ? `${owner} shared a GoodDeed® with you` : "A GoodDeed® was shared with you"}</p>
    <div class="card">
      <img class="art" src="${esc(ogImage)}" alt="${album}" />
      <div class="panel">
        <div class="album">${album}</div>
        ${artist ? `<div class="artist">${artist}</div>` : ""}
        <div class="cert">This GoodDeed® certifies that</div>
        <div class="owner">${owner || "—"}</div>
        <div class="cert">owns number ${num} of this series.</div>
        <div class="num">No. ${num}</div>
      </div>
    </div>
  </div>
  <div class="cta-bar">
    <div class="cta-inner">
      <p class="cta-title">Want one of your own?</p>
      <p class="cta-sub">Own a numbered, verified GoodDeed® for music you love.</p>
      <a class="cta-btn" href="${ctaHref}">Get your GoodDeed® <span class="arrow">→</span></a>
    </div>
  </div>
</body>
</html>`);
  });

  // ============================ ASCAP staging lookup ============================
  // Filtered slice of the ASCAP catalog (writers + publishers for roster titles).
  // Used by the admin Writers row to auto-fill writer-on-record + publisher chain.
  app.get("/api/admin/ascap/status", requireAdmin, async (_req, res) => {
    res.json(ascapStatus());
  });

  app.get("/api/admin/ascap/lookup", requireAdmin, async (req, res) => {
    const title = String(req.query.title || "").trim();
    if (!title) return res.status(400).json({ message: "title required" });
    if (title.length > 200) return res.status(400).json({ message: "title too long" });
    const rosterOnly = String(req.query.rosterOnly || "") === "1";
    const hit = lookupTitle(title, { rosterOnly });
    if (!hit) return res.status(404).json({ message: "no ASCAP match for title", title });
    res.json(hit);
  });

  app.get("/api/admin/ascap/search-writer", requireAdmin, async (req, res) => {
    const name = String(req.query.name || "").trim();
    if (!name) return res.status(400).json({ message: "name required" });
    if (name.length > 200) return res.status(400).json({ message: "name too long" });
    res.json(searchWriter(name));
  });

  return httpServer;
}
