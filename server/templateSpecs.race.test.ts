// Task #3099 review — replace/archive race on template-spec preview renders.
//
// A render that started against file A must never persist its pages after the
// template has been replaced with file B (or archived): the persist is guarded
// on the file URL the render was made from, and a rejected persist re-renders
// the CURRENT file instead of leaving previews stale or NULL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTemplateSpecPreviews } from "./templateSpecs";

const PRESS = "press-1";
const SPEC = "spec-1";

function specRow(templateFileUrl: string | null) {
  return { id: SPEC, pressId: PRESS, templateFileUrl, measuredPages: 1, expectedPages: 1 } as any;
}

test("replace mid-render: stale render is rejected and the new file is rendered", async () => {
  // The spec points at A when the render starts, but by persist time an
  // operator has attached B. The guarded write must miss for A and the
  // helper must loop to render + persist B.
  const files = [specRow("/objects/uploads/file-A.pdf"), specRow("/objects/uploads/file-B.pdf")];
  const rendered: string[] = [];
  const persisted: Array<{ urls: string[]; expected: string | null | undefined }> = [];
  const store = {
    getPressTemplateSpecById: async () => files.shift() ?? specRow("/objects/uploads/file-B.pdf"),
    updatePressTemplateSpecPreviews: async (
      _p: string,
      _s: string,
      urls: string[] | null,
      expected?: string | null,
    ) => {
      persisted.push({ urls: urls ?? [], expected });
      // Simulate the DB guard: only the CURRENT file (B) matches.
      return expected === "/objects/uploads/file-B.pdf" ? specRow("/objects/uploads/file-B.pdf") : null;
    },
  };
  const render = async (url: string) => {
    rendered.push(url);
    return [`preview-of-${url.split("/").pop()}`];
  };

  const urls = await renderTemplateSpecPreviews(PRESS, SPEC, { render, store: store as any });

  assert.deepEqual(rendered, ["/objects/uploads/file-A.pdf", "/objects/uploads/file-B.pdf"]);
  // The stale A write was attempted with the A guard (rejected), then B landed.
  assert.equal(persisted.length, 2);
  assert.equal(persisted[0].expected, "/objects/uploads/file-A.pdf");
  assert.equal(persisted[1].expected, "/objects/uploads/file-B.pdf");
  assert.deepEqual(urls, ["preview-of-file-B.pdf"]);
});

test("archive mid-render: stale render is rejected and nothing is persisted after", async () => {
  // Render starts against A; the template is archived (file cleared) before
  // persist. The guarded write must miss, and the retry must bail without
  // writing anything — previews stay NULL, exactly as the archive reset them.
  const files = [specRow("/objects/uploads/file-A.pdf"), specRow(null)];
  const persisted: Array<string | null | undefined> = [];
  const store = {
    getPressTemplateSpecById: async () => files.shift() ?? specRow(null),
    updatePressTemplateSpecPreviews: async (
      _p: string,
      _s: string,
      _urls: string[] | null,
      expected?: string | null,
    ) => {
      persisted.push(expected);
      return null; // guard rejects: file no longer matches
    },
  };
  const render = async () => ["stale-preview.png"];

  const urls = await renderTemplateSpecPreviews(PRESS, SPEC, { render, store: store as any });

  assert.deepEqual(urls, []);
  // Only the guarded (rejected) A write was attempted; nothing landed after
  // the archive was observed.
  assert.deepEqual(persisted, ["/objects/uploads/file-A.pdf"]);
});
