---
name: Side-file masters + press gap spec
description: How the inter-track gap spec and per-side master files feed the vinyl side-length preflight; measurement timing and null-vs-empty semantics.
---

**Rule:** The press inter-track gap spec (`press_audio_specs.inter_track_gap_seconds`, resolved via `resolveAudioSpec` — operator-entered only, never seeded/fabricated) must fold into EVERY surface that shows or judges a side's runtime: the preflight side-length check AND the VinylOrderPanel per-side readout, with identical math (gap × (tracks − 1)). No gap spec ⇒ byte-identical legacy results (pinned by test).

**Why:** A PMP customer's sides passed the gap-free sum but came out too long once the press cut its 20s gaps. A check and a display that disagree make operators trust the wrong one.

**How to apply:**
- Side master files (one file per side, `album_side_masters`, unique album+side) are measured ONCE at attach time: streamed to tmp → ffprobe duration + full-file `silencedetect=noise=-50dB:d=1.0` (no `-t` cap). Preflight consumes stored values only — never re-probe on the preflight path.
- Silences semantics: `NULL` = scan failed → honestly omit the gaps row entirely (never fake "no gaps"); `[]` = scan ran, none found. Attach 422s if ffprobe can't read a duration.
- Lead-in/run-out silences are trimmed (edge ±0.5s) before gap judgment; missing-track heuristic = deficit matches any single track within max(10s, 25% of that track); duration tolerance max(8, 2×trackCount)s.
- Side files ride the background upload manager's audio sign→PUT pipeline but SKIP finalize (no transcode/ACL flip; server probes the private object). The upload manager's `side-master` batch kind advances stage put→create directly.
