# MRP white-label setup — questionnaire

What GoodTunes needs from MRP's CTO and CFO to configure the Memphis
white-label instance. Designed to be filled in during the meeting; a checkbox
means "decided", the blank line is for the answer.

## 1. Domain & DNS (CTO)

- [ ] Which host should the portal live on?
  - ☐ A subdomain of your own domain (e.g. `vinyl.memphisrecordpressing.com`)
  - ☐ The GoodTunes-provided white-label host (`memphis.makesvinyl.com`, already live)
  - Answer: ______________________________________________
- [ ] If your own domain: who controls DNS and can add a CNAME record?
  (You add one CNAME; our side then verifies DNS, links TLS for the host,
  and an operator activates it — activation is a manual, gated step on our
  end.)
  - DNS contact: __________________________________________
- [ ] Bare apex domains and `www.` are not supported for this — a subdomain
  is required. Confirm the exact hostname: ________________________

## 2. Branding (CTO / marketing)

- [ ] Logo files (full logo + square mark for favicon/app icon):
  supplied? ______________________________________________
- [ ] Brand accent color(s) for the portal skin and transactional/estimate
  emails: ________________________________________________
- [ ] Email branding sign-off — estimate and notification emails go out in
  MRP's branding (accent + logo). Approver: ______________
- [ ] Anything that must NOT appear (e.g. GoodTunes marks on client-facing
  pages)? _______________________________________________

## 3. Staff accounts & access (CTO)

- [ ] Who at MRP needs a portal/admin account? Invites are email-based; each
  person is invited individually.
  - Names + emails: ______________________________________
- [ ] Who may edit pricing / send estimates vs. read-only?
  ________________________________________________________
- [ ] Who receives partner notifications (invoice paid, estimate accepted,
  etc.)? Default is all subscribed recipients; list preferred inboxes:
  ________________________________________________________

## 4. Payout account & KYC (CFO)

- [ ] Payouts arrive via a Stripe Connect Express account in MRP's name.
  Stripe handles onboarding and KYC directly (legal entity, bank account,
  identity verification) — GoodTunes never holds these documents.
  Who at MRP will complete the Stripe onboarding link?
  - Name / role / email: _________________________________
- [ ] Legal entity name and country for the account: ______________
- [ ] Bank account to receive payouts (entered directly into Stripe by MRP,
  not shared with us): ready? ☐ yes ☐ needs prep

## 5. Pricing inputs (CFO / CTO)

- [ ] Source of truth for MRP's pricing ladders (vinyl tiers, colors,
  components, surcharges). We can sync from an external sheet (e.g. a
  Coda doc with an API token you provide, mapped column-by-column and
  previewed before commit) or maintain pricing directly in the portal.
  - Preferred source: ____________________________________
- [ ] Who owns pricing updates going forward (MRP staff in the portal vs.
  synced sheet)? _________________________________________
- [ ] Any pricing rows that must never be overwritten by a sync (we can lock
  individual rungs)? _____________________________________

## 6. Ledger invoice payments (CFO)

- [ ] Preferred method for paying/receiving manufacturing-ledger steps:
  - ☐ US bank transfer (push transfer to a Stripe virtual account — no card
    fees on this path)
  - ☐ Card (card processing fee added as its own disclosed line)
- [ ] Accounting contact for statements, reconciliation, and payout
  questions:
  - Name / email: ________________________________________

## 7. Anything else

- [ ] Artwork/print rules specific to MRP (per-component artwork standards
  can be configured per press): ___________________________
- [ ] Target go-live date for the custom domain / portal: ____________
