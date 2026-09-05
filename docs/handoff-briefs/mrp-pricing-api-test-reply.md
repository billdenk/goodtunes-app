# Draft reply to MRP — pricing test and API questions

Subject: GoodTunes pricing-code reconciliation and test configuration

Hi MRP team,

We have reconciled the expanded Tier 3 workbook’s visible CODA codes and its
setup/job-cost and charge-type fields against the pricing already loaded in
GoodTunes. The common 300–10,000 price columns do not contain numeric changes,
so we preserved the existing all-in ladders and any operator-confirmed or
locked rungs.

For a first test, please use:

- 12-inch, 140g, single LP
- black vinyl
- full-color center labels
- standard full-color single jacket
- white poly-lined inner sleeve
- shrink-wrap
- quantity 1,000
- new audio (not a reorder), no insert, sticker, or poly bag

Please compare every line and the final total in the builder, sent email,
opened estimate, and accepted estimate. We will not call the launch verified
until that branded end-to-end check is completed.

Two workbook questions remain:

1. What should the unexpected secondary value/cell on row 29 (press setup,
   CODA `4080-0001`) mean?
2. What should the unexpected secondary value/cell on row 35 (color setup,
   CODA `4011A-0003`) mean?

We have held both from code-based calculation. Unknown CODA codes and any
unpriced selection remain “Pricing pending / custom quote” and block sending.

We are ready to design the future read-only GET integration, but we do not yet
have enough information to implement it safely. Please provide the endpoint,
authentication method and credential lifecycle, request inputs, response
schema and units, pagination, error format, rate limits/retry guidance,
environment/versioning, and network/allowlist requirements. We have not
invented a URL or request shape. Replit Autoscale should not be assumed to
have one fixed outbound IP; if source-IP allowlisting is mandatory, an
authenticated egress proxy/NAT with a stable IP or another mutually agreed
authenticated network path is safer.

Thanks,
GoodTunes
