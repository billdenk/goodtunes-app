import { DesktopConfirmationScreen } from "./_desktop";

// Desktop order confirmation — single copy. Centered "square" card on navy:
// GoodDeed hero + handle on the left, order summary on the right.
export default function DesktopConfirmation() {
  return <DesktopConfirmationScreen copies={[{ number: 310, signed: true, priceCents: 4500 }]} />;
}
