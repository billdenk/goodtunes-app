import { DesktopConfirmationScreen } from "./_desktop";

// Desktop order confirmation — three copies, each with its own GoodDeed number.
export default function DesktopConfirmationMulti() {
  return (
    <DesktopConfirmationScreen
      copies={[
        { number: 310, signed: true, priceCents: 4500 },
        { number: 311, priceCents: 2500 },
        { number: 312, priceCents: 2500 },
      ]}
    />
  );
}
