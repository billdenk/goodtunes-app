---
name: Invite accept ends signed-in; existing email = sign-in-to-accept behind normal 2FA
description: Durable policy for partner invite acceptance, especially on whitelabel hosts
---

**Rule:** Partner invite acceptance must never end in a granted-but-signed-out state, and must never silently ignore a typed password. When the invited email already has a partner account, the flow is sign-in-to-accept: the lookup flags the existing account up front, the claim page asks for the EXISTING password, and a new-credentials submit is rejected outright. Sign-in-to-accept is a real admin sign-in — it goes through the same second-factor policy as normal admin login (dev/trusted-device/reviewer bypasses only; otherwise pending-factor session + the standard OTP verify legs mint the session/bearer). An invite link is forwardable and is never a substitute for the enrolled second factor.

**Why:** A real whitelabel invite locked an artist out: the old existing-account branch granted the hat, discarded the password, returned no credentials, and the unauthenticated redirect chain dumped him on the press-client (customer-store) sign-in his partner password could never satisfy. A first fix that minted the session off password alone was review-rejected as an MFA bypass.

**How to apply:**
- Post-accept partner pages are partner paths: unauthenticated fallback goes to the admin login, never the fan/press-client login (whitelabel hosts forward customers there).
- Spent/expired invite responses carry enough context (account exists? created by this invite? press brand) for the unavailable page to route to the right sign-in + forgot-password instead of dead-ending.
- Granting + consuming the invite BEFORE the second factor completes is the established pattern (OAuth invite-accept does the same); only the session/bearer waits for the factor.
- Whitelabel branding on auth pages goes through the shared auth-page logo component — no bare GT logo mid-flow on branded hosts.
