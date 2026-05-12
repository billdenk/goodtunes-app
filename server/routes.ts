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
    const { username, displayName, password } = req.body;
    if (!username || !displayName || !password) {
      return res.status(400).json({ message: "Username, display name, and password are required" });
    }
    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return res.status(400).json({ message: "Username already taken" });
    }
    const hashed = await hashPassword(password);
    const user = await storage.createUser({ username, displayName, password: hashed });
    req.session.userId = user.id;
    const token = generateToken();
    tokenStore.set(token, user.id);
    return res.status(201).json({ id: user.id, username: user.username, displayName: user.displayName, token });
  });

  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    const user = await storage.getUserByUsername(username);
    if (!user || !(await comparePasswords(password, user.password))) {
      return res.status(401).json({ message: "Invalid username or password" });
    }
    req.session.userId = user.id;
    const token = generateToken();
    tokenStore.set(token, user.id);
    return res.json({ id: user.id, username: user.username, displayName: user.displayName, token });
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
    return res.json({ id: user.id, username: user.username, displayName: user.displayName });
  });

  app.put("/api/me", requireAuth, async (req, res) => {
    const { displayName, username } = req.body;
    const updates: any = {};
    if (displayName) updates.displayName = displayName;
    if (username) {
      const existing = await storage.getUserByUsername(username);
      if (existing && existing.id !== req.session.userId) {
        return res.status(400).json({ message: "Username already taken" });
      }
      updates.username = username;
    }
    const updated = await storage.updateUser(req.session.userId!, updates);
    if (!updated) return res.status(404).json({ message: "User not found" });
    return res.json({ id: updated.id, username: updated.username, displayName: updated.displayName });
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

    const origin = `${req.protocol}://${req.get("host")}`;
    const ogImage = artParam.startsWith("http")
      ? artParam
      : artParam
        ? `${origin}${artParam.startsWith("/") ? "" : "/"}${artParam}`
        : `${origin}/goodtunes-logo-color.png`;

    const title = `${owner || "I"} own${owner ? "s" : ""} No. ${num} of "${album}" — GoodDeed®`;
    const description = `${album}${artist ? ` by ${artist}` : ""}. Verified ownership by GoodTunes® GoodDeed®.`;
    const url = `${origin}${req.originalUrl}`;

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
    body { margin:0; background:#00062B; color:#fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
    .card { width:100%; max-width:360px; border-radius:24px; overflow:hidden; box-shadow:0 30px 80px rgba(0,0,0,.7); background:#0D2060; }
    .art { width:100%; aspect-ratio: 1 / 1; object-fit:cover; display:block; }
    .panel { padding:24px; background:linear-gradient(135deg,#1B3A8C 0%,#4A1E8F 60%,#2A1670 100%); text-align:center; }
    .album { font-size:20px; font-weight:700; }
    .artist { font-size:14px; opacity:.7; margin-top:4px; }
    .cert { margin-top:18px; font-size:13px; opacity:.8; }
    .owner { font-size:22px; font-weight:700; margin:6px 0 4px; }
    .num { font-size:28px; font-weight:700; margin-top:18px; }
  </style>
</head>
<body>
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
</body>
</html>`);
  });

  return httpServer;
}
