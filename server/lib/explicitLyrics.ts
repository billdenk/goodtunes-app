// Auto-GoodSync™ explicit-content detector.
//
// Best-effort profanity scan over a track's lyrics, used by the auto-
// GoodSync orchestrator to advisory-flag a song's `isExplicit` after it
// transcribes the master. Apple Music's model: an explicit flag is an
// advisory ("E" pill), not a block — so this only ever proposes setting
// the flag ON, never clears it, and a human can always override.
//
// Design choices (mirrors the spirit of server/certNameModeration.ts but
// tuned for running prose lyrics):
//   • Whole-word match, not collapsed-substring. Lyrics are full sentences
//     where a substring filter would Scunthorpe-flag innocent words
//     ("class", "assassin", "Cumberland"). We tokenize on word boundaries
//     and match a stem against a small unambiguous blocklist, allowing a
//     trailing suffix (plural / -ing / -ed / -er / -s) so "fucking",
//     "bitches", "shitty" still trip.
//   • Small, focused list of strong profanity + slurs. The flag is an
//     advisory the operator can flip off; we err toward catching the
//     obvious cases rather than being exhaustive.
//   • Leet-fold first so "f*ck", "sh1t", "b!tch" still match.

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
  "!": "i",
  "*": "",
};

// Blocked word stems (lowercase, letters only). A trailing inflectional
// suffix is allowed by the matcher, so list the bare stem.
const BLOCKLIST: string[] = [
  // strong profanity
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "asshole",
  "motherfucker",
  "bullshit",
  "dick",
  "pussy",
  "cock",
  "whore",
  "slut",
  // slurs
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "spic",
  "chink",
  "kike",
  "tranny",
];

const SUFFIX = "(?:s|es|ed|ing|er|ers|in|y|az|as)?";
const WORD_RE = new RegExp(
  `\\b(?:${BLOCKLIST.join("|")})${SUFFIX}\\b`,
  "i",
);

// Fold a single line to a lowercase ascii run with leet substitutions
// applied, collapsing the in-word symbols people use to self-censor
// ("f*ck" → "fck"? no — `*`→"" gives "fck", which the suffix-tolerant
// matcher still misses, so we ALSO try the raw lower line). We scan both
// the leet-folded and the plain-lowercased text and OR the results.
function fold(line: string): string {
  let out = "";
  for (const ch of line.toLowerCase()) out += LEET[ch] ?? ch;
  return out;
}

export interface ExplicitScan {
  explicit: boolean;
  // The distinct stems that matched — surfaced into the job-run summary so
  // an operator can see WHY a track auto-flagged (and spot a false
  // positive) without re-reading the lyrics.
  matches: string[];
}

export function detectExplicitLyrics(
  lyrics: string | null | undefined,
): ExplicitScan {
  if (!lyrics || !lyrics.trim()) return { explicit: false, matches: [] };
  const matches = new Set<string>();
  for (const raw of lyrics.split(/\n/)) {
    for (const candidate of [raw.toLowerCase(), fold(raw)]) {
      const m = candidate.match(new RegExp(WORD_RE, "gi"));
      if (m) for (const hit of m) matches.add(hit.toLowerCase());
    }
  }
  return { explicit: matches.size > 0, matches: [...matches] };
}
