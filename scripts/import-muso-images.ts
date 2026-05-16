import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  ObjectStorageService,
  objectStorageClient,
} from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

interface MusoPerson {
  id: string;
  name: string;
  imageUrl: string | null;
}
interface MusoDoc {
  people: Record<string, MusoPerson>;
}

const MAGIC: Array<{ mime: string; ext: string; test: (b: Buffer) => boolean }> = [
  { mime: "image/jpeg", ext: ".jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png",  ext: ".png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/gif",  ext: ".gif", test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  { mime: "image/webp", ext: ".webp", test: (b) => b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP" },
];

function sniff(buf: Buffer) {
  for (const m of MAGIC) if (m.test(buf)) return { mime: m.mime, ext: m.ext };
  return null;
}

async function uploadBuffer(buf: Buffer, mime: string, ext: string) {
  const objectStorage = new ObjectStorageService();
  const id = `${randomUUID()}${ext}`;
  const privateDir = objectStorage.getPrivateObjectDir().replace(/\/$/, "");
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

async function fetchOne(url: string): Promise<Buffer> {
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      Referer: "https://credits.muso.ai/",
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  const docPath = "server/data/muso-love-life-tragedy.json";
  const doc = JSON.parse(readFileSync(docPath, "utf8")) as MusoDoc;
  const targets = Object.values(doc.people).filter((p) => p.imageUrl);
  console.log(`Downloading ${targets.length} muso avatars...`);

  const manifest: Record<string, { name: string; sourceUrl: string; localUrl: string; mime: string }> = {};
  const failures: Array<{ id: string; name: string; url: string; reason: string }> = [];

  for (const p of targets) {
    try {
      const buf = await fetchOne(p.imageUrl!);
      const sniffed = sniff(buf);
      if (!sniffed) {
        failures.push({ id: p.id, name: p.name, url: p.imageUrl!, reason: `unknown bytes (size=${buf.length}, head=${buf.slice(0, 8).toString("hex")})` });
        continue;
      }
      const localUrl = await uploadBuffer(buf, sniffed.mime, sniffed.ext);
      manifest[p.id] = { name: p.name, sourceUrl: p.imageUrl!, localUrl, mime: sniffed.mime };
      console.log(`  OK  ${p.name.padEnd(38)} → ${localUrl}  (${sniffed.mime}, ${buf.length}b)`);
    } catch (e: any) {
      failures.push({ id: p.id, name: p.name, url: p.imageUrl!, reason: e?.message || String(e) });
      console.log(`  FAIL ${p.name} — ${e?.message || e}`);
    }
  }

  const outPath = "server/data/muso-people-manifest.json";
  writeFileSync(outPath, JSON.stringify({ manifest, failures, generatedAt: new Date().toISOString() }, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(`Success: ${Object.keys(manifest).length} / ${targets.length}, Failures: ${failures.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
