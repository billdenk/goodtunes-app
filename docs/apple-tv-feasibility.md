# Apple TV (tvOS) — feasibility & plan brief

*Audience: Bill (and anyone he wants to share this with — an investor, a future
engineer). Plain language, honest about what's real today vs. what would need
building. This is a decision document, not a build plan — nothing here is being
built yet.*

*Product direction (already decided, not up for debate here): on the TV,
GoodTunes should feel **music-first, like Apple Music on Apple TV** — shelves of
albums, big artwork, a full-screen Now Playing with lyrics, and bonus videos as a
secondary surface — **not** a video-first "Apple TV app" clone.*

---

## The short answer

**Apple TV is feasible, and almost everything that makes GoodTunes valuable
already carries over — but it cannot be a re-wrap of the phone app the way iOS and
Android are.** The iPhone/Android apps are a thin shell that loads the live
website in a webview. That trick does not work on Apple TV: there is no TV target
for the technology we use, and a 440-pixel touch-first phone page shrunk onto a
10-foot TV screen driven by a remote feels broken. Apple TV means a genuinely
**native TV front-end**.

The good news is that the *front-end* is the only new part. The entire backend —
catalog, ownership, the protected streaming that already plays on Apple hardware,
and every product decision (Apple-Music-style browsing, artwork, lyrics, credits) —
is reusable as-is. We'd be re-skinning proven ideas for the big screen, not
rethinking the product.

**Recommendation:** don't start a standalone native TV app today. **Fold Apple TV
into the React Native rewrite that's already on the roadmap** — tvOS becomes one
more target of that shared codebase — *unless* Bill wants GoodTunes on TV
*sooner* than the RN port will realistically land, in which case a focused native
tvOS app (Swift/SwiftUI) on top of the existing backend is the clean way to get
there. Either way the backend is done; the debate is purely about the front-end
and the sequencing.

The rest of this doc backs up each of those points.

---

## 1. The key reframing up front — Apple TV is not a re-wrap

This is the one expectation to set before anything else.

The iPhone and Android apps are **not** separately-built native apps. They are a
thin **Capacitor** shell that loads the live `my.goodtunes.music` site in a webview
(see `capacitor.config.ts` — `server.url` points straight at the real host). The
native binary is essentially a browser window pointed at the website, with a few
native capabilities bolted on (system volume, offline downloads, push). That's why
web, iOS, and Android ship from **one codebase** and a web change reaches phones the
moment we republish.

**That approach does not extend to Apple TV, for two independent reasons:**

1. **There is no tvOS target.** Capacitor — the wrapper the whole native strategy
   rests on — supports **only iOS and Android**. There is no "Capacitor for Apple
   TV." The lever we've been pulling simply isn't there.
2. **The screen is a different medium.** The player is a ~440px, single-column,
   touch-first phone layout (tap targets, swipe gestures, a thumb-reachable mini
   player). Apple TV is a **10-foot, remote-driven experience** built around
   Apple's *focus engine* — you move a highlight around the screen with a remote,
   there is no touch and no cursor, and text/buttons must be large and legible from
   across a room. A shrunk phone page on a TV doesn't just look small; it's
   genuinely **unusable** — nothing is focusable, nothing responds to the remote.

> **Stated plainly:** on iPhone and Android we ship the *website in a shell*. On
> Apple TV there is no shell to ship it in, and even if there were, the website is
> the wrong shape for the room. Apple TV means building a **native TV front-end** —
> a real, separate screen layer — not re-wrapping what we have.

Everything else in this brief follows from that one fact: the *screen* is new; the
*substance behind it* is not.

---

## 2. What already carries over (the good news)

Almost everything that isn't the screen itself is reusable **unchanged**. A TV app
is a new front door onto the exact same house.

- **The entire backend, catalog, and ownership model.** Albums, artists, songs,
  credits, who-owns-what, the whole data layer and its APIs — all of it is
  front-end-agnostic. A TV app authenticates a fan and calls the same endpoints the
  website already calls. Nothing server-side has to change.
- **Protected streaming already runs on Apple hardware.** Playback is
  **signed Mux HLS** — short-lived, signed streaming URLs, never a downloadable
  master file. This is the same technology Apple's own **AVPlayer** is built to
  play, so on a tvOS app the audio (and the bonus **videos**) stream natively with
  no new streaming stack. Crucially it **keeps the masters protected** on the way
  in: the fan-facing player never falls back to a raw audio file (that's a hard rule
  — masters never leave as a file), and the download-hardening work
  (`docs/cert-pinning.md`, the roadmap's DRM ladder) exists precisely because that
  protection matters. A TV app inherits the protected-playback posture for free.
- **Every product decision.** Apple-Music-style browsing, big artwork, synced
  lyrics, credits / SuperCredits™, the heart-vs-star conventions, the brand palette
  — all of that is *design* that's already been figured out and validated on the
  phone. On TV we re-present those same decisions at 10-foot scale; we're not
  re-inventing the product, we're re-skinning it for a bigger screen.

> **Stated plainly:** the streaming, the catalog, the ownership, and the taste of
> the product are done. What's genuinely new is one thing — a TV-native screen — and
> §3 is honest about exactly what that entails.

---

## 3. What's genuinely new work

Everything new lives in the TV front-end and its store presence. Four buckets:

1. **A TV-native UI built around Apple's focus engine.** This is the bulk of the
   work. Music-first means: **shelves of albums** (the horizontal rows Apple TV
   users expect), big artwork you can see from the couch, a **full-screen Now
   Playing with lyrics on the big screen**, and **bonus videos as a secondary
   shelf** — not the front door. Every element has to be *focusable* and driven by
   the remote (up/down/left/right + select), with a clear highlight state and
   legible-from-across-the-room type. None of the phone's touch/swipe UI transplants;
   it's rebuilt for the remote.
2. **TV sign-in.** Typing on a TV with a remote is miserable, so the standard
   patterns are **device-code pairing** ("go to `goodtunes.music/tv` and enter this
   code," then the phone/computer does the actual login) and/or **Sign in with
   Apple**, which is clean and native on tvOS. This is genuinely new plumbing — see
   §5 for the detail and the recommendation.
3. **TV-only polish Apple expects.** A **layered/parallax app icon** (tvOS icons are
   multi-layer and move as you focus them — a different asset from the flat phone
   icon), a **Top Shelf** featured row (the large promoted content that appears when
   the app is highlighted on the Apple TV home screen), and proper integration with
   the **native remote and the Now Playing controls** (the system playback UI that
   shows on the remote and in Control Center). These aren't optional niceties; they're
   part of what makes a tvOS app feel native rather than ported.
4. **A separate tvOS build + App Store submission.** Apple TV is its own build and
   its own App Store target, but it can **share the existing app identity** — the
   current bundle identifier is `Io.GoGoods.music` (App Store Connect Apple ID
   `6448246869`), and the existing **Codemagic** cloud-build pipeline
   (`docs/codemagic-builds.md`) is the natural place to add a tvOS workflow rather
   than standing up a new one. Reviewer notes, demo account, and privacy labels
   largely mirror what's already documented in `docs/app-store-submission.md`.

> The honest weighting: **#1 is most of the effort**, #2 and #3 are real but
> bounded, and #4 is mostly configuration on top of a pipeline we already run.

---

## 4. The strategic fork — two realistic paths, with a recommendation

There are two credible ways to get a native TV front-end, and they trade off
against *when* Bill wants it and *how much* we want to maintain.

### Path A — Build it natively now (Swift / SwiftUI) on the existing backend

Write a dedicated tvOS app in Apple's native stack, talking to the backend we
already have. **This is what Apple Music and Spotify do** for their TV apps.

- **Pros:** cleanest possible result, fully native focus-engine feel, available as
  soon as it's built — no dependency on any other project landing first.
- **Cons (be honest):** it's a **real project — multiple weeks** of focused work —
  and it creates a **new, separate codebase** (Swift/SwiftUI) to maintain alongside
  the web app forever. Nothing about the phone/web codebase is reused on the screen
  side; only the backend is shared.

### Path B — Fold Apple TV into the React Native rewrite already on the roadmap

The roadmap already recommends a **React Native port** as the mobile end-state (see
`docs/roadmap.md` → *Mobile / native strategy*, Path 2). There is a community
**"React Native for Apple TV"** path, so once the app is in React Native, **tvOS
becomes one more target of that same shared codebase** — the components, state, and
data flow that already power iOS/Android extend to the TV, with the TV-specific
focus-engine UI layered on top.

- **Pros:** **one codebase** ships phone *and* TV; the TV app rides the same
  investment as the mobile rewrite instead of being a second thing to maintain.
- **Cons:** it **only pays off *after* the RN port** — which is itself the bigger
  prerequisite and hasn't started. If the RN port slips, so does TV. And even under
  RN, the TV screen layer (shelves, Now Playing, Top Shelf, focus handling) is still
  new work — RN shares the *logic*, not the TV *layout*.

### Recommendation

**Default to Path B — fold Apple TV into the React Native rewrite** — because it
keeps GoodTunes on **one maintainable codebase** instead of permanently splitting
effort between a Swift TV app and everything else. The RN port is already the
recommended direction for phones; making TV a target of it is the lowest-total-cost
way to be on the big screen.

**Switch to Path A only if Bill wants GoodTunes on Apple TV *sooner* than the RN
port will realistically land.** Path A is buildable today against the existing
backend and doesn't wait on anything — the price is a second codebase. So the real
decision input is **timing**: if TV is a "someday, done right" goal, sequence it
behind the RN port (Path B); if TV is a "we want it on screens this quarter" goal,
build the focused native tvOS app now (Path A) and accept the extra maintenance.

Either way, **the backend is ready** — this fork is entirely about the front-end and
the sequencing, not about whether the platform can support it.

---

## 5. Auth on a TV, in detail

The phone/web login **won't transplant**, and it's worth being precise about why.

Today a fan signs in with **email/password, TOTP, Sign in with Apple, or Google
OAuth**, and native apps carry the session with a **bearer token** (the phone app's
authoritative auth mechanism — it survives iOS's cookie partitioning). All of that
assumes a keyboard and, for OAuth, a browser redirect. On a TV:

- **Typing is the enemy.** Entering an email and password with an on-screen keyboard
  driven by a remote is slow and error-prone — it's exactly the friction that makes
  fans give up. So TV apps avoid asking the fan to type credentials at all.
- **OAuth redirects are awkward on a TV** and Google in particular refuses its OAuth
  flow inside embedded webviews — the same constraint the phone app already works
  around.

The two legitimate patterns:

| Pattern | How it works | Fit for GoodTunes |
| --- | --- | --- |
| **Device-code pairing** | The TV shows a short code and a URL ("go to `goodtunes.music/tv` and enter this code"). The fan does the real login on their **phone or computer**, which hands the TV a token. No typing on the TV. | **Recommended.** Reuses the existing web login *and* the existing **bearer-token** model — the TV ends up holding a token just like the phone app does. New work is a small pairing endpoint + a short-lived code, not a new auth system. |
| **Sign in with Apple on tvOS** | Native Apple sign-in sheet, clean on Apple TV, no typing. | A strong **secondary** option, especially for fans already in the Apple ecosystem. We already support Apple sign-in, so the identity side is familiar; it's a good complement to pairing. |

**Recommendation: lead with device-code pairing, offer Sign in with Apple
alongside it.** Pairing leans directly on what we already have (web login + bearer
tokens) and gives the smoothest "no typing" experience; Apple sign-in is the clean
one-tap path for Apple-native fans. Between them, no fan ever has to peck out a
password with a remote.

---

## 6. Honest effort, risk, and what to weigh

**Effort.** The backend and streaming are done, so the cost is concentrated in one
place: the **TV-native screen layer** plus TV sign-in and the tvOS store polish. As
a standalone native app (Path A) that's a **multi-week project** and a new codebase
to maintain. Under the RN port (Path B) the *incremental* TV cost is smaller —
shared logic, TV-specific layout on top — but it's **gated behind the RN port
landing first**, which is the larger prerequisite.

**Risks / things to weigh:**

- **Maintenance surface.** Path A permanently adds a second codebase; Path B keeps
  it to one but couples TV's arrival to the RN timeline. This is the core trade.
- **The RN-for-TV path is community-maintained**, not first-party Apple — a real
  option that many apps use, but worth validating current status before committing
  Path B's timeline to it.
- **Focus-engine UX is its own craft.** "Music-first on a 10-foot screen" is a
  design problem (shelves, Now Playing, remote navigation) that deserves its own
  mockup pass before any code — the same way the phone player did. That's a separate
  task if Bill wants to see it.
- **Nothing here threatens the masters.** Because playback stays on signed Mux HLS
  via AVPlayer, adding a TV screen doesn't loosen the protection posture — the TV is
  just another authenticated player of the same protected streams.

---

## What happens next (no commitments here)

Nothing gets built from this brief — it's the decision input. **Nothing is decided
here.** *If* Bill greenlights a direction, the sequence is:

1. **Pick the fork on timing.** Want TV *soon* → Path A (focused native tvOS app on
   the existing backend, now). Want TV *done once, maintained cheaply* → Path B
   (fold it into the RN port, after that port lands).
2. **Confirm the RN-for-TV path's current status** if leaning Path B, so the
   timeline rests on something real.
3. **Design the music-first TV experience** (shelves, full-screen Now Playing with
   lyrics, bonus-video shelf, Top Shelf, layered icon) as its own mockup pass —
   separate task — before any implementation.
4. **Stand up TV sign-in** — device-code pairing first, Sign in with Apple alongside
   — reusing the existing web login and bearer-token model.
5. **Add a tvOS workflow to the existing Codemagic pipeline** and reuse the App
   Store identity (`Io.GoGoods.music`) and the submission checklist already
   documented.

**Explicitly *not* decided here:** Path A vs. Path B, any timeline, the TV UI
itself (mockups are a separate task), and any Xcode/tvOS scaffolding. The backend is
ready today; the choice in front of Bill is purely *how* and *when* to put a native
screen in front of it.
