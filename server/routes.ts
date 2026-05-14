import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

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

// Bearer-token store (token -> userId). Survives across requests in-memory.
const tokenStore = new Map<string, string>();

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function getUserIdFromRequest(req: Request): string | undefined {
  if (req.session.userId) return req.session.userId;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    return tokenStore.get(token);
  }
  return undefined;
}

function requireAuth(req: Request, res: Response, next: Function) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  // Make downstream handlers see it as a session userId for compat
  req.session.userId = userId;
  next();
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "goodtunes-secret-key-2024",
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
    // Normalize username: strip leading "@", lowercase, sanitize. Persist the normalized form
    // so signup, lookup, and login always agree on case/shape.
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
    tokenStore.set(token, user.id);
    return res.status(201).json({ id: user.id, username: user.username, email: user.email, displayName: user.displayName, realName: user.realName, token });
  });

  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username or email and password are required" });
    }
    const raw = String(username).trim();
    // Strip a leading "@" so "@bill" works as a username.
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
    tokenStore.set(token, user.id);
    return res.json({ id: user.id, username: user.username, email: user.email, displayName: user.displayName, realName: user.realName, token });
  });

  app.post("/api/logout", (req, res) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ")) {
      tokenStore.delete(auth.slice(7));
    }
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/me", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ id: user.id, username: user.username, email: user.email, displayName: user.displayName, realName: user.realName });
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
    return res.json({ id: updated.id, username: updated.username, email: updated.email, displayName: updated.displayName, realName: updated.realName });
  });

  app.get("/api/albums", requireAuth, async (_req, res) => {
    const albums = await storage.getAlbums();
    return res.json(albums);
  });

  app.get("/api/albums/:id", requireAuth, async (req, res) => {
    const album = await storage.getAlbumById(String(req.params.id));
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
  // Stub endpoint for the player-side analytics module. The GT coders will
  // replace the in-memory ring buffer with real persistence (Postgres / S3 +
  // Athena / Snowflake — see replit.md "Play analytics"). Shape is stable:
  // POST /api/events  body: { events: AnalyticsEvent[] }
  // DELETE /api/events  → wipes this user's events ("Delete my listening history")
  // GET /api/events/recent  → last 100 for inspection during integration
  type StoredEvent = {
    id: string;
    name: string;
    payload: Record<string, any>;
    ts: number;
    sessionId: string;
    userId?: string;
    receivedAt: number;
  };
  const eventBuffer: StoredEvent[] = [];
  const EVENT_BUFFER_MAX = 1000;

  app.post("/api/events", (req, res) => {
    const userId = getUserIdFromRequest(req);
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    const now = Date.now();
    for (const e of events) {
      if (!e || typeof e.name !== "string") continue;
      eventBuffer.push({
        id: String(e.id ?? ""),
        name: String(e.name),
        payload: e.payload && typeof e.payload === "object" ? e.payload : {},
        ts: typeof e.ts === "number" ? e.ts : now,
        sessionId: String(e.sessionId ?? ""),
        userId,
        receivedAt: now,
      });
    }
    if (eventBuffer.length > EVENT_BUFFER_MAX) {
      eventBuffer.splice(0, eventBuffer.length - EVENT_BUFFER_MAX);
    }
    return res.status(204).end();
  });

  app.delete("/api/events", requireAuth, (req, res) => {
    const userId = req.session.userId!;
    for (let i = eventBuffer.length - 1; i >= 0; i--) {
      if (eventBuffer[i].userId === userId) eventBuffer.splice(i, 1);
    }
    return res.json({ message: "Listening history deleted" });
  });

  app.get("/api/events/recent", requireAuth, (req, res) => {
    const userId = req.session.userId!;
    const mine = eventBuffer.filter((e) => e.userId === userId).slice(-100);
    return res.json(mine);
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
