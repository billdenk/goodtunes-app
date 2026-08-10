// Task #2993 — Human-readable labels for failed Stripe checkout attempts.
// Shared by the admin customer detail page, the ops report, and CSV
// exports so support reads the same wording everywhere.

export type CheckoutFailureKind = "payment_failed" | "session_expired";

// Stripe decline_code / error code → operator-friendly label. Anything
// unknown falls back to a de-snaked version of the code, then the raw
// Stripe message, so support always sees SOMETHING truthful.
const CODE_LABELS: Record<string, string> = {
  card_declined: "Card declined",
  generic_decline: "Card declined",
  do_not_honor: "Card declined",
  transaction_not_allowed: "Card declined",
  insufficient_funds: "Insufficient funds",
  expired_card: "Expired card",
  incorrect_cvc: "Incorrect CVC",
  incorrect_number: "Incorrect card number",
  invalid_account: "Invalid account",
  lost_card: "Card reported lost",
  stolen_card: "Card reported stolen",
  fraudulent: "Declined as suspected fraud",
  authentication_required: "Authentication required",
  processing_error: "Processing error",
  payment_intent_authentication_failure: "Authentication failed",
};

export function checkoutFailureReasonLabel(
  kind: string,
  failureCode: string | null | undefined,
  failureMessage: string | null | undefined,
): string {
  if (kind === "session_expired") return "Checkout expired";
  if (failureCode && CODE_LABELS[failureCode]) return CODE_LABELS[failureCode];
  if (failureCode) {
    const words = failureCode.replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return failureMessage || "Payment failed";
}
