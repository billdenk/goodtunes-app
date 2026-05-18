# GoodTunes® Launch Plan
*Working document — version 1, May 18, 2026.*
*Companion to `replit.md` (current state) and `docs/roadmap.md` (long-form deep-dives).*

This document captures the conversation between Bill and Replit Agent about what's built, what's next, and the order of operations to get GoodTunes to a paid launch with manufacturers, artists, and fans. It is meant to be edited as we go — when something here gets done, mark it done; when something changes, change it here first.

---

## 1. Where we are today (snapshot)

### What's built in the codebase
- **Mobile-first web player** (React + TypeScript + Vite), Apple-Music-style, persistent, lives on the existing Replit project.
  - Album list, album detail with tracks, full audio player with line-level synced lyrics (GoodSync™), credits sheet with people + gear, playlists, favorites, in-app cache toggle per song, photos viewer, video gallery, chat (vendor-messaging demo), GoodDeed digital certificate page.
  - Player dock primitive (Apple-Music-style floating pill) graduated to `client/src/components/ui/PlayerDock.tsx`.
- **Admin/CMS surfaces** for albums, people, instruments (gear), vendors, labels, label assignments. The Tracks tab is mid-redesign: the P/L/C (Preview/Lyrics/Credits) system mockup graduated this week into `artifacts/mockup-sandbox/.../Seamless.tsx`; the production `AdminAlbum.tsx` still uses the older dot system pending validation.
- **Object storage** for image uploads (album art, person photos, vendor logos/covers, scraped instrument images) — survives redeploys via Replit Object Storage.
- **Database**: PostgreSQL with Drizzle ORM. `users`, `albums`, `songs`, `people`, `instruments`, `instrument_vendors`, `trackWriters`, `trackPerformers`, `playlists`, etc.
- **Auth**: temporary bearer-token admin login (single operator). No fan login yet.
- **No payment, no fulfillment, no manufacturer workflow** in code yet — all designed in roadmap.

### What works in the prior production system (the one we're replacing)
- 7 proofs-of-concept shipped with Nick Carter's collection.
- Heavy manual process, ugly admin, no persistence on the existing app-store apps, no sorting.
- Four vinyl manufacturers are now sending people our way. **Starting this week.**
- Several artists gearing up for launches in weeks-to-months.

### The math we're optimizing for
**250 artists × 2,000 vinyl units in a year = profitable.** Everything that doesn't move that number is deferred.

---

## 2. Three direct answers to today's questions

### 2A. Rung 2 security — build vs. Mux

**Recommendation: use Mux for both audio and video. Don't build Rung 2 ourselves.**

Why:
- Mux is already in your stack for video, you're already paying them, and you've already vetted their security.
- Their audio streaming product is solid (added 2 years ago, mature now).
- The piece you don't like — their dashboard chrome — is irrelevant. We build our own player UI on top of their signed playback URLs (we already have the player; we just swap the audio source). You'll never make a fan look at Mux's chrome.
- Integration is **about a week of focused work, one developer**, and it collapses the security ladder from a project we'd own forever to a vendor we pay.

How it works in our system:
1. Fan taps play.
2. Our server checks ownership (does this fan own this album?).
3. If yes, we ask Mux for a signed playback URL, valid 1 hour, tied to this fan.
4. URL goes back to the player. Plays. Expires before they can share it meaningfully.

Cost expectation: **~$1 per 1,000 minutes streamed for audio**, similar for video. At 1,000 active fans you're looking at low hundreds per month. Predictable, scales with revenue.

**Action for Bill:** confirm the Mux account is on a plan that includes audio + signed URLs (most plans do). If not, upgrade.

### 2B. App Store transition — keep old apps live during the cutover

**Yes, we can do this cleanly without taking the old apps down first.**

The path:
1. Build the new auth in the **new web app** using Apple/Google sign-in. The provider tokens (Apple `sub`, Google `sub`) are stable and globally unique — so a user who signs in with "Sarah's Apple ID" gets the same identifier whether they're on the old app, the new web app, or the new native app down the road.
2. **Account linking script** (one-time): if a fan signed in to the *old* app with the same Apple/Google account, when they first log into the new web app we match the provider ID and link the accounts behind the scenes. They don't notice. Their purchase history (the 7 POC sales) carries over.
3. Old App Store apps **stay live and untouched** through this transition. They keep working with the old backend until we deprecate.
4. Once the new web app is solid, we build the React Native app (separate effort, a few months) and submit it to the App Store as an **update to the same bundle ID** as the old app. Existing users get the upgrade automatically through normal iOS app updates. No re-install, no losing them. The new app uses the new auth + new backend from day 1.
5. After the new native app is live for a few weeks and we've verified everyone migrated, we deprecate the old backend.

The key thing: **don't undo the old apps first.** Build forward, link in the middle, deprecate at the end. The old POC fans never feel a transition.

Risk to flag: if the old apps used a different bundle ID than we want to use going forward, we'd ship the new one as a *new* app (different App Store listing) and ask old users to download the new one. Worse but still survivable — we'd email the POC fans directly with their existing account preserved.

### 2C. SafeNames DNS for `app.goodtunes.music`

**Time: about 30 minutes once we're ready. Cost: zero (you already own goodtunes.music).**

The flow:
1. In Replit Deployments, configure the deployment to accept the custom domain `app.goodtunes.music`. Replit gives us a target value (a CNAME like `replit.app.` or a verification TXT record).
2. In SafeNames' DNS panel, add a CNAME record: `app` → that target value. Save.
3. DNS propagates in 5 minutes to a few hours (usually 5–30 minutes for SafeNames).
4. Replit auto-provisions TLS certificate via Let's Encrypt. Done.
5. The app is live at `https://app.goodtunes.music`. No code changes needed.

For the marketing site at `goodtunes.music`, leave it pointed wherever it currently lives. The two domains coexist:
- `goodtunes.music` → marketing site (the About page you mentioned, public-facing pitch).
- `app.goodtunes.music` → the actual player + admin.

If later you want fans to go straight to `goodtunes.music/album/xyz` for purchase, we can either move the player to the apex domain (more work) or just put a thin redirect from `goodtunes.music/album/...` to `app.goodtunes.music/album/...` on the marketing site. Defer that decision; `app.goodtunes.music` is a clean, professional URL on its own.

**Action for Bill:** when ready, give the agent (or your developer) the CNAME target from Replit's deployment settings, and add the record at SafeNames. Could be done as soon as today.

---

## 3. GitHub setup — for forking and clean handoffs

The Replit project is already a Git repo internally. To get the code into GitHub so we can fork, hand off to contractors, or sync changes externally:

### Steps for Bill (one-time, ~15 minutes)
1. **Create a GitHub account** if you don't have one (free at github.com). Use the same email you'd use for any business GitHub presence — eventually this becomes the GoodTunes org account.
2. **Create an empty private repository** on GitHub. Name it something like `goodtunes-app`. Do *not* check "Add README" or "Add .gitignore" — leave it completely empty.
3. **In Replit**, open the Version Control pane in the left sidebar. Click "Connect to GitHub." Authorize Replit to access your GitHub. Choose the empty repo you just made. Push.
4. After push, the entire current codebase is mirrored on GitHub. Every future change in Replit can be committed and pushed with a button click; every change made elsewhere can be pulled into Replit.

### How forking works once it's on GitHub
- "Forking" is just clicking the **Fork** button on GitHub. It creates a copy of the repo under a different account.
- For our purposes (the vendor-pitch demo, the labels' custom branding eventually): we **don't actually fork the code** — we use feature flags to switch what's visible. The whole point is one codebase, multiple presentations.
- The real reason to put it on GitHub: **clean handoff to contractors** (when we hire a React Native developer for the native iOS app, we add them as a collaborator on the GitHub repo, they clone it, we never share Replit credentials), **version history independent of Replit** (insurance), and **branch-based workflow** (a developer working on the native app does it in a `native-app` branch without touching the main branch we're shipping from).

### For the agent to access GitHub
Replit's GitHub integration handles this automatically once you connect. The agent uses the same credentials. Nothing extra to set up on your side.

---

## 4. The launch sequence — refined order of operations

This combines Bill's stated priorities with everything we've discussed. Each phase is shippable on its own.

### Phase 0 — Right now, next 2 days *(Bill's hands)*
Bill polishes the mobile UI and locks down the interactions. This is the "make the mobile player feel finished" sprint — not new features, just refinement of what's already on screen. The point: by Wednesday, the mobile player looks and feels like a real product so the next decisions can be made with that as a stable base.

### Phase 1 — Admin to onboard artists fast *(starts this week)*
This is the gating item for every dollar that follows.
- Finish the Tracks-tab P/L/C system — graduate the Seamless mockup into production `AdminAlbum.tsx`.
- Lock the album-creation flow end-to-end: create album → upload masters → set tracks → add people + credits + gear → preview → mark complete.
- Add manufacturer-package builder (per the existing Manufacturing pipeline section in `roadmap.md`).
- Rename "SuperCredits™" → "Credits" in fan-facing copy. Keep the gear data layer fully intact, just don't surface it as a marketing term yet.

Done when: a new artist's album can be onboarded by an operator in under 30 minutes from cold start.

### Phase 2 — Real auth + custom domain *(1–2 weeks)*
- Replace bearer-token admin login with real sessions for internal staff (Apple, Google, email).
- Build fan login on the consumer player. Apple/Google + email. The login-collision fix (when an email exists under a different provider, surface "you signed up with Google" instead of "no account").
- Phone-number verification at checkout for orders with a physical component (Twilio SMS code) — solves Apple's private relay shipping problem.
- Set up `app.goodtunes.music` via SafeNames CNAME (see 2C).
- Old App Store apps stay live, untouched. Account-linking script runs when an old user first signs into the new system.

Done when: fans can sign in at `app.goodtunes.music` and the admin team uses real per-person login.

### Phase 3 — Mux integration + Rung 2 security *(~1 week)*
- Integrate Mux for both audio and video.
- Ownership check happens server-side before minting Mux signed URLs.
- Snippet generation moves to upload time: when an artist sets a 30-second window, server cuts an actual separate `snippet.mp3` (lower bitrate); the player never sees the full master for non-owners.
- Visible photo watermark per purchase (forensic invisible fingerprint deferred until first leak).
- Audit: every audio/video file currently in storage gets re-checked to confirm no public URLs remain accessible without ownership.

Done when: a non-owner cannot retrieve a full master file even with browser DevTools open.

### Phase 4 — Preview/Purchase page + Stripe + OrderDesk *(2–3 weeks)*
- Public preview/purchase page for an album (linked from artist's private link or marketing site).
- 30-second snippets play freely here. Buy Now → Stripe Checkout.
- On purchase: GoodDeed serial number minted, instant in-app access granted, charity contribution recorded (up to $1, artist's chosen charity), OrderDesk record created for physical fulfillment.
- Smart-bump screen for the artist 48 hours before manufacturing cutoff: shows live margin math and price-tier options.
- Email/SMS confirmation to fan, manufacturing-package zip auto-built for the manufacturer.

Done when: a fan can buy an album, get instant digital access, and the run gets triggered to a manufacturer correctly.

### Phase 5 — Admin reporting + artist permissions *(2 weeks)*
- Event-tracking system in place from Phase 2 onward (every meaningful click → row in `events` table). By Phase 5 we surface them.
- Artist-facing read-only report view: sales, listening engagement, geographic map, source attribution, funnel from preview to purchase.
- Multi-tenant orgs (artist orgs first, see `roadmap.md` "Multi-tenant accounts"). Artists log in, see only their own albums.
- Label orgs in the same phase if a label is ready (parent of artist orgs, rolled-up reports).
- Manufacturer org in the same phase — read-only access to assigned runs.

Done when: an artist can log in and see their own data without an operator's help.

### Phase 6 — Vendor-pitch demo readiness *(2 weeks, can overlap with Phase 5)*
- Light up the gear surface (currently built but unannounced). Demo path: instrument → vendor link → fan click → affiliate revenue tracking.
- Fake-but-plausible affiliate-revenue dashboard (real artists, real gear picks, simulated affiliate $$ for the pitch).
- Bookmark on instruments becomes functional (currently dead — links to a saved-instruments view).
- About GoodTunes page rendered from a markdown file (single source of truth for `goodtunes.music/about` and the in-app About).

Done when: Bill can sit across from a buyer at Martin/Gibson and walk them through the demo cold.

### Phase 7 — Native iOS app (React Native) *(2–3 months, can run in parallel with phases 5–6)*
- Build the native iOS player as a second app in this repo (sharing `shared/schema.ts` and the API).
- Submit as an update to the existing App Store bundle ID (if available) or as a new listing (if not).
- Old POC fans get the upgrade automatically via the App Store.
- FairPlay DRM at this stage (Mux supports it; flip the switch).

Done when: GoodTunes is back on the App Store with a real native app and the old apps are deprecated.

### Phase 8 (and beyond) — Community, marketplace, charity profiles, Shopify alternative, Apple TV
Everything in the PDF that isn't above lives here. Documented in `docs/roadmap.md`; do not creep into Phase 0–7.

---

## 5. Removed from the launch scope (deliberate)

To keep the launch lean, these features that *exist in the code today* are hidden in the fan-facing app until later:
- **Chat** (vendor-messaging demo) — hidden. Saved for the vendor-pitch demo only.
- **SuperCredits™ gear surface** — visible as plain "Credits" only; gear sheet + vendor links lit up for vendor-pitch demo only.
- **Desktop download of master files** ("loose" downloads). Deferred indefinitely until marketplace exists.
- **Marketplace, borrowing, gearfinder, personal billboard chart, musical notes** — deferred to Phase 8.

---

## 6. Open decisions for Bill

A short list of things only Bill can answer:

1. **Mux plan** — confirm the existing account includes audio + signed URLs, or upgrade.
2. **GoodTunes GitHub account** — create it; add the agent + any future contractors there.
3. **SafeNames CNAME** — when to flip `app.goodtunes.music`. Recommendation: do it in Phase 2 once auth is real, so the public domain doesn't expose the temporary bearer token.
4. **Old App Store bundle IDs** — are they accessible (still controlled by GoodTunes' Apple Developer account)? Affects the "update vs. new listing" decision in Phase 7.
5. **Charity profiles** — are we building this in Phase 4 (alongside checkout) or Phase 8? Recommendation: minimal version in Phase 4 (artist picks one charity, $1 per sale, no charity profile page yet); full charity-profile page in Phase 8.
6. **Name for the demand-funded pressing model** — "Smart Run," "Demand-Funded Pressing," "GoodPress," something else. Worth one brainstorm session before the first vendor pitch.
7. **Manufacturer-template AI** — defer to Phase 7+, confirmed? Operator does the layout for the first 5–10 real runs.

---

## 7. What Bill does in the next 2 days
1. UI polish on the mobile player (refinement, not new features).
2. Lock the interactions: bookmark tap, About page placeholder, any remaining dead taps.
3. By end of Wednesday: mobile player feels finished enough to lock its visual layer.
4. *(Optional)* Create the GitHub account + empty repo + connect from Replit (15 minutes), so future handoffs have somewhere to land.

## 8. What the agent does in parallel
1. Stand ready to graduate the Tracks-tab Seamless mockup into production `AdminAlbum.tsx` once Bill says go.
2. Begin Phase 1 admin onboarding flow review — identify what's between "currently slow" and "30-minute album onboarding."
3. Wire up the bookmark tap and About page rendering when the visual layer is locked.
4. On Bill's go-signal for Phase 2: build the auth + custom domain wiring.

---

*This document supersedes ad-hoc decisions in chat. When something is decided, it gets edited here. When something is deferred, it goes into `docs/roadmap.md`. When something is shipping, it gets crossed off in this file.*
