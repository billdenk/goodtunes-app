# Runbook — press bring-your-own custom domain (white-label)

Task #3339. A press can serve their white-label portal from a subdomain of
THEIR domain (e.g. `vinyl.memphisrecordpressing.com`) instead of
`<slug>.makesvinyl.com`. DNS + the app side are self-service; the TLS
certificate is a manual operator step — this runbook covers it.

## The flow

1. **Press** enters the hostname in Settings → White Label → "Your own
   domain" and saves. Validation refuses bare apexes, `www.`, and anything
   inside our own domain families. Status starts at **Pending DNS**.
2. **Press** adds the DNS record at their provider:
   `CNAME <their-hostname> → makesvinyl.com`
   and hits **Verify domain**. The server does a real DNS check (CNAME to a
   makesvinyl/pressesvinyl/replit target, or matching A records). Passing
   advances status to **Pending activation**.
3. **Operator** (this is you):
   1. Open Replit → the production deployment → **Deployments → Domains**.
   2. Add/link the press's hostname. Replit issues one TLS cert per host —
      this cannot be automated.
   3. Wait for the cert to be issued and the host to load over https.
   4. In god view → the press's Details page → **White-label custom domain**
      card → **Mark linked & active** (also visible in
      `GET /api/admin/custom-domain-requests`).
4. Status is now **Active**: the host serves the press's full white-label
   skin (landing/login/estimate/invite/portal), and newly minted estimate,
   invite, and email links prefer it over the makesvinyl slug
   (production only; fallback chain custom → slug → request host).
   Existing makesvinyl links keep working.

## Removing / changing

- The press clears or edits the field and saves. Clearing falls back to the
  makesvinyl subdomain immediately; any CHANGE resets the ladder to
  Pending DNS (fail-closed — the new host never gets the skin until
  re-verified and re-activated).
- After removal, also unlink the old hostname in Replit Domains (harmless if
  you forget — an inactive host renders the neutral page, never their skin).

## Fail-closed guarantees

- Anything but `active` renders the neutral page — never an error page,
  never a redirect loop, never another press's skin.
- Activation is operator-only (a press can never self-activate; TLS is not
  real until the Replit Domains link).
- Hostnames are case-insensitively unique across presses (DB index).

## Out of scope (by design)

- Press apex domains and `www.` (their marketing site stays theirs).
- Fan OAuth on custom hosts (invite OAuth round-trips the canonical admin host).
- Email sending domains / DKIM (emails send from ours, branded).
