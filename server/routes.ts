import type { Express, Request, Response } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { pool } from "./db";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { z } from "zod";
import { insertTrackWriterSchema, insertTrackPerformerSchema } from "@shared/schema";

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

  // Image upload for album artwork / vendor logos / person photos. Saves to
  // an `uploads/` directory served statically from `/uploads/...`.
  // Caveat for production: on Replit's Autoscale deployments the local FS
  // is ephemeral, so an upload survives within a single instance but not
  // across redeploys. Move to Object Storage (or S3-compatible) when the
  // catalog goes beyond the demo phase.
  const multer = (await import("multer")).default;
  const path = (await import("path")).default;
  const fs = (await import("fs")).default;
  const uploadsDir = path.resolve("uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
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
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (_req, file, cb) => {
        const ext = MIME_TO_EXT[file.mimetype] || ".bin";
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        cb(null, `${id}${ext}`);
      },
    }),
    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB cap — matches the photo route
    fileFilter: (_req, file, cb) => {
      if (!(file.mimetype in MIME_TO_EXT)) {
        return cb(new Error("Only PNG, JPEG, GIF, WebP, or AVIF images are allowed"));
      }
      cb(null, true);
    },
  });
  app.post("/api/admin/upload", requireAdminBearer, upload.single("file"), (req, res) => {
    const f = (req as any).file as Express.Multer.File | undefined;
    if (!f) return res.status(400).json({ message: "No file uploaded" });
    return res.json({ url: `/uploads/${f.filename}` });
  });

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
  async function safeFetch(url: string, init?: RequestInit, maxHops = 5): Promise<Response> {
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
    if (node["@graph"]) return findProduct(node["@graph"], depth + 1);
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
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const filename = `${id}${ext}`;
    fs.writeFileSync(path.join(uploadsDir, filename), buf);
    return `/uploads/${filename}`;
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

      let rawImage: string | null =
        (Array.isArray(product?.image) ? product.image[0] : product?.image) ||
        meta["og:image:secure_url"] || meta["og:image"] || meta["twitter:image"] || null;
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
    const { id, title, artist, artwork, year, type, description } = req.body ?? {};
    if (!title || !artist || !artwork) {
      return res.status(400).json({ message: "title, artist, artwork are required" });
    }
    const album = await storage.createAlbum({
      id: id || undefined,
      title: String(title),
      artist: String(artist),
      artwork: String(artwork),
      year: year != null ? Number(year) : null,
      type: type === "EP" ? "EP" : "album",
      description: description ? String(description) : null,
    } as any);
    return res.status(201).json(album);
  });

  app.put("/api/admin/albums/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const { title, artist, artwork, year, type, description } = req.body ?? {};
    const updates: any = {};
    if (title !== undefined) updates.title = String(title);
    if (artist !== undefined) updates.artist = String(artist);
    if (artwork !== undefined) updates.artwork = String(artwork);
    if (year !== undefined) updates.year = year === null || year === "" ? null : Number(year);
    if (type !== undefined) updates.type = type === "EP" ? "EP" : "album";
    if (description !== undefined) updates.description = description ? String(description) : null;
    if (req.body?.isHidden !== undefined) updates.isHidden = !!req.body.isHidden;
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
    const { title, trackNumber, duration, lyrics, audioUrl } = req.body ?? {};
    const updates: any = {};
    if (title !== undefined) updates.title = String(title);
    if (trackNumber !== undefined) updates.trackNumber = Number(trackNumber);
    if (duration !== undefined) updates.duration = Number(duration);
    if (lyrics !== undefined) updates.lyrics = lyrics ? String(lyrics) : null;
    if (audioUrl !== undefined) updates.audioUrl = audioUrl ? String(audioUrl) : null;
    const updated = await storage.updateSong(id, updates);
    if (!updated) return res.status(404).json({ message: "Song not found" });
    return res.json(updated);
  });

  app.delete("/api/admin/songs/:id", requireAdmin, async (req, res) => {
    await storage.deleteSong(String(req.params.id));
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
    const { name, photoUrl, bio, accent } = req.body ?? {};
    if (!name) return res.status(400).json({ message: "name is required" });
    const p = await storage.createPerson({
      name: String(name),
      photoUrl: photoUrl ? String(photoUrl) : null,
      bio: bio ? String(bio) : null,
      accent: accent ? String(accent) : null,
    } as any);
    return res.status(201).json(p);
  });
  app.put("/api/admin/people/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const { name, photoUrl, bio, accent } = req.body ?? {};
    const updates: any = {};
    if (name !== undefined) updates.name = String(name);
    if (photoUrl !== undefined) updates.photoUrl = photoUrl ? String(photoUrl) : null;
    if (bio !== undefined) updates.bio = bio ? String(bio) : null;
    if (accent !== undefined) updates.accent = accent ? String(accent) : null;
    const p = await storage.updatePerson(id, updates);
    if (!p) return res.status(404).json({ message: "Person not found" });
    return res.json(p);
  });
  app.delete("/api/admin/people/:id", requireAdmin, async (req, res) => {
    await storage.deletePerson(String(req.params.id));
    return res.json({ message: "Deleted" });
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

  // Vendors are nested under an instrument. Create-via-parent makes it easy
  // for the CMS to assign instrumentId without leaking that field to the
  // client. Updates/deletes use the vendor id directly.
  app.post("/api/admin/instruments/:id/vendors", requireAdmin, async (req, res) => {
    const instrumentId = String(req.params.id);
    const parent = await storage.getInstrumentById(instrumentId);
    if (!parent) return res.status(404).json({ message: "Instrument not found" });
    const { name, affiliateUrl, aboutUrl, logoUrl, tagline, bio, location, coverUrl, position } = req.body ?? {};
    if (!name || !affiliateUrl) return res.status(400).json({ message: "name and affiliateUrl are required" });
    const v = await storage.createInstrumentVendor({
      instrumentId,
      name: String(name),
      affiliateUrl: String(affiliateUrl),
      aboutUrl: aboutUrl ? String(aboutUrl) : null,
      logoUrl: logoUrl ? String(logoUrl) : null,
      tagline: tagline ? String(tagline) : null,
      bio: bio ? String(bio) : null,
      location: location ? String(location) : null,
      coverUrl: coverUrl ? String(coverUrl) : null,
      position: position != null ? Number(position) : parent.vendors.length,
    } as any);
    return res.status(201).json(v);
  });
  app.put("/api/admin/vendors/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const { name, affiliateUrl, aboutUrl, logoUrl, tagline, bio, location, coverUrl, position } = req.body ?? {};
    const updates: any = {};
    if (name !== undefined) updates.name = String(name);
    if (affiliateUrl !== undefined) updates.affiliateUrl = String(affiliateUrl);
    if (aboutUrl !== undefined) updates.aboutUrl = aboutUrl ? String(aboutUrl) : null;
    if (logoUrl !== undefined) updates.logoUrl = logoUrl ? String(logoUrl) : null;
    if (tagline !== undefined) updates.tagline = tagline ? String(tagline) : null;
    if (bio !== undefined) updates.bio = bio ? String(bio) : null;
    if (location !== undefined) updates.location = location ? String(location) : null;
    if (coverUrl !== undefined) updates.coverUrl = coverUrl ? String(coverUrl) : null;
    if (position !== undefined) updates.position = Number(position);
    if (req.body?.isHidden !== undefined) updates.isHidden = !!req.body.isHidden;
    const v = await storage.updateInstrumentVendor(id, updates);
    if (!v) return res.status(404).json({ message: "Vendor not found" });
    return res.json(v);
  });
  app.delete("/api/admin/vendors/:id", requireAdmin, async (req, res) => {
    await storage.deleteInstrumentVendor(String(req.params.id));
    return res.json({ message: "Deleted" });
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

  return httpServer;
}
