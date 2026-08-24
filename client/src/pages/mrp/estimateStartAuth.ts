// Pure decisions for the estimate "Start this project" flow (both skins) and
// the accepted confirmation page — extracted so the auth-aware branching is
// unit-testable without rendering the full pages.
//
// The flow (Task: fix Adam's signup loop):
//   • An already-authenticated customer skips the account form — the start
//     request carries their session cookie + stored bearer and the server
//     starts the project under their account directly.
//   • A signed-out recipient whose email already has an account gets a
//     sign-in mode in the same modal instead of a dead-end ACCOUNT_EXISTS.
//   • The accepted page swaps its "sign in" step for a direct "continue"
//     action when the viewer is recognized as a signed-in customer.

export type StartStep = 'confirm' | 'account' | 'signin' | 'done';

/** Which step follows the confirm tap: authed customers start directly. */
export function stepAfterConfirm(authedCustomer: boolean): StartStep {
  return authedCustomer ? 'done' : 'account';
}

/** True when the confirm tap should fire the start request immediately
 * (no account form) — the viewer is already a signed-in customer. */
export function startsDirectly(authedCustomer: boolean): boolean {
  return authedCustomer;
}

/** Prefill for the start modal's email fields (sign-in AND create): the
 * address the estimate was sent to. Re-typed addresses were locking real
 * recipients out via typos (Task #3361). Editable — this is only a seed. */
export function prefilledEstimateEmail(clientEmail: string | null | undefined): string {
  const e = (clientEmail ?? '').trim();
  return e.includes('@') ? e : '';
}

/** After a failed start request, which step should the modal show?
 * ACCOUNT_EXISTS pivots to the sign-in form (email kept, password cleared);
 * anything else stays put and shows the error inline. */
export function stepAfterStartError(code: string | undefined | null, current: StartStep): StartStep {
  if (code === 'ACCOUNT_EXISTS') return 'signin';
  return current;
}

/** Accepted-page third step + CTA — auth-aware. Signed-in viewers go
 * straight into the portal; signed-out (e.g. a fresh tab from the
 * confirmation email) keep the sign-in CTA. */
export function acceptedNextStepCopy(
  authedCustomer: boolean,
  portalHost: string,
  depositLabel: string,
): { title: string; body: string; ctaLabel: string } {
  if (authedCustomer) {
    return {
      title: "You're signed in — continue to your project",
      body: `Your project home is ${portalHost}. Files come first; the 50% deposit (${depositLabel}) is only asked for once your test pressing is approved and the run is scheduled.`,
      ctaLabel: 'Continue to your project',
    };
  }
  return {
    title: 'Up next — sign in and upload audio & artwork',
    body: `Your project home is ${portalHost}. Files come first; the 50% deposit (${depositLabel}) is only asked for once your test pressing is approved and the run is scheduled.`,
    ctaLabel: `Sign in at ${portalHost}`,
  };
}
