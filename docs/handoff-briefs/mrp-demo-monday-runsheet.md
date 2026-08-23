# MONDAY DEMO RUN-SHEET — live MRP demo (Bill presents Monday Aug 24)

**This is the point of everything shipped this week.** Bill demos LIVE to
Memphis Record Pressing on Monday, on memphis.makesvinyl.com + the press
portal. Three flows, in order. Per STATUS.md most of this is already live —
this sheet is the gap list, in priority order. Bill's direction: this goes OPERATIONAL ASAP — start now, work the gap
list top-down, and flag anything at risk the moment you know, not later.

## Flow 1 — MRP creates a Package
Press portal: Components -> (vinyl builder, live) -> Packages -> package
builder -> price list.
- GAP CHECK: confirm package creation is demo-clean under the MRP skin
  (no dead rails, no "quote" wording, no placeholder prices — honest gaps
  only). Reference mocks: PressPackageBuilder / PressPackagesIndex.

## Flow 2 — Estimate -> artist -> production loop (the money demo)
Live already per STATUS: estimate builder from Components->Pricing rows,
estimate email, /e/:token page, Start-this-project + account creation,
next-steps file upload.
- **TEST MODE (Aug 22)** — Stripe payment moment: "You owe / Pay $X" is live on the accepted estimate page (/e/:token/accepted) for Converted estimates; card checkout in Stripe test mode, amount server-derived, Paid state + press-side Paid chip. GAP text follows for reference: **Stripe payment moment.** Artist pays their press bill from the
  portal (Billing model: "You owe." / "Pay $X" — Card or bank transfer,
  securely handled by Stripe). If real charges can't be live by Monday, a
  Stripe TEST-mode checkout is fine for the demo — but the tap must work.
- **READY TO TEST (Aug 22)** — MRP-side download: press-only Downloads sub-tab in the project view (finished print files per component + all-print-files, per-track master originals + all-masters ZIP, honest empty/health states). GAP text follows: **MRP-side download.** The press sees the converted project and
  downloads the finished template + music files from their end.
- **LIVE ON DEV (Aug 22)** — PQ sheet: online tokenized sheet at /pq/{token} (tap-to-play for Mux-ready tracks, honest side-length verdicts, artist confirmations never pre-ticked) + two-page PDF twin; "PQ sheet" entry under Physical → Audio in the press portal. GAP text follows: **PQ sheet** (handoff/pq-sheet/, pushed Aug 22): online cutting-
  master sheet with tap-to-play + Download PDF twin. This is the flow-2
  closer for their mastering folks. If playback can't land by Monday,
  ship the sheet + PDF without play and say so.
- Wave mastering label: **LIVE (removed)** — callout deleted from the artist
  release page (Aug 22). Needs the prod publish to show on the live domain.

## Flow 3 — MRP invites an artist to self-service
MRP adds an artist by Spotify link + email (and/or manager/team members);
artist receives the branded invite and starts on their own.
- GAP CHECK: is the invite send live end-to-end on the white-label host?
  Reference mock: PressArtistInviteMRP.

## Demo hygiene (all flows)
- Demo data: one clean press account (Memphis) + one clean artist
  (CALIFORNIALAND / Niina Soleil, NS-001 — matches the live Side Breaks
  page). No test junk in lists.
- Emails while testing: route ALL demo/test sends (invites, estimate
    emails, receipts) to Bill's and Andrew's own addresses — they will test
    the full loop themselves this weekend. Swap recipients to Brandon and
    the real MRP contacts only at go-live, not before. (The existing
    PRESS_ESTIMATE_REVIEW_RECIPIENT redirect is the right mechanism — keep
    it pointed at Bill/Andrew for now.) Bill must be able to show the
    emails in the room Monday.
- Client-only work needs a prod publish to show on the live domain —
  publish before Monday, not Monday morning.

**Update this file (or STATUS.md) as each line lands: LIVE / TEST MODE /
NOT READY. Bill and Andrew are testing the full loop with their own
emails as pieces come online — the sooner a line flips, the sooner it
gets tested.**


    ## Design guardrails (from Bill)

    - **No unapproved design.** Do not invent new layouts, colors, or patterns.
    The style guide at `handoff/style-guide/apple-canon.md` is the source of
    truth for every screen. When a screen needs design that the canon or a
    handoff doesn't cover, flag it — don't improvise.
    - **Cleanup pass, not creation:** bring existing screens up to canon —
    the artist portal, the super-admin, and anywhere else that predates the
    canon. Charcoal admin (never navy), one filled action per page,
    sentence-case headings, word + icon statuses (never color alone),
    "estimate" never "quote", commas in dollar amounts.
    - **MRP pricing must be viewable and connected end-to-end:** super-admin
    can open Memphis's pricing (per `handoff/admin-pricing-setup/`), see
    which components have prices on file, and trace how those exact rows
    feed the estimate builder. No orphaned prices, honest "no price on
    file" gaps.
    

    ## Loading / splash screen fix (from Bill, pre-Monday)

    Bill sees a blueish full-screen flash with the GoodTunes logo when moving
    between screens — in super-admin dark mode, as an artist, and as MRP.
    Two rules for that interstitial:

    1. **It must respect the surface's theme.** In dark surfaces (super-admin,
     press portal dark) the loading screen is charcoal — the same background
     the destination screen uses. Never the blue/navy flash. Light surfaces
     get the light background. The rule is: the loading state should be
     invisible as a "different screen" — same background, thin sweep
     progress bar at the top, no logo card, no color change.
    2. **White-label surfaces show the white-label brand, not GoodTunes.**
     On memphis.makesvinyl.com and any press/client-facing white-label page,
     a branded interstitial (if one shows at all) uses that press's logo
     (MRP), never the GoodTunes logo. GoodTunes branding on a white-label
     surface breaks the whole white-label promise. Prefer no logo at all —
     just the themed background + sweep bar.

    This one matters for Monday: the flash happens exactly while Bill is
    navigating in front of the room.
    

    ## Stale "GoodTunes Shopify+" option (from Bill, pre-Monday)

    The live admin album page (admin.goodtunes.music) still shows a
    "How is this album being sold?" modal with THREE options:
    GoodTunes Direct / Shopify store / **GoodTunes Shopify+**.

    GoodTunes Shopify+ was retired — the approved model is TWO options only:

    - **GoodTunes Direct** — we press, sell, fulfill.
    - **Shopify store** — label/artist fulfills.

    Remove the GoodTunes Shopify+ card from this modal and anywhere else it
    still appears (onboarding, Sell tab, any switcher). Also check copy in
    the remaining two cards against the current approved wording — this
    modal looks like the older flow generation, and "Quote" appears in its
    copy ("Quote + Path-to-press unlocks") — canon says "estimate", never
    "quote".
    

    ## Stale "Pick the physical format" modal (from Bill, pre-Monday)

    Same album page, next step: the "Pick the physical format" modal offers
    five cards — Single LP / Double LP / 7" Vinyl / Cassette / CD. That's
    the old flow. The current model is THREE formats:

    - **Vinyl**
    - **Cassette**
    - **CD**

    Size and disc count (12" vs 7", single vs double LP) are choices INSIDE
    the vinyl builder — they're component options with their own pricing
    rows, not top-level formats. Collapse the modal to the three format
    cards and let the builder handle the rest.

    Copy check here too: the modal subtitle says "Sell-tab quote flow" —
    "estimate", never "quote".
    

    ## Artist Assets tab issues (from Bill, pre-Monday)

    Viewing-as-artist (Niina) → release → Assets → Vinyl → Audio:

    1. **CRITICAL — "No tracks yet" with no way to upload.** The artist sees
     an empty vinyl-audio list and no upload control. The artist uploading
     music is the heart of flow 2 — this page needs an obvious upload path
     (or a clear pointer to wherever upload actually lives). If upload is
     press-side only by design, the empty state must say who provides the
     tracks and what happens next — never a dead end.
    2. **"Master with Wave" is still here.** This is the exact spot the Wave
     removal needs to hit: the "Master these for vinyl with Wave" banner +
     "→ Master with Wave" button, and the "…until Wave prepares a vinyl
     cut" line in the intro copy. Wave doesn't exist yet — remove all of it.
    3. **Artist can add asset sets?** The "+" next to the
     Master / GoodTunes® Player / Vinyl tabs is visible to the artist.
     Creating new asset sets looks like an operator action — the artist
     shouldn't see that "+" (confirm intended permissions; Bill believes
     artists shouldn't add asset sets here).

    Also canon nits on this page while it's open: "Vinyl audio." heading has
    a trailing period — headings don't end in periods.
    

    ## GoodTunes® Player audio tab — same dead end (from Bill)

    Same release, Assets → GoodTunes® Player → Audio: "No tracks yet" with
    no upload path, same as the Vinyl tab.

    If the intended flow is that the artist uploads masters once on the
    **Master** tab and the Player/Vinyl sets reference them, then these
    empty states must SAY so and LINK there. Apple-canon empty state,
    something like:

    > **No tracks yet**
    > Player audio uses your album masters. Upload them once and they
    > appear here automatically.
    > Upload masters → *(link to the Master tab)*

    Same treatment on the Vinyl audio empty state (minus the Wave copy,
    which is being removed). Rule: an empty state always says what fills it
    and gives the one link that gets you there — never a bare "No tracks
    yet."

    Heading nit here too: "GoodTunes® Player audio." — no trailing period
    on headings.
    

    ## CRITICAL — Master tab has no upload either (from Bill)

    Assets → Master → Audio, viewing as the artist: "No tracks yet." and NO
    upload control. Combined with the previous two notes, this means the
    artist has **no way to upload music anywhere** in the release Assets
    area — Master, GoodTunes® Player, and Vinyl are all dead ends. The
    Master tab is supposed to be the one place masters come in ("Your
    canonical album masters" per its own copy).

    Fix, top priority for flow 2:

    - The Master → Audio empty state gets a real **Upload masters** action
    (filled button — this is THE action of the page) with drag-and-drop
    and file picker. After upload, Player and Vinyl inherit automatically,
    per their empty-state copy.
    - If upload exists somewhere else (next-steps page on the white-label
    side?), it must ALSO exist here — the artist landed here looking for
    it, which is proof enough of where it belongs.

    Heading nit again: "Master audio." — no trailing period.
    

    ## Details tab — "Editing: 🔒 Open" contradiction + no editing (from Bill)

    Release → Details tab, viewing as the artist:

    1. **"Editing — 🔒 Open" contradicts itself.** A lock icon next to the
     word "Open" reads as the opposite of open. Status = word + icon that
     AGREE (canon: never rely on color, and never let the icon fight the
     word). If editing is open: open-padlock or pencil icon + "Open".
     If locked: closed padlock + "Locked". Two honest states, no mixes.
    2. **It says Open but nothing is editable.** Every row on this Details
     page (title, year, catalog number, UPC) is read-only — no edit
     affordance anywhere. Either make the rows actually editable when
     editing is Open (tap a row to edit is fine), or the status is lying.
     Empty fields showing "—" should invite the artist to fill them in
     when editing is open (e.g. "Add year").

    Heading nit: "Details." — no trailing period. (Same pattern as the
    Assets headings; sweep all these page headings at once.)
    

    ## Tablet: album art slides over the quantity cards (from Bill)

    Press portal → MRP Packages → the "Pick a quantity" section. The album
    mock uses "hover to slide the sleeve and record out." On iPad there is
    no hover — a TAP triggers the slide, and the record slides right out of
    its container and over the quantity price cards.

    Fix:

    - On touch devices, the slide-out must stay inside its own bounds —
    clip/contain the animation so it can never overlap the quantity cards
    (or any neighboring content) at any viewport width.
    - Reconsider the trigger on touch: hover doesn't exist on iPad, and
    Bill is demoing ON an iPad Monday. Either make tap an explicit toggle
    that animates within bounds, or disable the slide on touch and show
    the composed sleeve+record state statically.
    - Sweep the same hover-to-slide pattern anywhere else it's used
    (estimate pages, package views) for the same overflow on touch.

    Also note the copy under it says "hover to slide…" — on touch that
    instruction is wrong; it should adapt (e.g. "tap to slide") or vanish.
    

    ## iPad portrait: rail crushes the page (from Bill)

    Rotating the iPad to portrait on the MRP Packages page makes everything
    janky: the fixed left rail keeps its full width, so the content column
    gets crushed — captions wrap one word per line ("Memphis / Record /
    Pressing / house / artwork / by / default…"), section headings slide
    under the rail and get clipped ("…a quantity." with the first word cut),
    the sticker/insert grids squeeze, and the sleeve/record art overlaps the
    rail edge.

    Bill's direction — pick one of these (both are fine, first is simpler):

    1. **Portrait hides the rail.** Below a width breakpoint (portrait iPad
     and down), the rail collapses away and the content takes the full
     width. A standard sidebar toggle icon at the top-left (the same
     panel-collapse glyph Apple and everyone use — same icon family we
     already use in the press shell) brings it back.
    2. **Rail floats over content, Apple-style.** The rail becomes an
     overlay layer with translucent blurred material (so you can see the
     page behind it), collapsible via the same top-left toggle. Content
     lays out at full width underneath.

    Either way, the content column must never be narrower than its layout
    can handle — if the rail is visible and space is tight, the rail gives
    way, not the content. Apply the same rule to super-admin and the artist
    portal rails; test portrait AND landscape on iPad since Bill demos on
    one Monday.
    