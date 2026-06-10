import { ConfirmationScreen } from "./_shared";

// Order confirmation — the "You're in." page (multi copy).
// Same page, but a 3-copy Hope order so EVERY GoodDeed number is surfaced:
// the hero shows #310 · #311 · #312 and each copy carries its own number in
// the order breakdown. Mirrors the library reveal (Hope owns #310/#311/#312).
export default function NewConfirmationMulti() {
  return (
    <ConfirmationScreen
      copies={[
        { number: 310, signed: true, priceCents: 4500 },
        { number: 311, priceCents: 2500 },
        { number: 312, priceCents: 2500 },
      ]}
    />
  );
}
