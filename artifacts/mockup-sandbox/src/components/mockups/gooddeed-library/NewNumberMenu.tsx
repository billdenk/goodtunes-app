import { AlbumNumbersScreen } from "./_shared";

// Direction 2 · Tap a number — opens an action menu styled like the Player's
// "Go to Album / Go to Artist" popover, but reading "Download #310 PDF" /
// "View #310 Social" (the GoodDeed certificate PDF + the social share card).
export default function NewNumberMenu() {
  return <AlbumNumbersScreen openMenuFor={310} />;
}
