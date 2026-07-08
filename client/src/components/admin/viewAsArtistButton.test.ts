// Task #2429 — lock the gating of the People-admin "View as this Artist"
// button so a future refactor can't silently expose it on non-artist contacts
// or hide it from the operators who are meant to have it.
//
// The button on AdminPerson renders exactly when ALL of these hold (see
// AdminPerson.tsx ~L903):
//
//   !pressMode && personIsArtist(person) && <ViewAsPartnerButton
//        role="artist" testId="button-view-as-artist" ... />
//
// and ViewAsPartnerButton ITSELF self-gates on the super-admin role it reads
// from the /api/me/role query cache (renders null otherwise).
//
// This test exercises the two REAL units on that path:
//   1. `personIsArtist` (imported from AdminPerson) — the shape/promotion/role
//      predicate: artist-shape / operator-promoted / "artist" creative role
//      count as an artist; a contact-shape partner rep does NOT.
//   2. `ViewAsPartnerButton` — the super-admin self-gate + the artist testId.
//
// and composes them EXACTLY as AdminPerson does (mirroring the
// `!pressMode && personIsArtist(person) && <button/>` expression, with
// `pressMode = meRole === "manufacturer"`) so the four cases the task calls
// out are covered end-to-end:
//   - artist person + super_admin           → button-view-as-artist PRESENT
//   - contact-shape person + super_admin    → ABSENT (personIsArtist false)
//   - artist person + manufacturer (press)  → ABSENT (pressMode + self-gate)
//   - artist person + admin (non-super)     → ABSENT (ViewAsPartnerButton gate)
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/components/admin/viewAsArtistButton.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "../../pages/jsdomHarness";

// Stub static asset imports (.svg/.png/…) + rewrite import.meta.env so the
// real page/component modules import under tsx without Vite. Must run before
// any import that pulls them in.
register("../../pages/assetStubLoader.mjs", import.meta.url);

// The toast reducer (reachable from ViewAsPartnerButton's error path) arms
// shadcn's TOAST_REMOVE_DELAY (1,000,000ms) setTimeout the harness doesn't
// capture; trap setTimeout so the buffered tsx --test process doesn't stay
// alive ~1000s after the tests pass.
const realSetTimeout = globalThis.setTimeout;
const createdTimeouts = new Set<any>();
(globalThis as any).setTimeout = (...args: any[]) => {
  const id = (realSetTimeout as any)(...args);
  createdTimeouts.add(id);
  return id;
};
after(() => {
  for (const id of createdTimeouts) clearTimeout(id);
  createdTimeouts.clear();
  (globalThis as any).setTimeout = realSetTimeout;
});

const { window } = installTestDom({ url: "http://localhost/admin/people/p-1" });

// Import React + the real modules AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;
const { ViewAsPartnerButton } = await import("./ViewAsPartnerButton");
const { personIsArtist } = await import("../../pages/AdminPerson");

const h = React.createElement;

// ── fixtures ─────────────────────────────────────────────────────────
function makePerson(overrides: Record<string, any> = {}): any {
  return {
    id: "p-1",
    name: "Test Artist",
    shape: "artist",
    isArtistPromoted: false,
    roles: [],
    ...overrides,
  };
}

// ── pure predicate coverage (no DOM) ─────────────────────────────────
test("personIsArtist: artist-shape person is an artist", () => {
  assert.equal(personIsArtist(makePerson({ shape: "artist" })), true);
});

test("personIsArtist: operator-promoted person is an artist", () => {
  assert.equal(
    personIsArtist(makePerson({ shape: "contact", isArtistPromoted: true })),
    true,
  );
});

test('personIsArtist: a person carrying the "artist" creative role counts', () => {
  assert.equal(
    personIsArtist(makePerson({ shape: "contact", roles: ["Vocals", "Artist"] })),
    true,
  );
});

test("personIsArtist: a contact-shape partner rep is NOT an artist", () => {
  assert.equal(
    personIsArtist(
      makePerson({ shape: "contact", isArtistPromoted: false, roles: ["A&R"] }),
    ),
    false,
  );
});

// ── composed-gate coverage (real ViewAsPartnerButton + real predicate) ─
//
// Mirrors AdminPerson.tsx's render expression exactly. `pressMode` is derived
// from the same /api/me/role value AdminPerson reads (role === "manufacturer").
function ViewAsArtistGate({ person }: { person: any }) {
  const meRole = (RQ.useQuery({ queryKey: ["/api/me/role"] }) as any).data as
    | { role: string }
    | undefined;
  const pressMode = meRole?.role === "manufacturer";
  return !pressMode && personIsArtist(person)
    ? h(ViewAsPartnerButton, {
        role: "artist",
        scopeKind: "artist",
        scopeId: person.id,
        label: person.name,
        buttonText: "View as this Artist",
        testId: "button-view-as-artist",
      })
    : null;
}

async function settle(frames = 4) {
  for (let i = 0; i < frames; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function mount(person: any, role: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // Seed the /api/me/role cache both ViewAsPartnerButton and the gate read.
  queryClient.setQueryData(["/api/me/role"], { role });

  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(
        QueryClientProvider,
        { client: queryClient },
        h(ViewAsArtistGate, { person }),
      ),
    );
  });
  await settle();
  const q = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
    queryClient.clear();
  };
  return { q, cleanup };
}

test("artist-shape person + super_admin → the button is shown", async () => {
  const { q, cleanup } = await mount(makePerson({ shape: "artist" }), "super_admin");
  assert.ok(
    q("button-view-as-artist"),
    "a real artist gets 'View as this Artist' for a super-admin",
  );
  await cleanup();
});

test("contact-shape person + super_admin → the button is hidden", async () => {
  const { q, cleanup } = await mount(
    makePerson({ shape: "contact", isArtistPromoted: false, roles: ["A&R"] }),
    "super_admin",
  );
  assert.equal(
    q("button-view-as-artist"),
    null,
    "a non-artist contact never exposes the artist view-as tool",
  );
  await cleanup();
});

test("artist-shape person in press-mode (manufacturer) → the button is hidden", async () => {
  const { q, cleanup } = await mount(makePerson({ shape: "artist" }), "manufacturer");
  assert.equal(
    q("button-view-as-artist"),
    null,
    "press-mode never shows the god-view artist lens",
  );
  await cleanup();
});

test("artist-shape person + non-super admin → the button is hidden", async () => {
  const { q, cleanup } = await mount(makePerson({ shape: "artist" }), "admin");
  assert.equal(
    q("button-view-as-artist"),
    null,
    "ViewAsPartnerButton self-gates to super-admins only",
  );
  await cleanup();
});

// ── Task #2637 — demote-artist UI eligibility predicate ──────────────
//
// RemoveArtistProfilePanel on the artist-shape Overview renders exactly when
// `demoteArtistEligible(person)` holds: the operator promotion flag is the
// only CLIENT-visible artist signal (not a group, no non-empty creative
// roles). Catalog signals are enforced server-side with a 409 — see
// server/demoteArtist.routes.db.test.ts.

const { demoteArtistEligible } = await import("../../pages/AdminPerson");

test("demoteArtistEligible: promoted, no roles, not a group → eligible", () => {
  assert.equal(
    demoteArtistEligible(makePerson({ isArtistPromoted: true })),
    true,
  );
});

test("demoteArtistEligible: empty/whitespace roles don't block", () => {
  assert.equal(
    demoteArtistEligible(
      makePerson({ isArtistPromoted: true, roles: ["", "  "] }),
    ),
    true,
  );
});

test("demoteArtistEligible: not promoted → hidden", () => {
  assert.equal(demoteArtistEligible(makePerson()), false);
});

test("demoteArtistEligible: a creative-credit role → hidden", () => {
  assert.equal(
    demoteArtistEligible(
      makePerson({ isArtistPromoted: true, roles: ["Vocals"] }),
    ),
    false,
  );
});

test("demoteArtistEligible: a group → hidden", () => {
  assert.equal(
    demoteArtistEligible(makePerson({ isArtistPromoted: true, isGroup: true })),
    false,
  );
});
