// Task #536 — "What's New" welcome-back sheet content registry.
//
// Single source of truth for the cards the returning-fan welcome sheet
// renders, plus the monotonically increasing version stamp that
// controls re-display. Imported by `client/src/components/WhatsNewSheet.tsx`
// (renders the cards) and `server/routes.ts` (returns the current
// version in the recognition-gate response).
//
// To ship a new "what's new" wave:
//   1. Bump `WHATS_NEW_VERSION` by one (integer, monotonically rising).
//   2. Update `WHATS_NEW_CARDS` to the 2–3 capabilities you want fans
//      to see on first launch after the update.
// Every fan whose `customerUsers.whatsNewSeenVersion` is less than the
// new version (or NULL) will see the refreshed sheet the next time
// they sign in.

export const WHATS_NEW_VERSION = 1;

export type WhatsNewCard = {
  // Stable key used for analytics + dismissal — keep it lowercase and
  // human-readable. Don't change after shipping or you'll lose the
  // funnel history for that card.
  key: string;
  // Lucide icon name (rendered by the sheet). Picked from icons already
  // imported elsewhere in the app to keep the bundle lean.
  icon: "Mic2" | "ShieldCheck" | "MessageSquare" | "ListMusic" | "Sparkles" | "Heart";
  title: string;
  body: string;
};

export const WHATS_NEW_CARDS: ReadonlyArray<WhatsNewCard> = [
  {
    key: "goodsync_lyrics",
    icon: "Mic2",
    title: "GoodSync™ lyrics",
    body: "Line-by-line lyrics that scroll with the song — the way fans actually want to read along.",
  },
  {
    key: "gooddeed_provenance",
    icon: "ShieldCheck",
    title: "GoodDeed & Provenance",
    body: "View your GoodDeed and ownership provenance in the app for every album you own. Buy a physical copy and a limited, artist-signed certificate ships with it.",
  },
  {
    key: "super_credits",
    icon: "Sparkles",
    title: "SuperCredits™",
    body: "See every performer and the exact gear behind each track — down to the specific instrument used on that take.",
  },
];
