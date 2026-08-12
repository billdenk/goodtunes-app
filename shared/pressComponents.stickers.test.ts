// Stickers component config schema — offer state, template attachments, and
// the template-URL safety constraint. Templates are minted by the admin
// doc-upload sign flow as /objects/uploads/<id>; anything else (javascript:,
// data:, external https:, path traversal) must be rejected at the schema/API
// boundary so a press editor can never persist a link payload that renders
// for other privileged users.
import test from "node:test";
import assert from "node:assert/strict";
import { stickersComponentConfigSchema } from "./pressComponents";

test("legacy config without offer/template fields still parses (backward compat)", () => {
  const legacy = { shapes: [{ id: "rect", offeredSizeIds: ["2x1"] }] };
  const r = stickersComponentConfigSchema.safeParse(legacy);
  assert.equal(r.success, true);
  assert.equal(r.data!.shapes[0].offered, undefined); // absent = offered
});

test("offered flag, uploaded-path templateUrl, and sizeTemplates round-trip", () => {
  const cfg = {
    shapes: [
      {
        id: "circle",
        offeredSizeIds: ["3x3"],
        offered: false,
        templateUrl: "/objects/uploads/abc-123_v2.pdf",
        sizeTemplates: { "3x3": "/objects/uploads/die-cut.ai" },
      },
    ],
  };
  const r = stickersComponentConfigSchema.safeParse(cfg);
  assert.equal(r.success, true);
  assert.equal(r.data!.shapes[0].offered, false);
  assert.equal(r.data!.shapes[0].templateUrl, "/objects/uploads/abc-123_v2.pdf");
  assert.equal(r.data!.shapes[0].sizeTemplates!["3x3"], "/objects/uploads/die-cut.ai");
});

test("null templateUrl (cleared) is allowed", () => {
  const r = stickersComponentConfigSchema.safeParse({
    shapes: [{ id: "square", offeredSizeIds: [], templateUrl: null }],
  });
  assert.equal(r.success, true);
});

for (const bad of [
  "javascript:alert(1)",
  "data:text/html,<script>1</script>",
  "https://evil.example/payload.pdf",
  "/objects/uploads/../secrets",
  "/objects/other/abc.pdf",
  "//evil.example/x.pdf",
]) {
  test(`unsafe templateUrl rejected: ${bad}`, () => {
    const r = stickersComponentConfigSchema.safeParse({
      shapes: [{ id: "rect", offeredSizeIds: [], templateUrl: bad }],
    });
    assert.equal(r.success, false);
  });

  test(`unsafe sizeTemplates value rejected: ${bad}`, () => {
    const r = stickersComponentConfigSchema.safeParse({
      shapes: [{ id: "rect", offeredSizeIds: ["2x1"], sizeTemplates: { "2x1": bad } }],
    });
    assert.equal(r.success, false);
  });
}
