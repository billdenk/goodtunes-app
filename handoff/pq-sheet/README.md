# Handoff — PQ sheet (cutting master), online + PDF twin

**What this is:** the PQ / cutting-master sheet for the press's audio
mastering team — the Viryl "Vinyl mastering cue sheet" and the VRMA
cutting-master page merged into ONE living surface, plus its print twin.
Two mocks, both verbatim-replacement (handoff law: copy layout, states, and
copy exactly; swap MOCK_ consts for live data; self-contained files):

- PressPQSheetMRP.tsx — the ONLINE sheet. iPad-first, chrome-free token
  view (memphisvinyl.com/pq/{token}) for the mastering bench; the same
  sheet also lives under the project inside the press portal (with rail).
- PressPQSheetPdfMRP.tsx — what "Download PDF" produces. Two US-letter
  pages, same paper grammar as the estimate PDF: letterhead + thin blue
  rule, meta, artist confirmations, Side A (p1); Side B, LP reference
  ladder, mastering notes & run-out scribing, cutting-engineer sign-off,
  footer with the "listen online" token link (p2).

## Must work
- [ ] Sheet is generated from the project's uploaded masters + details:
      real track titles, file names, durations; start-end times computed
      with the chosen gap; catalogue/matrix from the release (NS-001 shape,
      matching the live Side Breaks page).
- [ ] Every track row PLAYS the uploaded master on the online sheet.
      Play control = circled hairline button, filled blue + white pause +
      "Now playing" word when active (word + icon, never color alone).
- [ ] Honest side-length verdicts vs the reference ladder for the format
      (album LP: 17 min loud / 20 average / 25 lower). Over-average says
      "expect a slightly quieter cut"; over-lower says "talk to the artist
      before cutting". Word + icon, check/triangle.
- [ ] Artist confirmations (lossless, consistent levels, approved masters)
      carry from the artist's submission — never pre-ticked by the press.
- [ ] ONE filled action on the online sheet: Download PDF. The PDF has no
      play buttons; its footer links back to the online sheet to listen.
- [ ] Token link works signed-out (same model as estimate links).

## Consistency sweep (goes with this work)
- [ ] Upgrade the existing Side Breaks (Physical > Audio) and Digital
      Tracks pages to the same apple-canon grammar as these mocks — one SF
      family, circled play control, quiet hairlines. Bill wants all three
      surfaces to read as one product.
- [ ] REMOVE the "Wave mastering" label currently live in the app — wave
      mastering does not exist yet and must not be shown (Bill, Aug 22).

## Acceptance bar
A mastering engineer with an iPad and a token link can read everything the
two paper forms held, tap-play every master, trust the side-length verdicts,
and hand a signed printed PDF to the lathe — with no page looking like it
came from a different app.
