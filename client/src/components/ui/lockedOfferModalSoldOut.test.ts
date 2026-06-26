// Task #2278 — automated coverage for the sunset "Sold Out" guard in the
// LockedOfferModal (defense-in-depth for stale deep-links).
//
// Even with the page-level Buy CTA suppressed, a fan can reach this modal via
// a stale deep-link on a sunset release. When `soldOut={true}` the modal body
// is replaced by a "no longer available" message so the fan never reaches the
// payment/notify flow. We mount the real modal open + sold out and assert the
// sold-out body renders while none of the offer/notify/payment surfaces do.
//
// The modal calls useQuery (gated `enabled`, never fires here) so it must be
// rendered inside a QueryClientProvider; we use Infinity stale/gc times so no
// timer is scheduled to hang the shared tsx --test run.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/components/ui/lockedOfferModalSoldOut.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { installTestDom } from "../../pages/jsdomHarness";

const { window } = installTestDom();

const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;
const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;

const { LockedOfferModal } = await import("./LockedOfferModal");

const h = React.createElement;

function makeClient() {
  // Infinity stale + gc ⇒ no background timer scheduled (would hang the
  // buffered tsx --test run on an open handle).
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, gcTime: Infinity, retry: false },
    },
  });
}

async function mountModal(props: Record<string, unknown>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(
        QueryClientProvider,
        { client: makeClient() },
        h(LockedOfferModal, {
          open: true,
          onClose: () => {},
          albumId: "a1",
          title: "Sunset Sessions",
          artist: "Tester",
          salesPending: false,
          onBuy: () => {},
          ...props,
        }),
      ),
    );
  });
  const q = (id: string) =>
    document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  return { q, cleanup };
}

test("a sold-out release shows the unavailable modal and no payment flow", async () => {
  const { q, cleanup } = await mountModal({ soldOut: true });

  assert.ok(
    q("locked-offer-modal-sold-out"),
    "sold-out release renders the no-longer-available modal body",
  );

  // None of the offer / notify / payment surfaces render.
  assert.equal(q("locked-offer-modal"), null, "no normal offer modal body");
  assert.equal(q("offer-modal"), null, "no offer step surface");
  assert.equal(q("button-primary"), null, "no primary Buy/Notify CTA");
  assert.equal(q("step-buy"), null, "no campaign buy step");
  assert.equal(q("button-submit-notify"), null, "no notify submission");
  assert.equal(q("input-notify-email"), null, "no notify email field");

  await cleanup();
});

test("an available release renders the real offer modal, not the sold-out body", async () => {
  // Guard the inverse: with soldOut=false the modal must NOT short-circuit to
  // the unavailable state.
  const { q, cleanup } = await mountModal({ soldOut: false });

  assert.equal(
    q("locked-offer-modal-sold-out"),
    null,
    "available release does not render the sold-out body",
  );
  assert.ok(q("locked-offer-modal"), "available release renders the offer modal");

  await cleanup();
});

void window;
