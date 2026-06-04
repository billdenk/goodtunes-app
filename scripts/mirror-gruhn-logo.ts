/**
 * One-off: mirror the official Gruhn Guitars wordmark into Object Storage so
 * the seeded `vendors` row (Task #1229) can reference a stable
 * /objects/uploads/<id> URL instead of the 32x32 favicon the scraper's
 * auto-stub would otherwise produce.
 *
 * The bucket is shared by dev + prod (see .agents/memory/object-storage-
 * shared-bucket.md), so we mirror ONCE and write the resulting URL into both
 * DBs from post-merge.sh. Source is Gruhn's own Shopify storefront header
 * logo (transparent PNG, 595x120).
 *
 * Run: npx tsx scripts/mirror-gruhn-logo.ts
 * Prints the /objects/uploads/<id> URL to paste into post-merge.sh.
 */
import { objectStorageClient } from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

const SOURCE =
  "https://gruhn-guitars.myshopify.com/cdn/shop/files/768495947f185cc20f43992d97153626Logo_3.png?v=1668799591";

async function main() {
  const resp = await fetch(SOURCE, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!resp.ok) throw new Error(`fetch ${SOURCE} -> ${resp.status}`);
  const mime = resp.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const buf = Buffer.from(await resp.arrayBuffer());

  const ext =
    mime === "image/png" ? ".png" : mime === "image/jpeg" ? ".jpg" : mime === "image/webp" ? ".webp" : ".png";
  const id = `${crypto.randomUUID()}${ext}`;
  const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
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
  await setObjectAclPolicy(file as any, { owner: "admin", visibility: "public" } as any);

  console.log(`Mirrored ${buf.length} bytes (${mime}).`);
  console.log(`logoUrl = /objects/uploads/${id}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
