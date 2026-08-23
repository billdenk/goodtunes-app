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
    

    ## Store tab: wrong-color logo + dishonest checklist (from Bill)

    Release → Store tab, viewing as the artist, on a brand-new empty
    "Test" release:

    1. **GoodTunes logo at an odd color again.** The GoodTunes® Direct card
     shows the logo in a yellowish/odd tint on the dark surface. Bill
     thought this was fixed already. Reminder of the asset rule: only
     dark logo assets exist — on dark surfaces the white version is made
     via CSS invert of the dark asset, never a tinted/recolored variant.
     Sweep every place the logo renders on dark (cards, "Powered by"
     footer, email previews) and fix them all at once, not spot by spot.
    2. **"Getting ready" checklist is lying.** This release has NO artwork,
     NO price, NO audio — yet the checklist shows "Artwork approved ✓"
     and "Price set ✓". Checkmarks must reflect reality: a fresh release
     shows every line unchecked (word + icon, e.g. "Artwork — not started")
     with each line linking to where you complete it. A checklist that
     pre-approves nothing-yet destroys trust in every status in the app —
     audit where these flags come from, because if they default to true,
     other status displays may be wrong too.
    

    ## Vinyl art cards: double status pills look bad (from Bill)

    Assets → Vinyl → Art, artist view. Each piece card (Cover · jacket,
    Center labels, Printed inner sleeve) stacks TWO status pills:
    "Using album art" AND "Waiting for art". Problems:

    - Two statuses on one card contradict each other — is it using album
    art, or waiting for art? One card = ONE status line (word + icon).
    - On a release with no album art at all (this one), "Using album art"
    is false anyway — there's nothing to use. Same dishonest-default
    problem as the Store checklist.
    - The big empty card area is just a cloud glyph — it should be the
    upload target and say so.

    Fix per canon:

    - One status per card, honest to actual state:
    - No album art + no piece file → "Waiting for art" only.
    - Album art exists, no piece file → "Using album art" (and show the
      art in the card, not a cloud glyph — that's the proof).
    - Piece file uploaded → "Custom art uploaded".
    - Card body = tappable upload target ("Drop file or tap to upload" on
    the empty state), sized to the press template's aspect ratio.
    - Heading nit: "Vinyl art." trailing period (same sweep as before).
    

    ## Template editor: bright white stage in dark mode (from Bill)

    Assets → 12" single jacket → "Add your art" editor, Front panel
    selected: the whole preview area below the panel tabs is a huge bright
    white box on the dark surface — jarring, and most of it is empty white
    on either side of the template strip.

    Fix:

    - The stage AROUND the template renders dark gray/charcoal in dark
    mode — the white box should never bleed edge to edge.
    - The template itself can stay light where that's honest (it represents
    the physical print file / paper), but render it as a contained
    "sheet" at its own aspect ratio, centered on the charcoal stage with
    a subtle edge — like a document preview — not a full-width white
    slab.
    - If the template asset has transparent or empty margins, those pick up
    the stage color, not white.
    - Check the other panels (Back, Spine, Full template) and other piece
    editors (labels, inner sleeve) for the same white-stage problem.
    

    ## Settings → Connections: dead taps on Shopify + Payout (from Bill)

    Artist Settings → Team and connections:

    1. **Both connection rows are dead ends.** Tapping the Shopify row
     ("Not connected") does nothing, and tapping Payout account's
     "Set up →" also does nothing. A row that shows a chevron/"Set up"
     affordance MUST go somewhere. Payout is the more serious one — an
     artist who can't set up a payout account can't get paid. Wire both
     flows, or if a flow isn't built yet, the row must say so honestly
     ("Coming soon" style, no chevron, not tappable) rather than
     silently ignoring taps.
    2. **Should the Shopify row/logo be here at all?** Bill recalls the
     Shopify logo being removed. Note the current model: GoodTunes
     Shopify+ is retired, but "Shopify store" (artist/label fulfills)
     is still a valid sell model — so an artist-level Shopify connection
     may still be legitimate. Otis: confirm with Bill/Ruby whether the
     artist Settings Shopify row (and the "Shopify" item in the artist
     nav rail) should stay. Don't remove without confirmation, but don't
     leave it dead either.

    Heading nit: "Settings. Team and connections." — trailing periods
    again (same global sweep).
    

    ## Super-admin release page: pre-canon look + phantom save toast (from Bill)

    Super-admin → Catalog → Projects → an artist release:

    1. **Whole page is the old look and feel.** Split shipments, SPIN Promo,
     Email appearance, Share link — dense pre-canon sections, purple
     accent glyphs, raw hex codes inline ("#1D5E8F (default)"), stacked
     upload boxes. This page is squarely in the canon cleanup pass
     (per the "Design guardrails" section above): charcoal admin canon,
     one filled action per section, sentence case, no raw hex in UI copy
     (show a color swatch + name; hex belongs in a detail/edit control).
     Don't invent new design — apply the canon grammar; flag anything the
     canon doesn't cover.
    2. **Phantom "Album URL saved." toast.** Bill touched nothing and got
     an "Album URL saved." toast on page load/scroll. A save toast firing
     without a user save means something is writing on load (autosave on
     mount?) — that's a data-integrity smell, not just noise. Find why it
     fired; save confirmations only appear when the user actually changed
     something. Also: toast copy should not end in a period per canon
     short-label rules.
    

    ## GoodDeed® Certificates pricing page — stray media player (from Bill)

    Press portal → Product Specs → GoodDeed® Certificates: scrolling down
    past the Finishing section, a floating AUDIO/MEDIA PLAYER control
    (play button, scrubber, 02:35/-00:54, AirPlay glyph) appears at the
    bottom center of the page. Nothing on this page should be playing
    media — find where that player comes from and remove it (leaked
    component? global player rendering on the wrong page?).

    Otherwise this page follows the intended grammar (honest "0 of 5
    priced" counter, rates-are-between-you-and-GoodTunes footnote).
    DECIDED (Bill, Aug 22): the $/unit fields get "typical range" hints —
    reference only, NEVER prefilled. Spec:

    - Ghost text inside/under each empty field: "Typical: $X.XX–$X.XX",
    one range per batch tier, declining as tiers grow (same shape as the
    package quantity ladder).
    - It's a hint, not a value: the field still reads as empty, "0 of 5
    priced" stays honest until MRP types real numbers, and the hint
    disappears once a price is entered.
    - The hint never submits, never becomes a default, and is never shown
    to artists (rates stay between the press and GoodTunes).
    - The actual range numbers come from GoodTunes (Bill/Andrew will
    supply them) — ship the mechanism with the numbers configurable
    per service, don't hardcode guesses.
    - Same pattern applies to the Finishing (holograms + shrinkwrap)
    pricing when that section is on.
    

    ## Connections rows: logos (from Bill, follow-up to dead-taps note)

    On artist Settings → Connections, each row carries its service's logo
    in white (dark surface): Shopify row = white Shopify logo (already
    there), and the **Payout account row = white Stripe logo** — payouts
    run on Stripe (Connect), so say so: subtitle "Powered by Stripe" style,
    logo + wordmark treated the same way as Shopify's. Same white-logo
    rule anywhere else connections appear.
    

    ## DECIDED — Shopify row & rail item (Bill deferred to Ruby, apple-canon)

    - **Settings → Connections: Shopify row STAYS** — "Shopify store"
    (artist/label fulfills) is still a valid sell model, so the
    account-level connection is legitimate. Wire it (no dead tap), white
    Shopify logo per the connections-logo rule above.
    - **Artist nav rail: remove the top-level "Shopify" item** for now.
    Canon keeps the rail minimal; a nav item duplicating a Settings
    connection is clutter. If/when a real Shopify management surface
    exists (orders sync, store status), it can earn a rail spot — until
    then, the Settings row is the single home.

    ## DECIDED — Billing tab is the pay-moment canon

    Bill approved Ruby's Billing tab mock. It's in
    `handoff/billing-tab/` (README + ArtistBillingTab.tsx) — restyle the
    "You owe / Pay $X" moment to it per that README's Must-work list.
    

    ## Super-admin album Physical → Art page: look-and-feel cleanup (from Bill)

    Super-admin → album (CALIFORNIALAND) → Physical → Art. The substance is
    right (honest "Not ready to send — 2 blockers" with real measured
    reasons, per-piece cards, Download all artwork) — keep all of that.
    The dress is pre-canon; bring it into the canon cleanup pass:

    - **Status chips**: "WARN" / "× FAIL" pills in yellow/red are shouting
    abbreviations. Canon: word + icon, sentence case — "Needs attention"
    (triangle) / "Failed check" (x-circle). Never color alone, and FAIL/
    WARN aren't words we show artists or partners.
    - **Blocker banner**: the pink slab reads harsh; use the canon callout
    grammar — quiet surface, icon + "Not ready to send" title, blocker
    lines beneath (content is already good and honest — keep the measured
    detail like the 0.147" bleed number).
    - **Tab rows**: colored dot bullets before Overview/Package/Digital/…
    aren't canon; tabs are plain text with the active underline. Same for
    the second row (Audio/Art/Fulfillment).
    - **"Open test view (temporary)" underlined links** — arrows only on
    links per canon (→), no bare underlines, and "(temporary)" shouldn't
    ship in UI copy.
    - Dense micro-type throughout (12px caps rows, cramped meta line under
    the title) — apply canon type scale and spacing.
    - Keep: per-piece card layout, real artwork previews, honest empty
    sleeve-PDF placeholder, "Download all artwork" as the one filled
    action top right.
    

    ## Physical → Fulfillment + Audio (Side Breaks): same canon pass (from Bill)

    Same album, two more Physical sub-pages for the same cleanup:

    **Sub-tab treatment (Bill's direction, applies to all Physical pages):**
    the Audio / Art / Fulfillment row should be a **segmented control — one
    fully-rounded rect containing the three segments** (same pattern as the
    artist Assets Master / GoodTunes® Player / Vinyl pill), not three loose
    icon+label links. Active segment filled, inactive quiet. Drop the little
    icons in front of each label. Same goes for the colored-dot main tab
    row noted in the previous section.

    **Fulfillment tab:**
    - ALL-CAPS micro headers ("FULFILLMENT DESTINATION", "CONTACT",
    "CUSTOMERS SEE") → canon sentence-case section titles.
    - The yellow/red "Split shipments are configured on the Overview tab…"
    strip → canon quiet callout (icon + text), not an alarm-colored bar;
    it's information, not an error.
    - Raw `<select>` dropdown and bare input get the canon field dress.
    - Substance is fine (destination, contact w/ edit pencil, customers-see
    default) — keep it.

    **Audio → Side Breaks:**
    - Already flagged as the PQ-sheet companion sweep — this screenshot
    confirms it's still the old dress. Same grammar as the PQ sheet:
    canon type, no "✓ PASS" chip (word + icon, sentence case — e.g.
    "Within limits ✓"), quiet side headers.
    - The row grammar (drag handles, #, title, duration, side caps
    17:59 / 22:00 max) is right — dress only.
    - Buttons top right (PQ sheet / View Masters / Download all masters):
    ONE filled action max; the rest hairline.
    

    ## Payments tab: same canon pass + "quote" wording (from Bill)

    Same album, Payments tab — same cleanup family, plus a wording strike:

    - **"Quote" everywhere.** Section header "Quotes", "Upload quote PDF",
    "$ Total (no active quote total)", "The quoted figure is…" — canon is
    "estimate", never "quote", in every surface including admin. Rename
    the section, buttons, and helper copy (Estimates / Upload estimate
    PDF / "no active estimate total" / "The estimated figure…").
    - **Chips and pills:** "Paid" chip, "Held — release pending →" pill —
    word + icon per canon; the arrow only if it's actually a link. The
    blue selected "Artist pays GoodTunes" / quiet "GoodTunes pays from
    sales" funded-by pair should be the same segmented-control pattern as
    the Physical sub-tabs (one rounded rect, two segments).
    - **Money summary row** (Quoted / Paid / Outstanding): keep the honest
    three-figure grammar; dress with canon type. Green paid figure —
    remember color is never the only signal.
    - **One filled action per section:** "Request payment", "Pay vendor",
    "Close out run" all compete; keep the section's true primary filled,
    the rest hairline ("Close out run" reads destructive — hairline with
    confirm).
    - ALL-CAPS/micro headers and raw selects ("Choose…", "$ Total") get the
    same field dress as the Fulfillment tab note.
    - Substance keep: staged payments to plant, held-until-release states,
    vendor payout ledger with dates, "Reversible." honesty.
    

    ## Customers tab: same canon pass (from Bill)

    Same album, Customers tab:

    - **The two comped-access cards render as light-gray slabs on the dark
    surface** — jarring theme break (same family as the template editor's
    white stage). Cards use the dark card surface like everything else.
    - ALL-CAPS micro headers ("TOTAL ORDERS", "DISTINCT FANS", "GROSS
    REVENUE", "COMPED & FREE ACCESS") → canon sentence case.
    - "COMP" chip → word + icon, sentence case ("Comped copy").
    - "Create a preview link →" — arrow on a link is right; keep, but style
    as canon link.
    - Keep the substance: honest zeros on the stat cards, honest "No
    customers yet." empty state, comped access counted separately from
    revenue ("These don't count toward revenue" line is exactly the right
    honesty).
    

    ## Early access tab: same canon pass (from Bill)

    Same album, Early access tab:

    - **TWO filled blue buttons on one page** ("Send early access email"
    and "Announce to 15") — canon is ONE filled accent action per page.
    "Announce to 15" is the real primary here; "Send early access email"
    goes hairline (and it's acting on an empty waitlist — it should be
    disabled with an honest reason while signups are 0).
    - ALL-CAPS micro headers ("TOTAL SIGNUPS", "NOTIFIED", "CAME BACK",
    table header row) → canon sentence case.
    - Keep the substance — it's good: honest zeros, "No signups yet.",
    the two-audience explanation (waitlist vs new-music list), one-tap
    unsubscribe note, and the "announced to this list only once"
    double-send protection is exactly the right honesty. Dress only.
    

    ## Overview tab: HOLD — redesign coming from Ruby (from Bill)

    The album Overview tab needs real reorganization, not just the canon
    dress pass — Bill and Ruby are designing it together. **Don't
    canon-sweep this tab yet**; a mock + handoff will follow. (Everything
    already on it — release dates, streaming links, metadata, split
    shipments, SPIN legacy, email appearance, share link, lineup, campaign
    gallery, NPO split — stays functional in the meantime.)
    

    ## Catalog list page: HOLD — Bill + Ruby working it (from Bill)

    Super-admin → Catalog → Projects opens a page titled "Albums" — the
    rail says Projects, the page says Albums, the button says "+ Add
    Album". Naming has to agree with itself (and with the artist-side
    Release → Draft → Project language). Bill and Ruby are redesigning
    this page together along with the album Overview tab — **hold it for
    the same reason** (organization + look-and-feel, not just dress).
    Keep the good bones meanwhile: lifecycle filter chips with honest
    counts (Prepping 12 / At press 1 / Staged 0 / Released 2 / Sunset 57 /
    Needs attention 68), grid/list toggle, one filled "+ Add" action.
    

    ## Artist Vinyl → Art: ragged card heights (from Bill)

    The three art cards (Cover · jacket / Center labels / Printed inner
    sleeve) each size themselves to their artwork's aspect ratio, so the
    cards end at three different heights and the captions float at three
    different altitudes — the empty inner-sleeve drop zone is the tallest
    thing on the row.

    **Fix:** uniform card grid. Every card gets the same fixed image
    window (artwork fits inside it, letterboxed on the card surface —
    never cropped or stretched), the caption + "Custom art uploaded ✓"
    row pins to a shared baseline, and the empty drop-zone card is
    byte-identical in size to a filled card. One row, one height.

    **Confirmed while here:** the "+" add-format chip next to
    Master / GoodTunes® Player / Vinyl STAYS — the earlier decision was
    to trim the modal behind it to three cards (Vinyl / Cassette / CD,
    size picked in the builder), not to remove the entry point.
    

    ## SITE-WIDE: page layout & type canon (from Bill — spotted on Vinyl audio, applies everywhere)

    The Vinyl → Audio track list shows the same disease as several other
    pages, so fix it as ONE law across the whole app, not per page:

    - **Centered content column, equal left/right margins.** Every content
    page lays its column with a max width and auto side margins — content
    never hugs the left edge with all the spare width dumped on the right.
    - **Heading rhythm.** Page title gets canon scale + breathing room above
    and below (title, then subtitle line, then a real gap before content —
    "Vinyl audio" and its subtitle currently sit cramped on top of the
    list).
    - **Row breathability.** List rows (tracks here) need taller row height
    and more air between the title line and its meta line
    ("Lacquer master · from your album masters" is nearly touching the
    title, and every row repeats it at whisper size). Consider stating
    shared meta ONCE above the list and keeping rows to what differs
    per row.
    - **Type scale.** Meta/secondary text has drifted too small in places —
    use the canon secondary size, not ever-smaller grays.

    Apply as a shared page-shell/layout component + type tokens so every
    admin and artist page inherits it, rather than page-by-page CSS.
    The mocks Ruby ships (AdminAlbumOverview etc.) show the target grammar.
    

    ## SPIN Promo visibility rule (from Bill)

    SPIN Promo is a legacy marker for artists imported from the old system
    **before Nightbirde**. Visibility law:

    - It appears ONLY on albums belonging to those pre-Nightbirde imports,
    and only in super-admin (in the Overview redesign it lives inside the
    quiet "Legacy settings" disclosure at the bottom).
    - Albums for newer artists never render the control at all — not
    toggled-off, absent.
    - Artists themselves, MRP/press users, and every other role never see
    it anywhere, on any album.
    

    ## GoodDeed typical-range numbers: use the existing printer ladder (from Bill)

    Bill's answer on the GoodDeed range hints you've been waiting on:
    **seed the typical ranges from the ladder we already had for a
    printer** — the current per-tier numbers you already have in the
    system (Bill: "Otis should know"). No new numbers coming; wire the
    ghost hints to that existing ladder. All the earlier rules stand:
    reference only, never prefilled, disappear on entry, artists never
    see them, and Bill/Andrew can adjust the values later.
    If it's ambiguous WHICH ladder that is, ask Bill before wiring —
    don't guess between candidates.
    

## HANDOFF: Album Overview redesign (super-admin) — hold lifted

Bill approved the Overview mock. File: handoff/AdminAlbumOverview.tsx
(this commit) plus six service-logo SVGs in handoff/assets/. Handoff
law applies (delete-first, verbatim presentational copy, wire data
only, both themes, screenshot diff at 1440/1024/768).

Structure: at-a-glance strip on top (Status / Release date / Press /
Share link / Needs attention with its own header and an in-place
expanding blockers panel), then four groups: The record / Where fans
find it / Marketing / GoodDeed(R) and giving. Split shipments lives on
Physical -> Fulfillment now. Legacy settings (SPIN) is ABSENT on this
album - new artist; render the disclosure only on pre-Nightbirde
imports per the SPIN law.

Naming decision (also lifts half the Catalog hold): the admin catalog
is "Releases" - rail item Releases, list page title Releases,
"+ Add release". "Project" stays reserved for in-production efforts
(Release -> Draft -> Project). The Releases LIST page mock is still
with Bill; that half of the hold stays until it lands.

Must work (everything else is decorative chrome):
- Needs-attention control in the glance strip: expands/collapses the blockers panel in place; each blocker's "Fix on Physical ->" navigates to Physical -> Art
- Hover pencils on every section card: reveal on hover/focus, open that section's edit state
- Release / Pre-save segmented chip: swaps the link row; Pre-save shows the honest empty state until a pre-save date exists, then shows its own URL with Open/Copy
- GoodTunes link tile: Open opens the live share page, Copy copies the URL
- Streaming service tiles: click toggles the detail row - linked services show real URL + Open/Copy/Remove; unlinked show paste field + Save (Save earns blue only on a valid link)
- Service logos: accurate brand marks on white carrier circles, never recolored or inverted (SVGs supplied; source better ones from brand kits if licensing requires)
- Marketing "Preview email" opens the real email preview
- Theme: light + dark THEMES both ship; the floating View light/dark pill is mock-only chrome - drop it

All MOCK_ consts (album fields, service URLs) are dummy data to wire.


    ## REGRESSION: track rows lost their expand + interactions (Assets audio tabs)

    Bill on the live dev build (GoodTunes Player audio + Vinyl audio tabs,
    Aug 23): after the structural row pass, track rows no longer expand.
    Gone with them: reorder / move tracks around, per-track audio info,
    bonus content, LyricFlow™, lyrics, splits - all the row interactions
    that existed before tonight.

    The rule: the canon pass changes how rows LOOK, never what they DO.
    "Repeated meta said once above the list" means the meta line, not the
    disclosure. Restore everything the rows could do before the pass:

    - Row expands (click/chevron) into the full per-track detail: audio
    info, lyrics, splits, LyricFlow™, bonus content
    - Drag-to-reorder tracks
    - Add bonus content stays wired
    - Keep the new quiet row dressing - taller rows, meta stated once -
    but the disclosure and every interaction come back exactly as they
    functioned before

    Acceptance: side-by-side against the pre-pass build - every
    interaction that worked then works now, on both audio tabs (Player +
    Vinyl), both themes.
    

    ## HANDOFF: Press vinyl color tool + gradient ramp (from Andrew)

    Andrew approved the "Rebuild this color" tool on the press vinyl
    mockup screen. File: handoff/PressVinylPhotoshopMockup.tsx (this
    commit) plus its disc/logo assets in handoff/assets/. Handoff law
    applies: delete-first, presentational code verbatim, wire data only,
    both themes, screenshot diff at 1440/1024/768. Build the color tool
    and the gradient slider/ramp EXACTLY as mocked - no re-derivation.

    Must work (everything else is decorative chrome):
    - Color popover tabs: Wheel / Spectrum / Sliders / Swatches all switch and function
    - Wheel: draggable pick point on the wheel + the horizontal lightness ramp beneath it; swatch preview updates live
    - Eyedropper button samples from the uploaded reference photo
    - Cancel / Select: Select commits the picked color to the active gradient stop
    - Gradient vs Advanced Gradient toggle switches ramp modes
    - Gradient ramp: stops are draggable; clicking a stop opens the color popover for that stop; the hex chip (#916818) reflects and accepts the active stop's value
    - Style row ("Metallic Blend") + Change style swaps the finish style and the disc render follows
    - Name field ("HB01 Metallic Gold") is editable; Replace is the ONE filled action - commits the rebuilt color over the press's suggested match
    - Compare their photo toggles the side-by-side with the press's uploaded reference
    - Size chips 12" / 10" / 7" re-render the disc at that size
    - Disc preview re-renders live from every change above (color, gradient, style)

    Wiring note: the mock's SVG disc stand-ins swap 1:1 for the real
    renders per the established vinyl-generator contract; artists never
    see raw hex anywhere outside this press-side tool.

    PROD: Andrew wants this screen in the next Publish. After it lands
    and passes acceptance, tell Bill it's ready so the next Publish
    includes it.
    

    ## BUG: artwork floats unregistered in Full Template view (template checker)

    Bill, viewing as Niina Soleil, 12" single jacket template
    (CALIFORNIALAND, Memphis Record Pressing), Aug 23: with "Full
    Template" selected, the uploaded artwork renders floating in the
    middle of the die-line - centered over the whole spread - instead of
    registered into the FRONT PANEL of the template.

    Expected: in Full Template view, each art file sits registered in its
    panel exactly as it will print - front art in the front-panel
    die-line (respecting bleed/cut/fold guides), back art in the back
    panel, spine in the spine. The Front / Back / Spine tabs already
    isolate panels; Full Template must show the same registration, all
    panels at once. Art must never render as a loose centered overlay at
    any zoom.

    Acceptance: Full Template at 100% shows the art seated in its panel
    with the overlay guides (bleed / cut / fold / safety) lining up on
    the art's edges - matching what the Front tab shows, in context.
    

    ## Vinyl art cards: art must FILL the image window (cover, not stretch)

    Bill, viewing as Niina Soleil, Assets -> Vinyl art, Aug 23: the
    uploaded art sits letterboxed inside each card's image window with
    card-background bands around it.

    The rule, extending the uniform-card-grid item already in this
    sheet: the art fills the card's image window edge to edge -
    object-fit: cover semantics (scale to fill, center, crop overflow)
    - NEVER stretched/distorted, and never letterboxed. Square art in a
    square window fills exactly; non-square art (center labels, sleeves)
    fills and crops, aspect ratio preserved. The empty drop-zone card
    keeps the identical window size.

    Acceptance: on the Vinyl art grid, every filled card shows art
    edge-to-edge in its window, no background bands, no distortion, both
    themes.
    

    ## Package tab missed the canon pass (live in prod)

    Bill published this morning and the Package tab (super-admin album,
    "Design your Package") is still serving pre-canon dressing - it was
    not in last night's tab-by-tab batch. Give it the same pass as the
    other tabs:

    - Caps section labels ("REQUIRED - VINYL", "TRACKS", "COLOR") ->
    sentence case
    - Raw color code "T01 Ruby" -> swatch + friendly name; raw codes
    stay press-side only
    - Adopt the shared page shell (PageColumn/PageHeader) like the other
    album tabs
    - One filled action on the page; word + icon for any status
    - Both themes, usual acceptance (screenshot at 1440/1024/768)

    Same law as everywhere: dressing changes only - every interaction
    the tab has today keeps working.
    