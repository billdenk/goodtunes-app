import { ConfirmationScreen } from "./_shared";

// Order confirmation — the "You're in." page (single copy).
// Faithful to Bill's Figma: filled color boxes (no outlines), larger font,
// wider boxes. The buyer's GoodDeed number is the hero of the page.
export default function NewConfirmation() {
  return (
    <ConfirmationScreen
      copies={[{ number: 310, signed: true, priceCents: 4500 }]}
    />
  );
}
