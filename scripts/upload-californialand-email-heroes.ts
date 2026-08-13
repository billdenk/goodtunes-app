// Task #3120 — one-shot: upload Niina Soleil's CALIFORNIALAND email hero
// scenes (vinyl + CD lifestyle shots) to Object Storage as public objects.
// The bucket is shared between dev and prod, so uploading once here gives a
// stable /objects/uploads/<id> URL that post-merge stamps into BOTH DBs.
// Inputs are pre-downscaled email-safe JPEGs produced in /tmp by the caller.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { objectStorageClient, ObjectStorageService } from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

async function uploadPublic(path: string): Promise<string> {
  const svc = new ObjectStorageService();
  const buf = readFileSync(path);
  const id = `${randomUUID()}.jpg`;
  const privateDir = svc.getPrivateObjectDir().replace(/\/$/, "");
  const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  await file.save(buf, {
    contentType: "image/jpeg",
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
    resumable: false,
  });
  await setObjectAclPolicy(file, { owner: "admin", visibility: "public" });
  return `/objects/uploads/${id}`;
}

(async () => {
  const vinyl = await uploadPublic("/tmp/californialand-hero-vinyl.jpg");
  const cd = await uploadPublic("/tmp/californialand-hero-cd.jpg");
  console.log(JSON.stringify({ vinyl, cd }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
