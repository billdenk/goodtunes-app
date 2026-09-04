import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./AdminPerson.tsx", import.meta.url), "utf8");
const pressSource = readFileSync(
  new URL("../components/admin/InvitedByPressPanel.tsx", import.meta.url),
  "utf8",
);

test("account presentation keeps the approved section order", () => {
  assert.match(
    source,
    /mirrorMode && tab === "settings"[\s\S]*Settings\.\{" "\}[\s\S]*Manage this artist\.[\s\S]*<OverviewPanel person=\{person\}/,
  );
  const markers = [
    'title="Links."',
    'title="Stores."',
    'title="Identity."',
    'title="Notifications."',
    'title="Production."',
    "<RemoveArtistProfilePanel",
  ];
  let cursor = source.indexOf('data-testid="admin-artist-account-stack"');
  assert.notEqual(cursor, -1);
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor);
    assert.ok(next > cursor, `${marker} must follow the preceding account section`);
    cursor = next;
  }
});

test("key account actions remain wired to their existing request contracts", () => {
  const contracts = [
    ['apiRequest("PUT", `/api/admin/people/${person.id}`', "identity, links, and artist URL"],
    ['apiRequest("PATCH", `/api/admin/${kind}/${id}/${assignmentRoute}`, { pressId })', "production press"],
    ['apiRequest("PATCH", `/api/admin/${kind}/${id}/press-mode`, { mode })', "press mode"],
    ['apiRequest("POST", `/api/admin/partners/${kind}/${id}/backfill-referral`', "referral back-fill"],
    ['queryKey: ["/api/admin/people", personId, "shopify"]', "Shopify status"],
  ] as const;

  for (const [needle, label] of contracts) {
    const body = label.startsWith("press") || label === "production press" ? pressSource : source;
    assert.ok(body.includes(needle), `${label} must retain its existing source-to-handler wiring`);
  }
  assert.match(
    pressSource,
    /kind === "people" && !currentPressId \? "default-press" : "invited-press"/,
  );
});

test("production press picker uses the live directory and mode-safe logo component", () => {
  assert.match(pressSource, /queryKey:\s*\["\/api\/manufacturers"\]/);
  assert.match(pressSource, /<BrandMarkImg/);
  assert.doesNotMatch(pressSource, /\bMOCK_PRESSES\b|paramountpressing\.com/);
});

test("production AdminPerson contains no handoff mock artifacts", () => {
  assert.doesNotMatch(source, /\bMOCK_[A-Z0-9_]+\b/);
  assert.doesNotMatch(source, /mockState|window\.location\.hash|href="#"/);
  assert.doesNotMatch(source, /setTimeout\([^)]*mock|mock timeout/i);
});

test("the admin artist mirror does not claim an unauthoritative empty work queue", () => {
  const dashboardSource = readFileSync(
    new URL("./ArtistDashboard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    dashboardSource,
    /<DashboardTab[\s\S]*operatorView=\{operatorView\}[\s\S]*\/>/,
  );
  assert.match(dashboardSource, /\{!operatorView && <WorkQueueEmpty \/>\}/);
  assert.match(
    dashboardSource,
    /operatorView\s*\?\s*"Artist performance overview\."\s*:\s*"Nothing needs you right now/,
  );
});