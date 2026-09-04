import fs from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("Artist Profile theme consistency skin", () => {
  it("scopes the mirror to light admin tokens without overriding dark", () => {
    const css = fs.readFileSync("client/src/index.css", "utf8");
    assert.match(css, /body\.gt-admin:not\(\.gt-admin-dark\) \.gt-artist-profile-mirror/);
    assert.match(css, /--artist-card: var\(--apple-card\)/);
    assert.doesNotMatch(css, /body\.gt-admin\.gt-admin-dark \.gt-artist-profile-mirror/);
  });

  it("keeps the production mirror component and handlers in place", () => {
    const source = fs.readFileSync("client/src/pages/AdminPerson.tsx", "utf8");
    assert.match(source, /<ArtistTabBody/);
    assert.match(source, /operatorView/);
    assert.match(source, /gt-artist-profile-mirror/);
  });
});