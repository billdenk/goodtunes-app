---
name: Artist referral one-year earning window
description: Artist→artist referrals earn $1/unit for ONE YEAR (not for life); the rule, its anchor, and where the gate lives.
---

# Artist referral one-year earning window

Artist→artist referrals earn the referrer $1/unit on the referred artist's
paid sales **for one year only** — NOT "for life". The copy and the behavior
were changed together so the promise matches reality.

**The rule**
- Window = one year from when the referred artist's relationship was
  established, anchored on the EARLIEST `artist_referrals.created_at` for that
  (referrer, invitee) pair (== the invitee's invite-accept date; a later
  second-album row can't reset the clock).
- A null/unparseable anchor **fails OPEN** (keeps minting) so a legacy
  referral with no recoverable date isn't wrongly cut off.
- Once the year lapses: no NEW `referral_credits` mint for that pair. Already-
  minted credits are NEVER clawed back, and the swap still freezes on first
  sale (attribution/reporting survives).
- The one-year check is an ADDITIONAL gate layered alongside the existing
  `people.earns_referral_payout` switch and the swap-state rules — all three
  must pass to mint.

**Why:** Bill wanted the referral promise honest. "For life" was never
enforced and was an open-ended liability; one year matches how the program is
actually run. No grandfathering — applies uniformly to all artist→artist
referrals.

**Scope boundaries (do NOT extend the window to these):**
- NPO / non-profit referrals stay **ongoing** (no window) — separate program.
- Press attribution is unaffected (press is paid via manufacturing margin).
- Do NOT touch the cert "Numbered for life" checkout copy — unrelated.

**How to apply:**
- The window helper (`isReferralWindowActive` / `referralWindowEndsAt`) is
  shared by server + client so the surfaced status can't drift from the mint
  gate — reuse it, don't re-derive the year math.
- The ONLY artist-credit mint site is the artist→artist branch of
  `materializeOrderFromSession`; that's where the window gate must sit. If a
  second mint path is ever added, it must apply the same gate.
- The referred-artists status ("Earning through <Mon YYYY>" / "Earning ended")
  comes from the same helper via the artist-referrals API — keep API and mint
  gate reading the same anchor or they diverge (see follow-up #2521).
