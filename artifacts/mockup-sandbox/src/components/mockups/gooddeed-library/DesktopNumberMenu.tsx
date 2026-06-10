import { DesktopAlbumNumbersScreen } from "./_desktop";

// Desktop number actions — tapping a GoodDeed number opens the certificate menu
// (Download PDF / View Social), echoing the Player's Go-to-Album popover.
export default function DesktopNumberMenu() {
  return <DesktopAlbumNumbersScreen openMenuFor={310} />;
}
