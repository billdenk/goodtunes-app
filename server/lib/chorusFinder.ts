// AI chorus finder.
//
// The deterministic `[Chorus]`-marker path lives on the client
// (findChorusStartMs in AdminAlbum.tsx) and is the cheap first tier. This
// module is the *fallback* for tracks whose lyrics carry no section labels
// at all (LRC / Apple / plain-text / Dropbox imports). It takes the
// time-aligned GoodSync™ cues (and the raw lyrics if present) and asks the
// LLM which cue line the chorus/hook begins on, then maps that answer back
// to a real cue timestamp.
//
// Design rules:
//   - Best-effort, never-throw. Any failure (no AI configured, malformed
//     JSON, out-of-range index, low confidence) resolves to `null` so the
//     caller leaves the preview untouched rather than guessing.
//   - Pure: no DB, no Express. The route layer wires it in.

import type OpenAI from "openai";

export interface ChorusCue {
  timeMs: number;
  text: string;
}

// Keep the prompt tight: cap how many cues we ship the model so a very
// long track (or a transcription that split every word onto its own line)
// can't blow up cost/latency. The chorus on a pop song almost always lands
// inside the first ~120 sung lines; this is a generous ceiling.
const MAX_CUES_SENT = 160;

const SYSTEM_PROMPT = [
  "You are a music editor. You are given the time-aligned lyric lines of a",
  "single song, each with an index. Identify the line where the CHORUS",
  "(the main repeated hook / refrain) FIRST begins.",
  "",
  "Rules:",
  "- Return the index of the FIRST line of the FIRST chorus, not a verse,",
  "  intro, or pre-chorus.",
  "- The chorus is the section that repeats later with the same words and is",
  "  usually the catchiest / title-bearing part.",
  "- If you cannot confidently identify a chorus, return null for the index.",
  '- Respond ONLY with JSON: {"chorusLineIndex": <number|null>, "confidence": <0..1>}',
].join("\n");

// Returns the cue index where the chorus begins, or null when the model
// can't decide (or anything goes wrong). Never throws.
export async function findChorusCueIndex(
  cues: ChorusCue[],
  lyrics: string | null | undefined,
  openai: OpenAI,
): Promise<number | null> {
  try {
    // Only sung lines are addressable targets. We still send the raw lyrics
    // separately (if present) as context, but the index the model returns
    // must map onto the cue array, so we number the cues themselves.
    const usable = cues
      .map((c, idx) => ({ idx, text: (c.text || "").trim() }))
      .filter((c) => c.text.length > 0)
      .slice(0, MAX_CUES_SENT);
    if (usable.length < 4) return null;

    const lines = usable.map((c) => `${c.idx}: ${c.text}`).join("\n");
    const userPayload = [
      lyrics && lyrics.trim()
        ? `Raw lyrics (for context only):\n---\n${lyrics.trim().slice(0, 4000)}\n---\n`
        : "",
      "Time-aligned lines (index: text):",
      lines,
    ]
      .filter(Boolean)
      .join("\n");

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
      return null;
    }

    const confidence =
      typeof parsed?.confidence === "number" ? parsed.confidence : 1;
    if (confidence < 0.5) return null;

    const idx = parsed?.chorusLineIndex;
    if (typeof idx !== "number" || !Number.isInteger(idx)) return null;
    // The model must point at a real cue with text — never an empty line or
    // an out-of-range index.
    if (idx < 0 || idx >= cues.length) return null;
    if (!(cues[idx]?.text || "").trim()) return null;
    return idx;
  } catch {
    return null;
  }
}
