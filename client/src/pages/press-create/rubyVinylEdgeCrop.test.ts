import fs from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("Ruby translucent vinyl source boundary", () => {
  it("crops the pale transparent edge inside every Ruby production renderer", () => {
    const files = [
      "client/src/pages/press-create/PressPackageBuilder.tsx",
      "client/src/pages/press-create/PressQuoteBuilder.tsx",
      "client/src/pages/PressClientEstimate.tsx",
      "client/src/pages/mrp/PressClientEstimateMRP.tsx",
    ];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      assert.match(source, /mrp-ruby-translucent\.png/);
      assert.match(source, /scale\(1\.16\)/);
      assert.doesNotMatch(source, /scale\(1\.13\)/);
    }
  });
});