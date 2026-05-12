import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectAlbumOg } from "./og";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.get("/album/:id", (req, res, next) => {
    try {
      const indexPath = path.resolve(distPath, "index.html");
      const template = fs.readFileSync(indexPath, "utf-8");
      const injected = injectAlbumOg(template, req, req.params.id);
      if (!injected) return next();
      res.status(200).set({ "Content-Type": "text/html" }).end(injected);
    } catch (e) {
      next(e);
    }
  });

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
