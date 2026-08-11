# Ruby Brief: Template Canon, Specs, and Prepress Review

## The model in one paragraph

A press's template is the source of truth. When a press uploads a template PDF, the platform ingests it: reads the title block, measures the geometry from the vector layers, lifts the printed rules, and proposes all of it as canon for that component. The press confirms, certification proves the checks work, and from then on every file uploaded for that press + component is measured against that canon. Nobody hand-types a spec that the template already declares.

The existing screens (Specs page, Prepress review dialog) stay as they are. This brief is about the new surfaces that feed them: template ingestion, canon confirmation, and certification.

Audio is a separate workstream. The checks engine itself (parsing, measuring, Pantone matching) is Otis's side. You design what the press and the artist see.

## Worked example (real files, use them as reference content)

Press template: MRP 12in LP Center Label for 2LP, 100mm trim, code 12-LBL100M-2, revision R-091125. Ingestion extracts:

From the title block:
- Press: Memphis Record Pressing
- Component: 12" LP center label
- Variant: 2LP, 100mm trim size
- Template code: 12-LBL100M-2
- Revision: R-091125

From the geometry (measured, not typed):
- Cut: 100mm diameter
- Center hole: 7mm
- Bleed ring and safety ring positions
- Side map: A and B required; C and D conditional (only used for double LP), so required page count derives from LP count

From the printed rules (each becomes a check):
- Art minimum 300ppi
- 1-bit images minimum 800ppi
- CMYK mode; Pantone spot inks remain as spot; no RGB
- Art extends to the bleed line
- Important text and graphics inside the safety line
- Final art submitted as high-resolution PDF with bleed included
- Template layer deleted before submission

Control file: the finished CALIFORNIALAND center labels (artist: Niina Soleil, two i's, album all caps). Correct trim, hole, side count, art to bleed, text inside safety, template layer removed.

Note the 800ppi: a different press on the platform runs a 1200ppi 1-bit floor. Same check, different number per press. That is the whole reason canon is per-press and template-derived.

## Surface 1: Template ingestion and canon confirmation (new, the centerpiece)

Flow when a press uploads a template:

1. Upload. Drag in the template PDF.
2. Ingestion. Platform parses it. Design a working state that feels like reading, not spinning.
3. Proposal. The platform presents what it found, grouped the way the worked example above is grouped: identity (press, component, variant, code, revision), geometry (measured values), rules (extracted checks). The component mapping is pre-filled because the template names itself; the press can correct it.
4. Confirm. Press reviews, adjusts anything misread, confirms. Confirmed values become canon.
5. Hand-off to certification (Surface 2).

Design considerations:
- Extracted vs. confirmed needs a visible distinction until the press signs off. After confirmation, everything reads as canon with no residue of the proposal state.
- Some rules extract as automated checks, some as check-by-eye items (e.g. "important elements inside safety" has an automated geometric component and a judgment component). Show which is which.
- Misread values will happen. Correcting one field should not restart the flow.
- Revisions: uploading a template whose code matches existing canon but whose revision differs is a supersede event, not a new component. Old canon goes to history, jobs in flight get flagged for review against the new rev. Design the supersede confirmation so it is impossible to do accidentally.

## Surface 2: Certification (new)

Certification proves the canon works before any customer file touches it. Each template is paired with two test files:

1. A control file that is correct (the CALIFORNIALAND labels are the live example). Must pass every check and render a preview.
2. A known-bad file with seeded, documented errors (RGB swatch, 600ppi 1-bit logo, text crossing the safety ring, template layer left in).

Certified means: control passes clean, and the known-bad file is rejected with every seeded error correctly called out.

The results view is a side-by-side: clean file passing on one side, broken file on the other with each planted error caught and named. This is a demo moment for presses; it should read as proof, not as a log.

States: attach test pair, running, certified (date-stamped), failed certification (which seeded error was missed, what to do), re-certification on supersede.

## Surface 3: Templates index (new page under Specs)

The library of canon. Each entry: component, variant, template code, revision, certification date, status (Certified / Pending / Failed / Superseded). Superseded entries stay in history; one certified revision is live per component.

Empty state: a press with no templates should see why loading them matters (their standards enforced before a bad file ever reaches them) and one obvious path to upload the first.

## Existing surfaces, untouched but connected

- Specs page: stays as designed. Canon values extracted from templates populate and reconcile with it; the page remains where a press views and edits their numbers. If a manual edit conflicts with template-derived canon, that conflict needs a treatment, but no redesign.
- Prepress review dialog: stays as designed. Every check result in it now traces to a line of canon from a specific template revision. The copy pattern already there is right: name the press, state their number, state the file's number, say the fix.

## Data relationships

- A press has many templates; a template belongs to one component and carries a code and revision.
- One certified revision per component is live canon.
- Required side/page count derives from the template's side map plus the project's LP count.
- An uploaded customer file is checked against: the live canon for its press + component.
- Every check result traces to an extracted rule or measured value. Nothing appears in the dialog that a press cannot see the source of.

## Out of scope

- Audio specs and checks
- The parsing/measuring engine (Otis)
- Any changes to the existing Specs page or Prepress review dialog layouts
- Shopify tab surfaces

## Placeholder data

Artist is Niina Soleil (two i's), album is CALIFORNIALAND (all caps). Real artist, real release.
