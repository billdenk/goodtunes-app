// Task #400 — Single source of truth for the welcome-back "while you
// were away" copy. Imported by `server/mail.ts` (email body) AND
// `client/src/pages/WelcomeBack.tsx` (step-3 zero-owned fallback) so
// fans see the same bullets in the mail and in the player.
export const WELCOME_BACK_WHATS_NEW: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "A real player.",
    body: "Every album you ever bought streams in-app on phone, tablet, and laptop — no more download-zip-and-import.",
  },
  {
    title: "GoodSync™ lyrics.",
    body: "Line-by-line lyrics that scroll with the song, the way fans actually want to read along.",
  },
  {
    title: "Your GoodDeed serial.",
    body: "Your original collectible number carries over, and you can pull a print-ready certificate of provenance any time.",
  },
  {
    title: "Playlists you can share.",
    body: "Mix tracks across albums, give the playlist a cover, and send it to friends with one tap.",
  },
];
