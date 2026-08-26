# Brief for Ruby — cross-press project import (Bill, Aug 26 2026 — built, held OFF)

**Needs, not solutions** — the design is yours. Everything below is wired and
working behind flags that stay OFF until Bill says go; today it renders with
plain components, so your look & feel can land whenever ready. House rules
apply: sentence case, "estimate" never "quote" in customer-facing copy, one
filled accent pill per screen, statuses word + icon never color alone, real ®
char. White-label surfaces follow each press's skin (MRP: white canvas, gold,
square corners, Poppins).

## The story (one paragraph)
One customer login now works across every press we power. A band that pressed
with one plant can walk into another press's portal and bring **their own
project specs** with them — format, size, weight, color, jacket, quantity —
without re-typing anything and without either press learning about the other.
The specs get translated into the destination press's own vocabulary
("Smoke Blends" there might be "Splatter" here), the customer confirms every
close call, and they land in a familiar pre-filled draft. Prices never travel:
whatever they paid before is gone from the record, and the new press's own
pricing takes over only after the customer confirms their choices.

## Hard rules (Bill — these bound the design)
- **Never name the other press.** Copy says "saved project specs on your
  account" / "your previous press" — never "import from Memphis". Not even a
  logo or color hint.
- **No prices from the past.** Prior price never appears anywhere, not even
  to the customer. Destination pricing appears only after options are
  confirmed, from that press's own ladders ("Pricing pending" where none).
- **Honest translation.** A near-match must be confirmed by the customer; a
  missing option says so plainly. Never a silent swap.
- **Customer-initiated only.** No press-side surface changes at all.

## Actors
- **The customer** — an artist/label signed into a press's white-label
  portal, or into their GoodTunes account.
- **The destination press** — sees only a normal new draft from its customer.
- **The source press** — sees nothing, except possibly a masters-release
  request *from its own customer* (with no hint of where they're going).

## Screens & states

### 1. Entry point (press portal, e.g. /projects on the MRP skin)
One-time, dismissible card: the customer has eligible saved specs and this
press has the feature on. States: card visible → dismissed (never returns) →
gone (no eligible specs / flag off). Current copy canon:
> **You have saved project specs on your account.**
> Start a project here from them? Your specs carry over — format, color,
> jacket and quantity — and you confirm every choice before anything is set.
CTA: "Start from saved specs". Dismiss: ×.

### 2. Import wizard (/projects/import)
Three beats on one page today; feel free to re-shape:
- **Choose a project** — list of saved specs (title, format, finish, color,
  jacket, last quantity). No press names, no prices.
- **Check your specs here** — per-field translation rows, each with a status:
  - *Matched* (exact equivalent found)
  - *Carried over* (copied verbatim — quantity, side breaks)
  - *Pick the closest match* (ranked candidates; customer must pick one)
  - *No equivalent here* (honest dead end; they choose later in the builder)
- **Start** — one filled accent action; creates a Draft estimate pre-filled
  in this press's own terms and returns to the project home.

### 3. Masters-release touchpoint (inside the wizard)
Quiet section: "Need your masters?" → "Request masters release" → sent state
with a visible status later (requested / acknowledged / released / declined —
word + icon). The request reads as coming from the customer's account.

### 4. GoodTunes "My projects" (non-white-label, /my-projects — flag OFF)
The one GoodTunes-branded surface: every project across presses in one list.
Here press names MAY appear (it's the customer's own account view). Specs
only, still no prices.

## Open design questions (explicitly unresolved — for Bill + you)
1. **Masters-release payment.** Whether a press may charge for releasing
   masters is an operator-configurable placeholder only — nothing built. If
   it becomes real: where does a fee live in this flow, and how is it shown
   without feeling like ransom?
2. **Entry-point placement & frequency.** Today: one card on the project
   home, one-time, dismissible forever. Right surface? Should it ever
   reappear (e.g. when NEW eligible specs show up later)?
3. **How should "no equivalent here" feel?** Today it's a plain honest row.
   Is a dead end acceptable, or should it invite ("ask this press about it")
   without promising anything the press doesn't offer?
