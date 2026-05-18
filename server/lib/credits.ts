// Credits-importer module.
//
// Three responsibilities:
//   1) Extract plain text from a credits document (PDF / .docx / .txt buffer).
//   2) Ask the LLM to read that text against the album's track list and
//      return a structured proposal: people, per-track writers, per-track
//      performers. Nothing is written to the DB here — the caller's
//      `commit` endpoint does that after the admin approves.
//   3) Match each proposed person against existing People rows so the
//      review UI can render "matched / ambiguous / new" pickers.
//
// We deliberately keep this file pure (no DB, no Express). The route
// layer wires it into request/response.

import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Plain-text extraction
// ---------------------------------------------------------------------------

export type CreditsFileFormat = "pdf" | "docx" | "txt";

export function detectCreditsFormat(filenameOrUrl: string): CreditsFileFormat | null {
  // Strip query string before sniffing the extension — Dropbox URLs always
  // carry `?dl=1&rlkey=…` and `.pdf?rlkey=…` would otherwise look like an
  // unknown extension.
  const cleaned = filenameOrUrl.split("?")[0].split("#")[0].toLowerCase();
  if (cleaned.endsWith(".pdf")) return "pdf";
  if (cleaned.endsWith(".docx") || cleaned.endsWith(".doc")) return "docx";
  if (cleaned.endsWith(".txt") || cleaned.endsWith(".md")) return "txt";
  return null;
}

export async function extractCreditsText(
  buf: Buffer,
  format: CreditsFileFormat,
): Promise<string> {
  let text = "";
  if (format === "pdf") {
    // Same dynamic import pattern routes.ts uses for the lyrics importer:
    // pdf-parse's `index.js` tries to load a bundled test PDF at module
    // init which crashes in prod builds; the named export skips that.
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buf });
    const parsed = await parser.getText();
    text = parsed.text || "";
  } else if (format === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: buf });
    text = result.value || "";
  } else {
    text = buf.toString("utf8");
  }
  // Strip NUL + other invalid control bytes that Postgres rejects with
  // "invalid byte sequence for encoding UTF8: 0x00". PDFs occasionally
  // smuggle NULs through pdf-parse and a single one kills row inserts.
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// LLM proposal
// ---------------------------------------------------------------------------

// The role taxonomy we let the LLM emit. Anything outside this list gets
// snapped to "Other" so we don't end up with 14 spellings of "Producer".
export const WRITER_ROLES = ["Composer", "Lyricist", "Producer"] as const;
export type WriterRole = (typeof WRITER_ROLES)[number];

// Album-wide production credits ("Produced by", "Mixed by", "Mastered by",
// "A&R", "Engineered by", "Arranged by"). Distinct from per-track writer
// or performer roles — these apply to the whole album (or "all tracks
// except…") and live in their own `album_credits` table.
export const ALBUM_CREDIT_ROLES = [
  "Producer",
  "Executive Producer",
  "Mixed by",
  "Mastered by",
  "Recording Engineer",
  "Engineer",
  "A&R",
  "Arranged by",
] as const;
export type AlbumCreditRole = (typeof ALBUM_CREDIT_ROLES)[number];

export const PERFORMER_ROLES = [
  "Guitar",
  "Bass",
  "Drums",
  "Keys",
  "Synth",
  "Piano",
  "Violin",
  "Cello",
  "Strings",
  "Horns",
  "Saxophone",
  "Trumpet",
  "Lead Vocals",
  "Background Vocals",
  "Programming",
  "Engineer",
  "Mix Engineer",
  "Mastering Engineer",
  "Recording Engineer",
  "Other",
] as const;
export type PerformerRole = (typeof PERFORMER_ROLES)[number];

export interface ProposalPerson {
  // Tag the LLM uses to refer to this person from the writer/performer
  // rows. Local to one proposal — not stored.
  tag: string;
  name: string;
  // Email pulled from the doc if the person appears with one. Admin
  // can drop these before commit.
  email?: string | null;
}

export interface ProposalWriter {
  personTag: string;
  songTitle: string; // matches a song.title on the album
  role: WriterRole;
}

export interface ProposalPerformer {
  personTag: string;
  songTitle: string;
  role: PerformerRole;
  // Free-form instrument hint ("1973 Martin D-28", "DADGAD"). Today we
  // don't auto-create Instrument rows from the credits doc — that's a
  // separate manual step. We store the hint in trackPerformers.role so
  // the credits surface still reads naturally ("Guitar — 1973 Martin").
  instrumentHint?: string | null;
}

export interface ProposalAlbumCredit {
  personTag: string;
  role: AlbumCreditRole;
}

export interface CreditsProposal {
  people: ProposalPerson[];
  writers: ProposalWriter[];
  performers: ProposalPerformer[];
  // Album-wide production credits (Produced by / Mixed by / Mastered by /
  // engineering / A&R). One row per person+role at the album level.
  albumCredits: ProposalAlbumCredit[];
  // Original full prose preserved verbatim, dropped into albums.linerNotes
  // on commit so anything the AI didn't slot into a row stays readable.
  linerNotes: string;
}

interface ParseInput {
  text: string;
  albumTitle: string;
  trackTitles: string[];
}

const SYSTEM_PROMPT = `You convert free-form album credits / liner notes into structured per-track credit rows.

You will receive:
- The full credits text (prose).
- The album's title.
- The album's exact track list.

Output STRICT JSON with this exact shape:
{
  "people": [{ "tag": "P1", "name": "Full Name", "email": "name@example.com or null" }],
  "writers": [{ "personTag": "P1", "songTitle": "exact track title", "role": "Composer" | "Lyricist" | "Producer" }],
  "performers": [{ "personTag": "P1", "songTitle": "exact track title", "role": <PERFORMER_ROLE>, "instrumentHint": "free text or null" }],
  "albumCredits": [{ "personTag": "P1", "role": <ALBUM_CREDIT_ROLE> }]
}

PERFORMER_ROLE must be one of: Guitar, Bass, Drums, Keys, Synth, Piano, Violin, Cello, Strings, Horns, Saxophone, Trumpet, Lead Vocals, Background Vocals, Programming, Other.

ALBUM_CREDIT_ROLE must be one of: Producer, Executive Producer, Mixed by, Mastered by, Recording Engineer, Engineer, A&R, Arranged by.

Rules:
1. Use ONLY the exact track titles I give you. If the doc says "(except 'Storms')" expand that to per-track rows for every OTHER track on the album.
2. If the doc says "all tracks" or doesn't qualify per-track, emit a row for EVERY track on the album for performer/writer credits.
3. One person per "tag" — reuse the same tag in writers/performers/albumCredits for the same human. Tag format: "P1", "P2", "P3"... Every personTag used MUST appear in the "people" array.
4. If the doc lists an email next to a person, capture it on the person row.
5. Album-wide production credits — "Produced by", "Mixed by", "Mastered by", "Recorded by", "Engineered by", "Executive Producer", "A&R", "Arranged by", "Strings arranged by" — go in "albumCredits", NOT in performers. Emit one albumCredits row per person+role. Examples:
   - "Produced by John Doe" → albumCredits row { personTag: "P1", role: "Producer" }
   - "Mixed by Jane Smith at Studio X" → albumCredits row { personTag: "P2", role: "Mixed by" }
   - "Mastered by Bob Ludwig" → albumCredits row { personTag: "P3", role: "Mastered by" }
   - "Recorded by Alex Lee" → albumCredits row { personTag: "P4", role: "Recording Engineer" }
   - "Arranged by Sarah" → albumCredits row { personTag: "P5", role: "Arranged by" }
6. If a producer is also credited on a SPECIFIC track ("Track 3 produced by X"), emit a writer row with role "Producer" for that song instead of an album-wide credit.
7. "Guitars/bass/synth/programming performed by X" → emit one performer row per instrument (Guitar, Bass, Synth, Programming) for X.
8. Background vocals listed for specific tracks → emit a Background Vocals performer row for each of those tracks per person.
9. Do NOT invent people who aren't in the doc. Do NOT invent tracks.
10. Output ONLY the JSON object, no prose, no markdown fences.`;

export async function proposeCreditsFromText(
  input: ParseInput,
  openai: OpenAI,
): Promise<CreditsProposal> {
  const userPayload = [
    `Album: ${input.albumTitle}`,
    "",
    "Tracks (use these exact titles, in this order):",
    ...input.trackTitles.map((t, i) => `  ${i + 1}. ${t}`),
    "",
    "Credits text:",
    "---",
    input.text,
    "---",
  ].join("\n");

  // gpt-5 / gpt-4o-mini either work fine; use the cheap one — credits docs
  // are short and the schema is forgiving. JSON-mode + low temperature so
  // re-runs are stable for the same input.
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPayload },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The AI didn't return valid JSON. Try again, or simplify the credits doc.");
  }

  // Normalize + filter. We tolerate sloppy LLM output rather than
  // throwing — the admin reviews everything before commit anyway.
  const people: ProposalPerson[] = Array.isArray(parsed.people)
    ? parsed.people
        .filter((p: any) => p && typeof p.tag === "string" && typeof p.name === "string" && p.name.trim())
        .map((p: any) => ({
          tag: String(p.tag),
          name: String(p.name).trim(),
          email: typeof p.email === "string" && p.email.includes("@") ? p.email.trim() : null,
        }))
    : [];

  const trackSet = new Set(input.trackTitles);

  const writers: ProposalWriter[] = Array.isArray(parsed.writers)
    ? parsed.writers
        .filter(
          (w: any) =>
            w &&
            typeof w.personTag === "string" &&
            trackSet.has(w.songTitle) &&
            (WRITER_ROLES as readonly string[]).includes(w.role),
        )
        .map((w: any) => ({
          personTag: String(w.personTag),
          songTitle: String(w.songTitle),
          role: w.role as WriterRole,
        }))
    : [];

  const performers: ProposalPerformer[] = Array.isArray(parsed.performers)
    ? parsed.performers
        .filter(
          (p: any) =>
            p &&
            typeof p.personTag === "string" &&
            trackSet.has(p.songTitle) &&
            (PERFORMER_ROLES as readonly string[]).includes(p.role),
        )
        .map((p: any) => ({
          personTag: String(p.personTag),
          songTitle: String(p.songTitle),
          role: p.role as PerformerRole,
          instrumentHint: typeof p.instrumentHint === "string" && p.instrumentHint.trim() ? p.instrumentHint.trim() : null,
        }))
    : [];

  const albumCredits: ProposalAlbumCredit[] = Array.isArray(parsed.albumCredits)
    ? parsed.albumCredits
        .filter(
          (a: any) =>
            a &&
            typeof a.personTag === "string" &&
            (ALBUM_CREDIT_ROLES as readonly string[]).includes(a.role),
        )
        .map((a: any) => ({
          personTag: String(a.personTag),
          role: a.role as AlbumCreditRole,
        }))
    : [];

  return {
    people,
    writers,
    performers,
    albumCredits,
    linerNotes: input.text,
  };
}

// ---------------------------------------------------------------------------
// Person matching
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface PersonMatchCandidate {
  id: string;
  name: string;
  photoUrl?: string | null;
}

export interface PersonMatchResult {
  // "exact": single existing person with the same normalized name.
  // "ambiguous": multiple existing people share or contain the name —
  //   the UI must let the admin pick.
  // "new": no existing person matches — create one.
  status: "exact" | "ambiguous" | "new";
  candidates: PersonMatchCandidate[];
}

export function matchPersonByName(
  proposed: string,
  existing: PersonMatchCandidate[],
): PersonMatchResult {
  const target = normalizeName(proposed);
  if (!target) return { status: "new", candidates: [] };

  const exact: PersonMatchCandidate[] = [];
  const partial: PersonMatchCandidate[] = [];
  for (const p of existing) {
    const k = normalizeName(p.name);
    if (k === target) {
      exact.push(p);
      continue;
    }
    if (k.includes(target) || target.includes(k)) {
      partial.push(p);
    }
  }

  if (exact.length === 1) return { status: "exact", candidates: exact };
  if (exact.length > 1) return { status: "ambiguous", candidates: exact };
  if (partial.length > 0) return { status: "ambiguous", candidates: partial };
  return { status: "new", candidates: [] };
}
