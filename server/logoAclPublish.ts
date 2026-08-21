// Task #3254 — reliable public-ACL publication for uploaded logo objects.
//
// The signed-PUT upload flow writes bytes straight to GCS with NO ACL
// metadata, but /objects/uploads/:id refuses to serve anything whose
// custom:aclPolicy isn't explicitly public. Any save path that persists a
// `/objects/uploads/...` URL must therefore publish the object FIRST and
// fail the save if publication didn't take — otherwise we persist a URL
// that 404s forever (that's exactly what broke Memphis Record Pressing's
// prod logos).
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./replit_integrations/object_storage/objectStorage";
import {
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./replit_integrations/object_storage/objectAcl";

/** Filter a set of candidate values down to served-by-us upload URLs. */
export function collectUploadObjectUrls(values: unknown[]): string[] {
  return values.filter(
    (u): u is string => typeof u === "string" && u.startsWith("/objects/uploads/"),
  );
}

export class LogoAclPublishError extends Error {
  constructor(public readonly url: string, message: string) {
    super(message);
    this.name = "LogoAclPublishError";
  }
}

/**
 * Set the public ACL on every given `/objects/uploads/...` object and VERIFY
 * it took by reading the policy back. Throws LogoAclPublishError on the first
 * URL that is missing or couldn't be published — callers must refuse to
 * persist the URL in that case. Pasted absolute external URLs should be
 * filtered out by collectUploadObjectUrls before calling this.
 */
export async function publishUploadObjectsOrThrow(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  const oss = new ObjectStorageService();
  for (const url of urls) {
    let file;
    try {
      file = await oss.getObjectEntityFile(url);
    } catch (e) {
      if (e instanceof ObjectNotFoundError) {
        throw new LogoAclPublishError(
          url,
          "The uploaded image can't be found in storage — the upload may have failed. Try uploading again.",
        );
      }
      throw new LogoAclPublishError(url, "Couldn't reach image storage — try again in a moment.");
    }
    try {
      await setObjectAclPolicy(file, { owner: "admin", visibility: "public" });
      // Verify: read the policy back so a silently-dropped metadata write
      // can't persist a URL that the serving route will 404.
      const acl = await getObjectAclPolicy(file);
      if (!acl || acl.visibility !== "public") {
        throw new Error(`readback visibility=${acl?.visibility ?? "null"}`);
      }
    } catch (e) {
      console.error("[logo-acl] failed to publish", url, e);
      throw new LogoAclPublishError(
        url,
        "Couldn't make the uploaded image publicly viewable — the save was not applied. Try again.",
      );
    }
  }
}
