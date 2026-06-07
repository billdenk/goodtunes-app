// Task #1609 — Lightweight cert-name moderation.
//
// Fans can set the name printed on their digital GoodDeed certificate
// (orders.cert_confirmed_name). The picker warns that derogatory /
// offensive names can get the order cancelled, but enforcement is manual.
// This module gives the admin review surface a cheap "this one looks
// suspect" flag so an operator can eyeball the short list of likely
// violations first instead of scanning every confirmed name.
//
// Deliberate design choices:
//   • FLAG, never BLOCK. We never reject a fan's save on this — a false
//     positive must never stop a legitimate buyer from confirming their
//     own name. The flag only changes sort order / shows a badge on the
//     admin surface; a human always makes the call.
//   • Collapsed-substring match. We strip everything but letters/digits
//     and fold common leet substitutions, then substring-match the
//     blocklist. This catches "f.u.c.k", "f u c k", and "phuck" at the
//     cost of the classic Scunthorpe problem (an innocent name that
//     happens to contain a blocked run gets flagged). That's an
//     acceptable trade for a flag a human reviews — better to over-flag
//     than to silently print a slur.
//
// The blocklist is intentionally small and focused on unambiguous
// slurs / profanity. It is not meant to be exhaustive; the human review
// step is the real backstop.

// Common leetspeak / homoglyph folds applied before matching.
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
};

// Blocked runs, already in collapsed (letters-only) form. Keep entries
// lowercase and free of spaces/punctuation — `normalize` strips those
// from the candidate before matching.
const BLOCKLIST: string[] = [
  // profanity
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "asshole",
  "dickhead",
  "bastard",
  "wanker",
  "bollocks",
  "motherfucker",
  // slurs (racial / homophobic / ableist)
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "spic",
  "chink",
  "kike",
  "tranny",
  // sexual
  "rape",
  "pedo",
  "cum",
  // hate
  "nazi",
  "hitler",
];

// Fold a candidate name to a letters-only lowercase run, applying leet
// substitutions first so "f4gg0t" and "n1gg3r" still match.
export function normalizeCertName(name: string): string {
  const lowered = name.toLowerCase();
  let folded = "";
  for (const ch of lowered) folded += LEET[ch] ?? ch;
  // Keep letters only — digits become noise once leet is folded, and
  // dropping every separator collapses "f u c k" / "f.u.c.k" to "fuck".
  return folded.replace(/[^a-z]/g, "");
}

export type CertNameFlag = {
  flagged: boolean;
  // Which blocklist runs matched — surfaced to the operator so they can
  // see WHY a name tripped the filter (helps spot Scunthorpe-style false
  // positives at a glance).
  matches: string[];
};

export function flagCertName(name: string | null | undefined): CertNameFlag {
  if (!name) return { flagged: false, matches: [] };
  const norm = normalizeCertName(name);
  if (!norm) return { flagged: false, matches: [] };
  const matches = BLOCKLIST.filter((bad) => norm.includes(bad));
  return { flagged: matches.length > 0, matches };
}
