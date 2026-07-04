// Task #1202 — component coverage for the artist Referrals invite surface.
//
// `InviteArtistPanel` (client/src/pages/ArtistDashboard.tsx) is the artist's
// main "who I invited / accepted / units" view. It was just polished (funnel
// rollup, slot counter, status pills, empty state) but had no test. This pins
// the four states the polish introduced so a refactor can't silently regress
// them:
//   • The funnel strip (Sent / Joined / Units sold / Pending payout) rolls up
//     the mocked invite + referral rows.
//   • The slot line reads "{n} of {cap} invite slots left" and flips to the
//     at-cap copy when outstanding >= cap.
//   • Each invite row shows the right status pill (Invited / Joined / Revoked
//     / Expired) and joined rows show units sold + pending payout.
//   • The empty state renders when there are no invites, with the single
//     header "Invite" CTA (Task #2495 collapsed the old header + empty-state
//     CTAs into one primary that opens a modal).
//
// We render the REAL InviteArtistPanel into jsdom, seeding the three queries it
// reads (/api/artist/invites, /api/artist/earmarked, /api/artist/referrals)
// directly into a test QueryClient so nothing hits the network.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test client/src/pages/artistReferralsPanel.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// ArtistDashboard pulls in sibling UI modules that may import binary assets and
// read import.meta.env; this loader stubs both so tsx can import the module
// graph without Vite. Must run before any import that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

// The loader rewrites `import.meta.env` (Vite-only) to this global.
(globalThis as any).__VITE_ENV__ = {
  DEV: false,
  PROD: true,
  MODE: "test",
  SSR: false,
};

// ── jsdom environment ────────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true, // gives us requestAnimationFrame for framer-motion
});
const { window } = dom;
const g = globalThis as any;
g.window = window;
g.document = window.document;
g.navigator = window.navigator;
g.location = window.location; // wouter reads the global location/history
g.history = window.history;
g.localStorage = window.localStorage;
g.addEventListener = window.addEventListener.bind(window);
g.removeEventListener = window.removeEventListener.bind(window);
g.dispatchEvent = window.dispatchEvent.bind(window);
g.HTMLElement = window.HTMLElement;
g.SVGElement = window.SVGElement;
g.Element = window.Element;
g.Node = window.Node;
g.DocumentFragment = window.DocumentFragment;
g.Event = window.Event;
g.CustomEvent = window.CustomEvent;
g.MouseEvent = window.MouseEvent;
g.KeyboardEvent = window.KeyboardEvent;
g.getComputedStyle = window.getComputedStyle.bind(window);
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
// framer-motion useReducedMotion → force reduced so animations resolve 0ms.
window.matchMedia = ((query: string) => ({
  matches: /reduce/.test(query),
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return false;
  },
})) as any;
g.matchMedia = window.matchMedia;
// Required for React 18's act().
g.IS_REACT_ACT_ENVIRONMENT = true;

// Import React + the real component AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;

const { InviteArtistPanel } = await import("@/pages/ArtistDashboard");

const h = React.createElement;

// ── fixtures ─────────────────────────────────────────────────────────
type InviteRow = {
  id: string;
  email: string;
  role: string;
  roleScopeId: string | null;
  scopeName: string | null;
  scopeThumbUrl: string | null;
  welcomeNote: string | null;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  resentAt: string | null;
  acceptUrl: string | null;
};

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

function inviteRow(over: Partial<InviteRow>): InviteRow {
  return {
    id: "iv-x",
    email: "x@example.com",
    role: "artist",
    roleScopeId: null,
    scopeName: null,
    scopeThumbUrl: null,
    welcomeNote: null,
    expiresAt: iso(now + 7 * DAY),
    createdAt: iso(now - 1 * DAY),
    usedAt: null,
    revokedAt: null,
    resentAt: null,
    acceptUrl: "https://get.goodtunes.music/accept/abc",
    ...over,
  };
}

async function mount(opts: {
  invites: InviteRow[];
  outstanding: number;
  cap: number;
  partners?: { id: string; units: number; pendingCents: number }[];
}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, gcTime: Infinity, retry: false },
    },
  });
  // Seed the three queries InviteArtistPanel reads so nothing hits the network.
  client.setQueryData(["/api/artist/invites"], {
    invites: opts.invites,
    outstanding: opts.outstanding,
    cap: opts.cap,
  });
  client.setQueryData(["/api/artist/earmarked"], { suggestions: [] });
  client.setQueryData(["/api/artist/referrals"], {
    partners: opts.partners ?? [],
  });

  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(QueryClientProvider, { client }, h(InviteArtistPanel, null)),
    );
  });
  const q = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const teardown = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    client.clear();
  };
  return { container, q, teardown };
}

// ── tests ────────────────────────────────────────────────────────────
test("funnel strip rolls up sent / joined / units sold / pending payout", async () => {
  const { q, teardown } = await mount({
    cap: 5,
    outstanding: 2,
    invites: [
      // Joined invitee with 3 units + $3.00 pending.
      inviteRow({
        id: "iv-joined",
        roleScopeId: "scope-a",
        scopeName: "Joined Artist",
        usedAt: iso(now - 2 * DAY),
      }),
      // Still-pending invite (counts toward Sent, not Joined).
      inviteRow({ id: "iv-pending", scopeName: "Pending Artist" }),
    ],
    partners: [{ id: "scope-a", units: 3, pendingCents: 300 }],
  });
  try {
    assert.ok(q("referral-funnel"), "funnel strip renders when invites exist");
    assert.equal(q("funnel-sent-value")?.textContent, "2", "Sent counts every invite");
    assert.equal(q("funnel-joined-value")?.textContent, "1", "Joined counts accepted only");
    assert.equal(q("funnel-units-value")?.textContent, "3", "Units sold sums joined-invitee units");
    assert.equal(q("funnel-pending-value")?.textContent, "$3.00", "Pending payout sums joined-invitee cents");
  } finally {
    await teardown();
  }
});

test("slot line: shows remaining slots when under cap", async () => {
  const { q, teardown } = await mount({
    cap: 5,
    outstanding: 2,
    invites: [inviteRow({ id: "iv-1" }), inviteRow({ id: "iv-2" })],
  });
  try {
    assert.equal(
      q("text-invite-slots")?.textContent,
      "3 of 5 invite slots left",
      "slot line reads remaining of cap",
    );
  } finally {
    await teardown();
  }
});

test("slot line: flips to at-cap copy when outstanding >= cap", async () => {
  const { q, teardown } = await mount({
    cap: 3,
    outstanding: 3,
    invites: [
      inviteRow({ id: "iv-1" }),
      inviteRow({ id: "iv-2" }),
      inviteRow({ id: "iv-3" }),
    ],
  });
  try {
    assert.equal(
      q("text-invite-slots")?.textContent,
      "All invite slots used — revoke one below to free a slot",
      "at-cap copy replaces the slot count",
    );
    assert.equal(
      (q("button-open-invite-artist") as HTMLButtonElement)?.disabled,
      true,
      "open-invite button is disabled at cap",
    );
  } finally {
    await teardown();
  }
});

test("invite rows show the correct status pill per state", async () => {
  const { q, teardown } = await mount({
    cap: 5,
    outstanding: 1,
    invites: [
      inviteRow({ id: "iv-invited", scopeName: "Pending One" }),
      inviteRow({
        id: "iv-joined",
        scopeName: "Joined One",
        roleScopeId: "scope-j",
        usedAt: iso(now - 1 * DAY),
      }),
      inviteRow({
        id: "iv-revoked",
        scopeName: "Revoked One",
        revokedAt: iso(now - 1 * DAY),
      }),
      inviteRow({
        id: "iv-expired",
        scopeName: "Expired One",
        expiresAt: iso(now - 1 * DAY),
      }),
    ],
    partners: [{ id: "scope-j", units: 2, pendingCents: 200 }],
  });
  try {
    assert.equal(q("text-artist-invite-status-iv-invited")?.textContent, "Invited");
    assert.equal(q("text-artist-invite-status-iv-joined")?.textContent, "Joined");
    assert.equal(q("text-artist-invite-status-iv-revoked")?.textContent, "Revoked");
    assert.equal(q("text-artist-invite-status-iv-expired")?.textContent, "Expired");

    // Joined row surfaces units sold + pending payout.
    const units = q("text-artist-invite-units-iv-joined");
    assert.ok(units, "joined row shows the units block");
    assert.match(units!.textContent ?? "", /2 units sold/, "joined row shows units sold");
    assert.match(units!.textContent ?? "", /\$2\.00 pending/, "joined row shows pending payout");

    // Non-joined rows never render the units block.
    assert.equal(q("text-artist-invite-units-iv-invited"), null);
    assert.equal(q("text-artist-invite-units-iv-revoked"), null);
    assert.equal(q("text-artist-invite-units-iv-expired"), null);
  } finally {
    await teardown();
  }
});

test("empty state renders with the single header 'Invite' CTA when there are no invites", async () => {
  const { q, teardown } = await mount({ cap: 5, outstanding: 0, invites: [] });
  try {
    assert.ok(q("empty-artist-invites"), "empty state renders");
    assert.equal(q("list-artist-invites"), null, "no invite list when empty");
    assert.equal(q("referral-funnel"), null, "no funnel strip when nothing sent");
    // The invite affordance is now a single primary CTA in the card header
    // (opens a modal), not a second empty-state button.
    const cta = q("button-open-invite-artist");
    assert.ok(cta, "the single header CTA renders");
    assert.equal((cta as HTMLButtonElement).disabled, false, "CTA is enabled when under cap");
    assert.equal(q("button-empty-invite-artist"), null, "the old duplicate empty-state CTA is gone");
    assert.equal(
      q("text-invite-slots")?.textContent,
      "5 of 5 invite slots left",
      "slot line still shows full capacity when empty",
    );
  } finally {
    await teardown();
  }
});
