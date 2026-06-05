// Task #400 — Single source of truth for the welcome-back "while you
// were away" copy. Imported by `server/mail.ts` (email body) AND
// `client/src/pages/WelcomeBack.tsx` (step-3 zero-owned fallback) so
// fans see the same bullets in the mail and in the player.
export const WELCOME_BACK_WHATS_NEW: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "The same albums you bought.",
    body: "Every record you already own on GoodTunes is right here — now with upgraded capabilities so it plays in-app on phone, tablet, and laptop.",
  },
  {
    title: "GoodSync™ lyrics.",
    body: "Line-by-line lyrics that scroll with the song, the way fans actually want to read along.",
  },
  {
    title: "Your GoodDeed®.",
    body: "Your original collectible number carries over, and you can pull a print-ready certificate of provenance any time.",
  },
  {
    title: "Playlists.",
    body: "Build your own playlists from songs across different albums and give each one a cover.",
  },
];
