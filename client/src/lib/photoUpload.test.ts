// Task #1803 — pins the profile-photo accept rules now that iPhone HEIC/HEIF
// is allowed. `isSupportedPhotoFile` is what both the fan editor
// (EditAccount) and the admin Edit Profile dialog gate on, so this file
// guards: (1) the existing PNG/JPEG/WEBP/GIF allowlist still passes, (2) HEIC
// is now accepted — by MIME *and* by extension when the type is empty/generic
// (Files / share-sheet handoffs often drop the MIME), and (3) genuinely
// unsupported types (PDF, TIFF, BMP) are still rejected so the caller can show
// a friendly message. The actual canvas/heic2any transcode needs a real
// browser image pipeline, so it isn't exercised here.
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/lib/photoUpload.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "../pages/jsdomHarness";

register("../pages/assetStubLoader.mjs", import.meta.url);

installTestDom();

const { isHeicFile, isSupportedPhotoFile, PHOTO_TRANSCODE_MIMES } = await import(
  "./photoUpload"
);

function fakeFile(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

test("PNG/JPEG/WEBP/GIF are still supported", () => {
  assert.equal(isSupportedPhotoFile(fakeFile("a.png", "image/png")), true);
  assert.equal(isSupportedPhotoFile(fakeFile("a.jpg", "image/jpeg")), true);
  assert.equal(isSupportedPhotoFile(fakeFile("a.webp", "image/webp")), true);
  assert.equal(isSupportedPhotoFile(fakeFile("a.gif", "image/gif")), true);
});

test("HEIC/HEIF is accepted by MIME type", () => {
  for (const mime of PHOTO_TRANSCODE_MIMES) {
    assert.equal(isHeicFile(fakeFile("photo", mime)), true, `${mime} via mime`);
    assert.equal(
      isSupportedPhotoFile(fakeFile("photo", mime)),
      true,
      `${mime} supported`,
    );
  }
});

test("HEIC is accepted by extension when the type is empty or generic", () => {
  // Files / share-sheet handoffs frequently arrive with no MIME or a generic
  // octet-stream — fall back to the filename extension.
  assert.equal(isHeicFile(fakeFile("IMG_0001.HEIC", "")), true);
  assert.equal(isHeicFile(fakeFile("IMG_0001.heic", "application/octet-stream")), true);
  assert.equal(isHeicFile(fakeFile("clip.heif", "")), true);
  assert.equal(isSupportedPhotoFile(fakeFile("IMG_0001.HEIC", "")), true);
});

test("genuinely unsupported types are rejected", () => {
  assert.equal(isSupportedPhotoFile(fakeFile("doc.pdf", "application/pdf")), false);
  assert.equal(isSupportedPhotoFile(fakeFile("scan.tiff", "image/tiff")), false);
  assert.equal(isSupportedPhotoFile(fakeFile("old.bmp", "image/bmp")), false);
  assert.equal(isHeicFile(fakeFile("doc.pdf", "application/pdf")), false);
});
