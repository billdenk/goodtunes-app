// Task #3161 — TIFF (and flattened PSD) in the press live-test art upload.
//
//   • CMYK TIFF → 200, Color passes (TIFF is the standard CMYK print raster)
//     and its embedded 300 PPI density is trusted for the resolution row.
//   • RGB TIFF → 200, Color fails (we never convert color).
//   • CMYK PSD → flattened server-side with ImageMagick, inspected as TIFF,
//     Color passes and a browser-renderable sRGB preview comes back.
//   • Broken PSD → 422 { code: "psd_flatten_failed" } with a friendly
//     "export a CMYK TIFF or a PDF" message, never a generic error.
//   • PNG → 200, Color fails with the explicit "PNG can't carry CMYK" text.
//
// Fixtures are generated at test time with the same ImageMagick the server
// uses for flattening (replit.nix pkgs.imagemagick).
//
//   npx tsx --test server/pressArtInspectRaster.routes.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "./db";
import { storage } from "./storage";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";
import { scanBuffer, fontsCheckVerdict } from "./validators/completedTemplate";

const run = promisify(execFile);
const exec = (q: any) => db.execute(q);

let baseUrl = "";
let httpServer: HttpServer | undefined;
let pressId = "";
let adminId = "";
let adminToken = "";
let fixturesDir = "";

const fixtures: Record<string, Buffer> = {};

type CheckRow = { param: string; tone: "pass" | "warn" | "fail" | "na"; detail: string };

before(async () => {
  // Generate raster fixtures with ImageMagick (300 PPI so the resolution
  // check has an embedded density to trust).
  fixturesDir = await mkdtemp(join(tmpdir(), "t3161-"));
  const mk = async (out: string, args: string[]) => {
    await run("magick", [...args, join(fixturesDir, out)]);
    fixtures[out] = await readFile(join(fixturesDir, out));
  };
  await mk("cmyk.tif", ["-size", "600x400", "xc:red", "-colorspace", "CMYK", "-density", "300", "-units", "PixelsPerInch"]);
  await mk("rgb.tif", ["-size", "600x400", "xc:blue", "-density", "300", "-units", "PixelsPerInch"]);
  await mk("cmyk.psd", ["-size", "600x400", "xc:green", "-colorspace", "CMYK", "-density", "300", "-units", "PixelsPerInch"]);
  await mk("rgb.png", ["-size", "100x100", "xc:red"]);
  fixtures["bad.psd"] = Buffer.from("this is definitely not a photoshop file");

  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  pressId = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${pressId}, ${"t3161 Press"})`);

  adminId = randomUUID();
  const tag = adminId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${adminId}, ${"t3161_" + tag}, ${"x"}, ${"t3161"}, ${"t3161_" + tag + "@example.test"},
            true, ${"super_admin"})
  `);
  adminToken = "t3161tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(adminToken, adminId, "admin");
});

after(async () => {
  await rm(fixturesDir, { recursive: true, force: true }).catch(() => {});
  await exec(sql`DELETE FROM auth_tokens WHERE token = ${adminToken}`);
  await exec(sql`DELETE FROM users WHERE id = ${adminId}`);
  await exec(sql`DELETE FROM manufacturers WHERE id = ${pressId}`);
  await new Promise<void>((resolve) => (httpServer ? httpServer.close(() => resolve()) : resolve()));
  await pool.end();
});

async function inspect(body: Buffer, contentType: string): Promise<Response> {
  return fetch(`${baseUrl}/api/press/${pressId}/templates/art-inspect`, {
    method: "POST",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

const colorRow = (checks: CheckRow[]) => checks.find((c) => c.param === "Color");

test("CMYK TIFF → Color passes, embedded 300 PPI density trusted", async () => {
  const res = await inspect(fixtures["cmyk.tif"], "image/tiff");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { checks: CheckRow[]; previewDataUrl?: string; pxW?: number };
  const color = colorRow(body.checks);
  assert.equal(color?.tone, "pass");
  assert.match(color!.detail, /CMYK TIFF/);
  const ppiRow = body.checks.find((c) => c.param.startsWith("Image resolution"));
  assert.equal(ppiRow?.tone, "pass", "300 PPI TIFF density must be read and meet the floor");
  assert.match(ppiRow!.detail, /300 PPI/);
  assert.ok(body.previewDataUrl?.startsWith("data:image/jpeg;base64,"), "CMYK TIFF needs a browser-renderable sRGB preview");
  assert.equal(body.pxW, 600);
});

test("RGB TIFF → Color fails (we never convert color)", async () => {
  const res = await inspect(fixtures["rgb.tif"], "image/tiff");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { checks: CheckRow[] };
  const color = colorRow(body.checks);
  assert.equal(color?.tone, "fail");
  assert.match(color!.detail, /RGB/);
  assert.match(color!.detail, /CMYK/);
});

test("CMYK PSD → flattened server-side, Color passes, preview renders", async () => {
  const res = await inspect(fixtures["cmyk.psd"], "image/vnd.adobe.photoshop");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { checks: CheckRow[]; previewDataUrl?: string; pxW?: number };
  const color = colorRow(body.checks);
  assert.equal(color?.tone, "pass");
  assert.match(color!.detail, /PSD \(flattened\)/);
  assert.ok(body.previewDataUrl?.startsWith("data:image/jpeg;base64,"), "flattened PSD needs an sRGB preview");
  assert.equal(body.pxW, 600);
});

test("broken PSD → 422 psd_flatten_failed with a TIFF/PDF suggestion", async () => {
  const res = await inspect(fixtures["bad.psd"], "image/vnd.adobe.photoshop");
  assert.equal(res.status, 422);
  const body = (await res.json()) as { code?: string; message?: string };
  assert.equal(body.code, "psd_flatten_failed");
  assert.match(body.message ?? "", /TIFF or a PDF/i);
});

test("PNG → Color fails with the explicit can't-carry-CMYK message", async () => {
  const res = await inspect(fixtures["rgb.png"], "image/png");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { checks: CheckRow[] };
  const color = colorRow(body.checks);
  assert.equal(color?.tone, "fail");
  assert.match(color!.detail, /PNG is an RGB format/);
  assert.match(color!.detail, /CMYK TIFF/);
});

// Task #3400 — the live banner's Fonts row, PDF-only, sharing the exact
// certification-test verdict (fontsCheckVerdict) so the two surfaces can't
// diverge. Three canon outcomes: outlined pass, embedded-live-text advisory
// (warn), non-embedded fail naming the missing fonts.
const fontsPdf = (fonts: "none" | "embedded" | "unembedded"): Buffer =>
  Buffer.from(
    "%PDF-1.6\n/Type /Page /MediaBox [ 0 0 918 918 ]\n/DeviceCMYK\n" +
      (fonts === "embedded"
        ? "/Type /Font /BaseFont /Helvetica\n/Type /FontDescriptor /FontName /Helvetica /FontFile2 9 0 R\n"
        : fonts === "unembedded"
        ? "/Type /Font /BaseFont /ABCDEF+Futura#20Bold\n"
        : "") +
      "%%EOF",
    "latin1",
  );

const fontsRow = (checks: CheckRow[]) => checks.find((c) => c.param === "Fonts");

test("PDF with no live text → Fonts passes (outlined), matching the certification verdict", async () => {
  const pdf = fontsPdf("none");
  const res = await inspect(pdf, "application/pdf");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { checks: CheckRow[] };
  const row = fontsRow(body.checks);
  assert.equal(row?.tone, "pass");
  assert.match(row!.detail, /No live text detected/);
  assert.match(row!.detail, /outlined/);
  // Lockstep: the live row IS the certification validator's verdict.
  const verdict = fontsCheckVerdict(scanBuffer(pdf));
  assert.equal(row!.tone, verdict.status);
  assert.equal(row!.detail, verdict.message);
});

test("PDF live text with embedded fonts → Fonts advisory (warn), matching certification", async () => {
  const pdf = fontsPdf("embedded");
  const res = await inspect(pdf, "application/pdf");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { checks: CheckRow[] };
  const row = fontsRow(body.checks);
  assert.equal(row?.tone, "warn", "embedded live text is the certification test's advisory tier — never a fail");
  assert.match(row!.detail, /fonts are embedded/);
  const verdict = fontsCheckVerdict(scanBuffer(pdf));
  assert.equal(verdict.status, "warn", "fixture must scan as embedded live text");
  assert.equal(row!.tone, verdict.status);
  assert.equal(row!.detail, verdict.message);
});

test("PDF live text with NO embedded fonts → Fonts fails naming the missing font", async () => {
  const pdf = fontsPdf("unembedded");
  const res = await inspect(pdf, "application/pdf");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { checks: CheckRow[] };
  const row = fontsRow(body.checks);
  assert.equal(row?.tone, "fail");
  assert.match(row!.detail, /no embedded font program/);
  assert.match(row!.detail, /Futura Bold/, "missing fonts are named when the file exposes them");
  const verdict = fontsCheckVerdict(scanBuffer(pdf));
  assert.equal(verdict.status, "fail", "fixture must scan as unembedded live text");
  assert.equal(row!.tone, verdict.status);
  assert.equal(row!.detail, verdict.message);
});

test("raster art gets NO Fonts row — pixels can't carry live text", async () => {
  const res = await inspect(fixtures["cmyk.tif"], "image/tiff");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { checks: CheckRow[] };
  assert.equal(fontsRow(body.checks), undefined);
});

test("signed-upload whitelist accepts the PSD content type", async () => {
  const res = await fetch(`${baseUrl}/api/admin/upload-doc/sign`, {
    method: "POST",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: JSON.stringify({ contentType: "image/vnd.adobe.photoshop" }),
  });
  // 200 with a signed URL when object storage is reachable; the 400
  // whitelist rejection is the only wrong answer here.
  assert.notEqual(res.status, 400, "PSD must be on the signed-upload whitelist");
});
