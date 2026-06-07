import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, json, jsonb, boolean, uniqueIndex, unique, check, primaryKey, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { SignedCertLadderRung } from "./signedCertLadder";

// Task #475 — 30-day soft-delete Trash. Every admin-deletable entity
// (albums, songs, people, vendors, instruments, labels, manufacturers,
// fulfillment partners, album bonus content, track/album credits, band
// members) carries this trio of columns. `deletedAt` stamps when the
// admin deleted the row; rows with `deletedAt IS NOT NULL` are filtered
// out of every list/detail read path and only visible on /admin/trash.
// `deletedByUserId` is the admin user who pressed Delete (for the audit
// row); `deletedViaParentId` is set when the row was soft-deleted as a
// cascade of a soft-deleted parent (album → songs/videos/photos/credits;
// song → track_writers/track_performers; person → band_members) so the
// trash UI only surfaces root deletions and restoring a parent restores
// its children. A daily sweeper hard-deletes anything older than 30 days.
export const softDeleteCols = {
  deletedAt: timestamp("deleted_at"),
  deletedByUserId: varchar("deleted_by_user_id"),
  deletedViaParentId: varchar("deleted_via_parent_id"),
};

// Task #860 — Terms acceptance at sign-up. We capture consent the
// industry-standard way: inline microcopy under the signup CTA
// ("By continuing, you agree to the Terms and Privacy Policy") with no
// checkbox, and record the moment + the version of Terms in force on the
// new account row (`terms_accepted_at` / `terms_version`). Bump
// TERMS_VERSION (a plain dated string) whenever the Terms materially
// change so a future re-consent flow can tell who agreed to what. URLs
// are the canonical public policy pages; links open in a new tab.
export const TERMS_VERSION = "2026-05-31";
export const TERMS_URL = "https://goodtunes.music/terms";
export const PRIVACY_POLICY_URL = "https://goodtunes.music/privacy";

// Task #936 — the album the store.goodtunes.music launch storefront drops fans
// into (Nightbirde "Hope", June 8 launch). Prod-only row; dev DBs can point the
// storefront at a local album via VITE_LAUNCH_ALBUM_ID for testing.
export const STOREFRONT_LAUNCH_ALBUM_ID = "54d46505-2d23-4066-88f3-0337bb2e8b79";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  realName: text("real_name"),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  // Task #57 — preferred second factor for admin sign-in:
  // "email"  → 6-digit code emailed each sign-in (default for new admins)
  // "totp"   → authenticator app (existing TOTP-enrolled admins)
  // Anyone with a row in admin_totp is migrated to "totp" on first apply
  // so no current admin gets locked out. Switching factors is a one-click
  // toggle on the admin security page (only allowed if both are set up).
  factorPref: text("factor_pref").notNull().default("email"),
  // Task #538 — Phone verification (gated to gifting / payouts / recovery).
  // `phoneE164` is the canonical E.164 form ("+12025551234") set the
  // moment a partner verifies a number; `phoneVerifiedAt` stamps when
  // the OTP succeeded. Mirrored on `customer_users` for fan-side gating
  // (gifting, recovery). Verify-once, reuse-everywhere: re-verification
  // only runs when the user changes their number.
  phoneE164: text("phone_e164"),
  phoneVerifiedAt: timestamp("phone_verified_at"),
  // Task #860 — Terms acceptance captured at account creation. NULL for
  // admins/partners minted before this shipped (no re-consent for
  // existing accounts); set to now() + the in-force TERMS_VERSION the
  // moment a fresh row is provisioned via invite accept.
  termsAcceptedAt: timestamp("terms_accepted_at"),
  termsVersion: text("terms_version"),
  // Task #1037 — Unified identity P2: link this admin row to the same
  // human's canonical fan (customer_users) row. When set, the fan row is
  // the source of truth for credentials + OAuth identities; users.password
  // is kept in sync as a sign-in fallback so an admin is never locked out.
  // No FK is declared on purpose — a relational FK here would reappear on
  // every publish dev→prod diff (see .agents/memory/auth-tokens-fk-recurrence.md);
  // link integrity is enforced in app code + the post-merge migration. The
  // partial unique index guarantees at most one admin per fan.
  customerUserId: varchar("customer_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  customerUserIdUniq: uniqueIndex("users_customer_user_id_uniq")
    .on(t.customerUserId)
    .where(sql`${t.customerUserId} IS NOT NULL`),
}));

// Record-label entity. One row per label (Atlantic, XL, Sub Pop, …) —
// logo / bio / location / cover live here. Each album is released on at
// most one label (the label printed on the back of the record); a label
// has many albums; the label's artist roster is derived from those albums.
// Future: dedicated `/label/:id` fan page with all releases.
export const labels = pgTable("labels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  // Canonical apex domain (lowercased, no www). Mirrors `vendors.domain`
  // as the dedup key so the "paste a label URL" flow can detect "already
  // added" before double-creating. Nullable for legacy rows created
  // before the paste-URL flow existed. Uniqueness is enforced by the
  // partial index in the table callback (excludes soft-deleted rows), not
  // a plain `.unique()` constraint — see `labelsDomainUniq`.
  domain: text("domain"),
  logoUrl: text("logo_url"),
  // Curation lock on `logoUrl`. When true, automated paths (favicon
  // backfills, "re-scrape from website" enrichment, any future logo
  // enrichment job) MUST skip writing `logoUrl` — the operator has
  // explicitly curated it. Explicit admin writes (PUT /api/admin/labels/:id
  // with a new `logoUrl`) bypass the lock; locks are about automation,
  // not editability. Mirrors `people.photoLocked` / `people.coverLocked`.
  logoLocked: boolean("logo_locked").notNull().default(false),
  bio: text("bio"),
  location: text("location"),
  // Task #489 — structured snapshot of the Places-picked Location. The
  // free-text `location` above stays the source of truth for display
  // (and is what legacy rows already carry); this jsonb column lets
  // filters/reports read country/region/postal-code without regexing
  // the formatted string. Populated by the admin address autocomplete
  // and by the one-shot backfill job.
  locationAddress: jsonb("location_address").$type<PartnerAddressSnapshot>(),
  websiteUrl: text("website_url"),
  // Optional Instagram profile URL. Used in admin so the label page can
  // surface a follow link later — not auto-scraped from IG (Instagram blocks
  // server fetches), so this is admin-entered.
  instagramUrl: text("instagram_url"),
  coverUrl: text("cover_url"),
  // Task #199 — invited-by press. When a manufacturer (pressing plant)
  // admin invites this label to GoodTunes, we stamp their manufacturer
  // id here so the label's Sell-panel Presses surface defaults to that
  // press (soft lock — artist can expand to other plants) and the
  // per-format cost calculator pulls from that press's pricing.
  // Nullable + SET NULL so deleting a press doesn't orphan the label.
  invitedByPressId: varchar("invited_by_press_id"),
  // Task #522 — Default press for new albums this label starts. Set at
  // invite-accept to the inviting press; mutable by the label as they
  // shop other presses. Separate from `invitedByPressId` (which is the
  // immutable provenance stamp) so the label can re-home their pipeline
  // without losing the original referral attribution.
  defaultPressId: varchar("default_press_id"),
  // Task #736 — press mode (super-admin god-view). null = inherit
  // (resolve artist → label → "dedicated" default); "dedicated" locks
  // the album Sell panel to the single resolved plant (press-demo);
  // "all" unlocks the press picker + side-by-side multi-bid comparison
  // (investor / unaffiliated-artist demo). Layered on top of the
  // immutable invitedByPressId provenance stamp — a separate concept.
  pressMode: text("press_mode"),
  createdAt: timestamp("created_at").defaultNow(),
  ...softDeleteCols,
}, (table) => ({
  // Task #1254 — domain uniqueness must exclude soft-deleted rows so
  // trashing a label immediately frees its domain slot for re-creation
  // (mirrors the vendors_domain_top_uniq fix). drizzle-kit doesn't push
  // WHERE-claused indexes, so the matching partial index lives in
  // scripts/post-merge.sh (migrate_softdelete_natural_key_uniques) and
  // scripts/prod-schema-fixups/2026-06-04-task-1254-softdelete-natural-key-uniques.sql.
  domainUniq: uniqueIndex("labels_domain_unique")
    .on(table.domain)
    .where(sql`${table.domain} IS NOT NULL AND ${table.deletedAt} IS NULL`),
}));

// Task #1425 — Manager ENTITY. A "manager" represents an artist-management
// company (or a solo manager) that looks after a roster of acts. It mirrors
// the `labels` entity almost exactly — same paste-a-URL Add flow, same logo
// curation lock, same soft-delete + domain partial-unique — but managers do
// NOT carry press/Shopify/pricing fields (out of scope) and there is NO
// `albums.managerId`: a manager's catalog is derived from the albums of the
// people on its roster (people.managerId). NOTE: this is a different concept
// from the teammate sub-role "manager" (memberships.sub_role); the manager
// ENTITY / role / scope-kind all live in their own columns.
export const managers = pgTable("managers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  // Canonical apex domain (lowercased, no www) — the dedup key for the
  // "paste a manager URL" Add flow. Nullable for hand-created rows.
  // Uniqueness is enforced by the partial index in the table callback
  // (excludes soft-deleted rows), applied to both DBs via post-merge.sh.
  domain: text("domain"),
  logoUrl: text("logo_url"),
  // Curation lock on `logoUrl`. Mirrors `labels.logoLocked` — automated
  // enrichment paths skip the write when true; explicit operator Replace
  // bypasses it.
  logoLocked: boolean("logo_locked").notNull().default(false),
  bio: text("bio"),
  location: text("location"),
  // Structured snapshot of the Places-picked location (mirrors labels).
  locationAddress: jsonb("location_address").$type<PartnerAddressSnapshot>(),
  websiteUrl: text("website_url"),
  instagramUrl: text("instagram_url"),
  coverUrl: text("cover_url"),
  createdAt: timestamp("created_at").defaultNow(),
  ...softDeleteCols,
}, (table) => ({
  // Domain uniqueness excludes soft-deleted rows — see labels.domainUniq.
  // drizzle-kit doesn't push WHERE-claused indexes, so the matching partial
  // index is hand-applied in scripts/post-merge.sh + the dated
  // prod-schema-fixups SQL.
  domainUniq: uniqueIndex("managers_domain_unique")
    .on(table.domain)
    .where(sql`${table.domain} IS NOT NULL AND ${table.deletedAt} IS NULL`),
}));

export const albums = pgTable("albums", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  artwork: text("artwork").notNull(),
  year: integer("year"),
  // Release format. One of "Single" (1 track — only reachable via
  // streaming-catalog imports; GoodTunes itself never sells a single),
  // "Duo" (2 tracks — the smallest GoodTunes-curated bundle), "EP"
  // (3–7 tracks), "LP" (8+ tracks, the full-length record; covers
  // Double-LPs too — the physical-pressing surface will add an
  // `isDoubleLP` boolean when that ships). Legacy rows used "album" —
  // migrated to "LP" on the 2026-05 schema bump.
  type: text("type").notNull().default("LP"),
  description: text("description"),
  // ISO YYYY-MM-DD. Day GoodTunes goes live with the in-app player (the
  // bundle-holder pre-streaming window starts here). Nullable while the
  // album is still being assembled.
  goodTunesReleaseDate: text("good_tunes_release_date"),
  // ISO YYYY-MM-DD. Day the same album drops on Apple/Spotify/etc. When
  // this date hits, the player surfaces a "Now on streaming — listen
  // anywhere" banner so we're not holding fans hostage.
  streamingReleaseDate: text("streaming_release_date"),
  // Task #1078 — Apple-Music-style album footer. `originalReleaseDate`
  // (ISO YYYY-MM-DD) is the canonical FIRST release date of the record —
  // for reissues this is the original press, not the GoodTunes go-live —
  // and renders as the full "February 16, 2010" line in the footer. Falls
  // back to the year-only footer when null. `copyrightLine` is the free-
  // text ℗ phonogram credit (operator enters "2009 Brash Music"; the UI
  // prepends the ℗ glyph). Both nullable; neither is auto-imported.
  originalReleaseDate: text("original_release_date"),
  copyrightLine: text("copyright_line"),
  // Task #1158 — per-album footer copyright symbol. The footer prepends a
  // symbol in front of `copyrightLine`; this picks which one. "℗" (sound-
  // recording / phonogram — the music-industry default) or "©" (general
  // copyright). Nullable; null renders as "℗" so every existing album is
  // unchanged. Operator-chosen in the album editor; never auto-imported.
  copyrightSymbol: text("copyright_symbol"),
  // The label this album was released on. SET NULL so deleting a label
  // doesn't take down its catalog; the album just loses its label credit
  // until reassigned. Album reads denormalize the joined label entity
  // into `album.label` so the fan side can render it without a 2nd fetch.
  labelId: varchar("label_id").references(() => labels.id, { onDelete: "set null" }),
  // Primary artist of this album as a real People row. Optional + SET NULL —
  // the `artist` text column above stays the canonical display string (so
  // legacy rows + reissues with collaboration billing keep rendering even
  // when there's no profile). When `primaryArtistId` is set the admin UI
  // mirrors the People name into `artist` on save, and the artist page can
  // surface this album under "GoodTunes Releases".
  primaryArtistId: varchar("primary_artist_id").references(() => people.id, { onDelete: "set null" }),
  // Demo show/hide flag. When true the album is excluded from public catalog
  // reads (album list + detail) AND from the fan-facing credits surface,
  // effectively hiding the artist + all their songs/credits in one toggle.
  // Admin endpoints keep returning hidden rows so the CMS can flip them back.
  isHidden: boolean("is_hidden").notNull().default(false),
  // True only for albums GoodTunes is actually releasing — i.e. curated by
  // the label, not pulled in via a People discography import. The admin
  // Albums sidebar filters to these by default so the second column stays
  // reserved for GoodTunes releases. Discography-imported albums still
  // live in the DB (so they remain reachable from a person's profile
  // and from the credits surface), they're just absent from this list.
  isGoodTunesRelease: boolean("is_goodtunes_release").notNull().default(false),
  // Task #440 — "Prepping" lifecycle gate. New GoodTunes shells created
  // via "+ Add Album" land here (`isPrepping=true, isGoodTunesRelease=true`)
  // so the Released tab doesn't fill up with "Unknown artist / 0 tracks"
  // placeholder rows. Promotion to Released is an explicit admin step on
  // the album detail page that flips this back to false. Default false
  // so every existing row (which the admin has long since treated as
  // Released) stays put on rollout. Independent of `isGoodTunesRelease`,
  // which still distinguishes streaming-imported catalog from curated
  // GoodTunes releases (see docs/admin-conventions.md).
  isPrepping: boolean("is_prepping").notNull().default(false),
  // Parental-advisory flag. When true the consumer surfaces a small "E"
  // badge next to the album title (Apple Music / Spotify convention).
  // Admin toggle lives in AdminAlbum's header; defaults false because most
  // catalog rows are clean and we don't want to force a per-album decision
  // on every import.
  isExplicit: boolean("is_explicit").notNull().default(false),
  // Admin-only "SPIN Promo (digital-only legacy)" marker. When true, the
  // admin album page drops all manufacturing surfaces: the Path-to-press
  // strip, the Package tab, the Physical tab, and the Shopify tab. Only
  // Overview + Digital remain. Cover-art editing (header thumbnail →
  // ArtworkPanel dialog) stays reachable on Overview. Deep-linking to a
  // now-hidden tab (?tab=sell/press/shopify) falls back to Overview.
  // ZERO fan-facing behavior (no Library/lifecycle/playback effect).
  isSpinPromo: boolean("is_spin_promo").notNull().default(false),
  // Task #965 — clean per-release share slug for get.goodtunes.music/<slug>.
  // Optional; null means the album has no clean link (UUID still works).
  // Unique on non-null. Normalized + validated (reserved-word check) at the
  // PUT layer via shared/shareSlug.ts. The public resolver only returns an
  // album for its slug when it's buy-eligible (non-hidden, non-prepping,
  // non-soft-deleted), so a slug is no less secure than the UUID URL.
  // Uniqueness is enforced by the partial index in the table callback
  // (excludes soft-deleted rows, Task #1254) — see `shareSlugUniq`.
  shareSlug: text("share_slug"),
  // Streaming-service handoff. We host the album in-app for the first ~2 weeks
  // then surface "Listen on Apple Music / Spotify" buttons on the album page
  // that point fans at the canonical album URL on each service — same
  // referral logic as the per-artist links on `people`.
  appleMusicUrl: text("apple_music_url"),
  spotifyUrl: text("spotify_url"),
  // Additional streaming-service handoff links (Task #816). Same external
  // "Listen on …" referral role as Apple Music / Spotify above — operators
  // paste these in the album editor, fans pick any of the six as their
  // remembered handoff service. Never in-app playback.
  tidalUrl: text("tidal_url"),
  qobuzUrl: text("qobuz_url"),
  deezerUrl: text("deezer_url"),
  pandoraUrl: text("pandora_url"),
  // Single primary genre string ("Indie Rock", "Soul", "Ambient"). Free-text
  // for now — admin types it in, fan-side renders it next to the year
  // under the artist on the album page. Optional: legacy rows + imports
  // without a genre stay null and the "Genre · Year" line collapses to
  // just the year on the fan side.
  genre: text("genre"),
  // Liner notes — the full original prose from the album's credits doc
  // (PDF/Word/text) preserved verbatim after a credits-importer run.
  // Structured per-track writers + performers go into trackWriters /
  // trackPerformers, but this field is the human-readable "back of the
  // record" version: anything the AI couldn't slot into a structured row
  // is still readable here. Surfaced on the album detail page when set.
  linerNotes: text("liner_notes"),
  // ─── Task #48 — per-album payout override ────────────────────────
  // When set, this album's orders use these split values instead of
  // the global payout_settings row. NULL means "inherit the default".
  // `payoutOwnerKind` + `payoutOwnerId` let an operator route revenue
  // to a specific People or Label row when the album's primaryArtistId
  // / labelId isn't who should be paid (e.g. compilations, side
  // projects). When NULL we fall back to labelId, then primaryArtistId.
  payoutFeePctOverride: integer("payout_fee_pct_override"),
  payoutCertCentsOverride: integer("payout_cert_cents_override"),
  payoutOwnerKind: text("payout_owner_kind"),
  payoutOwnerId: varchar("payout_owner_id"),
  // Bundle purchase price in cents (e.g. 1999 for $19.99). Nullable so
  // back-catalog rows and discography-imported albums (which aren't for
  // sale on GoodTunes) stay null and don't surface a Buy Bundle CTA. Set
  // by admin on the Preview & Purchase pipeline. Real checkout (Stripe +
  // cart sheet) arrives in later tasks — this is the data + stub button.
  priceCents: integer("price_cents"),
  // Task #79 — post-sale edit lock. Stamped the moment an album's first
  // paid order materializes (Stripe webhook + Shopify webhook + dev
  // mint). Once non-null, partner-side metadata mutations require a
  // super-admin unlock (admin_overrides row) or are written into the
  // pending_changes queue. Super-admin is never blocked. Idempotent —
  // only written when currently null, never reset on refund.
  firstSoldAt: timestamp("first_sold_at"),
  // Task #242 — One-click Push to Shopify (draft product).
  // `maxRedemptions` is the inventory cap for the digital-edition
  // variant on Shopify (label can leave NULL to leave inventory
  // untracked / uncapped). `signedCertRetailCents` is the fan-facing
  // retail of the optional signed-cert variant when the album has the
  // signed_cert addon enabled — must clear the wholesale rung GoodTunes
  // will bill at window close (the earnings preview surfaces this).
  // The `shopifyPush*` fields persist the draft product's Shopify ids
  // after a successful push so re-clicking Push updates the same draft
  // (idempotent) instead of creating duplicates. `shopifyPushSnapshot`
  // captures a fingerprint of what we last sent so we can detect
  // post-push edits the label made on the Shopify side and warn before
  // overwriting them.
  maxRedemptions: integer("max_redemptions"),
  signedCertRetailCents: integer("signed_cert_retail_cents"),
  shopifyPushStoreId: varchar("shopify_push_store_id"),
  shopifyPushProductId: text("shopify_push_product_id"),
  shopifyPushEditionVariantId: text("shopify_push_edition_variant_id"),
  shopifyPushCertVariantId: text("shopify_push_cert_variant_id"),
  shopifyPushedAt: timestamp("shopify_pushed_at"),
  shopifyPushSnapshot: jsonb("shopify_push_snapshot").$type<ShopifyPushSnapshot>(),
  // ─── Task #246 — Signed-cert sale-window batch workflow ────────────
  // Optional sale-window for the signed-cert addon. When set, fan
  // orders carrying the cert addon while open mint a `cert_reservations`
  // row with a reserved GoodDeed number. At close, a min-check refunds
  // the cert line (below 25) or flips into the production pipeline
  // (>=25). Window status reflects the lifecycle the operator walks
  // through on the album panel. After the window has closed, any new
  // Shopify orders that still carry the cert variant are recorded as
  // `digital_only` reservations — no print row is added.
  //
  //   null              — no window configured (legacy behaviour)
  //   "scheduled"       — opensAt is in the future
  //   "open"            — opensAt <= now < closesAt; mints reservations
  //   "closed_below_min"— closesAt reached with <25 reservations; refunded
  //   "in_production"   — closesAt reached, snapshot stamped, batch live
  //   "shipped"         — batch reached the "inserted" step
  //   "cancelled"       — operator-cancelled before close (rare)
  signedCertWindowOpensAt: timestamp("signed_cert_window_opens_at"),
  signedCertWindowClosesAt: timestamp("signed_cert_window_closes_at"),
  signedCertWindowStatus: text("signed_cert_window_status"),
  signedCertWindowClosedAt: timestamp("signed_cert_window_closed_at"),
  // Operations tracker — six steps, one timestamp + free-text note
  // each. The note bag is a tiny `{ stepKey: note }` jsonb so the same
  // row can be edited without N round-trips.
  certBatchSentToPressAt: timestamp("cert_batch_sent_to_press_at"),
  certBatchAtArtistAt: timestamp("cert_batch_at_artist_at"),
  certBatchReturnedAt: timestamp("cert_batch_returned_at"),
  certBatchHologramAt: timestamp("cert_batch_hologram_at"),
  certBatchShippedToFulfillmentAt: timestamp("cert_batch_shipped_to_fulfillment_at"),
  certBatchInsertedAt: timestamp("cert_batch_inserted_at"),
  certBatchNotes: jsonb("cert_batch_notes").$type<Record<string, string>>(),
  certBatchPdfAssetUrl: text("cert_batch_pdf_asset_url"),
  certBatchPdfGeneratedAt: timestamp("cert_batch_pdf_generated_at"),
  // Task #335 — sell mode + physical format.
  // `sellMode`: "direct" (GoodTunes Direct: digital + optional press) or
  // "shopify" (digital + optional GoodDeed addon only; label fulfills
  // the physical product themselves). Null on freshly-created albums
  // until the operator picks in the two-step creation modal.
  // `physicalFormat`: the format chosen up front when sellMode=direct —
  // drives the Sell-tab quote flow (Hellbender catalog) and the Path-to-
  // press stepper. Null for sellMode=shopify (no press path) and for
  // direct albums that haven't picked yet.
  // `sellQuoteLockedAt`: timestamped when the operator hits "Lock in
  // quote" on the Sell tab. Until non-null, the Press/Shopify/Bonus
  // tabs stay hidden — Overview/Tracks/Sell are the only surfaces. Lock
  // is reversible until the run actually goes to press.
  sellMode: text("sell_mode"),
  physicalFormat: text("physical_format"),
  sellQuoteLockedAt: timestamp("sell_quote_locked_at"),
  // Task #429 — Anticipated track count used to drive the Sell-panel
  // Publishing estimate (`N × $0.254`) BEFORE any masters have been
  // uploaded. NULL means "fall back to the live song count" — the
  // moment songs.length > 0 the field is read-only on the UI and the
  // estimate uses the real tracklist. Capped at 99 by the route.
  anticipatedTrackCount: integer("anticipated_track_count"),
  // gogoods.com legacy import id — used by the importer to dedupe and
  // by Tasks #400/#402/#403/#404 to reconnect legacy assets. Nullable;
  // populated only for rows that came in via the legacy export.
  legacyGogoodsId: text("legacy_gogoods_id"),
  // Task #522 — Press portal pipeline state. `mastersTriggeredAt` is
  // set the moment fan-earmarked revenue crosses the press's
  // masters_prep_cost_cents threshold (artist is notified). The artist
  // approves early-start; `mastersApprovedByArtistAt` is stamped then,
  // and the press's pipeline card flips into the "Masters triggered"
  // column with an "Approved — start masters" CTA. The press uploads
  // their PDF invoice once the run goes to plant; the URL + total +
  // optional note live here so the artist + admin see variance vs the
  // locked quote without a second round-trip. `pressInvoiceOutsideSystem`
  // is the escape hatch for presses that bill outside GoodTunes — flips
  // the same "In production" stage transition without requiring a file.
  mastersTriggeredAt: timestamp("masters_triggered_at"),
  mastersApprovedByArtistAt: timestamp("masters_approved_by_artist_at"),
  pressInvoiceUrl: text("press_invoice_url"),
  pressInvoiceTotalCents: integer("press_invoice_total_cents"),
  pressInvoiceNote: text("press_invoice_note"),
  pressInvoiceUploadedAt: timestamp("press_invoice_uploaded_at"),
  pressInvoiceOutsideSystem: boolean("press_invoice_outside_system").notNull().default(false),
  // Task #527 — Stripe Connect transfer earmarking the captured
  // invoice total to the press's connected account. Set the first
  // time the invoice POST succeeds (and the press has a payouts-enabled
  // Connect account); kept stable for the life of the album so the
  // re-upload path doesn't double-mint. `pressInvoiceTransferError`
  // captures the most recent failure reason if Stripe rejected the
  // transfer — surfaced on the press's Payouts subtab so the operator
  // can fix the underlying account state and retry.
  pressInvoiceTransferId: text("press_invoice_transfer_id"),
  pressInvoiceTransferredAt: timestamp("press_invoice_transferred_at"),
  pressInvoiceTransferAmountCents: integer("press_invoice_transfer_amount_cents"),
  pressInvoiceTransferError: text("press_invoice_transfer_error"),
  // Short hash of (invoiceUrl|totalCents) the transfer was minted
  // against. Lets us tell "same invoice, retry" from "corrected invoice,
  // remint" without comparing dollars-only (which would collapse two
  // distinct same-amount invoices). Cleared whenever a new invoice
  // identity supersedes the prior one, so a failed/skipped remint
  // can't display a stale prior success.
  pressInvoiceTransferInvoiceKey: text("press_invoice_transfer_invoice_key"),
  // Heads-up to fulfillment was sent on Locked transition. Re-fires
  // when the locked quantity changes by >5%; we keep the last-sent
  // snapshot so the re-fire check doesn't double-send for tiny drifts.
  fulfillmentHeadsUpSentAt: timestamp("fulfillment_heads_up_sent_at"),
  fulfillmentHeadsUpQty: integer("fulfillment_heads_up_qty"),
  // Task #541 — vinyl press format chosen for the *cut* (independent of
  // the streaming/digital release). One of the keys in
  // `shared/vinylFormatRules.ts`: 12_33_single, 12_33_double, 12_45,
  // 7_45. Null until the artist picks on the Tracks → Vinyl-order view.
  // Distinct from `physicalFormat` (which is the Sell-panel SKU choice
  // — single_lp/double_lp/seven_inch/cassette); the cut format here is
  // a finer-grained pressing decision (33⅓ vs 45 RPM) that drives the
  // safe-length warnings per side. Defaults to a value derived from
  // `physicalFormat` if the artist hasn't picked one yet.
  vinylFormat: text("vinyl_format"),
  // Task #533 — Pool-funded early masters cut. On every paid fan sale a
  // per-unit slice (the "press earmark") is set aside into a per-album
  // press funding pool sized to exactly cover the picked tier's
  // minimum-run press cost. These two columns are the running derived
  // totals (the authoritative per-event rows live in
  // `album_press_pool_ledger`); we denorm the sums here so the SellPanel
  // popover, AdminAlbum readout, and the eligibility evaluator can read
  // `available = accrued - released` without aggregating the ledger on
  // every request. The pool starts at zero on rollout — sales that
  // happened before this task landed do NOT retroactively contribute.
  pressPoolAccruedCents: integer("press_pool_accrued_cents").notNull().default(0),
  pressPoolReleasedCents: integer("press_pool_released_cents").notNull().default(0),
  // Operator-recorded units PRESSED for the mechanical publishing
  // settlement, used ONLY when this album's pressing didn't run through
  // the in-app pressing_order_requests pipeline (e.g. Nick Carter's
  // catalog was pressed offline — Memphis billed the Double LP across two
  // purchase orders). The settlement basis is the sum of APPROVED
  // pressing_order_requests when any exist; this column is the fallback
  // for offline runs so the Publishing view shows the real owed total
  // instead of $0. NULL = no offline run recorded (basis stays 0 unless
  // approved pressing orders exist). Never auto-imported.
  mechanicalUnitsPressed: integer("mechanical_units_pressed"),
  // Artist opt-in for the early cut (gate #2 of three). Default OFF —
  // the artist ticks the SellPanel checkbox after seeing the cost
  // breakdown for their currently-picked POR tier. We record WHICH
  // tier + format they consented against so re-picking a different
  // format/tier invalidates the consent (the server clears these
  // columns when the SKU tier changes), forcing a fresh tick.
  earlyCutConsentAt: timestamp("early_cut_consent_at"),
  earlyCutConsentByUserId: varchar("early_cut_consent_by_user_id"),
  earlyCutConsentForTierName: text("early_cut_consent_for_tier_name"),
  earlyCutConsentForFormat: text("early_cut_consent_for_format"),
  ...softDeleteCols,
}, (t) => ({
  legacyGogoodsIdUniq: uniqueIndex("albums_legacy_gogoods_id_uniq")
    .on(t.legacyGogoodsId)
    .where(sql`${t.legacyGogoodsId} IS NOT NULL`),
  // Task #1310 — album share-slug is now unique PER ARTIST, not globally.
  // The matching partial composite index lives in scripts/post-merge.sh
  // (migrate_task_1310_share_slugs) because drizzle-kit doesn't push
  // WHERE-claused indexes. The old global albums_share_slug_unique index
  // is dropped there and replaced with this per-artist composite.
  artistShareSlugUniq: uniqueIndex("albums_artist_share_slug_unique")
    .on(t.primaryArtistId, t.shareSlug)
    .where(sql`${t.primaryArtistId} IS NOT NULL AND ${t.shareSlug} IS NOT NULL AND ${t.deletedAt} IS NULL`),
}));

export const ALBUM_SELL_MODES = ["direct", "shopify"] as const;
export type AlbumSellMode = (typeof ALBUM_SELL_MODES)[number];
export const ALBUM_PHYSICAL_FORMATS = [
  "single_lp",
  "double_lp",
  "seven_inch",
  "cassette",
] as const;
export type AlbumPhysicalFormat = (typeof ALBUM_PHYSICAL_FORMATS)[number];
export const ALBUM_PHYSICAL_FORMAT_LABEL: Record<AlbumPhysicalFormat, string> = {
  single_lp: "Single LP",
  double_lp: "Double LP",
  seven_inch: "7\" Vinyl",
  cassette: "Cassette",
};
// The New Album dialog stores its own format vocabulary
// (`ALBUM_PHYSICAL_FORMATS`) — Single LP / Double LP / 7" / Cassette.
// The Sell-panel SKU machinery keys off a different list
// (`ALBUM_FORMATS` below) — 7_inch / 12_lp / 12_double / cassette / cd.
// Map between them when the dialog's pick is seeded into a draft SKU
// row, otherwise the row arrives with a key SkuRow can't recognise
// (e.g. "seven_inch" instead of "7_inch") and falls out of the vinyl
// branch entirely.
export const PHYSICAL_FORMAT_TO_ALBUM_FORMAT: Record<
  AlbumPhysicalFormat,
  "7_inch" | "12_lp" | "12_double" | "cassette"
> = {
  seven_inch: "7_inch",
  single_lp: "12_lp",
  double_lp: "12_double",
  cassette: "cassette",
};
// Reverse of the map above, keyed by the Sell-panel SKU vocabulary
// (`ALBUM_FORMATS`). Used to keep `albums.physicalFormat` in sync when
// a vinyl SKU's format is swapped in the Sell panel so the Tracklist /
// Side-length panel (which reads `albums.physicalFormat`) re-derives
// the side count + per-side limit. `cd` has no physical-format / vinyl
// side layout, so it maps to `null` — callers must skip the sync (and
// must not corrupt `physicalFormat`) for CDs.
export const ALBUM_FORMAT_TO_PHYSICAL_FORMAT: Record<
  "7_inch" | "12_lp" | "12_double" | "cassette" | "cd",
  AlbumPhysicalFormat | null
> = {
  "7_inch": "seven_inch",
  "12_lp": "single_lp",
  "12_double": "double_lp",
  cassette: "cassette",
  cd: null,
};

// Fingerprint of what was last sent to Shopify on a Push. Re-push
// fetches the live product and diffs the same shape against this row
// — any field whose Shopify value diverges from the snapshot means the
// label edited it after our push, and we surface a confirm-overwrite
// in the UI before clobbering.
export type ShopifyPushSnapshot = {
  title: string;
  bodyHtml: string;
  vendor: string;
  tags: string;
  edition: {
    priceCents: number;
    inventory: number | null;
  };
  cert: {
    priceCents: number;
    inventory: number | null;
  } | null;
};

// Bonus content attached to an album. Both tables are intentionally
// tiny — admin uploads a file via /api/admin/upload (Object Storage),
// then POSTs the returned URL here as `videoUrl` / `photoUrl`. Fan-side
// surfaces these only when there's at least one row, so a clean album
// keeps the same scrolling layout it has today. `position` drives
// display order so the admin can reorder without renumbering anything.
// FK on delete cascade — wiping an album wipes its bonus content too.
export const albumVideos = pgTable("album_videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled video"),
  // Short blurb shown under the video on the fan side. Optional —
  // most album videos are self-explanatory from the title alone.
  description: text("description"),
  // /objects/uploads/<uuid>.mp4 served by Object Storage. Uploaded MP4
  // (or whatever video MIME the admin picked — we don't restrict here,
  // the multer config does).
  videoUrl: text("video_url").notNull(),
  // Optional still frame for the thumbnail. When null the fan-side
  // renders a generic play-icon tile.
  posterUrl: text("poster_url"),
  // Original URL the operator pasted when importing (Dropbox share,
  // direct .mp4 link, etc.). NULL for direct file uploads. Surfaced
  // in the admin Edit dialog as an "Imported from <host>" chip so
  // Bill can copy/open the original. Never shown fan-side.
  sourceUrl: text("source_url"),
  position: integer("position").notNull().default(0),
  // Mux pipeline — bonus videos stream as signed, adaptive-bitrate HLS
  // (same path as audio masters), NOT as the raw progressive MP4. The
  // original upload above (`videoUrl`) is preserved in Object Storage and
  // used only as Mux's ingest source. `muxStatus`: null | "preparing" |
  // "ready" | "errored". A row only plays fan-side when status is "ready"
  // and a playback id exists; otherwise the player shows a "preparing" tile.
  muxAssetId: text("mux_asset_id"),
  muxPlaybackId: text("mux_playback_id"),
  muxStatus: text("mux_status"),
  muxLastError: text("mux_last_error"),
  // Task #1470 — persisted Mux auto-retry ladder, mirroring songs'
  // mux_retry_count / mux_last_retry_at. A bonus video that DOES have an
  // /objects/ source but whose Mux conversion genuinely errors used to be
  // re-attempted by the reconcile sweep on every interval forever. These
  // two columns let reconcileMuxVideos apply exponential backoff and stop
  // after BACKFILL_MAX_ATTEMPTS, leaving the row terminally `errored`
  // (admin warning badge + fan "unavailable") instead of spamming Mux.
  // Both reset to 0/null the moment an ingest succeeds (status → ready).
  muxRetryCount: integer("mux_retry_count").notNull().default(0),
  muxLastRetryAt: timestamp("mux_last_retry_at"),
  ...softDeleteCols,
});

export const albumPhotos = pgTable("album_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  // /objects/uploads/<uuid>.<ext> — same upload path as album artwork
  // and profile photos.
  photoUrl: text("photo_url").notNull(),
  // Optional caption rendered under the photo on the fan-side gallery.
  caption: text("caption"),
  position: integer("position").notNull().default(0),
  ...softDeleteCols,
});

export const songs = pgTable("songs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id),
  title: text("title").notNull(),
  trackNumber: integer("track_number").notNull(),
  duration: integer("duration").notNull().default(180),
  lyrics: text("lyrics"),
  audioUrl: text("audio_url"),
  // Browser-friendly playback URL is in `audioUrl`. When the operator
  // uploads a master in a format the browser can't decode (24-bit /
  // 32-bit / 32-bit-float PCM WAV is the common one — HTML5 <audio>
  // only handles 16-bit PCM reliably), the import pipeline transcodes
  // it to FLAC for `audioUrl` and stashes the ORIGINAL bytes here
  // under `audioSourceUrl`. Null when the upload was already
  // browser-friendly (no transcode happened). Used for: archival,
  // re-mastering for streaming services, and a "Download original"
  // affordance on the admin master row.
  audioSourceUrl: text("audio_source_url"),
  // Per-line WebVTT-derived timing. Uploaded by admin as a .vtt file,
  // parsed client-side into { timeMs, text } cues. When present, the
  // Player's lyrics overlay uses these timestamps verbatim instead of
  // auto-distributing the plain-text `lyrics` field across duration.
  syncedLyrics: jsonb("synced_lyrics").$type<{ timeMs: number; endMs?: number; text: string }[]>(),
  // Marks a track that has no lyrics by design (instrumental / interlude /
  // outro). The Lyrics status dot then reads "intentionally none" (grey
  // Ban glyph) instead of "missing" (empty grey ring). Default false.
  instrumental: boolean("instrumental").notNull().default(false),
  // Per-track explicit flag — Apple Music's model. The fan-facing
  // tracklist renders a small "E" pill next to the title when true.
  // Album.isExplicit stays as a separate override (artwork/title
  // advisory) so admins can mark the whole record without flipping
  // every song; the album card's "E" badge lights up if either is on.
  isExplicit: boolean("is_explicit").notNull().default(false),
  // Legacy "opt-in preview single" flag. Superseded by the inverted
  // `previewHidden` model below — every track is previewable by default
  // and the admin only flips a switch to hide a preview. Kept in the
  // schema so the publish dev→prod diff doesn't try to DROP the column.
  // No code path reads it anymore.
  isPreviewable: boolean("is_previewable").notNull().default(false),
  // Inverted preview gate — when true, fans CANNOT play the pre-purchase
  // preview for this track. Default false (every track is previewable
  // out of the box). Toggle ON in the admin Master tile to embargo a
  // single track (e.g. an unreleased bonus). Lives alongside
  // `previewHiddenUntil` (optional sunrise) — a background sweep + lazy
  // read normalization unhides any track whose sunrise has passed.
  previewHidden: boolean("preview_hidden").notNull().default(false),
  // Optional sunrise. NULL while the hide flag is OFF, or when the
  // operator chose "hide indefinitely". A non-null value means the
  // server should auto-unhide the preview at that timestamp.
  previewHiddenUntil: timestamp("preview_hidden_until"),
  // Denormalized "song in N playlists" counter. Incremented in storage's
  // addSongToPlaylist / decremented in removeSongFromPlaylist (and on
  // cascade from deletePlaylist), so the analytics roll-up / admin "most
  // playlisted" surface doesn't have to COUNT(*) joining playlist_songs
  // on every read. Default 0 — backfilled lazily as users add/remove.
  playlistCount: integer("playlist_count").notNull().default(0),
  // The 30-second in-app preview window. When both are null, the player
  // auto-derives a preview from the first 30s of the master (v1 default
  // → Preview status dot reads "auto-set", green check). When the admin
  // hand-picks a window via the Preview Slider™ — by dragging the
  // handles, typing a timestamp, or uploading a custom clip — these
  // store the chosen window in milliseconds and the Preview dot flips
  // to the gold "custom clip" state (rounded-rectangle glyph). FK is
  // implicit: the window lives on the master, not the song row, but the
  // master is one-to-one with the song so we colocate the fields here.
  previewStartMs: integer("preview_start_ms"),
  previewEndMs: integer("preview_end_ms"),
  // Pre-computed waveform peaks for the master file. Generated server-side
  // at upload (or via the admin "Regenerate waveform" action) by piping
  // the master through ffmpeg → mono 8 kHz PCM → ~200 normalized peaks
  // (0..1, loudest = 1). Powers the Preview Slider™ window picker and the
  // consumer Now Playing scrubber so both render the same shape that
  // matches the actual audio. Null until the master has been analyzed —
  // UI falls back to decorative bars in that case.
  waveform: jsonb("waveform").$type<number[]>(),
  // Mux integration (launch-plan Phase 3). When an admin migrates a
  // master to Mux, the import pipeline POSTs the WAV to Mux as a new
  // asset under `playback_policy: signed` and stashes the IDs here.
  // - `muxAssetId`     — internal Mux asset handle, returned synchronously
  //                       at creation. Persists even before encoding finishes.
  // - `muxPlaybackId`  — the HLS playback handle (`https://stream.mux.com/<id>.m3u8`).
  //                       Only set once Mux fires `video.asset.ready`.
  // - `muxStatus`      — `preparing` (asset created, encoding) → `ready`
  //                       (playable) → `errored` (Mux failed). Drives the
  //                       admin "Mux: ready/preparing/errored" pill on the
  //                       Tracks tab and gates the player swap to HLS.
  // The original `audioUrl` is left intact so non-Mux songs keep playing
  // and we can fall back if a Mux asset gets deleted. Once all songs are
  // on Mux + Phase 3 audit lands, the Object-Storage masters become
  // archival only and we restrict their ACL.
  muxAssetId: text("mux_asset_id"),
  muxPlaybackId: text("mux_playback_id"),
  muxStatus: text("mux_status"),
  // Task #364 — human-readable reason captured from Mux when an ingest
  // errors out (e.g. "invalid_input · could not download the asset"). The
  // boot reconcile sweep fetches the Mux asset for every `errored` song
  // and pins the message here so admins see WHY the track isn't streaming
  // without needing to open the Mux dashboard. Cleared back to null the
  // moment a retry succeeds (status flips to `ready`).
  muxLastError: text("mux_last_error"),
  // Task #370 — Persisted Mux auto-retry ladder. The backfill sweep
  // used to track attempts in an in-memory Map, which meant every
  // deploy or crash forgot the ladder and granted every `errored`
  // song a fresh round of retries. Persisting the count + last-attempt
  // timestamp on the row makes the BACKFILL_MAX_ATTEMPTS cap meaningful
  // across restarts, so a permanently-broken master ages out cleanly
  // instead of re-hitting Mux on every flapping deploy. Both reset to
  // 0/null the moment an ingest succeeds (status flips to `ready`).
  muxRetryCount: integer("mux_retry_count").notNull().default(0),
  muxLastRetryAt: timestamp("mux_last_retry_at"),
  // Master tech specs — populated at upload time by ffprobe so the
  // admin track UI can surface a one-line `format · sample rate ·
  // bit depth · channels · bytes · duration` readout (Task #317) and
  // the operator can confirm at a glance what'll ship to the press
  // vendor. All nullable — older rows that predate the probe show
  // whatever subset we have, never an error.
  //
  // `audio*` reflect the AS-SERVED playback file (`audioUrl`). When a
  // master was transcoded on upload (e.g. 24-bit WAV → FLAC), the
  // `audioSource*` fields mirror the AS-PRESSED ORIGINAL bytes that
  // live at `audioSourceUrl`. Source fields stay null on passthrough
  // uploads — the served file IS the original.
  audioFormat: text("audio_format"),
  audioContainerExt: text("audio_container_ext"),
  audioSampleRate: integer("audio_sample_rate"),
  audioBitDepth: integer("audio_bit_depth"),
  audioChannels: integer("audio_channels"),
  audioBytes: integer("audio_bytes"),
  audioSourceFormat: text("audio_source_format"),
  audioSourceContainerExt: text("audio_source_container_ext"),
  audioSourceSampleRate: integer("audio_source_sample_rate"),
  audioSourceBitDepth: integer("audio_source_bit_depth"),
  audioSourceChannels: integer("audio_source_channels"),
  audioSourceBytes: integer("audio_source_bytes"),
  // Task #541 — Vinyl-specific track order. `vinylSide` is one of
  // "A"/"B"/"C"/"D" (depending on the album's `vinylFormat`); `vinylOrder`
  // is the 1-indexed position WITHIN that side. Both null until the
  // artist opens the Tracks → Vinyl-order view; the UI then seeds them
  // from `trackNumber` (digital order) on first edit. Press masters PDF
  // generation reads these when present, otherwise falls back to
  // trackNumber so legacy albums keep cutting in digital order.
  vinylSide: text("vinyl_side"),
  vinylOrder: integer("vinyl_order"),
  // Task #734 — "stream-elsewhere" track type. A credits-bearing track
  // GoodTunes does NOT host: no uploaded master (`audioUrl` stays null),
  // but it carries full SuperCredits and a per-track link out to the
  // streaming services that DO host it. When true, the fan player must
  // NEVER attempt in-app playback (no Mux, no raw audio) — taps route to
  // the streaming handoff instead. Distinct from "master not ready yet",
  // which pauses; a stream-only track never plays here by design.
  streamOnly: boolean("stream_only").notNull().default(false),
  // Canonical per-track web links for the streaming handoff. Pasted or
  // looked up via the Spotify API in the album editor. Spotify is the
  // confirmed source; Apple Music is optional when a per-track link is
  // available. Album-level fallbacks live on the album row
  // (`albums.spotifyUrl` / `albums.appleMusicUrl`).
  spotifyTrackUrl: text("spotify_track_url"),
  appleMusicTrackUrl: text("apple_music_track_url"),
  legacyGogoodsId: text("legacy_gogoods_id"),
  ...softDeleteCols,
}, (t) => ({
  legacyGogoodsIdUniq: uniqueIndex("songs_legacy_gogoods_id_uniq")
    .on(t.legacyGogoodsId)
    .where(sql`${t.legacyGogoodsId} IS NOT NULL`),
}));

export const userAlbums = pgTable(
  "user_albums",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id),
    albumId: varchar("album_id").notNull().references(() => albums.id),
    certificateNumber: integer("certificate_number"),
    acquiredAt: timestamp("acquired_at").defaultNow(),
    // Task #909 — a preview is a time-boxed full-playback grant that is
    // NOT a purchase: it mints no GoodDeed number, creates no order, and
    // counts toward nothing. `isPreview` distinguishes it from a real
    // owned/comp row; `previewExpiresAt` is the lazy auto-revoke deadline
    // (a preview past its expiry is treated as "not granted" everywhere
    // it's read). Real owned/comp rows keep isPreview=false / null expiry.
    isPreview: boolean("is_preview").notNull().default(false),
    previewExpiresAt: timestamp("preview_expires_at"),
  },
  (t) => ({
    userAlbumUnique: uniqueIndex("user_albums_user_album_uniq").on(t.userId, t.albumId),
  }),
);

// Task #395 — `userId` is a loose FK. Fan playlists carry a `customer_users.id`
// here; admin playlists (legacy / staff demos) carry a `users.id`. Same pattern
// as `user_albums` and the old `auth_tokens.user_id` — Drizzle's pgTable can't
// express "FK to one of two tables", and the column has to accept both, so we
// drop the `.references()` entirely. `scripts/post-merge.sh` idempotently
// sweeps the leftover `playlists_user_id_users_id_fk` constraint off both
// dev + prod so the publish dev→prod diff can't keep re-adding it (which is
// what broke fan playlist creation with a 500 — see
// .agents/memory/user-albums-loose-fk.md + auth-tokens-fk-recurrence.md).
export const playlists = pgTable("playlists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const playlistSongs = pgTable(
  "playlist_songs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    playlistId: varchar("playlist_id").notNull().references(() => playlists.id),
    songId: varchar("song_id").notNull().references(() => songs.id),
    position: integer("position").notNull().default(0),
    addedAt: timestamp("added_at").defaultNow(),
  },
  (t) => ({
    playlistSongUnique: uniqueIndex("playlist_songs_playlist_song_uniq").on(t.playlistId, t.songId),
  }),
);

// Task #395 — Server-side song & artist favorites for signed-in fans.
// Replaces the localStorage-only `gt:fav:songs` / `gt:fav:artists` keys so
// hearts and stars survive logout, device switch, and reinstall. Anonymous
// fans keep the localStorage path; on first sign-in the client one-shot
// migrates whatever's in localStorage up here, then clears the keys.
//
// `userId` is a loose FK to customer_users.id (same pattern as playlists /
// user_albums) — drizzle pgTable can't express the dual-table reference and
// only fans favorite anyway, but we keep the constraint off so a stray admin
// session (or a future shape change) can't 500 the route.
//
// Artist favorites are keyed by **artist name** because the current data
// model has no stable artist id surfaced to the fan client; the hooks have
// always treated the name string as the identity.
export const songFavorites = pgTable(
  "song_favorites",
  {
    userId: varchar("user_id").notNull(),
    songId: varchar("song_id").notNull().references(() => songs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.songId] }),
  }),
);

export const artistFavorites = pgTable(
  "artist_favorites",
  {
    userId: varchar("user_id").notNull(),
    artistName: text("artist_name").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.artistName] }),
  }),
);

// ----- SuperCredits™ catalog -------------------------------------------
// Bound to song-level credits in a later turn (track_writers /
// track_performers will FK into people + instruments). Keep these
// schemas matching the in-app `Person` / `Instrument` / `InstrumentVendor`
// shapes in client/src/data/musicData.ts so the CMS can fully replace the
// static seed data without a downstream type rewrite.
export const people = pgTable("people", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  photoUrl: text("photo_url"),
  // Optional wide background image for the artist hero — mirrors
  // `vendors.coverUrl` / `labels.coverUrl` so when the fan-side artist
  // page lands we already have a place to put a banner. The initial
  // circle now always falls back to brand blue (#319ED8); the old
  // per-person `accent` hex was removed.
  coverUrl: text("cover_url"),
  // Curation locks. When `true`, automated paths (Spotify bulk-match,
  // credits-import enrichment, future Wikipedia / Apple scrapes) MUST
  // skip writing this field — the admin has explicitly curated it and
  // doesn't want a refresh to clobber their choice. Explicit admin
  // writes (PUT /api/admin/people/:id with a new URL) still go
  // through; the lock is about *automation*, not editability.
  photoLocked: boolean("photo_locked").notNull().default(false),
  coverLocked: boolean("cover_locked").notNull().default(false),
  bio: text("bio"),
  // Optional FK to the label this artist is signed to. Mirrors
  // `albums.labelId` so an artist can be tagged with a label even before
  // they've released anything in-app, and so independent artists (no
  // label) stay an explicit choice — `null` means "no label", not
  // "missing". SET NULL on delete keeps the person renderable if the
  // label row is removed.
  labelId: varchar("label_id").references(() => labels.id, { onDelete: "set null" }),
  // Task #1425 — Optional FK to the artist-management company this act is
  // signed to. Mirrors `labelId` exactly: `null` means "no manager" (an
  // explicit choice, not "missing"), SET NULL on delete keeps the person
  // renderable if the manager row is removed. A manager's roster is the set
  // of people carrying its id here; the manager's catalog is derived from
  // those people's albums (there is NO albums.managerId).
  managerId: varchar("manager_id").references(() => managers.id, { onDelete: "set null" }),
  // Streaming-service handoff. We host the song in-app for the first ~2 weeks,
  // then surface "Listen on Apple Music / Spotify" buttons that point at the
  // artist's canonical page on each service. Same URLs are also the scrape
  // source for name/photo/bio on first import.
  appleMusicUrl: text("apple_music_url"),
  spotifyUrl: text("spotify_url"),
  // Additional streaming-service handoff links (Task #816). Same external
  // referral role as Apple Music / Spotify above — operators paste these on
  // the artist editor, fans pick any of the six as their handoff service.
  tidalUrl: text("tidal_url"),
  qobuzUrl: text("qobuz_url"),
  deezerUrl: text("deezer_url"),
  pandoraUrl: text("pandora_url"),
  // Tri-state Spotify scan outcome, written by the bulk "Match people on
  // Spotify" walk. Lets the People grid badge people who've been searched
  // (true = candidates exist & still need admin pick; false = Spotify
  // returned zero results) versus never-scanned (null). When the admin
  // picks a candidate via the dialog the row gets a real spotifyUrl —
  // the flag stops mattering at that point.
  spotifyHasMatch: boolean("spotify_has_match"),
  // iTunes Lookup needs the numeric artist id (last path segment of an Apple
  // Music artist URL). Cached so the discography panel can refresh without
  // re-parsing the URL.
  itunesArtistId: text("itunes_artist_id"),
  // Social handles. Stored as full URLs (not @handles) so the renderer can
  // open them directly without per-platform URL construction. The streaming
  // links above (apple/spotify) get small icons too — these socials are the
  // "don't only push fans to Apple/Spotify" answer: keep artists discoverable
  // wherever they live. `websiteUrl` is the generic catch-all (personal site,
  // Mastodon, Linktree, Bandcamp, anything we don't have a dedicated icon for).
  instagramUrl: text("instagram_url"),
  tiktokUrl: text("tiktok_url"),
  twitterUrl: text("twitter_url"),
  blueskyUrl: text("bluesky_url"),
  facebookUrl: text("facebook_url"),
  websiteUrl: text("website_url"),
  // LinkedIn profile URL — captured by the per-entity "Add a contact"
  // paste flow (Task #294). Stored as the canonical public profile URL
  // so re-paste matches the same Person row instead of creating a
  // duplicate. Used by `POST /api/admin/people/from-linkedin` as the
  // dedup key.
  linkedinUrl: text("linkedin_url"),
  // Optional muso.ai profile UUID — captured when a Person is imported from a
  // muso credits dump so re-imports can match this row instantly. muso.ai
  // splits the same human across multiple UUIDs (e.g. "Nick Carter", "Nick
  // (us) Carter", "Nickolas G Carter") — only ONE of those gets pinned here;
  // the rest live as rows in `person_aliases` below. Not unique on purpose.
  musoId: text("muso_id"),
  // Admin-only contact email. Captured when a credits doc lists an email
  // next to a person ("connorhansonmusic@gmail.com") so we have an outreach
  // roster for verified-artist invites + label-side follow-ups. NEVER
  // surfaced on the public Person page — only readable on admin endpoints.
  contactEmail: text("contact_email"),
  // Task #665 — admin-only contact phone. Same provenance + privacy
  // contract as contactEmail: captured by the partner-detail "Add
  // Admin" flow so we have a non-email outreach handle, never surfaced
  // on the public Person page.
  contactPhone: text("contact_phone"),
  // Task #665 — admin override that flips a contact-shape Person into
  // the artist shape (Albums/Members/etc tabs). Normally derived from
  // role-scope + primary-artist albums + discography, but operators
  // sometimes need to mark a business contact who turns out to be an
  // artist before any of those signals exist. Cleared automatically
  // when one of those signals shows up — the flag is the floor, not
  // the ceiling.
  isArtistPromoted: boolean("is_artist_promoted").notNull().default(false),
  // Task #80 — referrer chain. When THIS person is the *referred* artist,
  // either or both of these point at who referred them in. The referrer
  // gets `referrerPerUnitCents` (default 100¢ = $1) for every paid order
  // on an album whose primaryArtistId is this person. Both nullable so
  // an artist with no referrer is the common path. NPO (organization)
  // referrers and artist (person) referrers earn the same way; the partner
  // shell shows them a Referrals report scoped to their cohort. We let
  // BOTH be set (NPO and a person both referred Fernando) — the per-unit
  // amount is paid to each independently; GoodTunes funds it from its cut.
  referredByPersonId: varchar("referred_by_person_id"),
  referredByOrgId: varchar("referred_by_org_id"),
  referrerPerUnitCents: integer("referrer_per_unit_cents").notNull().default(100),
  // Task #199 — invited-by press. When a manufacturer admin invites
  // this artist, we stamp the manufacturer id here so their Sell-panel
  // Presses surface defaults to that press (soft lock — artist can
  // expand to other plants) and the per-format cost calculator pulls
  // from that press's pricing. Nullable + SET NULL on delete so a
  // removed press doesn't orphan the artist row.
  invitedByPressId: varchar("invited_by_press_id"),
  // Task #522 — Default press for new albums by this artist. Set at
  // invite-accept to the inviting press; mutable from the artist's
  // album setup ("Choose a different press"). Separate from
  // invitedByPressId so the original referral never resets.
  defaultPressId: varchar("default_press_id"),
  // Task #736 — press mode (super-admin god-view). null = inherit
  // (resolve artist → label → "dedicated" default); "dedicated" locks
  // the album Sell panel to the single resolved plant; "all" unlocks
  // the press picker + side-by-side multi-bid comparison. Artist mode
  // wins over the label's mode, mirroring press resolution. Layered on
  // top of the immutable invitedByPressId provenance stamp.
  pressMode: text("press_mode"),
  // Task #350 — per-person ambassador inviter flag. NPO partner shells
  // gate the "Invite an ambassador" action on `inviteSubusers` (org-wide
  // permission) AND this column on the specific ambassador-Person who
  // would receive the invite. Default false so promoting a contact
  // person on an NPO into an ambassador-inviter is an explicit step.
  // Only meaningful when the person is also referred_by_org_id == some
  // NPO (otherwise the toggle has no scope to invite into).
  canInviteAmbassadors: boolean("can_invite_ambassadors").notNull().default(false),
  // Task #190 — bands & members. When `isGroup` is true this Person row
  // represents a band/duo/orchestra/etc. rather than a single human; the
  // join rows in `bandMembers` enumerate who plays in it. `groupKind` is
  // a free-form label ("Band", "Duo", "Orchestra", "Quartet", "Trio",
  // "Choir", "Ensemble") shown on the fan-side group page under the
  // name. Solo artists keep `isGroup=false` and never appear in either
  // join table.
  isGroup: boolean("is_group").notNull().default(false),
  groupKind: text("group_kind"),
  // Task #824 — person-level creative-credit tags (the "many hats" case:
  // Prince is artist + producer + writer + guitarist). Free-growing list
  // of credit-role labels ("Artist", "Producer", "Writer", "Guitar", …)
  // set explicitly from the multi-role person picker. This is the manual
  // floor; the admin Person endpoint UNIONS these with roles derived from
  // the person's actual track/album credits so a guitar credit on one
  // song still surfaces on the profile without re-tagging. "Artist" here
  // also drives the artist shape, same as `isArtistPromoted`. Distinct
  // from ACCESS roles (admin/label/artist partner grants on `users.role`)
  // — those gate the admin app; these are descriptive credits.
  roles: text("roles").array().notNull().default(sql`'{}'::text[]`),
  // Task #490 — Mailing/shipping address for artist comp shipments and
  // outreach mail. Free-form formatted-address text written by the
  // shared AddressAutocompleteField; matches the `location` pattern on
  // vendors/labels rather than the structured jsonb snapshot used on
  // orders, because the EditablePanel address field only round-trips
  // a single string.
  shippingAddress: text("shipping_address"),
  // Task #517 — structured snapshot of the Places-picked shipping
  // address. Free-text `shippingAddress` above stays the display
  // source of truth; this jsonb column lets shipping/printer
  // pipelines read structured line1/city/postal-code without
  // regexing the formatted string. Populated by
  // AddressAutocompleteField on the Person Identity panel.
  shippingAddressStruct: jsonb("shipping_address_struct").$type<PartnerAddressSnapshot>(),
  legacyGogoodsId: text("legacy_gogoods_id"),
  // Task #1310 — two-part artist/album share links. The artist "part" of
  // the URL get.goodtunes.music/<artist>/<album> lives here (per-artist,
  // stable across all of that artist's releases). Nullable; null means no
  // clean link set yet. Unique on non-null, soft-delete aware: trashing a
  // person frees their slug for re-use. The matching partial unique index
  // lives in scripts/post-merge.sh (migrate_task_1310_share_slugs) because
  // drizzle-kit doesn't push WHERE-claused indexes reliably.
  artistShareSlug: text("artist_share_slug"),
  ...softDeleteCols,
}, (t) => ({
  legacyGogoodsIdUniq: uniqueIndex("people_legacy_gogoods_id_uniq")
    .on(t.legacyGogoodsId)
    .where(sql`${t.legacyGogoodsId} IS NOT NULL`),
  // Task #1310 — artist share slug must be unique across live (non-trashed)
  // people rows. Matches the partial index in post-merge.sh.
  artistShareSlugUniq: uniqueIndex("people_artist_share_slug_unique")
    .on(t.artistShareSlug)
    .where(sql`${t.artistShareSlug} IS NOT NULL AND ${t.deletedAt} IS NULL`),
}));

// Task #190 — Band ↔ member roster. One row per (band, member) pair;
// `bandId` and `memberId` are both Person rows (the band itself is the
// `isGroup=true` Person). `joinedYear` / `leftYear` are nullable so the
// admin can record "founding member" or "still in the band" without
// being forced to invent dates; `leftYear == null` means current member.
// `roles[]` captures the per-band role(s) ("Bass, Vocals") so a single
// human in two bands can carry different responsibilities. `displayOrder`
// drives the band's roster order on the fan page (lead → rhythm → etc.).
export const bandMembers = pgTable("band_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bandId: varchar("band_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  memberId: varchar("member_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  roles: text("roles").array(),
  joinedYear: integer("joined_year"),
  leftYear: integer("left_year"),
  displayOrder: integer("display_order").notNull().default(0),
  ...softDeleteCols,
});

// Task #190 — Per-album lineup snapshot. When an album's primary artist
// is a band, the admin can optionally pin which members played on this
// specific record (e.g. Pink Floyd's lineup on The Wall vs The Division
// Bell). When no rows exist for an album, the fan page falls back to
// the band's *current* roster (members with `leftYear == null`).
export const albumLineup = pgTable("album_lineup", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  memberId: varchar("member_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  roles: text("roles").array(),
  displayOrder: integer("display_order").notNull().default(0),
});

// Alias rows for a Person — extra names + extra source IDs that all point
// at the same canonical human. Two main uses today:
//   1. muso.ai dedup — fold the 3–4 muso UUIDs muso.ai splits a real artist
//      across into a single People row, with each original (id, name) kept
//      here so future re-imports route back to the same Person.
//   2. Stage / legal-name variants (e.g. "Aleks Šebek" ↔ "Aleksandar Šebek")
//      so credits typed by one variant still resolve to the right Person.
// CASCADE on personId so cleanup is automatic when a Person is deleted.
export const personAliases = pgTable(
  "person_aliases",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    personId: varchar("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Optional foreign-system ID this alias represents (e.g. a muso UUID).
    // When set we'll prefer a `source` so we can disambiguate sources later
    // ("muso", "spotify", "isni", …) without inventing a new column.
    source: text("source"), // "muso" | "spotify" | "isni" | null
    sourceId: text("source_id"),
  },
  (t) => ({
    // The same external (source, sourceId) pair must only map to one Person.
    sourceUnique: uniqueIndex("person_aliases_source_id_uniq")
      .on(t.source, t.sourceId)
      .where(sql`${t.source} IS NOT NULL AND ${t.sourceId} IS NOT NULL`),
  }),
);

// Cached iTunes Lookup discography for a Person. We pull this in admin
// (`/api/admin/people/scrape`) and persist it here so the fan-side artist
// page can render a "Streaming" section without re-hitting Apple on every
// visit, and so the data survives the admin's `sessionStorage` lifetime.
// One row per release (album / EP / single). `collectionId` is Apple's
// numeric iTunes id, unique per person so re-pulls upsert cleanly.
export const personDiscography = pgTable("person_discography", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  personId: varchar("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  collectionId: text("collection_id").notNull(),
  name: text("name").notNull(),
  artworkUrl: text("artwork_url"),
  year: integer("year"),
  // "album" | "EP" | "Single" — kept lowercase-ish to match the
  // ScrapedArtistAlbum shape so admin + fan render off the same values
  // without translation.
  type: text("type").notNull(),
  trackCount: integer("track_count"),
  appleMusicUrl: text("apple_music_url"),
  // Per-release Spotify URL is a v2 problem (needs Spotify Web API).
  // Today the fan-side "How to Play" sheet falls back to a Spotify
  // search URL when this is null.
  spotifyUrl: text("spotify_url"),
  // Additional streaming-service handoff links (Task #816). Parity with the
  // album/person tables; the discography pull only fills appleMusicUrl today,
  // so these stay null unless a future per-release link source writes them.
  tidalUrl: text("tidal_url"),
  qobuzUrl: text("qobuz_url"),
  deezerUrl: text("deezer_url"),
  pandoraUrl: text("pandora_url"),
  // Display order — admin pulls newest-first from Apple, we mirror that.
  position: integer("position").notNull().default(0),
});

export const instruments = pgTable("instruments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // e.g. "1967 Gretsch 6071 'Monkees' Bass Walnut"
  name: text("name").notNull(),
  category: text("category").notNull(),
  shortCategory: text("short_category"),
  photoUrl: text("photo_url"),
  // Task #1233 — additional gallery photos beyond the headline `photoUrl`.
  // Vintage listings carry 5–15 shots (front, back, headstock, serial,
  // case); the Add-gear scraper now surfaces the whole gallery so the
  // operator can one-click import the extras. The hero stays in
  // `photoUrl`; these are the rest, in display order. Each is an Object-
  // Storage URL rehosted at import time (same as the hero).
  photoUrls: text("photo_urls").array(),
  about: text("about"),
  artistNote: text("artist_note"),
  // Headline maker — the partner who *built* this piece of gear (Gibson,
  // Fender, Martin, …). One FK per instrument because a guitar has one
  // builder. Resellers (where you can buy it) live in instrument_vendors.
  // ON DELETE SET NULL so deleting a vendor doesn't orphan the instrument.
  makerVendorId: varchar("maker_vendor_id").references((): any => vendors.id, {
    onDelete: "set null",
  }),
  // Task #461 — the original product/listing page this gear was scraped
  // from (e.g. the Carter Vintage Guitar listing or martinguitar.com
  // model page). Drives the fan-side "View original listing" link, the
  // admin one-click "Refetch image" recovery for missing photos, and
  // keeps a breadcrumb so we can re-scrape later if needed. Distinct
  // from `instrument_vendors.affiliate_url` — that table holds the N
  // resellers; this column is the *one* page the gear came from.
  sourceUrl: text("source_url"),
  ...softDeleteCols,
});

// Real-world vendor entity. One row per partner (Carter Vintage, Reverb,
// Sweetwater, Gibson, Martin, …) — the logo / bio / location / cover live
// here so editing once propagates across every instrument that links to
// this partner. `domain` is the canonical dedup key (lowercased hostname,
// no www).
//
// Task #174 — one entity, two roles:
//   `isReseller` — shows up in the admin Resellers index, can be attached
//                  to a gear item as "Available at" via instrument_vendors.
//   `isMaker`    — shows up in the admin Makers index, can be set as a
//                  gear item's headline maker via instruments.makerVendorId.
// A single row can carry both flags (Gibson is both a Maker and a
// Reseller for its current-production catalog).
export const vendors = pgTable("vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  // Task #237 — `domain` is no longer globally unique. Sister brands
  // under a single parent company (Epiphone/Kramer/KRK under Gibson;
  // Squier under Fender) often share the parent's marketing domain
  // while still deserving their own vendor row. The uniqueness is
  // enforced by a *partial* unique index — `vendors_domain_top_uniq` —
  // that only covers rows with parent_vendor_id IS NULL. Sub-brands
  // (parent_vendor_id IS NOT NULL) are exempt. See the matching
  // scripts/prod-schema-fixups/2026-05-23-task-237-parent-vendor.sql.
  domain: text("domain").notNull(),
  // Task #237 — single-level self-reference. When set, this vendor is a
  // sub-brand of `parentVendorId` (e.g. Epiphone → Gibson). A parent
  // row is one whose parent_vendor_id IS NULL; the admin UI rejects
  // multi-level chains (a sub-brand cannot itself be a parent). On
  // parent delete we SET NULL so the sub-brands survive as
  // independents rather than cascading away.
  parentVendorId: varchar("parent_vendor_id").references((): any => vendors.id, {
    onDelete: "set null",
  }),
  isMaker: boolean("is_maker").notNull().default(false),
  isReseller: boolean("is_reseller").notNull().default(true),
  // Task #471 — Quickprinter capability. A Quickprinter prints things
  // like the Letter-size GoodDeed certificate but does NOT press vinyl,
  // so it's mutually exclusive with `isMaker` (enforced in PUT
  // /api/admin/vendors/:id). Only Quickprinters are selectable as the
  // platform-default Printing vendor on AdminPlatformPricing.
  isQuickprinter: boolean("is_quickprinter").notNull().default(false),
  homeUrl: text("home_url"),
  aboutUrl: text("about_url"),
  logoUrl: text("logo_url"),
  // Curation lock on `logoUrl`. When true, automated paths (favicon
  // backfills, "re-scrape from website" enrichment, any future logo
  // enrichment job) MUST skip writing `logoUrl` — the operator has
  // explicitly curated it. Explicit admin writes (PUT /api/admin/vendors/:id
  // with a new `logoUrl`) bypass the lock; locks are about automation,
  // not editability. Mirrors `people.photoLocked` / `people.coverLocked`.
  logoLocked: boolean("logo_locked").notNull().default(false),
  tagline: text("tagline"),
  bio: text("bio"),
  location: text("location"),
  // Task #489 — structured snapshot of the Places-picked Location.
  // See labels.locationAddress for the same column on labels.
  locationAddress: jsonb("location_address").$type<PartnerAddressSnapshot>(),
  coverUrl: text("cover_url"),
  createdAt: timestamp("created_at").defaultNow(),
  ...softDeleteCols,
}, (table) => ({
  // Task #174 — a vendor row with both flags off is invisible to both
  // index pages. The DB-level CHECK is the truth; the API guard in
  // PUT /api/admin/vendors/:id mirrors it for a friendlier 400 message.
  roleAtLeastOne: check(
    "vendors_role_at_least_one",
    sql`${table.isMaker} OR ${table.isReseller}`,
  ),
  // Task #237 — partial unique index. Only enforced for top-level rows
  // (parent_vendor_id IS NULL). Sub-brands are allowed to share their
  // parent's domain (Epiphone, Kramer, KRK can all sit under
  // gibson.com without colliding with each other or with the Gibson
  // parent row). drizzle-kit doesn't push WHERE clauses on indexes;
  // the matching CREATE UNIQUE INDEX … WHERE lives in
  // scripts/prod-schema-fixups/2026-05-23-task-237-parent-vendor.sql.
  // Task #1252 — also exclude soft-deleted rows so trashing a vendor
  // immediately frees its domain slot for re-creation.
  domainTopUniq: uniqueIndex("vendors_domain_top_uniq")
    .on(table.domain)
    .where(sql`${table.parentVendorId} IS NULL AND ${table.deletedAt} IS NULL`),
}));

// Join row attaching a vendor to an instrument with a per-instrument
// product URL. Vendor metadata lives on `vendors`; only the things that
// vary per-instrument live here.
export const instrumentVendors = pgTable("instrument_vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  instrumentId: varchar("instrument_id").notNull().references(() => instruments.id, { onDelete: "cascade" }),
  vendorId: varchar("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  affiliateUrl: text("affiliate_url").notNull(),
  position: integer("position").notNull().default(0),
  // Demo show/hide flag — hides this vendor's "Buy / Discover more" button
  // from the fan-facing InstrumentSheet on THIS instrument only, so it
  // doesn't look like we're promoting a competitor during a different
  // vendor's pitch. Per-attachment, not per-vendor.
  isHidden: boolean("is_hidden").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ----- SuperCredits™ song credits (linking layer) -----------------------
// Each song has any number of writers + performers. Both rows store a
// `name` snapshot so credits keep rendering after a Person is removed
// (historical credits, muso.ai imports of people not in our roster).
// FK delete policy:
//   - songId → CASCADE              (credits row is meaningless without song)
//   - personId → SET NULL           (name snapshot preserves display)
//   - instrumentId → SET NULL       (performance keeps person, loses gear)
export const trackWriters = pgTable("track_writers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  songId: varchar("song_id").notNull().references(() => songs.id, { onDelete: "cascade" }),
  personId: varchar("person_id").references(() => people.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: text("role").notNull(), // "Composer" / "Lyricist" / "Producer"
  position: integer("position").notNull().default(0),
  ...softDeleteCols,
});

export const trackPerformers = pgTable("track_performers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  songId: varchar("song_id").notNull().references(() => songs.id, { onDelete: "cascade" }),
  personId: varchar("person_id").references(() => people.id, { onDelete: "set null" }),
  instrumentId: varchar("instrument_id").references(() => instruments.id, { onDelete: "set null" }),
  name: text("name").notNull(), // snapshot of person.name at credit time
  role: text("role").notNull(), // "Guitar" / "Bass" / "Composer · Violin"
  tuningNotes: text("tuning_notes"), // "DADGAD", "Dropped D, capo 3"
  position: integer("position").notNull().default(0),
  ...softDeleteCols,
});

// Album-wide production credits — Producer / Mixed by / Mastered by /
// Recording Engineer / Executive Producer / A&R / Arranged by. These
// apply to the album as a whole (or "all tracks except…") rather than a
// single song, which trackWriters/trackPerformers don't model cleanly.
// Same delete policy as track credits: album CASCADE, person SET NULL
// with a name snapshot so deleting a Person row doesn't blank historical
// credits. Rendered at the bottom of the album credits sheet on the fan
// side and also reused as the "Album credits" review section in the
// credits importer.
export const albumCredits = pgTable("album_credits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  personId: varchar("person_id").references(() => people.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: text("role").notNull(),
  position: integer("position").notNull().default(0),
  ...softDeleteCols,
});

// ----- Organizations (labels-publishers as legal entities) --------------
// A muso-style "Organizations" credit (Record Label, Publisher, PRO, etc.)
// is a *legal entity*, not a person. We already have a richer `labels` table
// for record labels we actually release on — `organizations` is the broader
// catch-all: any company that needs to show up on a publishing/mechanical
// split (publishers, sub-publishers, admin shops, distributors, sometimes a
// label not yet promoted into `labels`). `musoId` is captured when imported
// so re-imports dedup. `kind` is a free text tag for now ("label",
// "publisher", "pro", …) — promotable to an enum once we stop discovering
// new shapes.
export const organizations = pgTable(
  "organizations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // "label" | "publisher" | "pro" | "distributor" | …
    musoId: text("muso_id"),
    websiteUrl: text("website_url"),
    logoUrl: text("logo_url"),
    // Optional FK promoting an Organization that's also a GoodTunes-tracked
    // label into the richer `labels` row — so admins editing the label there
    // don't need to keep two records in sync.
    labelId: varchar("label_id").references(() => labels.id, { onDelete: "set null" }),
    // Task #490 — NPO partner mailing address. Free-form formatted-address
    // text written by AddressAutocompleteField (same shape as vendors/labels'
    // `location`). Lets us send partner mail without inventing a parallel
    // address table.
    mailingAddress: text("mailing_address"),
    // Task #517 — structured snapshot of the Places-picked mailing
    // address. Free-text `mailingAddress` above stays the display
    // source of truth; this jsonb column lets partner-mail pipelines
    // read structured fields without regexing the formatted string.
    // Populated by AddressAutocompleteField on the NPO Identity panel.
    mailingAddressStruct: jsonb("mailing_address_struct").$type<PartnerAddressSnapshot>(),
    // Publishing-payout routing. When a publisher is administered by
    // another entity (e.g. "Songs of Kaotic" is paid through "Hipgnosis
    // Songs Group, LLC" per License #24084), set this to the administrator
    // org's id. The publishing-settlement engine credits the composition to
    // THIS org (name on the credit) but routes the money to the pay-to org's
    // payout account. NULL = the org is paid directly. Loose self-FK on
    // purpose (no `.references()`): a hard self-FK drifts dev→prod and the
    // publish diff re-adds/drops it — same failure class as auth_tokens.
    payToOrgId: varchar("pay_to_org_id"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    // Mirrors the partial unique index created in
    // scripts/migrate-muso-tables.sql — keeps the Drizzle schema and the live
    // DB invariants aligned so a future `drizzle-kit push` doesn't see drift.
    musoIdUniq: uniqueIndex("organizations_muso_id_uniq")
      .on(t.musoId)
      .where(sql`${t.musoId} IS NOT NULL`),
  }),
);

// ----- Organization ↔ Person contacts -----------------------------------
// Many-to-many between organizations (currently used for non-profits) and
// people in the directory. Lets admins attach one or more contacts/reps to
// an NPO row without inventing a separate `npo_contacts` table — the same
// join works for any other organization kind we expose later (publishers,
// PROs, etc.). `role` is a free-text label ("Director", "Program Lead", …)
// the operator fills in; null is allowed because most attachments just
// need to say "this person represents this org."
export const organizationPeople = pgTable(
  "organization_people",
  {
    organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    personId: varchar("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    role: text("role"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.personId] }),
  }),
);
export type OrganizationPerson = typeof organizationPeople.$inferSelect;

// ----- Operator-created custom add-ons (Task #844) ----------------------
// "Gift of Hope"-style add-ons: a super-admin creates a non-profit-owned
// product and attaches it to one or more artists. It then surfaces as a
// single optional checkbox in the fan Buy sheet of every album by an
// attached artist (one per order, no quantity selection). Paid through the
// same Stripe embedded checkout and recorded on the order so the named
// fulfiller knows to ship it. Built to support cost ladders / artist
// opt-in later; v1 is flat-price, operator-curated.
export const customAddons = pgTable("custom_addons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // The non-profit that owns / benefits from the add-on.
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  priceCents: integer("price_cents").notNull(),
  // Free-text name of whoever fulfils / ships the add-on (the NPO, a
  // vendor, the artist, …). Snapshotted onto the order line at checkout
  // so fulfillment knows who handles it without a second lookup.
  fulfiller: text("fulfiller"),
  active: boolean("active").notNull().default(true),
  // Task #987 — scope. When true the add-on applies to EVERY eligible
  // album (a global option) regardless of the per-artist attach join
  // below; when false it only surfaces on albums whose primary artist
  // is attached via `custom_addon_artists`. Default false preserves the
  // original attach-to-specific-artists behavior.
  appliesToAllArtists: boolean("applies_to_all_artists").notNull().default(false),
  // Operator-controlled display order on the Buy sheet (lower = shown
  // first). Ties fall back to createdAt so older add-ons stay stable.
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
export type CustomAddon = typeof customAddons.$inferSelect;

// Many-to-many: one custom add-on can apply to one or more artists
// (people). Built for multiple artists; used for Nightbirde only at
// launch. Composite PK dedupes a re-attach.
export const customAddonArtists = pgTable(
  "custom_addon_artists",
  {
    customAddonId: varchar("custom_addon_id").notNull().references(() => customAddons.id, { onDelete: "cascade" }),
    personId: varchar("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.customAddonId, t.personId] }),
  }),
);
export type CustomAddonArtist = typeof customAddonArtists.$inferSelect;

// ----- Generic entity ↔ Person contacts ---------------------------------
// Task #294 — every entity kind that has contacts (vendor / manufacturer /
// label / fulfillment_partner) shares a single join table here so the
// admin "Add a contact" surface looks and writes the same on each detail
// page. NPOs keep using the older `organization_people` table because
// that join is already wired everywhere (referrer reports, etc.).
// `entityKind` is a free-text discriminator validated at the API layer.
// Composite PK on (entityKind, entityId, personId) prevents dup rows.
// No FK on `entityId` — the column is polymorphic so we can't reference
// a single table; the API guards by checking the matching table exists.
export const entityContacts = pgTable(
  "entity_contacts",
  {
    entityKind: text("entity_kind").notNull(),
    entityId: varchar("entity_id").notNull(),
    personId: varchar("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    role: text("role"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.entityKind, t.entityId, t.personId] }),
  }),
);
export type EntityContact = typeof entityContacts.$inferSelect;

// ----- Mechanical (master-side) splits ----------------------------------
// Per-track percentage split of the *recording* (master) revenue — the
// "mechanical" side of the song. Rows can credit either a Person (artist,
// session player who negotiated points) or an Organization (label, distrib).
// Percentages are stored as integer basis-points (12.5% → 1250) to dodge
// float drift; UI divides by 100 for display. Sum across a song SHOULD be
// 10000 but isn't enforced in DB — admin tooling validates. Admin-only
// surface: never returned to the fan-side credits endpoint.
export const trackMechanicalSplits = pgTable("track_mechanical_splits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  songId: varchar("song_id").notNull().references(() => songs.id, { onDelete: "cascade" }),
  personId: varchar("person_id").references(() => people.id, { onDelete: "set null" }),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: text("role").notNull(), // "Featured Artist" / "Label" / "Distributor" / …
  percentBp: integer("percent_bp").notNull().default(0),
  position: integer("position").notNull().default(0),
  // Task #616 — soft-delete so historical payout snapshots can still
  // resolve the row that paid out (audit trail). Every read MUST
  // filter isNull(deletedAt) or removed splits leak back into the
  // editor + writer-name credit line.
  ...softDeleteCols,
});

// ----- Publishing (writers-side) splits ---------------------------------
// Per-track percentage split of the *composition* (publishing) revenue —
// the songwriter / publisher side. Each row also captures the PRO the
// writer is affiliated with so reporting can roll up by society (ASCAP /
// BMI / SESAC / PRS / SOCAN / …). Same basis-points convention. Admin-only.
export const trackPublishingSplits = pgTable("track_publishing_splits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  songId: varchar("song_id").notNull().references(() => songs.id, { onDelete: "cascade" }),
  personId: varchar("person_id").references(() => people.id, { onDelete: "set null" }),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: text("role").notNull(), // "Writer" / "Co-Writer" / "Publisher" / "Sub-Publisher"
  proAffiliation: text("pro_affiliation"), // "ASCAP" | "BMI" | "SESAC" | "PRS" | …
  percentBp: integer("percent_bp").notNull().default(0),
  position: integer("position").notNull().default(0),
  // See note on trackMechanicalSplits — soft-delete for payout-snapshot
  // resolution. Reads must filter isNull(deletedAt).
  ...softDeleteCols,
});

// ----- Credit role catalog ----------------------------------------------
// A searchable, growable list of roles the admin can assign on track-level
// credits. `kind` tells the system which underlying table a credit belongs
// in when saved:
//   • "writer"    → row lives in track_writers  (Composer, Lyricist, …)
//   • "performer" → row lives in track_performers (Guitar, Lead vocal, …)
// We seed the table lazily with industry-standard roles on first read.
// Admins can create new ones inline from the credits picker — pick a
// kind, give it a name, save. Unique on `name` so a typo'd duplicate
// surfaces as a clean upsert rather than two near-identical rows.
//
// Future use: a `person_roles` join (or `roles[]` on people) can pull
// from the same table to categorize people as Singer-Songwriters,
// Producers, etc. on the artist-list/filter surfaces.
export const creditRoles = pgTable(
  "credit_roles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    kind: text("kind").notNull(), // "writer" | "performer"
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    kindNameUnique: unique("credit_roles_kind_name_unique").on(t.kind, t.name),
  }),
);

// Bearer token store (replaces in-memory tokenStore).
//
// `kind` tags the side this token belongs to. Today's tokens were minted
// against the `users` table which is the admin table going forward, so
// pre-existing rows are implicitly `admin`. Customer tokens reference
// `customer_users.id` (no FK because Drizzle pgTable can't express
// "FK to one of two tables", and we want kind to be the authoritative
// switch anyway — the server always reads tokens through the kind+id
// pair via the storage layer).
//
// Task #265 — Per-side id columns with real, enforced FKs. Prior shape
// was a single `user_id` varchar that held either a `users.id` (admin),
// a `customer_users.id` (customer), or a `verify:<email>` sentinel
// during signup. One column can't reference two tables, so we ran with
// no FK at all — and a stale leftover FK kept reappearing on prod via
// the publish dev→prod diff (see Task #264 and .agents/memory/
// auth-tokens-fk-recurrence.md).
//
// Now: exactly one of `admin_user_id` / `customer_user_id` is set per
// row, each carrying a real FK that the DB enforces. The signup-verify
// ticket moved out of this table entirely — see `signupVerifyTokens`
// below — so this table never holds a non-user sentinel again.
export const authTokens = pgTable("auth_tokens", {
  token: varchar("token").primaryKey(),
  adminUserId: varchar("admin_user_id").references(() => users.id, { onDelete: "cascade" }),
  customerUserId: varchar("customer_user_id").references(() => customerUsers.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("admin"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Short-lived ticket minted by /api/email-verifications/confirm and
// traded in at /api/customer/signup-with-code. Lives in its own table
// (not auth_tokens) so signup never has to write a sentinel userId
// into a column that carries a real user FK.
export const signupVerifyTokens = pgTable("signup_verify_tokens", {
  token: varchar("token").primaryKey(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ──────────────────────────────────────────────────────────────────────────
// Task #31 — Dual auth (admin + customer)
//
// `users` is the admin table going forward (existing rows = admins). A
// separate `customer_users` table holds fan accounts. The two tables
// NEVER share rows; the same email can exist on both sides as two
// independent accounts. `*_identities` tables link Google/Apple OAuth
// subjects to a user row on that same side. `admin_totp` stores the
// admin-only second factor.
//
// We deliberately did NOT rename `users` → `admin_users` because doing
// so would require migrating 7+ existing FKs (playlists, user_albums,
// profile_photos, analytics_events, etc.) — far more invasive than the
// product change requires. The table name stays; the role does not.
// ──────────────────────────────────────────────────────────────────────────

export const customerUsers = pgTable("customer_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  realName: text("real_name"),
  // Nullable: OAuth-only customers never set a password.
  password: text("password"),
  // Task #44 — Stripe-backed identity columns. The Stripe Customer is the
  // source of truth for legal name + addresses + phone; webhook handlers
  // backfill these columns on payment success. realName/displayName above
  // remain user-editable on the profile; the Stripe-backed `billing*` +
  // `shipping*` snapshots are append-only history.
  stripeCustomerId: text("stripe_customer_id").unique(),
  billingAddress: jsonb("billing_address").$type<StripeAddressSnapshot>(),
  shippingAddress: jsonb("shipping_address").$type<StripeAddressSnapshot>(),
  phone: text("phone"),
  // Task #538 — phone verification (gifting / recovery gates). Mirrors the
  // pair on `users`. `phone` above remains the Stripe-snapshot raw string
  // we backfill from billing details; `phoneE164` is the canonical form
  // we own and only set after a successful OTP. Verify-once, reuse-
  // everywhere — clearing happens when the fan changes their number.
  phoneE164: text("phone_e164"),
  phoneVerifiedAt: timestamp("phone_verified_at"),
  emailVerifiedAt: timestamp("email_verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
  legacyGogoodsId: text("legacy_gogoods_id"),
  // Task #400 — Welcome-back flow for imported gogoods.com fans.
  // `onboardedAt` is stamped after the 3-screen onboarding finishes; once
  // set, the flow never re-appears even if the fan signs out and back in.
  // `welcomeEmailSentAt` is stamped when the wave-1 welcome email leaves
  // Resend (so a retry / second batch can target only fans who haven't
  // received it). `mergedIntoId` is the surviving customer row when a fan
  // taps "These two accounts are me" on their profile — the duplicate row
  // is soft-deleted (kept for audit) and every authed query treats this
  // value as "redirect to that id" so the deleted row can never sign in.
  onboardedAt: timestamp("onboarded_at"),
  welcomeEmailSentAt: timestamp("welcome_email_sent_at"),
  mergedIntoId: varchar("merged_into_id"),
  // Task #536 — "What's New" welcome-back sheet. Stamped with the
  // current `WHATS_NEW_VERSION` (see shared/whatsNew.ts) the moment the
  // fan dismisses the sheet. The sheet only re-appears when we ship a
  // new version (i.e. `whatsNewSeenVersion < WHATS_NEW_VERSION`). NULL
  // means the fan has never seen the sheet — eligible for the next
  // first-launch render.
  whatsNewSeenVersion: integer("whats_new_seen_version"),
  // Task #537 — Finish-signup flow for OAuth-minted accounts. Apple/
  // Google sign-in drops a fresh fan into the app with whatever the
  // provider returned (often a `@privaterelay.appleid.com` mask + no
  // name). Real accounts that will hold purchases, receipts, gifting,
  // and a public handle need a deliverable contact + a chosen display
  // name + a unique, non-reserved handle before they land in the
  // player. The fields below capture that:
  //
  //   `handle`            — public @handle the fan picks. Mirrors
  //                         `username` (kept in sync on the same write)
  //                         so legacy /api/me/welcome-back/* paths and
  //                         playlist sharing keep working, but the
  //                         reserved-artist check and uniqueness live
  //                         here (case-insensitive on the unique index).
  //   `contactEmail`      — deliverable email captured when Apple's
  //                         relay address is the only one we have.
  //                         The provider email stays on
  //                         `customer_identities.email` (the link key);
  //                         `customer_users.email` keeps whatever the
  //                         provider sent so admin search keeps finding
  //                         the row; this column is what receipts /
  //                         gifting / payouts read from.
  //   `contactPhone`      — alternative deliverable contact. Phone
  //                         verification is intentionally out of scope
  //                         here (separate task — gifting/payouts gate
  //                         it later) — this column stores the raw
  //                         value as entered until that flow ships.
  //   `signupCompletedAt` — stamped once the fan submits a valid
  //                         finish-setup form. The route guard treats
  //                         NULL as "still in onboarding" and redirects
  //                         every navigation to /finish-setup until
  //                         set. Legacy rows + password-signup rows
  //                         backfill to `created_at` so they never see
  //                         the flow.
  handle: text("handle"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  signupCompletedAt: timestamp("signup_completed_at"),
  // Task #734 — the fan's preferred streaming service for "stream-
  // elsewhere" handoffs (credits-bearing tracks GoodTunes doesn't host).
  // One of "spotify" / "apple_music". NULL until the fan makes their
  // first pick from the service picker; once set, future handoffs go
  // straight to that service without re-asking. Changeable any time from
  // the Apple-style settings screen. Mirrored to localStorage client-
  // side for instant/anon resolution.
  favoriteStreamingService: text("favorite_streaming_service"),
  // Task #860 — Terms acceptance captured at fan account creation (see
  // the `users` table for the rationale). NULL for fans who signed up
  // before this shipped — no re-consent.
  termsAcceptedAt: timestamp("terms_accepted_at"),
  termsVersion: text("terms_version"),
}, (t) => ({
  legacyGogoodsIdUniq: uniqueIndex("customer_users_legacy_gogoods_id_uniq")
    .on(t.legacyGogoodsId)
    .where(sql`${t.legacyGogoodsId} IS NOT NULL`),
  handleUniq: uniqueIndex("customer_users_handle_lower_uniq")
    .on(sql`lower(${t.handle})`)
    .where(sql`${t.handle} IS NOT NULL`),
}));

// Task #537 — Reserved handles. Verified artists + a curated top-N
// of famous-artist usernames are blocked from the fan handle picker
// so a random fan can't grab `@taylorswift` before the artist's team
// has a chance to claim it. Seeded manually for now (a Spotify-driven
// importer is tracked as a separate task). The picker hits
// /api/auth/handle-available which does a case-insensitive lookup
// here AND on `customer_users.handle` in one round-trip.
export const reservedHandles = pgTable("reserved_handles", {
  // Stored lowercased — the unique index is on the column itself, so
  // every insert MUST lowercase first. Picker lookups also lowercase
  // the input before the .where(eq) match.
  handle: text("handle").primaryKey(),
  // Human-readable reason for the block. Surfaces nowhere fan-facing
  // (the picker shows a generic "held for the artist" message) — it's
  // an operator note: "verified artist on people.id=…", "top-N seed",
  // "manual block", etc.
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type ReservedHandle = typeof reservedHandles.$inferSelect;

// Task #400 — Single-use one-tap sign-in tokens emailed in the welcome
// campaign. Clicking the link in the wave-1 email lands the fan on
// `/welcome-back?token=…`, which trades the token for a fresh customer
// session, stamps `email_verified_at`, and routes into the 3-screen
// onboarding. Tokens are 30-day TTL and single-use (consumedAt). Hash
// the token at rest so a DB leak can't be replayed — the raw token is
// the secret in the email and we hold its sha-256 here.
export const welcomeBackTokens = pgTable("welcome_back_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customerUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Task #400 — Per-recipient send log for the welcome-back campaign.
// One row per *attempt* (success or failure) so an operator can see who
// got the mail, retry only the failed addresses, and reconcile against
// Resend deliverability after the fact. `status` is "sent" on a 2xx
// Resend response, "failed" otherwise. Bounce/complaint webhooks (not
// in this task) would extend this to "bounced" / "complained".
export const welcomeBackEmailSends = pgTable("welcome_back_email_sends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customerUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  status: text("status").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Task #400 — Self-service customer account merges. One row per merge
// the fan triggered from their profile ("These two accounts are me").
// `losingId` is the row that got soft-deleted (carries mergedIntoId
// pointing here); `survivingId` is the row that absorbed the orders +
// owned albums + playlists. Admin surfaces this list under the
// surviving customer's profile for audit / undo.
export const customerMerges = pgTable("customer_merges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  survivingId: varchar("surviving_id").notNull().references(() => customerUsers.id, { onDelete: "cascade" }),
  losingId: varchar("losing_id").notNull().references(() => customerUsers.id, { onDelete: "cascade" }),
  losingEmail: text("losing_email").notNull(),
  movedOrderCount: integer("moved_order_count").notNull().default(0),
  movedAlbumCount: integer("moved_album_count").notNull().default(0),
  movedPlaylistCount: integer("moved_playlist_count").notNull().default(0),
  // Task #400 — exact row ids that moved, persisted so admin undo can
  // reverse precisely the same set without timestamp heuristics that
  // might sweep in legitimate pre-existing surviving-account data.
  movedOrderIds: text("moved_order_ids").array().notNull().default(sql`'{}'::text[]`),
  movedAlbumIds: text("moved_album_ids").array().notNull().default(sql`'{}'::text[]`),
  movedPlaylistIds: text("moved_playlist_ids").array().notNull().default(sql`'{}'::text[]`),
  triggeredBy: text("triggered_by").notNull().default("customer"),
  createdAt: timestamp("created_at").defaultNow(),
});

// JSON shape we persist for billing/shipping snapshots. Matches the subset
// of Stripe's Address object we actually read on receipts + cert prints.
export type StripeAddressSnapshot = {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

// Task #489 — Structured snapshot persisted alongside the free-text
// `location` / `shipping_address` columns on every partner table
// (labels, vendors, manufacturers, fulfillment_partners). Same shape as
// `StripeAddressSnapshot` minus the customer-name field — partners
// already carry a `name` column of their own. Written by the admin
// address autocomplete (Google Places) and the one-shot backfill job;
// reports/filters that care about country, region, or postal code read
// from this struct instead of regexing the formatted text.
export type PartnerAddressSnapshot = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

// 6-digit email verification codes. Issued when a guest types an email at
// the Buy-flow signup gate; the code lands in their inbox and proves the
// address before a password / Stripe customer ever gets attached. Stored
// as scrypt-hashed strings so a DB leak can't be replayed. Expire in 15m;
// `attempts` caps brute force; `consumedAt` is non-null after a successful
// verification so the row can't be redeemed twice.
export const emailVerifications = pgTable("email_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Commerce (Task #44) ─────────────────────────────────────────────────
// Album SKUs: per-album, per-physical-format rows. The fan-side Buy sheet
// reads `active=true` rows for an album to populate the format picker, and
// the admin "Sell this album" panel writes here. We keep this table narrow
// (format type + price + stock + active) because price + design rules vary
// per album, not per global format catalog.
//
// `format` is a closed enum at the API edge (see `ALBUM_FORMAT` below);
// the column stays `text` so future formats land without a migration.
export const albumSkus = pgTable(
  "album_skus",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
    format: text("format").notNull(),
    priceCents: integer("price_cents").notNull(),
    // null = unlimited stock; non-null = decrement on successful order.
    stock: integer("stock"),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    // Task #194 — planning number for this physical format (vinyl press
    // run, cassette dub count, CD short-run). NULL = uncapped; positive
    // int = artist's committed run. Drives the "Total if they all sell"
    // readout in the admin Sell panel. Not a hard cap on fan checkout
    // today — `stock` is still the only column that gates buy attempts.
    plannedQuantity: integer("planned_quantity"),
    // Task #397 — optional artist-edited display name for this format
    // row. Empty / NULL falls back to the format label on read so the
    // Buy sheet and admin Sell panel header never render as "Untitled".
    displayName: text("display_name"),
    // Task #194 — per-format cost snapshot. Locked at save time off the
    // platform default in `payout_format_costs`, so the artist's profit
    // readout is stable until they re-save (mirrors the addon
    // `costCentsSnapshot` pattern). Nullable until first save.
    costSnapshotManufacturingCents: integer("cost_snapshot_manufacturing_cents"),
    // Task #624 — broker / wholesale discount applied to the press at
    // the moment this SKU was last saved (snapshot of
    // `manufacturers.brokerDiscountPct`). Nullable for legacy rows
    // saved before the column existed (treated as 0). The artist-facing
    // breakdown keeps showing the retail manufacturing number above;
    // the discount becomes GoodTunes margin at payout (we pay the
    // press the discounted amount).
    costSnapshotBrokerDiscountPct: integer("cost_snapshot_broker_discount_pct"),
    // Task #624 — discounted manufacturing snapshot. Computed at save
    // time as floor(retail × (100 - brokerDiscountPct)/100). Persisted
    // alongside the retail snapshot + pct so payout/margin reporting
    // can read what GoodTunes actually pays the press without
    // recomputing from a (potentially changed) live pct. Null for
    // legacy rows / no-broker presses.
    costSnapshotManufacturingDiscountedCents: integer("cost_snapshot_manufacturing_discounted_cents"),
    costSnapshotPublishingCents: integer("cost_snapshot_publishing_cents"),
    costSnapshotPaymentProcessingCents: integer("cost_snapshot_payment_processing_cents"),
    costSnapshotGoodtunesCents: integer("cost_snapshot_goodtunes_cents"),
    // Task #423 — track count in effect when this SKU was last saved.
    // Publishing is computed live as trackCount × MECH per-track rate
    // (vinyl + digital mechanicals); without a snapshot, adding or
    // removing songs after Save silently shifts the saved row's
    // Publishing / Profit / Total. Nullable so pre-#423 rows fall
    // back to the live `album.songs.length` until they're re-saved.
    costSnapshotTrackCount: integer("cost_snapshot_track_count"),
    // Task #200 — Pressing picks snapshot. Captures which row of the
    // Hellbender reference matrix the manufacturing snapshot came from
    // (color id + collapsed price tier + jacket upgrade + snapped qty
    // tier) plus a source tag ("hellbender" for vinyl, "placeholder"
    // for cassette/CD/12" double until those plants have their own
    // matrices). Nullable for pre-#200 rows.
    vinylColor: text("vinyl_color"),
    vinylColorTier: text("vinyl_color_tier"),
    jacketUpgrade: text("jacket_upgrade"),
    quantityTier: integer("quantity_tier"),
    costSource: text("cost_source"),
    // Task #1025 — exact catalog identity of the saved vinyl pick. The
    // legacy `vinylColor`/`vinylColorTier` snapshots store only display
    // NAMES, which resolve differently for each admin once a press
    // re-imports its catalog (color ids regenerate) or the operator
    // views the row under a different press in "All Presses" mode. These
    // three ids pin the snapshot to the exact press + tier + color row
    // so a saved color resolves identically for everyone. Nullable for
    // legacy rows + non-catalog (placeholder) vinyl saves.
    pressId: varchar("press_id"),
    pressTierId: varchar("press_tier_id"),
    pressColorId: varchar("press_color_id"),
    // Task #433 — per-row Lock affordance. Same "finalized, reversible
    // until the run actually goes to press" semantics as the album-level
    // `sellQuoteLockedAt`. NULL = unlocked (editable); non-null = locked
    // (read-only on the artist Sell panel). Server blocks unlock once a
    // pressing_order_requests row for this album reaches status='approved'.
    lockedAt: timestamp("locked_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    albumFormatUnique: unique("album_skus_album_format_unique").on(t.albumId, t.format),
  }),
);

// Task #194 — Platform default cost breakdown per physical format. One
// row per format. Editable by super-admin; per-album snapshot lives on
// `album_skus`. Manufacturing/publishing/payment processing/GoodTunes
// margin are stored as integer cents so the SellPanel ⓘ tooltip can
// add them up to a single Cost number.
export const payoutFormatCosts = pgTable("payout_format_costs", {
  format: text("format").primaryKey(),
  manufacturingCents: integer("manufacturing_cents").notNull().default(0),
  publishingCents: integer("publishing_cents").notNull().default(0),
  paymentProcessingCents: integer("payment_processing_cents").notNull().default(0),
  goodtunesCents: integer("goodtunes_cents").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type PayoutFormatCost = typeof payoutFormatCosts.$inferSelect;

// Task #199 — Per-press cost overrides. When an artist/label was
// invited to GoodTunes by a specific press (people.invitedByPressId or
// labels.invitedByPressId), the Sell-panel cost calculator pulls its
// manufacturing/publishing/payment-processing/GoodTunes lines from
// this table first and falls back to the platform-default
// `payout_format_costs` row when this press hasn't set its own
// numbers. Composite primary key on (pressId, format).
//
// No admin UI to edit these yet — the row is reserved for the
// press's own negotiated pricing, populated out-of-band as we
// onboard each press. The fallback to platform defaults keeps the
// soft-lock useful from day one.
export const pressFormatCosts = pgTable("press_format_costs", {
  pressId: varchar("press_id").notNull(),
  format: text("format").notNull(),
  manufacturingCents: integer("manufacturing_cents").notNull().default(0),
  publishingCents: integer("publishing_cents").notNull().default(0),
  paymentProcessingCents: integer("payment_processing_cents").notNull().default(0),
  goodtunesCents: integer("goodtunes_cents").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  pressFormatPk: primaryKey({ columns: [t.pressId, t.format] }),
}));
export type PressFormatCost = typeof pressFormatCosts.$inferSelect;

// ─── Task #218 — Press catalog (formats → tiers → colors) ────────────────
// Replaces the per-format manufacturing override above. A press's
// catalog is what its admin actually maintains: which formats they
// press, which color/finish tiers exist inside each format, what
// colors live inside each tier, and the price-per-unit ladder by
// quantity for each tier. The Sell-panel "Add Physical" picker walks
// the catalog progressively (format → tier → color → quantity) and
// the saved SKU snapshots the picked tier name + color name + qty
// tier + unit cents onto `album_skus` so historical orders are stable
// when the press re-prices.
//
// Quantity ladders are stored inline on the tier as JSON (a small,
// ordered list of {qty, unitCents}). They're rarely more than 6-8
// rungs and they always change as a unit, so a side-table would be
// overkill. Lookup snaps the artist's typed quantity up to the next
// rung the same way #200 snapped to Hellbender's 50/100/200/300/500/
// 1000 brackets — see `snapToCatalogQuantityTier` in shared/pressing.ts.
export const pressFormats = pgTable(
  "press_formats",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    pressId: varchar("press_id").notNull(),
    format: text("format").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    pressFormatUniq: unique("press_formats_press_format_uniq").on(t.pressId, t.format),
  }),
);
export type PressFormat = typeof pressFormats.$inferSelect;

export const pressColorTiers = pgTable("press_color_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pressId: varchar("press_id").notNull(),
  format: text("format").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  // Quantity → unit-cents ladder. Stored sorted ascending by `qty`.
  // Anything above the top rung is treated as "request a custom
  // quote" (the SKU still saves at the top-rung price; the UI shows
  // a caveat). Example: [{qty:100,unitCents:1235},{qty:200,unitCents:889}…].
  priceLadder: jsonb("price_ladder")
    .$type<{ qty: number; unitCents: number }[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  // Task #522 — Per-tier masters-prep cost. Once fan-earmarked revenue
  // on an album using this tier crosses this threshold, the artist is
  // offered an early-start approval (so the press can begin cutting
  // masters before the preorder window closes). 0 disables the offer.
  mastersPrepCostCents: integer("masters_prep_cost_cents").notNull().default(0),
});
export type PressColorTier = typeof pressColorTiers.$inferSelect;

export const pressColors = pgTable("press_colors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tierId: varchar("tier_id")
    .notNull()
    .references(() => pressColorTiers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Either swatchHex (CSS color) OR swatchImageUrl (uploaded swatch
  // photo) drives the picker thumbnail. Hex is enough for solids;
  // splatter / picture-disc / marbled stocks use the image.
  swatchHex: text("swatch_hex"),
  swatchImageUrl: text("swatch_image_url"),
  position: integer("position").notNull().default(0),
  // Task #668/#669 — set by the per-vendor color-library importers
  // (MRP, Hellbender, …) to the upstream product/tile URL we pulled
  // the photo from. Used to detect "already imported" rows on re-run
  // and to keep an audit trail in the importer batch entry. Manual
  // swatches stay null.
  importSourceUrl: text("import_source_url"),
});
export type PressColor = typeof pressColors.$inferSelect;

// Task #467 — per-press jacket catalog. One row per jacket SKU the
// press offers (e.g. "Standard Full-Color Jacket"). Each jacket pairs
// with a tier under any format to form a (format,tier,jacket) combo
// whose price ladder lives in `press_tier_jacket_ladders`. Exactly one
// jacket per press is flagged `isDefault` — that ladder is what
// /invited-press exposes as `tier.priceLadder` so the SellPanel (which
// doesn't pick a jacket today) keeps reading the same shape.
export const pressJackets = pgTable(
  "press_jackets",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    pressId: varchar("press_id").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => ({
    pressJacketNameUniq: unique("press_jackets_press_name_uniq").on(t.pressId, t.name),
  }),
);
export type PressJacket = typeof pressJackets.$inferSelect;

// Per (tier, jacket) combo price ladder. Replaces the old
// `press_color_tiers.priceLadder` jsonb (which is left in place for
// back-compat reads but is no longer the source of truth).
export const pressTierJacketLadders = pgTable(
  "press_tier_jacket_ladders",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tierId: varchar("tier_id")
      .notNull()
      .references(() => pressColorTiers.id, { onDelete: "cascade" }),
    jacketId: varchar("jacket_id")
      .notNull()
      .references(() => pressJackets.id, { onDelete: "cascade" }),
    priceLadder: jsonb("price_ladder")
      .$type<{ qty: number; unitCents: number }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (t) => ({
    pressTierJacketLadderUniq: unique("press_tier_jacket_ladder_uniq").on(t.tierId, t.jacketId),
  }),
);
export type PressTierJacketLadder = typeof pressTierJacketLadders.$inferSelect;

// Task #670 — audit log for automated pricing imports (Hellbender's
// Shopify scrape today; future MRP/PMP sync rows land here too).
// One row per scrape attempt with the resolved proposal + counts +
// any per-color failures so admins can re-run idempotently and trace
// what changed without diffing the catalog ladders by hand.
export const pressPricingSyncs = pgTable("press_pricing_syncs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pressId: varchar("press_id").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  triggeredByUserId: varchar("triggered_by_user_id"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  productsFetched: integer("products_fetched").notNull().default(0),
  colorsMapped: integer("colors_mapped").notNull().default(0),
  colorsUnmapped: integer("colors_unmapped").notNull().default(0),
  rungsWritten: integer("rungs_written").notNull().default(0),
  unmappedHandles: jsonb("unmapped_handles").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  proposal: jsonb("proposal"),
  error: text("error"),
});
export type PressPricingSync = typeof pressPricingSyncs.$inferSelect;

// Generic per-album add-on. First user: the **signed_cert** add-on (printed
// & signed GoodDeed certificate). Future shapes (professional framing,
// full-album-sized framed GoodDeed with QR provenance) drop in here as new
// `kind` values without a migration rewrite. `minPriceCents` is the per-
// album floor the artist can't price below; `priceCents` is what they
// chose for this album.
export const albumAddons = pgTable(
  "album_addons",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    priceCents: integer("price_cents").notNull(),
    minPriceCents: integer("min_price_cents").notNull().default(0),
    // Task #793 — booklet-only. The single "7\" + booklet" set bundle
    // price the fan pays for the with-booklet variant of the 7" single
    // (NOT priceCents + sku price — a flat set price, default $25).
    // NULL on legacy booklet rows (and all signed_cert rows); the fan
    // + admin paths fall back to `sku.priceCents + addon.priceCents`
    // so an existing standalone booklet add-on maps cleanly into the
    // "with booklet" option without double-charging or disappearing.
    bundlePriceCents: integer("bundle_price_cents"),
    // Task #119 — platform-cost price lock. When the artist saves the
    // signed_cert add-on we snapshot the live `payout_settings.cert_cost_cents`
    // onto this row, so admin's "You earn $X.XX per unit" readout stays
    // stable until the artist re-saves at a new platform price. Nullable
    // because pre-Task-#119 rows have no snapshot — the SellPanel falls
    // back to the live platform setting in that case.
    costCentsSnapshot: integer("cost_cents_snapshot"),
    // Task #121 — planned-quantity for the signed_cert add-on. NULL means
    // "as many as will sell" (uncapped); a positive integer is the
    // artist's committed planned print run. This is a *planning* value
    // only (drives the admin Total readout); it does not hard-cap sales.
    plannedQuantity: integer("planned_quantity"),
    // Task #245 — per-leg vendor assignment for the signed_cert add-on.
    // Up to one vendor per leg (Printing / Hologram+shrinkwrap / Insertion).
    // Each vendor must have an active vendor_gooddeed_services row for the
    // matching service before it can be assigned. Vendors stay editable
    // post-sale (the legs are operational routing, not metadata).
    printVendorId: varchar("print_vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    hologramVendorId: varchar("hologram_vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    insertionVendorId: varchar("insertion_vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    // Task #579 — addon-scoped artwork URL. Used by the `booklet`
    // add-on as the print-ready cover the artist drag-and-drops on
    // the BookletPill tile (separate from the album jacket art). Nullable
    // so existing signed_cert rows (which inherit `albums.artwork`)
    // keep working without a backfill.
    artworkUrl: text("artwork_url"),
    // Task #245 — per-release pricing snapshot. Populated when the sale
    // window closes and the run is locked for print. Shape:
    //   { runQty, printing: { vendorId, perUnitCents, setupFeeCents },
    //     hologram: { vendorId, perUnitCents, setupFeeCents },
    //     insertion: { vendorId, perUnitCents, setupFeeCents } | null,
    //     totalPerUnitCents, totalRunCents }
    // Once stamped, vendor pricing edits no longer affect this release.
    pricingSnapshot: jsonb("pricing_snapshot"),
    pricingSnapshotAt: timestamp("pricing_snapshot_at"),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    albumKindUnique: unique("album_addons_album_kind_unique").on(t.albumId, t.kind),
  }),
);

// ─── Task #245 — Vendor-managed GoodDeed pricing portal ───────────────
// One row per (vendor, service) where service is one of the three legs
// a signed/printed GoodDeed run goes through:
//   - "printing"  → tiered per-unit ladder in `tiersJson` (one row per
//                   batch-size break: 25/50/100/200/300/500, etc.)
//   - "hologram"  → flat per-unit price in `flatPerUnitCents`
//                   (hologram sticker + shrinkwrap is sold together).
//   - "insertion" → flat per-unit price in `flatPerUnitCents`
//                   (insert into sleeves at the pressing plant). Only
//                   meaningful when the vendor is also a press.
//
// `active=false` lets a vendor save a draft without being assignable.
// `minBatch` and `leadTimeDays` are advisory — quoting tools use them
// to flag undersized batches. `shipToDefault` is the default ship-to
// address for inbound stock (printer → press, etc.) so artists/admins
// don't have to type it on every PO.
export const VENDOR_GOODDEED_SERVICES = ["printing", "hologram", "insertion"] as const;
export type VendorGoodDeedService = (typeof VENDOR_GOODDEED_SERVICES)[number];

export const vendorGoodDeedServices = pgTable(
  "vendor_gooddeed_services",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    vendorId: varchar("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    active: boolean("active").notNull().default(false),
    // Printing only — array of { qty, perUnitCents }, sorted asc by qty.
    // `qty` is the floor of the tier; the runtime walks the ladder and
    // picks the highest qty <= run size. Use `flat_per_unit_cents` for
    // hologram/insertion.
    tiersJson: jsonb("tiers_json").$type<Array<{ qty: number; perUnitCents: number }>>(),
    // Task #471 — per-paper-size price ladder for Quickprinter printing
    // rows. Shape: `{ letter?: Tier[]; "12x18"?: Tier[] }`. When set,
    // takes precedence over `tiersJson` (which stays for back-compat
    // with pre-#471 vinyl-press printing rows). The runtime asks for a
    // specific size; missing sizes return null pricing.
    sizeLaddersJson: jsonb("size_ladders_json").$type<{ letter?: Array<{ qty: number; perUnitCents: number }>; "12x18"?: Array<{ qty: number; perUnitCents: number }> }>(),
    flatPerUnitCents: integer("flat_per_unit_cents"),
    setupFeeCents: integer("setup_fee_cents").notNull().default(0),
    minBatch: integer("min_batch").notNull().default(25),
    leadTimeDays: integer("lead_time_days").notNull().default(14),
    shipToDefault: text("ship_to_default"),
    notes: text("notes"),
    updatedByUserId: varchar("updated_by_user_id"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    vendorServiceUniq: uniqueIndex("vendor_gooddeed_services_vendor_service_uniq").on(
      t.vendorId,
      t.service,
    ),
  }),
);

export type VendorGoodDeedServiceRow = typeof vendorGoodDeedServices.$inferSelect;
export type InsertVendorGoodDeedService = typeof vendorGoodDeedServices.$inferInsert;

// Task #242 — Push-to-Shopify audit trail. One row per push attempt
// (create or update), persisted after the Shopify API call succeeds.
// Operators can scan this from the album editor to see who pushed,
// when, with what action, and whether they had to force-overwrite a
// label-side edit. Kept narrow on purpose — the canonical
// product/variant ids live on the album row; this is the *history*.
export const shopifyPushLog = pgTable("shopify_push_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  storeId: varchar("store_id").notNull(),
  productId: varchar("product_id").notNull(),
  action: text("action").notNull(),
  forced: boolean("forced").notNull().default(false),
  conflicts: text("conflicts").array(),
  actorUserId: varchar("actor_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type ShopifyPushLogEntry = typeof shopifyPushLog.$inferSelect;

// Task #122 — Pending signed-certificate reservations. Created the
// moment we mint a Stripe Checkout Session that includes the
// signed_cert add-on, expires 30 minutes later if the buyer abandons.
// Counted alongside paid+shipped order_items so two simultaneous
// buyers at the planned-quantity boundary can't both pass the cap
// check. The row is deleted once the matching order is materialized
// as paid (paid orders are then counted via order_items directly).
export const signedCertReservations = pgTable(
  "signed_cert_reservations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
);

// Orders. One row per Stripe Checkout Session that completed payment.
// Idempotent writes are keyed on `stripeCheckoutSessionId` (and also
// `stripePaymentIntentId` once Stripe attaches one) so webhook replays
// don't double-write. Status lifecycle: pending → paid → shipped (or
// → refunded at any point). `goodDeedNumber` is assigned at paid-time
// (atomically picking the next number for the album) and voided on
// refund. Address + buyer snapshots are duplicated here so a later
// customer-profile edit doesn't rewrite history.
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customerUsers.id),
  albumId: varchar("album_id").notNull().references(() => albums.id),
  totalCents: integer("total_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
  status: text("status").notNull().default("pending"),
  shippingAddress: jsonb("shipping_address").$type<StripeAddressSnapshot>(),
  billingAddress: jsonb("billing_address").$type<StripeAddressSnapshot>(),
  buyerEmail: text("buyer_email"),
  buyerName: text("buyer_name"),
  buyerPhone: text("buyer_phone"),
  // Payment-instrument snapshot from Stripe, captured at materialization.
  // brand/last4 come from payment_intent.payment_method.card; walletType
  // from card.wallet.type ("apple_pay" / "google_pay" / …); receiptUrl is
  // the Stripe-hosted receipt on the latest charge. All null for
  // legacy/imported orders that never ran through current materialization.
  paymentCardBrand: text("payment_card_brand"),
  paymentCardLast4: text("payment_card_last4"),
  paymentWalletType: text("payment_wallet_type"),
  receiptUrl: text("receipt_url"),
  goodDeedNumber: integer("good_deed_number"),
  shippedAt: timestamp("shipped_at"),
  refundedAt: timestamp("refunded_at"),
  // Task #46 — gifting. Nullable FK to the gifts row when this order was
  // bought as a gift. Lets the buyer's order list + admin orders view
  // pull the gift status without a separate query.
  giftId: varchar("gift_id"),
  // ─── Task #48 — Stripe Connect payouts ────────────────────────────
  // Lifecycle: null → "pending" (paid, awaiting ship) → "transferred"
  // (ship triggered a Connect Transfer) → "reversed" (refund reversed
  // the transfer). "skipped" means we shipped but had no connected
  // account to pay (operator must reconcile manually). "failed" means
  // we tried the transfer and Stripe rejected it — surfaced in the
  // stuck-cases dashboard with the error string.
  payoutStatus: text("payout_status"),
  payoutTransferId: text("payout_transfer_id"),
  // Amount transferred to the connected account, in cents. Equals
  // `totalCents - platformFeeCents - certCostCents` at transfer time.
  // Snapshotted so a later settings change can't rewrite history.
  payoutAmountCents: integer("payout_amount_cents"),
  platformFeeCents: integer("platform_fee_cents"),
  certCostCents: integer("cert_cost_cents"),
  // Which connected-account owner received the payout. Mirrors
  // payout_accounts.ownerKind / ownerId so the admin order row can
  // deep-link to the recipient even if the album's owner later changes.
  payoutOwnerKind: text("payout_owner_kind"),
  payoutOwnerId: varchar("payout_owner_id"),
  payoutAt: timestamp("payout_at"),
  payoutError: text("payout_error"),
  // ─── Task #49 — order origin ───────────────────────────────────────
  // "direct"            → bought on goodtunes.music via Stripe Checkout
  // "shopify:<storeId>" → bought on a label's Shopify store; webhook
  //                       arrived at /api/webhooks/shopify/orders.
  // Existing rows backfill to "direct" via column default. Order surfaces
  // (fan + admin) read this to render the origin badge.
  origin: text("origin").notNull().default("direct"),
  // FK to shopify_stores when origin starts with "shopify:". Null for
  // direct orders. Lets admin lists join to store_name without parsing
  // the origin string.
  shopifyStoreId: varchar("shopify_store_id"),
  // Shopify's numeric order id (stringified). Unique across the system
  // so a replayed `orders/paid` webhook is a no-op. Null for direct.
  shopifyOrderId: text("shopify_order_id").unique(),
  // Task #49 — Shopify's per-order unguessable token (`order.token` on the
  // payload, also exposed to the order-status-page JS as
  // Shopify.checkout.token). We require it on the public redemption-by-
  // order endpoint so possession of an order id alone isn't enough to
  // pull the redemption code; the buyer also has to be on their own
  // order status page (where Shopify hands them the token).
  shopifyOrderToken: text("shopify_order_token"),
  // ─── Task #73 — Order Desk fulfillment wiring ─────────────────────
  // Snapshot fields and lifecycle timestamps for the physical-goods
  // path. We snapshot artistId/labelId/skuKind here (denormalized) so
  // Stripe-dashboard metadata and reporting joins survive an album
  // reassignment. Coarse skuKind values:
  //   "digital" | "vinyl" | "cassette" | "cd" | "bundle" | "gift" | "gooddeed".
  skuKind: text("sku_kind"),
  artistSnapshotId: varchar("artist_snapshot_id"),
  labelSnapshotId: varchar("label_snapshot_id"),
  // Fulfillment lifecycle, separate from `status` (Stripe-side):
  //   "pending"        → physical order materialized, awaiting OD push
  //   "submitted"      → OD order created, awaiting warehouse pick
  //   "in_fulfillment" → warehouse picking/packing
  //   "shipped"        → carrier accepted, tracking present
  //   "delivered"      → carrier reports delivered
  //   "cancelled"      → OD/operator cancelled before ship
  //   "returned"       → fan returned the package
  // null = not applicable (digital-only).
  fulfillmentStatus: text("fulfillment_status"),
  // Operator-override warehouse selection. SET NULL on partner delete
  // so historical orders survive.
  fulfillmentPartnerId: varchar("fulfillment_partner_id").references(
    (): any => fulfillmentPartners.id,
    { onDelete: "set null" },
  ),
  // Order Desk's own order id. Unique → replayed webhook can't double-create.
  orderDeskOrderId: text("order_desk_order_id").unique(),
  // Carrier + tracking, written by the OD webhook on shipped events.
  carrier: text("carrier"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  // Lifecycle milestones (shippedAt already exists above).
  submittedToFulfillmentAt: timestamp("submitted_to_fulfillment_at"),
  inFulfillmentAt: timestamp("in_fulfillment_at"),
  deliveredAt: timestamp("delivered_at"),
  cancelledAt: timestamp("cancelled_at"),
  returnedAt: timestamp("returned_at"),
  // Last raw OD payload for admin debugging — small enough to inline.
  fulfillmentRaw: jsonb("fulfillment_raw"),
  // ─── Shipping & handling charged to the fan ────────────────────────
  // Snapshot of what we collected for shipping on this order. We store
  // the fulfillment partner's raw rate (`shipping_base_cents`, e.g.
  // Spinney's published band price) and OUR markup (`shipping_markup_
  // cents`, the $1.00 fudge) separately so the breakdown is always
  // auditable; `shipping_charged_cents` is what the fan actually paid
  // (base + markup, ×weight overflow). `shipping_band` records which
  // weight band (band1/band2/band3) resolved. All null for digital
  // orders and for legacy/imported orders created before this shipped.
  shippingBaseCents: integer("shipping_base_cents"),
  shippingMarkupCents: integer("shipping_markup_cents"),
  shippingChargedCents: integer("shipping_charged_cents"),
  shippingBand: text("shipping_band"),
  // Task #937 — stamped the moment the branded order-receipt email is
  // claimed for sending. The send is best-effort, but the claim is an
  // atomic conditional UPDATE (… WHERE receipt_email_sent_at IS NULL)
  // so two concurrent materializations (webhook vs. /welcome fetch)
  // can never dispatch two receipts for one order.
  receiptEmailSentAt: timestamp("receipt_email_sent_at"),
  // Task #1467 — fan-confirmed name for the DIGITAL GoodDeed certificate.
  // The physical signed-cert add-on confirms its name on a real
  // `signed_cert_certificates` row; digital-only owners never get one,
  // so the cert PDF (server/certificates.ts Path 2) synthesizes the
  // recipient from realName → displayName → username. Imported gogoods
  // fans in particular may have a username that isn't the name they want
  // printed. These two columns let a digital owner review + override that
  // synthesized name without minting a print-queue row. NULL = never
  // confirmed (fall back to the synthesized name). `certConfirmedAt`
  // records when. Only read on the no-real-row (digital) cert path.
  certConfirmedName: text("cert_confirmed_name"),
  certConfirmedAt: timestamp("cert_confirmed_at"),
  // Per-order paper size for the DIGITAL (synthetic) GoodDeed cert. NULL =
  // fall back to the country-derived default (paperSizeFromCountry). A
  // digital owner can flip US Letter ↔ A4 from the cert viewer; the
  // physical signed-cert path stores its own size on the cert row instead.
  certPaperSize: text("cert_paper_size"),
  createdAt: timestamp("created_at").defaultNow(),
  legacyGogoodsId: text("legacy_gogoods_id"),
}, (t) => ({
  legacyGogoodsIdUniq: uniqueIndex("orders_legacy_gogoods_id_uniq")
    .on(t.legacyGogoodsId)
    .where(sql`${t.legacyGogoodsId} IS NOT NULL`),
  // Task #551 — per-album GoodDeed number is the printed sequence on
  // the physical cert. Partial uniqueness ensures two orders for the
  // same album can never share a number, even under a concurrent
  // webhook race that beats the MAX+1 read. Callers wrap the insert
  // in a retry loop (see withRetryOnGoodDeedCollision in commerce.ts).
  goodDeedNumberUniq: uniqueIndex("orders_album_good_deed_number_uniq")
    .on(t.albumId, t.goodDeedNumber)
    .where(sql`${t.goodDeedNumber} IS NOT NULL`),
}));

// ─── Task #73 — Order Desk webhook idempotency ─────────────────────
// One row per OD event id we've successfully processed. PK on event
// id so replays are `onConflictDoNothing` no-ops.
export const orderDeskWebhookEvents = pgTable("order_desk_webhook_events", {
  eventId: varchar("event_id").primaryKey(),
  orderId: varchar("order_id").references(() => orders.id, { onDelete: "set null" }),
  eventType: text("event_type"),
  receivedAt: timestamp("received_at").defaultNow(),
});

// ─── Task #49 — Shopify redemption flow ─────────────────────────────────
// One row per Shopify store that has installed the GoodTunes app. We
// store the offline access token Shopify hands us at OAuth callback so
// later admin calls (script-tag install, refund queries) can authenticate
// without the operator re-clicking through the install flow. v1 stores
// the token in plaintext — pre-production we should envelope-encrypt it
// like admin_totp.secretEncrypted.
export const shopifyStores = pgTable("shopify_stores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // The myshopify.com domain (e.g. "tim-snider-records.myshopify.com").
  // Unique because Shopify's OAuth handshake is per-shop and a re-install
  // overwrites the same row.
  shopDomain: text("shop_domain").notNull().unique(),
  // Display name of the store, pulled from /admin/api/.../shop.json on
  // install so admin lists don't have to make a live call.
  storeName: text("store_name"),
  accessToken: text("access_token").notNull(),
  scopes: text("scopes"),
  // Set when the store calls app/uninstalled. We keep the row (for
  // historical order joins) but clear accessToken and stamp this column
  // so admin UI can render "Disconnected" without losing the linkage.
  installedAt: timestamp("installed_at").defaultNow(),
  uninstalledAt: timestamp("uninstalled_at"),
});

// Mapping a Shopify product (or specific variant) on a connected store
// to a GoodTunes album. One row per (storeId, productId, variantId).
// `offerSignedCert` toggles whether the label is bundling a printed +
// signed GoodDeed certificate into the same Shopify order — the price
// label sets here is enforced at webhook time against the album's
// per-album minimum floor (album_addons.signed_cert.minPriceCents).
export const shopifyProductMappings = pgTable(
  "shopify_product_mappings",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    storeId: varchar("store_id")
      .notNull()
      .references(() => shopifyStores.id, { onDelete: "cascade" }),
    // Both ids stored as strings — Shopify uses int64 ids that overflow
    // JS numbers in some cases, so always treat them as strings.
    shopifyProductId: text("shopify_product_id").notNull(),
    // null variantId = match every variant of the product (label hasn't
    // split formats into separate variants; the album maps the whole
    // product). Required for products with multiple variants where the
    // label wants different albums per variant — they create one mapping
    // per variant id instead.
    shopifyVariantId: text("shopify_variant_id"),
    // Snapshot for the admin list ("Bundled with: ‹product title›")
    // so we don't round-trip Shopify on every render.
    shopifyProductTitle: text("shopify_product_title"),
    albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
    offerSignedCert: boolean("offer_signed_cert").notNull().default(false),
    // Price the label is selling the cert for inside the Shopify cart.
    // Subject to the album's min floor — webhook discards values below.
    signedCertPriceCents: integer("signed_cert_price_cents"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  // No table-level uniqueness here — Postgres treats NULL variantId as
  // distinct from every other NULL, so a single 3-col unique constraint
  // would let product-wide mappings (variantId=null) duplicate. Instead
  // we maintain two PARTIAL unique indexes via raw SQL migration:
  //   * shopify_mapping_unique_with_variant: (store, product, variant)
  //       WHERE variant IS NOT NULL
  //   * shopify_mapping_unique_product_wide: (store, product)
  //       WHERE variant IS NULL
  // Drizzle's table builder doesn't model partial indexes today, so
  // these live in code-managed SQL alongside the upsert in
  // server/shopify.ts (which uses a manual select-then-update-or-insert
  // because Postgres requires the conflict target to match exactly one
  // of the two partial indexes).
);

// One-time redemption code minted at orders/paid webhook time. The code
// is the path component on /redeem/<code> — both the order-status-page
// script and the email template button deep-link to it. We don't hash
// it (unlike admin OTPs) because the code IS the secret being mailed to
// the fan, and order resolution requires the raw string anyway. Long
// enough (16 hex chars = 64 bits) that brute force is uneconomical.
export const shopifyRedemptionCodes = pgTable("shopify_redemption_codes", {
  code: varchar("code").primaryKey(),
  orderId: varchar("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" })
    .unique(),
  // Filled when /redeem/:code lands the fan in the player. Idempotent —
  // a second click just signs them in to the already-claimed account.
  redeemedAt: timestamp("redeemed_at"),
  redeemedByUserId: varchar("redeemed_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Task #46 — Gifting. One row per gifted order. Created when the buyer
// taps "This is a gift" on the order-confirmation screen. `claimToken`
// is the shareable secret embedded in /gift/:token. When the recipient
// signs in/up and claims, `claimedByUserId` + `claimedAt` get filled,
// AND the parent order.customerId + matching user_albums.userId both
// move to the claimer so the certificate + library follow the gift.
// `expiresAt` is suggested 30 days from creation; the buyer can re-send
// (rotates `claimToken`) or change the recipient within 24h.
// Task #550 — per-copy gifting + scheduled delivery. The order-level
// gift from #46 still works (legacy single-copy orders pass copyId=null
// and the whole order transfers). On multi-quantity orders the sender
// can gift any individual copy, attach an optional message, and
// optionally schedule delivery for a future date. When the recipient
// already has a GoodTunes account we resolve the email/phone to a
// `recipientUserId` at creation time and reserve the entitlement; the
// claim flow keeps working the same way (recipient still has to log in
// and tap Claim). A daily scheduler stamps `deliveredAt` on gifts
// whose `deliverOn` date has arrived. Refund-before-claim stamps
// `revertedAt` and leaves the entitlement with the sender.
export const gifts = pgTable("gifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  // When set, the gift moves only this one per-copy entitlement; when
  // null, the whole order moves (legacy single-copy path).
  copyId: varchar("copy_id").references(() => orderCopies.id, { onDelete: "cascade" }),
  buyerUserId: varchar("buyer_user_id").notNull().references(() => customerUsers.id),
  recipientFirstName: text("recipient_first_name").notNull(),
  recipientLastName: text("recipient_last_name").notNull(),
  recipientEmail: text("recipient_email"),
  recipientPhone: text("recipient_phone"),
  // Resolved at creation time when the recipient email/phone matches an
  // existing customer_users row. Null when no match (we send an invite
  // link instead). Distinct from `claimedByUserId` — recipientUserId is
  // who we *expect* will claim; claimedByUserId is who actually did.
  recipientUserId: varchar("recipient_user_id").references(() => customerUsers.id, { onDelete: "set null" }),
  // Optional gift-card-style message the recipient sees on the claim
  // page. Plain text, ≤500 chars (enforced at the route).
  message: text("message"),
  // Optional scheduled delivery date (YYYY-MM-DD). Until the daily
  // scheduler stamps `deliveredAt`, the public claim endpoint reports
  // the gift as not-yet-delivered and the claim button is disabled.
  deliverOn: text("deliver_on"),
  deliveredAt: timestamp("delivered_at"),
  claimToken: text("claim_token").notNull().unique(),
  claimedByUserId: varchar("claimed_by_user_id").references(() => customerUsers.id),
  claimedAt: timestamp("claimed_at"),
  // Stamped when the parent order is refunded before claim — the gift
  // link stops working and the entitlement stays with the sender (or
  // is removed entirely as part of the standard refund unwind).
  revertedAt: timestamp("reverted_at"),
  expiresAt: timestamp("expires_at").notNull(),
  // Bookkeeping for "Sent / Resent" admin pill — increments each resend.
  resendCount: integer("resend_count").notNull().default(0),
  lastSentAt: timestamp("last_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
// Uniqueness enforced at the DB layer via two partial indexes (post-
// merge SQL): one on (order_id) WHERE copy_id IS NULL for the legacy
// whole-order gift, one on (order_id, copy_id) WHERE copy_id IS NOT
// NULL for per-copy gifts. Mirrors the signed_cert_certificates
// pattern from Task #549.

// Stripe Connect (Express) account attached to a People row or a
// Label row. Pair (ownerKind, ownerId) is unique — each artist or
// label has at most one connected account. Created via
// POST /api/admin/payouts/accounts (operator-driven; no self-serve
// artist portal yet). `payoutsEnabled` + `chargesEnabled` mirror
// the Stripe account capability flags; we refresh them on demand
// (GET /accounts/:id/refresh) and on the `account.updated` webhook.
export const payoutAccounts = pgTable(
  "payout_accounts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerKind: text("owner_kind").notNull(),
    ownerId: varchar("owner_id").notNull(),
    stripeAccountId: text("stripe_account_id").notNull().unique(),
    country: text("country").notNull().default("US"),
    email: text("email"),
    payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
    chargesEnabled: boolean("charges_enabled").notNull().default(false),
    detailsSubmitted: boolean("details_submitted").notNull().default(false),
    requirementsDue: jsonb("requirements_due").$type<string[]>(),
    disabledReason: text("disabled_reason"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    ownerUnique: unique("payout_accounts_owner_unique").on(t.ownerKind, t.ownerId),
  }),
);

// Singleton settings row (id = 'default'). Platform fee + per-order
// certificate cost are global defaults; per-album overrides live on
// the `albums` table (see payoutFeePctOverride / payoutCertCentsOverride).
export const payoutSettings = pgTable("payout_settings", {
  id: varchar("id").primaryKey().default("default"),
  platformFeePct: integer("platform_fee_pct").notNull().default(10),
  // Task #119 — platform's wholesale cost of a printed & signed
  // GoodDeed certificate. Default bumped to $12.00 to reflect real
  // print + ship cost. Editable on the super-admin Platform Pricing
  // page; per-album overrides still live on `albums.payoutCertCentsOverride`.
  certCostCents: integer("cert_cost_cents").notNull().default(1200),
  // Task #119 — platform's per-order Shopify checkout fee (in cents).
  // Surfaced on the Platform Pricing page; payout math wiring is
  // tracked separately on the roadmap.
  shopifyFeeCents: integer("shopify_fee_cents").notNull().default(350),
  // Signed-cert wholesale ladder — the per-unit price GoodTunes charges
  // artists and labels for printed, signed, hologrammed GoodDeed
  // certificates, snapped to the actual run size at window close. Edited
  // by super_admin on AdminPlatformPricing; consumed by the Push-to-Shopify
  // earnings preview (server/shopify.ts) and the future window-close
  // auto-charge. NULL falls back to `DEFAULT_SIGNED_CERT_LADDER` in
  // shared/signedCertLadder.ts so the column being un-seeded never breaks
  // the preview math. See `validateSignedCertLadder` for the write rules.
  signedCertLadder: jsonb("signed_cert_ladder").$type<SignedCertLadderRung[]>(),
  // Task #471 — platform-default GoodDeed vendor routing. Moved off
  // `album_addons.{print,hologram,insertion}_vendor_id` so admins set
  // it once on AdminPlatformPricing instead of per album. The Shopify
  // Sell panel's Cost (live) preview resolves against these IDs; the
  // legacy album-level columns are kept (loose FK, no longer written
  // from the UI) so historical snapshots still read.
  defaultPrintVendorId: varchar("default_print_vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  defaultHologramVendorId: varchar("default_hologram_vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  defaultInsertionVendorId: varchar("default_insertion_vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  // Publishing mechanical-royalty rate, in MICRO-DOLLARS per pressed unit
  // ($1 = 1,000,000 micros). Default 127,000 = $0.127/unit, the U.S.
  // statutory Section-115 physical/DPD rate honored in Nick Carter's signed
  // Hipgnosis license #24084. The publishing-settlement engine computes
  // owed = rateMicros × unitsPressed × (percentBp / 10000) per split, so
  // changing the statutory rate here re-prices every open settlement.
  mechanicalRateMicros: integer("mechanical_rate_micros").notNull().default(127000),
  // Task #550 — gifting window. Fan can convert a kept copy into a
  // gift from their library for this many days after purchase. Default
  // 30; editable on AdminPlatformPricing. The checkout-time gift path
  // is always available (no window check at order-creation time).
  giftingWindowDays: integer("gifting_window_days").notNull().default(30),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// One row per line item on an order. `kind` is "format" (the physical SKU
// the fan picked) or "addon" (signed_cert today, framing/etc. later).
// `label` is a human snapshot — even if the SKU row is later renamed in
// admin, the receipt + order history keep reading the original label.
// Task #549 — per-copy entitlement row. One row per album the fan
// bought, even when quantity > 1. Each copy carries its own
// `signed_cert` add-on toggle and (when signed) its own GoodDeed
// number — the downstream gifting flow assigns/keeps individual
// copies, so the per-copy unit needs to be addressable in the schema
// rather than derived from order_items aggregate quantities.
//
// `order_items` stays the aggregate Stripe-aligned receipt structure
// (one row per kind+sku with summed quantity); `order_copies` is the
// gift-able unit. Both views are written at materialize time.
export const orderCopies = pgTable(
  "order_copies",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    // Denormalised from `orders.album_id` so the partial unique index
    // below can enforce per-album GoodDeed-number uniqueness without a
    // join — same protection model as `orders.good_deed_number`.
    albumId: varchar("album_id").notNull(),
    position: integer("position").notNull().default(0),
    format: text("format").notNull(),
    signedCert: boolean("signed_cert").notNull().default(false),
    // Task #793 — true when this copy is the "7\" + booklet" bundle
    // variant (each with-booklet copy consumes one booklet from the
    // run). `formatPriceCents` already holds the set bundle price the
    // fan paid for this copy ($25 with booklet vs $15 alone), so the
    // boolean is the fulfillment/run-consumption signal, not pricing.
    booklet: boolean("booklet").notNull().default(false),
    formatPriceCents: integer("format_price_cents").notNull(),
    addonPriceCents: integer("addon_price_cents").notNull().default(0),
    goodDeedNumber: integer("good_deed_number"),
    vinylColor: text("vinyl_color"),
    jacketUpgrade: text("jacket_upgrade"),
    // Downstream gifting task fills this when a copy is sent as a gift.
    giftId: varchar("gift_id"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    orderPosUniq: uniqueIndex("order_copies_order_position_uniq").on(t.orderId, t.position),
  }),
);
export type OrderCopy = typeof orderCopies.$inferSelect;

export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  sku: text("sku").notNull(),
  label: text("label").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  quantity: integer("quantity").notNull().default(1),
  // Task #201 — pressing snapshot. For vinyl format rows we copy the
  // SKU's vinyl_color + jacket_upgrade onto the order item at
  // materialize-time so a later artist edit to album_skus can never
  // retroactively change the receipt the fan already got. Null on
  // non-vinyl / addon rows and on historical orders written before
  // this column existed (those fall back to current-SKU lookup on
  // read, then black if the SKU is gone).
  vinylColor: text("vinyl_color"),
  jacketUpgrade: text("jacket_upgrade"),
  // Task #844 — name of who fulfils a custom ("Gift of Hope") add-on,
  // snapshotted from custom_addons.fulfiller at checkout so the order
  // line tells fulfillment who ships it. Null on format / signed-cert /
  // booklet rows and on historical orders.
  fulfiller: text("fulfiller"),
  // Task #1630 — for a custom non-profit add-on (e.g. Nightbirde's "Gift
  // of Hope" donation box) the buyer picks whether it ships anonymously
  // or is destined for a specific recipient they assign after the sale.
  // "anonymous" | "specific". Null on every other kind and on historical
  // rows. Whom each donation actually goes to is assigned post-purchase
  // via the existing gift-assignment flow, not captured here.
  recipientMode: text("recipient_mode"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adminIdentities = pgTable(
  "admin_identities",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "google" | "apple"
    providerUserId: text("provider_user_id").notNull(),
    email: text("email"),
    linkedAt: timestamp("linked_at").defaultNow(),
  },
  (t) => ({
    providerSubUnique: unique("admin_identities_provider_sub_unique").on(t.provider, t.providerUserId),
  }),
);

export const customerIdentities = pgTable(
  "customer_identities",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => customerUsers.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    email: text("email"),
    linkedAt: timestamp("linked_at").defaultNow(),
  },
  (t) => ({
    providerSubUnique: unique("customer_identities_provider_sub_unique").on(t.provider, t.providerUserId),
  }),
);

// TOTP second factor for admin sign-in. One row per admin user.
// `secretEncrypted` is AES-256-GCM-encrypted at rest with TOTP_ENC_KEY
// so a DB dump alone can't be used to generate codes.
// `recoveryCodes` is an array of scrypt-hashed single-use codes; each
// hash is removed after consumption.
export const adminTotp = pgTable("admin_totp", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  secretEncrypted: text("secret_encrypted").notNull(),
  recoveryCodes: text("recovery_codes").array().notNull().default(sql`'{}'::text[]`),
  enrolledAt: timestamp("enrolled_at").defaultNow(),
});

// Task #57 — Email-a-code admin sign-in.
// One row per admin currently mid-sign-in: holds the scrypt-hashed
// 6-digit code, its expiry, and the attempt counter. The row is deleted
// the moment the code verifies (or replaced when the admin asks for a
// fresh one). We only store ONE active code at a time — issuing a new
// code invalidates the previous one, which is what users expect from
// "didn't get it, resend".
//
// Phone number is intentionally absent: SMS delivery is out of scope for
// this task. When SMS lands we add `phoneE164` here and branch on
// channel at issue time — no other shape change needed.
export const adminEmailOtp = pgTable("admin_email_otp", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastSentAt: timestamp("last_sent_at").defaultNow(),
});

// Task #538 — Phone OTP codes.
// One row per (userKind, userId) currently mid-verify. `userKind` is
// "admin" (users table) or "customer" (customer_users table) — we keep
// a single table instead of two because the verify flow is identical
// and the rate-limit windows are easier to reason about in one place.
// `phoneE164` is the number the code was issued against; on successful
// verify we stamp it on the corresponding user row. Code is scrypt-
// hashed (same helper as the email-OTP table). Replacing a row when
// the user requests a fresh code invalidates the previous one. Used
// for gifting, partner payout-setting gating, and account recovery.
export const phoneOtpCodes = pgTable("phone_otp_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userKind: text("user_kind").notNull(),
  userId: varchar("user_id").notNull(),
  phoneE164: text("phone_e164").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastSentAt: timestamp("last_sent_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userUniq: uniqueIndex("phone_otp_codes_user_uniq").on(t.userKind, t.userId),
  phoneIdx: index("phone_otp_codes_phone_idx").on(t.phoneE164),
}));
export type PhoneOtpCode = typeof phoneOtpCodes.$inferSelect;

// Task #269 — Admin "Forgot password?" reset tokens. One row per
// outstanding reset request; raw token lives only in the recipient's
// email (we store the SHA-256 hex hash). Tokens are single-use
// (`consumedAt` is set the moment the new password is written) and
// expire 30 minutes after issue. Customer reset (when we ship one) is
// a separate flow against `customer_users`; this table is admin-only.
export const adminPasswordResetTokens = pgTable("admin_password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type AdminPasswordResetToken = typeof adminPasswordResetTokens.$inferSelect;

// Task #271 — Customer "Forgot password?" reset tokens. Mirror of the
// admin table, pointed at customer_users. Same single-use + SHA-256-hash
// + 30-minute TTL contract. OAuth-only fans (no password row) are
// skipped at the route layer, not by a schema constraint.
export const customerPasswordResetTokens = pgTable("customer_password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => customerUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type CustomerPasswordResetToken = typeof customerPasswordResetTokens.$inferSelect;

export type CustomerUser = typeof customerUsers.$inferSelect;
export type AdminIdentity = typeof adminIdentities.$inferSelect;
export type CustomerIdentity = typeof customerIdentities.$inferSelect;

// Task #256 — Pending admin-shell access requests.
// One row per customer who landed on admin.goodtunes.music while
// signed in as a fan. We use it to (a) dedupe the "tell the
// super_admins" email to one per 24h per requester and (b) surface
// the request in the Admin → Customers row so a super_admin can
// promote the fan in place. `resolvedAt` is set when the customer is
// promoted (or otherwise dismissed) so we stop showing reminders.
export const adminAccessRequests = pgTable("admin_access_requests", {
  customerUserId: varchar("customer_user_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  firstRequestedAt: timestamp("first_requested_at").defaultNow().notNull(),
  lastRequestedAt: timestamp("last_requested_at").defaultNow().notNull(),
  lastNotifiedAt: timestamp("last_notified_at"),
  resolvedAt: timestamp("resolved_at"),
});
export type AdminAccessRequest = typeof adminAccessRequests.$inferSelect;
export type AdminTotp = typeof adminTotp.$inferSelect;
export type AdminEmailOtp = typeof adminEmailOtp.$inferSelect;

export const insertCustomerUserSchema = createInsertSchema(customerUsers).pick({
  username: true,
  email: true,
  displayName: true,
  realName: true,
  password: true,
});
export type InsertCustomerUser = z.infer<typeof insertCustomerUserSchema>;

// One profile photo per user. New writes land in object storage and we
// persist the public `/objects/uploads/<id>` URL in `photo_url`. The
// legacy `data_url` column stays nullable for backward compat — old
// inline base64 avatars keep rendering until the user replaces them.
//
// `user_id` is a loose FK: it stores either a `users.id` (admin/partner)
// or a `customer_users.id` (fan), so we intentionally do NOT declare a
// `.references()` here — same pattern as `auth_tokens` / `user_albums`.
// post-merge.sh drops the leftover FK constraint on both DBs.
export const profilePhotos = pgTable("profile_photos", {
  userId: varchar("user_id").primaryKey(),
  photoUrl: text("photo_url"),
  dataUrl: text("data_url"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Server-side analytics event store (replaces the in-memory ring buffer).
// Indexed-loosely — for real reporting this gets rolled up nightly.
export const analyticsEvents = pgTable("analytics_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: text("client_id"),
  name: text("name").notNull(),
  payload: json("payload").$type<Record<string, any>>(),
  ts: timestamp("ts").notNull(),
  sessionId: text("session_id"),
  userId: varchar("user_id"),
  receivedAt: timestamp("received_at").defaultNow(),
});

// Task #80 — Reporting v1. Cache the (city, region, country) → lat/long
// geocode lookups we feed to the partner Fan Map. Nominatim (OSM) is our
// default provider; its terms forbid hammering, so we cache aggressively
// and only re-geocode on cache miss. `query` is the normalized lookup
// string ("brooklyn|ny|us") and is the unique key — countries and
// regions get rows too so an order with only a country still maps.
// lat/lon are nullable when the provider returned no result; we still
// cache the miss so we don't re-ask. Source = "nominatim" | "manual".
export const geoCache = pgTable("geo_cache", {
  query: text("query").primaryKey(),
  lat: integer("lat_e6"),
  lon: integer("lon_e6"),
  displayName: text("display_name"),
  countryCode: text("country_code"),
  source: text("source").notNull().default("nominatim"),
  cachedAt: timestamp("cached_at").defaultNow(),
});
export type GeoCache = typeof geoCache.$inferSelect;

// Audit log for long-running admin jobs (Dropbox imports, GoodSync,
// etc.). One row per completed run. The summary jsonb captures the
// matched/unmatched/errors arrays so the agent can dig into what
// actually happened when Bill says "nothing imported." Status is
// success | partial | failed.
export const jobRuns = pgTable("job_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobType: text("job_type").notNull(),
  albumId: varchar("album_id"),
  songId: varchar("song_id"),
  status: text("status").notNull(),
  summary: jsonb("summary").$type<Record<string, any>>(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  displayName: true,
  realName: true,
  password: true,
});

export const insertAlbumSchema = createInsertSchema(albums);
export const insertSongSchema = createInsertSchema(songs);
export const insertPlaylistSchema = createInsertSchema(playlists).pick({ name: true });
export const insertPlaylistSongSchema = createInsertSchema(playlistSongs).pick({ songId: true, position: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Album = typeof albums.$inferSelect;
export type Song = typeof songs.$inferSelect;

export const insertPersonSchema = createInsertSchema(people).omit({ id: true });
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof people.$inferSelect;

export const insertPersonDiscographySchema = createInsertSchema(personDiscography).omit({ id: true });
export type InsertPersonDiscography = z.infer<typeof insertPersonDiscographySchema>;
export type PersonDiscography = typeof personDiscography.$inferSelect;

export const insertBandMemberSchema = createInsertSchema(bandMembers).omit({ id: true });
export type InsertBandMember = z.infer<typeof insertBandMemberSchema>;
export type BandMember = typeof bandMembers.$inferSelect;

export const insertAlbumLineupSchema = createInsertSchema(albumLineup).omit({ id: true });
export type InsertAlbumLineup = z.infer<typeof insertAlbumLineupSchema>;
export type AlbumLineup = typeof albumLineup.$inferSelect;

// Enriched read shapes for band-member & album-lineup endpoints — the
// joined Person fields (name/photoUrl/isGroup) are baked in so fan UIs
// can render member rows without N+1 person fetches.
export type BandMemberWithPerson = BandMember & {
  memberName: string;
  memberPhotoUrl: string | null;
  memberIsGroup: boolean;
};
export type AlbumLineupWithPerson = AlbumLineup & {
  memberName: string;
  memberPhotoUrl: string | null;
};

export const insertInstrumentSchema = createInsertSchema(instruments).omit({ id: true });
export type InsertInstrument = z.infer<typeof insertInstrumentSchema>;
export type Instrument = typeof instruments.$inferSelect;

export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true, createdAt: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;

// Enriched read shape for /api/instruments — includes the headline Maker
// (vendor row referenced by makerVendorId) joined in so the admin Gear
// index and fan InstrumentDetail can render the maker without a second
// fetch. `maker` is null when the gear hasn't been linked to a builder.
export type InstrumentWithMaker = Instrument & { maker: Vendor | null };

export const insertLabelSchema = createInsertSchema(labels).omit({ id: true, createdAt: true });
export type InsertLabel = z.infer<typeof insertLabelSchema>;
export type Label = typeof labels.$inferSelect;

// Task #1425 — Manager ENTITY insert/select types. Mirrors the Label pair.
export const insertManagerSchema = createInsertSchema(managers).omit({ id: true, createdAt: true });
export type InsertManager = z.infer<typeof insertManagerSchema>;
export type Manager = typeof managers.$inferSelect;

export const insertJobRunSchema = createInsertSchema(jobRuns).omit({ id: true, finishedAt: true });
export type InsertJobRun = z.infer<typeof insertJobRunSchema>;
export type JobRun = typeof jobRuns.$inferSelect;

export const insertAlbumVideoSchema = createInsertSchema(albumVideos).omit({
  id: true,
  // Mux fields are server-managed (ingest pipeline / webhook), never client-set.
  muxAssetId: true,
  muxPlaybackId: true,
  muxStatus: true,
  muxLastError: true,
});
export type InsertAlbumVideo = z.infer<typeof insertAlbumVideoSchema>;
export type AlbumVideo = typeof albumVideos.$inferSelect;

export const insertAlbumPhotoSchema = createInsertSchema(albumPhotos).omit({ id: true });
export type InsertAlbumPhoto = z.infer<typeof insertAlbumPhotoSchema>;
export type AlbumPhoto = typeof albumPhotos.$inferSelect;

// Album reads denormalize the joined label entity so the fan-facing UI can
// render label name/logo without a second fetch. `label` is null when an
// album has no labelId set or the label was deleted (FK SET NULL).
export type AlbumWithLabel = Album & { label: Label | null };

export const insertInstrumentVendorSchema = createInsertSchema(instrumentVendors).omit({ id: true, createdAt: true });
export type InsertInstrumentVendor = z.infer<typeof insertInstrumentVendorSchema>;
export type InstrumentVendor = typeof instrumentVendors.$inferSelect;

// Enriched shape returned by read joins (getInstruments / getSongCredits /
// getAlbumCredits). Keeps the flat fan-facing shape AlbumDetail.tsx and the
// admin UI expect, while adding `vendorId` + `domain` so admin write paths
// can route vendor-entity edits vs attachment edits to the correct endpoint.
export type EnrichedInstrumentVendor = {
  // attachment fields
  id: string;
  instrumentId: string;
  vendorId: string;
  affiliateUrl: string;
  position: number;
  isHidden: boolean;
  createdAt: Date | null;
  // vendor entity fields (flattened)
  name: string;
  domain: string;
  homeUrl: string | null;
  aboutUrl: string | null;
  logoUrl: string | null;
  tagline: string | null;
  bio: string | null;
  location: string | null;
  coverUrl: string | null;
};

export const insertTrackWriterSchema = createInsertSchema(trackWriters).omit({ id: true });
export type InsertTrackWriter = z.infer<typeof insertTrackWriterSchema>;
export type TrackWriter = typeof trackWriters.$inferSelect;

export const insertTrackPerformerSchema = createInsertSchema(trackPerformers).omit({ id: true });
export type InsertTrackPerformer = z.infer<typeof insertTrackPerformerSchema>;
export type TrackPerformer = typeof trackPerformers.$inferSelect;

export const insertAlbumCreditSchema = createInsertSchema(albumCredits).omit({ id: true });
export type InsertAlbumCredit = z.infer<typeof insertAlbumCreditSchema>;
export type AlbumCredit = typeof albumCredits.$inferSelect;

export const insertPersonAliasSchema = createInsertSchema(personAliases).omit({ id: true });
export type InsertPersonAlias = z.infer<typeof insertPersonAliasSchema>;
export type PersonAlias = typeof personAliases.$inferSelect;

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

// percentBp is a basis-point integer in [0, 10000] (0% – 100%).
// Enforce the range at the API edge — DB column is a bare integer,
// so without this an operator could PUT 12345 ("over 100%") and a
// negative typo would skew totals silently.
export const insertTrackMechanicalSplitSchema = createInsertSchema(trackMechanicalSplits)
  .omit({ id: true, deletedAt: true })
  .extend({
    percentBp: z.number().int().min(0).max(10000),
  });
export type InsertTrackMechanicalSplit = z.infer<typeof insertTrackMechanicalSplitSchema>;
export type TrackMechanicalSplit = typeof trackMechanicalSplits.$inferSelect;

export const insertTrackPublishingSplitSchema = createInsertSchema(trackPublishingSplits)
  .omit({ id: true, deletedAt: true })
  .extend({
    percentBp: z.number().int().min(0).max(10000),
  });
export type InsertTrackPublishingSplit = z.infer<typeof insertTrackPublishingSplitSchema>;
export type TrackPublishingSplit = typeof trackPublishingSplits.$inferSelect;

export const insertCreditRoleSchema = createInsertSchema(creditRoles)
  .omit({ id: true, createdAt: true })
  .extend({
    // Kind is a closed enum on the API even though the column is text —
    // keeps junk like "engineer" or "" from sneaking in via direct POSTs.
    kind: z.enum(["writer", "performer"]),
    name: z.string().min(1).max(60),
  });
export type InsertCreditRole = z.infer<typeof insertCreditRoleSchema>;
export type CreditRole = typeof creditRoles.$inferSelect;
export type UserAlbum = typeof userAlbums.$inferSelect;
export type Playlist = typeof playlists.$inferSelect;
export type PlaylistSong = typeof playlistSongs.$inferSelect;
export type SongFavorite = typeof songFavorites.$inferSelect;
export type ArtistFavorite = typeof artistFavorites.$inferSelect;
export type AuthToken = typeof authTokens.$inferSelect;
export type ProfilePhoto = typeof profilePhotos.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;

// ─── Commerce constants + insert schemas (Task #44) ──────────────────────
// Closed enum of formats the API accepts. The DB column stays text so a
// new format ships without a migration, but every write path validates
// against this list to keep the catalog clean. Labels rendered to the fan
// live in `ALBUM_FORMAT_LABEL` so admin + buy-sheet read identical copy.
export const ALBUM_FORMATS = ["7_inch", "12_lp", "12_double", "cassette", "cd"] as const;
export type AlbumFormat = (typeof ALBUM_FORMATS)[number];
export const ALBUM_FORMAT_LABEL: Record<AlbumFormat, string> = {
  "7_inch": '7" Single',
  "12_lp": '12" LP',
  "12_double": '12" Double LP',
  cassette: "Cassette",
  cd: "CD",
};
// Closed enum of add-on kinds. Today the shipped add-ons are the
// printed & signed GoodDeed certificate (`signed_cert`) and the
// 16-page PMP booklet upsell on 7" / cassette releases (`booklet`).
// Future shapes (`framing`, `framed_gooddeed_qr`) drop in here
// without a schema change.
export const ALBUM_ADDON_KINDS = ["signed_cert", "booklet"] as const;
export type AlbumAddonKind = (typeof ALBUM_ADDON_KINDS)[number];
export const ALBUM_ADDON_LABEL: Record<AlbumAddonKind, string> = {
  signed_cert: "Printed & Signed GoodDeed Certificate",
  booklet: "16-Page Booklet",
};
// Task #579 — formats the `booklet` add-on can be paired with. The
// 7.125"×7.125" trim suits 7" jackets; the cassette J-card sleeve
// holds the same booklet as an insert. Other formats hide the add-on
// in admin and on the fan Buy sheet.
export const BOOKLET_ELIGIBLE_FORMATS = ["7_inch", "cassette"] as const;

export const insertAlbumSkuSchema = createInsertSchema(albumSkus)
  .omit({ id: true, createdAt: true })
  .extend({
    format: z.enum(ALBUM_FORMATS),
    priceCents: z.number().int().min(0),
    stock: z.number().int().min(0).nullable().optional(),
  });
export type InsertAlbumSku = z.infer<typeof insertAlbumSkuSchema>;
export type AlbumSku = typeof albumSkus.$inferSelect;

export const insertAlbumAddonSchema = createInsertSchema(albumAddons)
  .omit({ id: true, createdAt: true })
  .extend({
    kind: z.enum(ALBUM_ADDON_KINDS),
    priceCents: z.number().int().min(0),
    // Task #119 — min floor is being phased out of the artist Sell panel,
    // but the column stays for the Shopify-bundle webhook (server/shopify.ts)
    // until that path is also retired. Optional on the insert schema so
    // new callers can omit it.
    minPriceCents: z.number().int().min(0).optional(),
    costCentsSnapshot: z.number().int().min(0).nullable().optional(),
    // Task #121 — null = "as many as will sell"; positive int = fixed
    // planned quantity for the signed_cert print run.
    plannedQuantity: z.number().int().min(1).nullable().optional(),
    // Task #793 — flat "7\" + booklet" set price (booklet add-on only).
    bundlePriceCents: z.number().int().min(0).nullable().optional(),
  });
export type InsertAlbumAddon = z.infer<typeof insertAlbumAddonSchema>;
export type AlbumAddon = typeof albumAddons.$inferSelect;

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true, createdAt: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

// Task #844 — custom ("Gift of Hope") add-ons.
export const insertCustomAddonSchema = createInsertSchema(customAddons).omit({ id: true, createdAt: true });
export type InsertCustomAddon = z.infer<typeof insertCustomAddonSchema>;

// Task #46 — gift create/update inputs. Recipient name fields are
// required; contact is "at least one of email/phone" — enforced at the
// route layer because zod refinement on createInsertSchema makes the
// type ergonomics awkward downstream.
export const insertGiftSchema = createInsertSchema(gifts).omit({
  id: true,
  claimToken: true,
  claimedByUserId: true,
  claimedAt: true,
  resendCount: true,
  lastSentAt: true,
  createdAt: true,
});
export type InsertGift = z.infer<typeof insertGiftSchema>;
export type Gift = typeof gifts.$inferSelect;

// ─── Task #48 — Stripe Connect payouts ──────────────────────────────────
// "organization" added by Task #354 so non-profit referral payees can
// link a Stripe Connect Express account on AdminNonProfit — same panel,
// owner row points at `organizations.id`. Payout permission for
// organization-owned accounts is super-admin only (the partner-permissions
// scope graph doesn't include non_profit yet).
export const PAYOUT_OWNER_KINDS = ["person", "label", "organization", "manufacturer"] as const;
export type PayoutOwnerKind = (typeof PAYOUT_OWNER_KINDS)[number];

export const insertPayoutAccountSchema = createInsertSchema(payoutAccounts)
  .omit({ id: true, createdAt: true, lastSyncedAt: true })
  .extend({
    ownerKind: z.enum(PAYOUT_OWNER_KINDS),
  });
export type InsertPayoutAccount = z.infer<typeof insertPayoutAccountSchema>;
export type PayoutAccount = typeof payoutAccounts.$inferSelect;
export type PayoutSettings = typeof payoutSettings.$inferSelect;

// ─── Task #543 — Held payout earmarks ───────────────────────────────────
// Bill must personally sign off on every dollar that leaves our Stripe
// before it lands with a partner. Every existing "money moves" path
// (artist royalty on shipped order, press invoice capture, referral
// credit batch) creates a row here in status='held' instead of calling
// stripe.transfers.create directly. The Bill-only /admin/payouts-release
// page is the single chokepoint that flips held → released (firing the
// actual Stripe Connect transfer) or held → rejected (with a required
// reason). Other admins see the queue read-only.
//
// `ownerKind` covers every partner type that receives money — superset
// of PAYOUT_OWNER_KINDS plus vendor + fulfillment so future flows for
// those partner types can land earmarks here without a schema bump.
// `sourceKind` records which event minted the earmark so the queue
// can render the right "from order X" / "from album Y invoice" chip.
export const PAYOUT_EARMARK_OWNER_KINDS = [
  "person",
  "label",
  "organization",
  "manufacturer",
  "vendor",
  "fulfillment",
] as const;
export type PayoutEarmarkOwnerKind = (typeof PAYOUT_EARMARK_OWNER_KINDS)[number];
export const PAYOUT_EARMARK_SOURCE_KINDS = [
  "order_royalty",
  "press_invoice",
  "referral_credit",
  "fulfillment_fee",
  "vendor_payout",
  "early_cut",
  // Mechanical publishing settlement — one earmark per payee per album
  // pressing run, minted from track_publishing_splits at the statutory
  // rate × units pressed. sourceRef = `${albumId}:${payeeKey}`.
  "publishing_mechanical",
] as const;
export type PayoutEarmarkSourceKind = (typeof PAYOUT_EARMARK_SOURCE_KINDS)[number];
export const PAYOUT_EARMARK_STATUSES = [
  "held",
  "released",
  "rejected",
  "failed",
] as const;
export type PayoutEarmarkStatus = (typeof PAYOUT_EARMARK_STATUSES)[number];

export const payoutEarmarks = pgTable(
  "payout_earmarks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    sourceKind: text("source_kind").notNull(),
    // Free-text reference back to whatever minted the row. For
    // `order_royalty` this is the order id; for `press_invoice` the
    // album id; for `referral_credit` the comma-joined credit ids.
    // Lets the UI deep-link to the right detail page without a join.
    sourceRef: text("source_ref").notNull(),
    // Optional album the earmark is "about" — populated when the source
    // event has one (order_royalty, press_invoice). Lets the digest +
    // queue render "(albumTitle) – $X to (owner)" without per-row joins.
    albumId: varchar("album_id"),
    ownerKind: text("owner_kind").notNull(),
    ownerId: varchar("owner_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    status: text("status").notNull().default("held"),
    heldAt: timestamp("held_at").defaultNow().notNull(),
    releasedAt: timestamp("released_at"),
    releasedByUserId: varchar("released_by_user_id"),
    rejectedAt: timestamp("rejected_at"),
    rejectedByUserId: varchar("rejected_by_user_id"),
    rejectionReason: text("rejection_reason"),
    // Stripe Connect transfer id stamped on release. NULL until released.
    stripeTransferId: text("stripe_transfer_id"),
    // Last release-attempt failure surfaced in the UI for retry.
    transferError: text("transfer_error"),
    // Free-text operator note (e.g. "Hold-longer until tour kickoff").
    notes: text("notes"),
  },
  (t) => ({
    statusIdx: index("payout_earmarks_status_idx").on(t.status),
    ownerIdx: index("payout_earmarks_owner_idx").on(t.ownerKind, t.ownerId),
    sourceIdx: index("payout_earmarks_source_idx").on(t.sourceKind, t.sourceRef),
  }),
);

export type PayoutEarmark = typeof payoutEarmarks.$inferSelect;
export type InsertPayoutEarmark = typeof payoutEarmarks.$inferInsert;

export type EmailVerification = typeof emailVerifications.$inferSelect;

// ─── Task #49 — Shopify redemption flow ─────────────────────────────────
export const insertShopifyStoreSchema = createInsertSchema(shopifyStores).omit({
  id: true,
  installedAt: true,
  uninstalledAt: true,
});
export type InsertShopifyStore = z.infer<typeof insertShopifyStoreSchema>;
export type ShopifyStore = typeof shopifyStores.$inferSelect;

export const insertShopifyProductMappingSchema = createInsertSchema(shopifyProductMappings)
  .omit({ id: true, createdAt: true })
  .extend({
    shopifyProductId: z.string().min(1),
    signedCertPriceCents: z.number().int().min(0).nullable().optional(),
  });
export type InsertShopifyProductMapping = z.infer<typeof insertShopifyProductMappingSchema>;
export type ShopifyProductMapping = typeof shopifyProductMappings.$inferSelect;

export type ShopifyRedemptionCode = typeof shopifyRedemptionCodes.$inferSelect;

// ─── Task #69 — Manufacturer & fulfillment partner roles + RFQ ──────────
// Two new partner entities, both first-class in the single admin shell:
//
//   manufacturers          — vinyl/CD/cassette pressing plants. Bid on
//                            RFQs from labels/artists, then receive
//                            masters + artwork once awarded.
//   fulfillment_partners   — warehouses that take finished units and
//                            ship them to fans. Each manufacturer
//                            optionally points at a default fulfillment
//                            partner (their preferred shipper).
//
// Both reuse the labels-style profile shape (name/contact/logo/cover/
// location/website) — we explicitly chose NOT to overload the existing
// Vendors table here. Vendors is for affiliate-linked instrument shops
// (Reverb, Carter, etc.); it has no concept of turnaround days,
// specialties, or fulfillment FK. Conflating the two would force every
// vendor read path to filter on a `kind` column and would muddy fan-side
// surfaces that should never see B2B operations data.
export const manufacturers = pgTable("manufacturers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  // Uniqueness enforced by the partial index in the table callback
  // (excludes soft-deleted rows, Task #1254), not a plain `.unique()`.
  domain: text("domain"),
  logoUrl: text("logo_url"),
  coverUrl: text("cover_url"),
  bio: text("bio"),
  location: text("location"),
  // Task #489 — structured snapshot of the Places-picked Location.
  // See labels.locationAddress for the same column on labels.
  locationAddress: jsonb("location_address").$type<PartnerAddressSnapshot>(),
  websiteUrl: text("website_url"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  // Task #624 — broker / wholesale discount we negotiated with this
  // press, expressed as a whole-number percentage off every catalog
  // unit price (0–100). The artist-facing price ladder always shows
  // the retail/catalog number — this discount becomes additional
  // GoodTunes platform margin at payout time (we pay the press the
  // discounted amount, the delta stays with us). Snapshotted onto
  // each SKU at save time via `costSnapshotBrokerDiscountPct` so a
  // mid-quote rate change can't retroactively rewrite finalised SKUs.
  brokerDiscountPct: integer("broker_discount_pct").notNull().default(0),
  // Task #625 — short free-text operational note shown on the
  // manufacturer admin page. Used for quote-conditions, overrun
  // tolerance, pricing rules (e.g. MRP: "Quoted TOTAL is retail —
  // GoodTunes does not mark up. Margin = 0. Orders may run +10% of
  // ordered qty for runs ≤1000; quote valid through 6/26/26"). Free
  // text — no enforcement logic anywhere reads this. Kept separate
  // from `bio` (which is the marketing intro the scraper fills in)
  // so a re-scrape doesn't clobber operator-entered quote notes.
  operationalNote: text("operational_note"),
  // Task #916 — capability flags. A single production partner can serve
  // up to three capabilities and appears in every matching list
  // automatically: Vinyl (pressing plant, shown on the Presses tab +
  // RFQ broadcast), GoodDeeds (prints/finishes GoodDeed certificates),
  // Fulfillment (warehouses + ships finished units — also surfaced in
  // the Fulfillment nav). `manufacturers` is the canonical home for
  // these three; the legacy `vendors.is_quickprinter` + `fulfillment_partners`
  // consumers are read alongside it (union) rather than hard-cut, and the
  // vendor-FK-keyed GoodDeed pricing/routing-default selection stays
  // vendor-keyed. A row with all three off is invisible everywhere, so a
  // DB CHECK + the PUT/POST guard require at least one (mirrors
  // `vendors_role_at_least_one`). Defaults: new presses are Vinyl-on so
  // an "Add press" with nothing else set still lands on the Presses tab.
  doesVinyl: boolean("does_vinyl").notNull().default(true),
  doesGoodDeed: boolean("does_good_deed").notNull().default(false),
  doesFulfillment: boolean("does_fulfillment").notNull().default(false),
  // Typical lead-time the plant quotes for a standard 12" LP press run,
  // in calendar days. Admin-entered; surfaces on the RFQ comparison
  // table so the operator can sort by turnaround. Nullable while the
  // record is still being onboarded.
  // Task #363 — superseded by the week-range pair below for fan-facing
  // display + admin entry. Kept on the schema so existing rows that
  // only have a day count don't get nulled out, and so the RFQ
  // desired-completion-date warning has something to compare against
  // until min/max weeks are filled in.
  turnaroundDays: integer("turnaround_days"),
  // Standard turnaround expressed as an inclusive week range (e.g.
  // 12–14 wks). Labels and artists think in weeks when planning a
  // pressing campaign, so every press card renders this range instead
  // of a raw day count. Either column may be null while the record is
  // still being onboarded; display falls back to the legacy
  // `turnaroundDays` for back-compat.
  turnaroundWeeksMin: integer("turnaround_weeks_min"),
  turnaroundWeeksMax: integer("turnaround_weeks_max"),
  // Free-text array of capabilities this plant handles natively. We
  // keep it loose-text (not a closed enum) so Bill can write "180g
  // black", "splatter / picture disc", "lathe-cut", "Direct Metal
  // Mastering" without a schema migration each time. Surfaces as chips
  // on the manufacturer card + filters the RFQ broadcast list.
  specialties: text("specialties").array().notNull().default(sql`'{}'::text[]`),
  // Preferred fulfillment partner — the warehouse this plant ships
  // finished units to by default. The label/artist can still override
  // per-album. SET NULL so deleting a fulfillment partner doesn't
  // orphan the manufacturer record.
  defaultFulfillmentPartnerId: varchar("default_fulfillment_partner_id").references(
    (): any => fulfillmentPartners.id,
    { onDelete: "set null" },
  ),
  // Task #533 — One-time super-admin consent that GoodTunes may
  // auto-stage an early masters cut for this press's albums once their
  // per-album pool covers the picked tier's minimum-run floor (gate #1
  // of three). Null = never consented; the eligibility evaluator
  // refuses to enqueue an early cut for any album homed to a press that
  // hasn't switched this on. `autoTriggerConsentBy` is the user id that
  // flipped it (audit trail only).
  autoTriggerConsentAt: timestamp("auto_trigger_consent_at"),
  autoTriggerConsentBy: varchar("auto_trigger_consent_by"),
  createdAt: timestamp("created_at").defaultNow(),
  ...softDeleteCols,
}, (table) => ({
  // Task #916 — a manufacturer row with all three capability flags off
  // would be invisible to every list. The DB-level CHECK is the truth;
  // the API guard in PUT/POST /api/admin/manufacturers mirrors it for a
  // friendlier 400 message. Mirrors `vendors_role_at_least_one`.
  capabilityAtLeastOne: check(
    "manufacturers_capability_at_least_one",
    sql`${table.doesVinyl} OR ${table.doesGoodDeed} OR ${table.doesFulfillment}`,
  ),
  // Task #1254 — domain uniqueness must exclude soft-deleted rows so
  // trashing a press frees its domain slot (mirrors the vendors fix).
  // drizzle-kit doesn't push WHERE-claused indexes; the real partial
  // index lives in scripts/post-merge.sh + the matching prod-schema-fixup.
  domainUniq: uniqueIndex("manufacturers_domain_unique")
    .on(table.domain)
    .where(sql`${table.domain} IS NOT NULL AND ${table.deletedAt} IS NULL`),
}));

export const fulfillmentPartners = pgTable("fulfillment_partners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  // Uniqueness enforced by the partial index in the table callback
  // (excludes soft-deleted rows, Task #1254), not a plain `.unique()`.
  domain: text("domain"),
  logoUrl: text("logo_url"),
  coverUrl: text("cover_url"),
  bio: text("bio"),
  location: text("location"),
  websiteUrl: text("website_url"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  // The warehouse address shipments are received at + ship from.
  // Free-text single line (the manufacturer formats it on the carton
  // label themselves). Optional while onboarding.
  shippingAddress: text("shipping_address"),
  // Task #489 — structured snapshots for both the head-office Location
  // and the receiving-dock Shipping address. Free-text columns above
  // stay the source of truth for display; these are what fulfillment
  // tooling reads to compute ship-zones, country filters, and reliable
  // carton labels.
  locationAddress: jsonb("location_address").$type<PartnerAddressSnapshot>(),
  shippingAddressStruct: jsonb("shipping_address_struct").$type<PartnerAddressSnapshot>(),
  createdAt: timestamp("created_at").defaultNow(),
  ...softDeleteCols,
}, (table) => ({
  // Task #1254 — domain uniqueness must exclude soft-deleted rows so
  // trashing a fulfillment partner frees its domain slot (mirrors the
  // vendors fix). drizzle-kit doesn't push WHERE-claused indexes; the
  // real partial index lives in scripts/post-merge.sh + the prod-schema-fixup.
  domainUniq: uniqueIndex("fulfillment_partners_domain_unique")
    .on(table.domain)
    .where(sql`${table.domain} IS NOT NULL AND ${table.deletedAt} IS NULL`),
}));

// ─── Per-fulfillment-partner shipping rate card ──────────────────────
// One row per (partner × destination × weight band). `destination` is an
// ISO-3166-1 alpha-2 country code (e.g. "US", "CA", "GB") for countries
// the partner publishes a specific rate for, or the literal "INTL" for
// the catch-all international average applied to every other country.
// `band` is band1/band2/band3 (Spinney's "up to 8oz / 1lb / 2lb" tiers).
// `baseCents` is the partner's own published rate; `markupCents` is the
// GoodTunes margin we add on top (Bill's $1.00 = 100), kept separate so
// the fudge is always visible. The fan is charged base + markup (with a
// weight-overflow multiplier on `baseCents` for orders heavier than the
// top band — see server/shipping.ts). `source` documents where the rate
// came from (e.g. "spinney_chart_april_2026").
export const shippingRates = pgTable("shipping_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fulfillmentPartnerId: varchar("fulfillment_partner_id")
    .notNull()
    .references((): any => fulfillmentPartners.id, { onDelete: "cascade" }),
  destination: text("destination").notNull(),
  band: text("band").notNull(),
  baseCents: integer("base_cents").notNull(),
  markupCents: integer("markup_cents").notNull().default(100),
  currency: text("currency").notNull().default("usd"),
  source: text("source"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  partnerDestBandUniq: uniqueIndex("shipping_rates_partner_dest_band_uniq")
    .on(t.fulfillmentPartnerId, t.destination, t.band),
}));

export const insertShippingRateSchema = createInsertSchema(shippingRates).omit({ id: true, createdAt: true });
export type InsertShippingRate = z.infer<typeof insertShippingRateSchema>;
export type ShippingRate = typeof shippingRates.$inferSelect;

// One open quote request from a label/artist out to N manufacturers.
// `albumId` is the album being pressed; the broadcast list (rfqReplies
// with status="invited") is materialized when the RFQ is created. As
// each invited plant submits a quote that row flips to "quoted". The
// label/artist accepts exactly one reply — its plant's id becomes
// `albums.manufacturerId` and every other reply flips to "declined".
export const rfqs = pgTable("rfqs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  // Who opened the RFQ. We capture both the admin user id and an
  // optional scope (label/artist) so the manufacturer-facing inbox can
  // show "Atlantic Records — Album X" rather than the operator's name.
  createdByUserId: varchar("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Closed enum: "open" | "awarded" | "cancelled". Once awarded the
  // accepted reply id is in `acceptedReplyId` and the row is read-only.
  status: text("status").notNull().default("open"),
  // Target quantity for the run. Plants quote against this number.
  quantity: integer("quantity").notNull(),
  // The format being requested. Mirrors albumSkus.format values but
  // kept as text so the API never crashes if a new format ships
  // without this table being migrated in lockstep.
  format: text("format").notNull(),
  // Free-text notes the requester pastes for plants ("matte sleeve,
  // metallic ink on the labels, splatter vinyl"). Markdown-ish, no
  // server-side rendering yet.
  notes: text("notes"),
  // The desired completion date (when the requester needs finished
  // units in hand). Plants whose `turnaroundDays` would miss this
  // date can still bid but the comparison view flags them.
  desiredCompletionDate: text("desired_completion_date"),
  acceptedReplyId: varchar("accepted_reply_id"),
  createdAt: timestamp("created_at").defaultNow(),
  awardedAt: timestamp("awarded_at"),
});

// One row per (rfq, manufacturer). Created up front in "invited" state
// the moment the RFQ is broadcast — gives every invited plant an inbox
// row even before they reply. The plant edits this same row to submit
// their quote; we never insert a second row per (rfq, manufacturer).
export const rfqReplies = pgTable(
  "rfq_replies",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    rfqId: varchar("rfq_id").notNull().references(() => rfqs.id, { onDelete: "cascade" }),
    manufacturerId: varchar("manufacturer_id").notNull().references(() => manufacturers.id, { onDelete: "cascade" }),
    // "invited" | "quoted" | "declined" | "won". Plants whose RFQ was
    // awarded to someone else flip to "declined" on acceptance.
    status: text("status").notNull().default("invited"),
    unitPriceCents: integer("unit_price_cents"),
    setupFeeCents: integer("setup_fee_cents"),
    leadTimeDays: integer("lead_time_days"),
    notes: text("notes"),
    repliedAt: timestamp("replied_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    rfqManufacturerUnique: unique("rfq_replies_rfq_manufacturer_unique").on(t.rfqId, t.manufacturerId),
  }),
);

// users.role / role_scope — promoted to first-class columns on the
// admin user table so the SAME /admin/* surface can render different
// views per partner type. "super_admin" keeps the existing god-mode
// behaviour (Bill, agents). "label" / "artist" / "manufacturer" /
// "fulfillment" each scope their reads to a single row via
// roleScopeId. Existing rows backfill to "super_admin" via the DB
// CREATE so no current admin loses access.
//
// We add these as new columns via ALTER TABLE in the migration
// alongside this schema — the new fields are intentionally NOT in the
// `users` pgTable definition above to keep that diff out of the labels/
// albums region of this file. The role column is read via raw SQL in
// the auth middleware (see server/auth/roles.ts) until we get a chance
// to fold it into the main `users` definition without diff-bombing
// every consumer.

// Task #522 — Audit row written every time an artist/label re-homes
// an in-flight album from one press to another (or changes their
// default press in Settings). The original press's Customers tab
// greys out the customer for 90 days post-switch, then drops them
// off — but the row itself is retained for analytics + dispute.
// Soft-delete via deletedAt so we never lose history on an accidental
// admin sweep.
export const pressSwitchHistory = pgTable("press_switch_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerKind: text("customer_kind").notNull(), // "artist" | "label"
  customerId: varchar("customer_id").notNull(),
  // Album the switch was triggered from (null for a Settings-level
  // defaultPressId change with no album in flight).
  albumId: varchar("album_id"),
  fromPressId: varchar("from_press_id"),
  toPressId: varchar("to_press_id"),
  reason: text("reason"),
  switchedAt: timestamp("switched_at").defaultNow().notNull(),
  ...softDeleteCols,
});
export type PressSwitchHistory = typeof pressSwitchHistory.$inferSelect;

export const insertManufacturerSchema = createInsertSchema(manufacturers).omit({ id: true, createdAt: true });
export type InsertManufacturer = z.infer<typeof insertManufacturerSchema>;
export type Manufacturer = typeof manufacturers.$inferSelect;

export const insertFulfillmentPartnerSchema = createInsertSchema(fulfillmentPartners).omit({ id: true, createdAt: true });
export type InsertFulfillmentPartner = z.infer<typeof insertFulfillmentPartnerSchema>;
export type FulfillmentPartner = typeof fulfillmentPartners.$inferSelect;

// Task #534 — Partner notifications. One row per person/endpoint that
// should hear about events for a partner (vendor / press / fulfillment).
// `partnerKind` + `partnerId` is a soft pointer into vendors /
// manufacturers / fulfillment_partners (no FK because it spans three
// tables). `events` is an allow-list; empty = subscribe to all (see
// recipientWantsEvent in shared/partnerNotifications.ts). Only the
// `email` channel is delivered in v1.
export const partnerNotificationRecipients = pgTable(
  "partner_notification_recipients",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    partnerKind: text("partner_kind").notNull(),
    partnerId: varchar("partner_id").notNull(),
    name: text("name").notNull(),
    channel: text("channel").notNull().default("email"),
    address: text("address").notNull(),
    role: text("role").notNull().default("ops"),
    events: jsonb("events").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at").defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    partnerIdx: index("partner_notif_recipients_partner_idx").on(
      t.partnerKind,
      t.partnerId,
    ),
  }),
);
export const insertPartnerNotificationRecipientSchema = createInsertSchema(
  partnerNotificationRecipients,
).omit({ id: true, createdAt: true, deletedAt: true });
export type InsertPartnerNotificationRecipient = z.infer<
  typeof insertPartnerNotificationRecipientSchema
>;
export type PartnerNotificationRecipient =
  typeof partnerNotificationRecipients.$inferSelect;

// One row per delivery attempt. `payloadSnapshot` captures the event
// context at send time so the operator can see exactly what went out
// even after the underlying album/order moves on.
export const partnerNotificationLog = pgTable(
  "partner_notification_log",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    recipientId: varchar("recipient_id")
      .notNull()
      .references(() => partnerNotificationRecipients.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payloadSnapshot: jsonb("payload_snapshot").$type<Record<string, unknown>>(),
    status: text("status").notNull(),
    sentAt: timestamp("sent_at").defaultNow(),
    error: text("error"),
  },
  (t) => ({
    recipientIdx: index("partner_notif_log_recipient_idx").on(t.recipientId),
  }),
);
export type PartnerNotificationLog = typeof partnerNotificationLog.$inferSelect;

export const RFQ_STATUSES = ["open", "awarded", "cancelled"] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];
export const RFQ_REPLY_STATUSES = ["invited", "quoted", "declined", "won"] as const;
export type RfqReplyStatus = (typeof RFQ_REPLY_STATUSES)[number];

export const insertRfqSchema = createInsertSchema(rfqs)
  .omit({ id: true, createdAt: true, awardedAt: true, acceptedReplyId: true, status: true })
  .extend({
    quantity: z.number().int().min(1),
    format: z.string().min(1),
  });
export type InsertRfq = z.infer<typeof insertRfqSchema>;
export type Rfq = typeof rfqs.$inferSelect;

export const insertRfqReplySchema = createInsertSchema(rfqReplies).omit({ id: true, createdAt: true });
export type InsertRfqReply = z.infer<typeof insertRfqReplySchema>;
export type RfqReply = typeof rfqReplies.$inferSelect;

// Closed enum used by route + middleware code. Mirrors the values
// written to users.role.
// `admin` = privileged non-super, non-partner tier. Sees the unscoped
// god-view reports (KPIs, revenue breakdown, top content, ops, funnels)
// but NOT the super-admin-only sensitive cuts (payout reconciliation,
// raw event explorer). Partner roles (label/artist/manufacturer/
// fulfillment) only see their own scoped reports via /api/partner/*.
// Task #78 — `non_profit` is the new partner role for charity/community
// orgs that refer artists onto GoodTunes. It binds to a row in
// `organizations` where `kind = 'non_profit'` (we reuse the existing
// organizations table rather than minting a parallel scope table).
// `org` is kept as a historical alias used in reports code; resolved
// to `non_profit` by getUserRole().
export const ADMIN_ROLES = ["super_admin", "admin", "label", "artist", "manufacturer", "fulfillment", "non_profit", "vendor", "manager"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

// ─── Admin invitations ───────────────────────────────────────────────
// One row per outstanding invite. A super-admin picks a role (+ optional
// scope id pointing at a label / manufacturer / fulfillment partner)
// and an email; we mint a single-use token, email it, and on accept
// we create the users row with role + roleScopeId baked in. Tokens
// expire so a leaked invite mail can't sit forever — 7 days is the
// default. `usedAt` is set the moment the invite is accepted so the
// link can't be reused; we keep the row around for audit.
export const adminInvites = pgTable("admin_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  role: text("role").notNull(),
  roleScopeId: varchar("role_scope_id"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  acceptedUserId: varchar("accepted_user_id"),
  createdByUserId: varchar("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  // Task #78 — optional referrer captured at invite time. Kind is
  // "artist" (person) or "non_profit" (organization). Resolved into
  // people.referredByPersonId / referredByOrgId at accept time so the
  // existing referral-attribution machinery sees the link.
  referrerKind: text("referrer_kind"), // "artist" | "non_profit" | null
  referrerScopeId: varchar("referrer_scope_id"),
  welcomeNote: text("welcome_note"),
  // Task #351 — Team-invite shape. inviteRole is one of
  // "identity"|"manager"|"team" and drives both the permission defaults
  // applied at accept time AND the landing-page treatment. NULL falls
  // back to the legacy single-role behaviour. targetPersonId is the
  // Person the invitee will represent (Identity → that artist; Manager
  // → managing that artist; Team → bandmate of that artist's group).
  // preFlightedAlbumId optionally attaches a pre-flighted album draft
  // so the invitee lands on the album editor instead of an empty
  // dashboard. reviewStatus drives the claimed-Person review queue.
  inviteRole: text("invite_role"), // "identity" | "manager" | "team" | null
  targetPersonId: varchar("target_person_id"),
  preFlightedAlbumId: varchar("pre_flighted_album_id"),
  reviewStatus: text("review_status").notNull().default("not_required"), // "not_required"|"pending_review"|"approved"|"rejected"
  reviewedByUserId: varchar("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNote: text("review_note"),
  // Soft state — revokedAt invalidates immediately, resentAt tracks
  // the last time the magic link was re-issued.
  revokedAt: timestamp("revoked_at"),
  resentAt: timestamp("resent_at"),
  // Task #522 — When a press invites an artist/label, we stamp the
  // inviting manufacturer id here so the accept handler can pin the
  // new partner's `defaultPressId` (people.defaultPressId /
  // labels.defaultPressId) at signup. Separate from the existing
  // referrerKind="manufacturer" path because that one only sets the
  // immutable invitedByPressId provenance stamp.
  defaultPressId: varchar("default_press_id"),
});

export const insertAdminInviteSchema = createInsertSchema(adminInvites).omit({
  id: true,
  token: true,
  expiresAt: true,
  usedAt: true,
  acceptedUserId: true,
  createdAt: true,
  revokedAt: true,
  resentAt: true,
}).extend({
  email: z.string().email(),
  role: z.enum(ADMIN_ROLES),
  roleScopeId: z.string().optional().nullable(),
  // Task #350 — `ambassador` is a Person-scoped referrer (a contact
  // person on an NPO who's been promoted to invite their own artists).
  // Accept-flow resolves it to people.referredByPersonId on the new
  // artist's row + a parent-chain back to the NPO via the ambassador's
  // own referredByOrgId, so the NPO's roll-up still sees every artist
  // their ambassadors brought in.
  referrerKind: z.enum(["artist", "label", "non_profit", "manufacturer", "ambassador"]).optional().nullable(),
  referrerScopeId: z.string().optional().nullable(),
  welcomeNote: z.string().max(1000).optional().nullable(),
  inviteRole: z.enum(["identity", "manager", "team", "label", "npo_ambassador", "npo_staff", "press_staff"]).optional().nullable(),
  targetPersonId: z.string().optional().nullable(),
  preFlightedAlbumId: z.string().optional().nullable(),
});

// Task #351 — Roles a Team invite can take. Identity = "I am this
// artist", Manager = "I manage this artist", Team = "I'm a member of
// this band/team", Label = "this artist's record label (recognition
// only — no edit permissions; add verbs here to open it up later)".
// Drives accept-time wiring + landing chrome.
export const INVITE_ROLES = ["identity", "manager", "team", "label"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

// Task #545 — Non-profit invite sub-roles. Stored on the same
// `admin_invites.invite_role` column as artist-scope invite roles, but
// only legal when `role = 'non_profit'`. Both sub-roles can invite
// artists into their parent NPO's scope; only the NPO admin (no
// inviteRole) can invite ambassadors or staff.
export const NPO_INVITE_ROLES = ["npo_ambassador", "npo_staff"] as const;
export type NpoInviteRole = (typeof NPO_INVITE_ROLES)[number];

// Task #699 — Press (manufacturer) invite sub-roles. Stored on the same
// `admin_invites.invite_role` column. Owner/Admin invites carry NO
// inviteRole (full press scope, like an NPO admin); `press_staff` is the
// restricted tier — view everything + invite artists, but every editing
// verb (metadata, masters, Shopify, payouts, settings) is denied via
// per-user partner_permission_overrides written at accept time.
export const PRESS_INVITE_ROLES = ["press_staff"] as const;
export type PressInviteRole = (typeof PRESS_INVITE_ROLES)[number];
export type InsertAdminInvite = z.infer<typeof insertAdminInviteSchema>;
export type AdminInvite = typeof adminInvites.$inferSelect;

// Task #546 — Cap on how many invites a single artist can have
// outstanding (not used, not revoked, not expired) at one time. Keeps
// the artist-to-artist invite system from becoming a spam vector.
export const ARTIST_INVITE_OUTSTANDING_LIMIT = 5;

// Task #546 — Pre-seeded "earmarked folks" list. Super-admin pastes in
// names/emails Bill wants to personally onboard; the artist dashboard
// surfaces these as one-tap invite suggestions. Once an artist sends
// an invite to a matching email, invitedAt + invitedInviteId stamp
// so the row drops off the suggestion list. Not auto-imported — the
// inviting artist still has to click Send.
export const earmarkedArtists = pgTable("earmarked_artists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  notes: text("notes"),
  addedByUserId: varchar("added_by_user_id"),
  addedAt: timestamp("added_at").defaultNow(),
  invitedAt: timestamp("invited_at"),
  invitedInviteId: varchar("invited_invite_id"),
});
export type EarmarkedArtist = typeof earmarkedArtists.$inferSelect;
export type InsertEarmarkedArtist = typeof earmarkedArtists.$inferInsert;

// ─── Task #78 — Referral credit ledger ────────────────────────────────
// One row per paid unit on an album whose primary artist was referred
// by another partner. `$1` (100¢) per unit by default — read off
// people.referrerPerUnitCents. Status starts `pending_payout`; the
// actual Stripe Connect transfer is a follow-on alongside Task #48 and
// flips status to `paid`.
//
// referrerKind is denormed alongside referrerOrgId / referrerPersonId
// so we can roll up per kind without joining back to people.
export const referralCredits = pgTable("referral_credits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  referredArtistId: varchar("referred_artist_id").notNull(),
  referrerKind: text("referrer_kind").notNull(), // "artist" | "non_profit"
  referrerPersonId: varchar("referrer_person_id"),
  referrerOrgId: varchar("referrer_org_id"),
  amountCents: integer("amount_cents").notNull(),
  // Paid units that backed this credit (sum of order_items.quantity
  // for the order's format lines). `amountCents = perUnit * units`.
  // Stored so reporting can sum units without re-joining order_items.
  units: integer("units").notNull().default(1),
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull().default("pending_payout"),
  // Task #354 — Stamped when the batched payout job clears the credit.
  // payoutTransferId is the Stripe Transfer id; payoutOwnerKind/Id is
  // the resolved PayoutAccount owner the credit was paid to (so the
  // dashboards can reconcile "Paid out" without re-walking referrer
  // → owner-kind every render). Status flips pending_payout → paid.
  payoutTransferId: text("payout_transfer_id"),
  paidAt: timestamp("paid_at"),
  payoutOwnerKind: text("payout_owner_kind"), // person | label | organization
  payoutOwnerId: varchar("payout_owner_id"),
  payoutError: text("payout_error"),
  // Set when a run claims this row (status flipped pending_payout →
  // processing under one atomic UPDATE). Stripe transfer uses the
  // run_id in its idempotency key, so a concurrent overlapping run
  // can neither claim the same row twice nor produce a different
  // transfer for the same money. Cleared back to NULL when the row
  // resolves to paid or is reverted to pending_payout on failure.
  payoutRunId: varchar("payout_run_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  // Task #922 — an order can now earn MANY non_profit credits (one per
  // per-album NPO beneficiary) plus at most one artist credit. The old
  // (order_id, referrer_kind) unique blocked multiple NPO rows, so it is
  // replaced by two partial uniques:
  //   • artist: one per order      → (order_id) WHERE kind = 'artist'
  //   • non_profit: one per (order, org) → (order_id, referrer_org_id)
  //                  WHERE kind = 'non_profit'
  // The matching ON CONFLICT targets live in server/commerce.ts.
  orderArtistUniq: uniqueIndex("referral_credits_order_artist_uniq")
    .on(t.orderId)
    .where(sql`${t.referrerKind} = 'artist'`),
  orderOrgUniq: uniqueIndex("referral_credits_order_org_uniq")
    .on(t.orderId, t.referrerOrgId)
    .where(sql`${t.referrerKind} = 'non_profit'`),
}));

export type ReferralCredit = typeof referralCredits.$inferSelect;

// ─── Task #922 — Per-album NPO donation split ─────────────────────────
// An album can name up to 4 NPO beneficiaries, each earning a per-unit
// donation (cents). The total across an album's beneficiaries is capped
// at $1.00/unit (100¢) and funded out of GoodTunes' margin — album
// pricing never changes. At sale time the splitter mints one
// referral_credits row per beneficiary instead of one artist-level NPO
// credit. New albums default their split from the artist's existing NPO
// referral (people.referred_by_org_id); the split is freely editable
// until first sale, after which an operator can only ADD from the
// unallocated remainder (existing shares can't be reduced or removed).
export const albumNpoBeneficiaries = pgTable("album_npo_beneficiaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  perUnitCents: integer("per_unit_cents").notNull(),
  // Audit: which admin user last set/added this beneficiary (nullable —
  // backfilled rows and seed defaults carry no user).
  allocatedByUserId: varchar("allocated_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  albumOrgUniq: uniqueIndex("album_npo_beneficiaries_album_org_uniq")
    .on(t.albumId, t.organizationId),
  perUnitChk: check(
    "album_npo_beneficiaries_per_unit_chk",
    sql`${t.perUnitCents} > 0 AND ${t.perUnitCents} <= 100`,
  ),
}));
export const insertAlbumNpoBeneficiarySchema = createInsertSchema(albumNpoBeneficiaries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAlbumNpoBeneficiary = z.infer<typeof insertAlbumNpoBeneficiarySchema>;
export type AlbumNpoBeneficiary = typeof albumNpoBeneficiaries.$inferSelect;

// ─── Task #350 — Per-album artist↔artist attribution ────────────────
// An artist referring another artist (invite_subusers + artist scope)
// creates ONE row here per (referrer, invitee, album) — but the album
// id is filled in only when the invitee actually starts a release on
// GoodTunes. The pre-release row exists with album_id=null to record
// the invite + the referrer's pre-elected swap intent.
//
// `swapState`:
//   referrer_keeps_full → referrer earns $1/unit (default behaviour)
//   invitee_keeps_full  → no credit minted; invitee keeps the slice
//                         that would otherwise be paid out. Symmetric
//                         to the press $0 attribution — the row still
//                         exists so the tree view + provenance reports
//                         can show the link without a payout.
//
// `frozenAt` is stamped at the FIRST paid order on the album. After
// that the swap state can no longer change for this project (history
// stays honest). `preElectedAt` records when the referrer toggled
// their default pre-election (separate from frozenAt — the invitee
// can still flip it during their draft phase, up until first sale).
export const artistReferrals = pgTable("artist_referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerPersonId: varchar("referrer_person_id").notNull(),
  inviteePersonId: varchar("invitee_person_id").notNull(),
  albumId: varchar("album_id"),
  swapState: text("swap_state").notNull().default("referrer_keeps_full"),
  preElectedAt: timestamp("pre_elected_at"),
  frozenAt: timestamp("frozen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  pairUniq: uniqueIndex("artist_referrals_pair_album_uniq")
    .on(t.referrerPersonId, t.inviteePersonId, t.albumId),
}));
export type ArtistReferral = typeof artistReferrals.$inferSelect;

// ─── Task #350 — Press project-scoped attribution ─────────────────────
// One row per (press, invitee artist, album) — minted with $0 referral
// credit so the press's invited-artists report shows the album's paid
// units without paying the press a per-unit slice (presses are paid
// through manufacturing margin, not referral). Project-scoped: if the
// invitee's NEXT album goes to a different press, the new press row is
// not created — only the first invited album rolls up under the press
// that brought them in.
export const pressInvitedAlbums = pgTable("press_invited_albums", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pressId: varchar("press_id").notNull(),
  inviteePersonId: varchar("invitee_person_id").notNull(),
  albumId: varchar("album_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  pressAlbumUniq: uniqueIndex("press_invited_albums_press_album_uniq")
    .on(t.pressId, t.albumId),
}));
export type PressInvitedAlbum = typeof pressInvitedAlbums.$inferSelect;

// ─── Task #350 — Referral funding config (singleton) ──────────────────
// Single-row table (id='singleton') holding global referral-funding
// flags. `inviteeCharityBonusEnabled` adds $0.50 to the NPO referrer
// credit per paid unit ($1.50 instead of $1) — funded out of GoodTunes'
// margin, defaults OFF so a launch decision can flip it without code.
export const referralFundingConfig = pgTable("referral_funding_config", {
  id: varchar("id").primaryKey().default(sql`'singleton'`),
  inviteeCharityBonusEnabled: boolean("invitee_charity_bonus_enabled").notNull().default(false),
  updatedByUserId: varchar("updated_by_user_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type ReferralFundingConfig = typeof referralFundingConfig.$inferSelect;

// ─── Task #128 — Printable GoodDeed certificates ───────────────────────
// One row per paid order that carries a `signed_cert` add-on. The fan
// confirms the name on their printed certificate before we'll cut the
// PDF; the admin print queue locks the row, batches the PDFs into a
// ZIP/merged file, then flips it to `printed` after download. The QR on
// every certificate encodes a per-deed short URL — `shortId` is the
// path component, public (signed-out fans can hit it), and is the
// primary join key for the provenance view.
//
// State machine for `nameStatus`:
//   awaiting          ← created on `orders/paid` (or backfilled)
//   confirmed         ← fan picked + confirmed the name in /orders
//   locked_for_print  ← admin added it to a print batch (no more fan edits)
//   printed           ← batch was downloaded by admin
//
// `paperSize` is letter for US/CA/MX shipping addresses, A4 otherwise.
// Admin can override (`paperSizeOverridden = true`) without un-locking.
export const signedCertCertificates = pgTable("signed_cert_certificates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  // Task #549 — per-copy cert. NULL on legacy single-copy orders
  // (kept that way for backwards-compat); set on every cert minted
  // for an order with `order_copies`. Uniqueness is enforced by two
  // partial indexes managed in post-merge.sh so legacy + per-copy rows
  // coexist without a data migration.
  copyId: varchar("copy_id"),
  shortId: varchar("short_id").notNull().unique(),
  nameStatus: text("name_status").notNull().default("awaiting"),
  confirmedIdentityKind: text("confirmed_identity_kind"),
  confirmedName: text("confirmed_name"),
  paperSize: text("paper_size").notNull().default("letter"),
  paperSizeOverridden: boolean("paper_size_overridden").notNull().default(false),
  printBatchId: varchar("print_batch_id"),
  lockedAt: timestamp("locked_at"),
  printedAt: timestamp("printed_at"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SignedCertCertificate = typeof signedCertCertificates.$inferSelect;

// One row per ZIP/merged-PDF batch the admin downloads from the print
// queue. We snapshot the format + count so the admin "Print history"
// list (future) doesn't have to recount via join.
export const certPrintBatches = pgTable("cert_print_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  format: text("format").notNull(), // "zip" | "merged_pdf"
  certCount: integer("cert_count").notNull(),
  downloadedByAdminId: varchar("downloaded_by_admin_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CertPrintBatch = typeof certPrintBatches.$inferSelect;

// Audit trail for name edits. Both fans (re-picking before lock) and
// admins (override after lock) create entries. Lets us answer "who
// changed the name on this certificate" without an event log.
export const certNameAudits = pgTable("cert_name_audits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certId: varchar("cert_id").notNull().references(() => signedCertCertificates.id, { onDelete: "cascade" }),
  changedByKind: text("changed_by_kind").notNull(), // "fan" | "admin"
  changedByUserId: varchar("changed_by_user_id"),
  fromIdentityKind: text("from_identity_kind"),
  fromName: text("from_name"),
  toIdentityKind: text("to_identity_kind").notNull(),
  toName: text("to_name").notNull(),
  at: timestamp("at").defaultNow().notNull(),
});

// ─── Task #79 — Per-partner permissions ──────────────────────────────
// One row per (scopeKind, scopeId) — i.e. per label or per artist.
// Permission verbs are stored as boolean columns so the admin UI and
// the server middleware share the exact same shape with no JSON
// guessing. Defaults are CONSERVATIVE: a freshly-invited partner can
// look but not touch until a super-admin flips the flags on.
//
// `metadataEditsRequireApproval` is the "training wheels" flag. When
// true, partner-side mutations that would otherwise apply directly to
// album/song metadata (title, description, credits, bio) are diverted
// into the `pending_changes` queue for a super-admin to review.
//
// scopeKind ∈ {label, artist, manufacturer, fulfillment}. The middleware
// resolves the album → scope row (labelId or primaryArtistId) and looks
// up the row to gate the request.
export const PARTNER_SCOPE_KINDS = ["label", "artist", "manufacturer", "fulfillment", "vendor", "manager"] as const;
export type PartnerScopeKind = (typeof PARTNER_SCOPE_KINDS)[number];

export const PARTNER_PERMISSION_VERBS = [
  "edit_metadata",
  "upload_masters",
  "map_shopify",
  "manage_payouts",
  "invite_subusers",
  // Task #351 — Team-role verb. Granted to band members ("Team") so
  // they can edit per-song credits + the artist gear list without
  // touching commerce, payouts, or fan-facing metadata. Distinct from
  // edit_metadata so a Team invite can be productive without unlocking
  // the full Identity surface.
  "edit_credits_and_gear",
] as const;
export type PartnerPermissionVerb = (typeof PARTNER_PERMISSION_VERBS)[number];

export const partnerPermissions = pgTable("partner_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scopeKind: text("scope_kind").notNull(),
  scopeId: varchar("scope_id").notNull(),
  editMetadata: boolean("edit_metadata").notNull().default(false),
  uploadMasters: boolean("upload_masters").notNull().default(false),
  mapShopify: boolean("map_shopify").notNull().default(false),
  managePayouts: boolean("manage_payouts").notNull().default(false),
  inviteSubusers: boolean("invite_subusers").notNull().default(false),
  // Task #351 — Team-role verb (see comment on PARTNER_PERMISSION_VERBS).
  editCreditsAndGear: boolean("edit_credits_and_gear").notNull().default(false),
  metadataEditsRequireApproval: boolean("metadata_edits_require_approval").notNull().default(true),
  updatedByUserId: varchar("updated_by_user_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Task #351 — Per-(scope, user) permission overrides ──────────────
// God-View matrix: super-admin can grant or deny individual verbs for
// individual users on a specific artist scope, overriding the
// scope-wide partner_permissions row. NULL `granted` means "fall back
// to the scope default"; `true`/`false` is an explicit override.
export const partnerPermissionOverrides = pgTable("partner_permission_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scopeKind: text("scope_kind").notNull(),
  scopeId: varchar("scope_id").notNull(),
  userId: varchar("user_id").notNull(),
  verb: text("verb").notNull(),
  granted: boolean("granted").notNull(),
  updatedByUserId: varchar("updated_by_user_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("partner_permission_overrides_uniq").on(t.scopeKind, t.scopeId, t.userId, t.verb),
}));
export type PartnerPermissionOverride = typeof partnerPermissionOverrides.$inferSelect;

export type PartnerPermissions = typeof partnerPermissions.$inferSelect;
export type InsertPartnerPermissions = typeof partnerPermissions.$inferInsert;

// ─── Task #1036 — Unified identity P1: memberships ───────────────────
// One account → many scopes. Each membership is one "hat" a user wears
// (an artist Person, a label, an NPO/organization, a press/manufacturer,
// a vendor, a fulfillment partner), carrying the same role + sub-role +
// per-(scope, verb) permission state a user has today — but as a SET so
// one person can hold more than one (e.g. NPO staff AND manager of an
// artist). The hat-switcher UI that exposes this is Phase 3; this phase
// is intentionally INVISIBLE.
//
// Backfill (scripts/post-merge.sh) gives every existing partner exactly
// ONE membership reproducing their current users.role / role_scope_id +
// partner_permissions + partner_permission_overrides, and server-side
// resolution (server/auth/roles.ts + partnerPermissions.ts) reads the
// membership SET while producing byte-for-byte identical results for
// single-membership users. The legacy users.role / role_scope_id columns
// and the partner_permissions(+overrides) tables stay the canonical READ
// source this phase and are DUAL-WRITTEN in lock-step; dropping them is
// deferred (see docs/roadmap.md + docs/roles-and-permissions.md).
//
//   • role        — an ADMIN_ROLES value. super_admin / admin are the
//                   god roles and hold NO scope (scopeKind/scopeId NULL).
//   • scopeKind   — a MEMBERSHIP_SCOPE_KINDS value for partner hats; the
//                   role name doubles as the scope kind (label→label,
//                   artist→artist, …, non_profit→non_profit).
//   • scopeId     — the scope row id (people.id for artist, labels.id,
//                   organizations.id for non_profit, vendors.id, …).
//   • subRole     — reuses the existing invite sub-role vocabulary
//                   (identity/manager/team, npo_ambassador/npo_staff,
//                   press_staff); NULL for a plain owner-level hat.
//   • permissionOverrides — mirrors THIS user's
//                   partner_permission_overrides rows for the scope as
//                   `{ verb: granted }`. An empty object means "inherit
//                   the scope-wide partner_permissions default", exactly
//                   like a user with no override rows today. The
//                   scope-wide defaults stay shared in partner_permissions
//                   (one row per scope) — never duplicated per membership.
//
// DEV→PROD DRIFT: like the role columns, the canonical DDL (table + the
// two partial unique indexes) is hand-applied to BOTH dev and prod via
// scripts/post-merge.sh so the publish dev→prod diff stays empty. This
// drizzle definition exists for types + query building; do NOT rely on
// drizzle-kit push to create it (see .agents/memory/MEMORY.md).
export const MEMBERSHIP_SCOPE_KINDS = [
  "label",
  "artist",
  "manufacturer",
  "fulfillment",
  "vendor",
  "non_profit",
  // Task #1425 — Manager ENTITY scope. Distinct from the teammate sub-role
  // "manager" (memberships.sub_role); this is the partner-role scope kind,
  // its scopeId is a managers.id.
  "manager",
] as const;
export type MembershipScopeKind = (typeof MEMBERSHIP_SCOPE_KINDS)[number];

export const memberships = pgTable("memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  role: text("role").notNull(),
  scopeKind: text("scope_kind"),
  scopeId: varchar("scope_id"),
  subRole: text("sub_role"),
  permissionOverrides: jsonb("permission_overrides")
    .$type<Record<string, boolean>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  // One god membership per user (scope_id IS NULL) + one membership per
  // (user, scope) otherwise. Two PARTIAL uniques because a plain unique
  // treats NULL scope_id as distinct and would let god dupes through.
  godUniq: uniqueIndex("memberships_user_god_uniq")
    .on(t.userId)
    .where(sql`scope_id IS NULL`),
  scopedUniq: uniqueIndex("memberships_user_scope_uniq")
    .on(t.userId, t.scopeKind, t.scopeId)
    .where(sql`scope_id IS NOT NULL`),
  byUser: index("memberships_user_idx").on(t.userId),
}));

export type Membership = typeof memberships.$inferSelect;
export type InsertMembership = typeof memberships.$inferInsert;

// ─── Task #79 — Pending changes queue ────────────────────────────────
// When a partner with `metadataEditsRequireApproval = true` (or a
// partner editing a post-sale-locked album) submits a mutation, the
// route writes a row here instead of applying. Super-admin reviews on
// /admin/review and applies (status=approved) or rejects.
//
// `targetTable` ∈ {albums, songs} for the v1 surface. `patch` is the
// raw JSON body the partner submitted; the apply step replays it
// against the same storage method an admin PUT would call.
export const PENDING_CHANGE_STATUSES = ["pending", "approved", "rejected"] as const;
export type PendingChangeStatus = (typeof PENDING_CHANGE_STATUSES)[number];

export const pendingChanges = pgTable("pending_changes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  targetTable: text("target_table").notNull(),
  targetId: varchar("target_id").notNull(),
  // Denorm of the album the change ultimately affects (songs roll up
  // to their album). Lets the review queue group by album without a
  // join, and lets us show the lock status on the queue row.
  albumId: varchar("album_id"),
  scopeKind: text("scope_kind").notNull(),
  scopeId: varchar("scope_id").notNull(),
  patch: jsonb("patch").notNull(),
  submittedByUserId: varchar("submitted_by_user_id").notNull(),
  submittedNote: text("submitted_note"),
  status: text("status").notNull().default("pending"),
  reviewedByUserId: varchar("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at"),
  reviewerNote: text("reviewer_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PendingChange = typeof pendingChanges.$inferSelect;
export type InsertPendingChange = typeof pendingChanges.$inferInsert;

// ─── Task #79 — Super-admin unlock overrides ─────────────────────────
// One row each time a super-admin unlocks a post-sale-locked album for
// a partner edit. `consumedAt` is set the moment the override is used
// (single-shot) OR the override carries an `expiresAt` window — the
// gate accepts either model. Audit trail survives consumption.
export const adminOverrides = pgTable("admin_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  targetTable: text("target_table").notNull(), // "albums" for v1
  targetId: varchar("target_id").notNull(),
  grantedByUserId: varchar("granted_by_user_id").notNull(),
  reason: text("reason").notNull(),
  // Window override (e.g. 24h) — non-null = "any number of edits until
  // expiresAt"; null = single-shot consumed at first edit.
  expiresAt: timestamp("expires_at"),
  consumedAt: timestamp("consumed_at"),
  consumedByUserId: varchar("consumed_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AdminOverride = typeof adminOverrides.$inferSelect;
export type InsertAdminOverride = typeof adminOverrides.$inferInsert;

// ─── Task #216 — Upload preflight validation results ────────────────
// Persisted output of `server/validators/preflight.ts`. One row per
// art / audio file the artist or label submits. The same row powers
// both the upload page (artist-side) and the admin Orders queue, so a
// pass/warn/fail decision survives reloads and is visible to the admin
// without re-running the validator. Failing checks are blocking by
// default; an admin can override via /api/admin/uploads/validations/:id/override
// which stamps `override_*` fields with a required justification.
//
// `checks` is the structured per-rule result (array of {key,label,status,message}).
// `status` is the rolled-up worst status across `checks`, denormalized so
// list queries can sort/filter without touching the JSONB.
export const uploadValidations = pgTable("upload_validations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // "art" | "audio"
  vendorId: text("vendor_id").notNull(), // "mrp" | "pmp" | "hellbender"
  templateId: text("template_id"), // null for audio rows
  assetUrl: text("asset_url").notNull(),
  fileName: text("file_name"),
  status: text("status").notNull(), // "pass" | "warn" | "fail"
  checks: jsonb("checks").$type<Array<{ key: string; label: string; status: "pass" | "warn" | "fail"; message: string }>>().notNull(),
  overrideJustification: text("override_justification"),
  overrideByUserId: varchar("override_by_user_id"),
  overrideAt: timestamp("override_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UploadValidation = typeof uploadValidations.$inferSelect;
export type InsertUploadValidation = typeof uploadValidations.$inferInsert;

// ─── Task #225 — Pressing-order requests (artist → GoodTunes review) ────
// One row per "Go to Press!" submission from the artist Sell tab. Status
// is a single column (pending | approved | rejected | cancelled).
// `packageSnapshot` is a JSON snapshot of the SKU/press picks at submit
// time so later catalog edits never mutate a pending or decided order.
export type PressingOrderPackageSnapshot = {
  format: string;
  pressId: string | null;
  pressName: string | null;
  vinylColor: string | null;
  vinylColorTier: string | null;
  jacketUpgrade: string | null;
  quantityTier: number | null;
};

export const pressingOrderRequests = pgTable("pressing_order_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // pending | approved | rejected | cancelled
  packageSnapshot: jsonb("package_snapshot").$type<PressingOrderPackageSnapshot>().notNull(),
  quantity: integer("quantity").notNull(),
  unitCents: integer("unit_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  preflightStatus: text("preflight_status"), // pass | warn | overridden | fail | null
  rejectionNote: text("rejection_note"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  submittedByUserId: varchar("submitted_by_user_id"),
  decidedAt: timestamp("decided_at"),
  decidedByUserId: varchar("decided_by_user_id"),
});

export type PressingOrderRequest = typeof pressingOrderRequests.$inferSelect;
export type InsertPressingOrderRequest = typeof pressingOrderRequests.$inferInsert;

// ─── Task #533 — Pool-funded early masters cut ─────────────────────────
// Authoritative per-event log of contributions to (and releases from)
// an album's press funding pool. `albums.press_pool_accrued_cents` /
// `press_pool_released_cents` are the denormalized running sums.
//   kind='accrue'  — a paid fan sale set aside its per-unit press
//                    earmark. `sourceOrderId` is the order it came from;
//                    the partial unique index on (album_id, source_order_id)
//                    WHERE kind='accrue' makes the accrual idempotent so a
//                    replayed webhook / double-materialization can't
//                    double-count. `cents` is the full earmark for the
//                    order (per-unit earmark × quantity).
//   kind='release' — an approved early cut drew the press floor back out
//                    of the pool to fund the masters run. `sourceOrderId`
//                    is null; `cents` is the press_floor_total snapshot.
export const albumPressPoolLedger = pgTable(
  "album_press_pool_ledger",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    albumId: varchar("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // accrue | deaccrue | release
    cents: integer("cents").notNull(),
    sourceOrderId: varchar("source_order_id"),
    note: text("note"),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (t) => ({
    accrueOncePerOrder: uniqueIndex("album_press_pool_ledger_accrue_order_uniq")
      .on(t.albumId, t.sourceOrderId)
      .where(sql`${t.kind} = 'accrue' AND ${t.sourceOrderId} IS NOT NULL`),
    // A refund reverses an order's accrual exactly once.
    deaccrueOncePerOrder: uniqueIndex("album_press_pool_ledger_deaccrue_order_uniq")
      .on(t.albumId, t.sourceOrderId)
      .where(sql`${t.kind} = 'deaccrue' AND ${t.sourceOrderId} IS NOT NULL`),
  }),
);
export type AlbumPressPoolLedger = typeof albumPressPoolLedger.$inferSelect;
export type InsertAlbumPressPoolLedger = typeof albumPressPoolLedger.$inferInsert;

// One row per album that has crossed the early-cut funding threshold
// with all three consents in place (gate #3 of three — admin approval).
// The pipeline sweep upserts a `pending` row; an admin approves or
// declines it from the Early Cut Review queue. Snapshot the cents at
// enqueue time so the queue card shows the numbers that made it
// eligible even if later sales/refunds move the live pool.
export const pressEarlyCutQueue = pgTable(
  "press_early_cut_queue",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    albumId: varchar("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    pressId: varchar("press_id").notNull(),
    status: text("status").notNull().default("pending"), // pending | approved | declined
    pressFloorTotalCents: integer("press_floor_total_cents").notNull(),
    poolAvailableCents: integer("pool_available_cents").notNull(),
    unitsSold: integer("units_sold").notNull().default(0),
    tierName: text("tier_name"),
    format: text("format"),
    declineReason: text("decline_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    decidedAt: timestamp("decided_at"),
    decidedByUserId: varchar("decided_by_user_id"),
  },
  (t) => ({
    onePendingPerAlbum: uniqueIndex("press_early_cut_queue_pending_album_uniq")
      .on(t.albumId)
      .where(sql`${t.status} = 'pending'`),
  }),
);
export type PressEarlyCutQueue = typeof pressEarlyCutQueue.$inferSelect;
export type InsertPressEarlyCutQueue = typeof pressEarlyCutQueue.$inferInsert;

// Task #217 — Pressing-plant print PDF generations.
//
// One `print_generations` row per "Generate print PDFs for [Vendor]"
// click on a release's admin page. Each row groups N
// `print_artifacts` (one per template the order required — center
// label, jacket, insert, …). Versioning is just "rows are immutable;
// re-clicking generates a new row" — the admin page lists all
// generations newest-first so previous versions are downloadable.
//
// `overrideJustification` is non-null when the source art failed
// upload validation and the admin clicked through anyway; we record
// the justification on the generation, not the order, so the
// downstream "why did we ship this art" forensic trail lives next
// to the bytes that were sent.
export const printGenerations = pgTable("print_generations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  vendorId: text("vendor_id").notNull(), // "mrp" | "pmp" | "hellbender"
  createdByUserId: varchar("created_by_user_id"),
  overrideJustification: text("override_justification"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const printArtifacts = pgTable("print_artifacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  generationId: varchar("generation_id").notNull().references(() => printGenerations.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  templateLabel: text("template_label").notNull(),
  fileName: text("file_name").notNull(),
  assetUrl: text("asset_url").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PrintGeneration = typeof printGenerations.$inferSelect;
export type InsertPrintGeneration = typeof printGenerations.$inferInsert;
export type PrintArtifact = typeof printArtifacts.$inferSelect;
export type InsertPrintArtifact = typeof printArtifacts.$inferInsert;

// ─── Task #246 — Signed-cert sale-window reservations ──────────────────
// One row per fan order (direct or Shopify) that bought into a signed-
// cert sale window. The row pins the reserved GoodDeed number to the
// order at sale time and tracks the lifecycle of the cert leg through
// the batch. `variantKind` distinguishes prints (in-window orders) from
// digital-only fallbacks (post-window orders that still buy the cert
// variant on Shopify) — only `printed` rows are eligible for the print
// batch.
//
// Status lifecycle:
//   reserved             — order paid in-window; GoodDeed # held for batch
//   in_production        — window closed >=25; pricing snapshotted
//   fulfilled            — batch inserted into vinyl shipment
//   refunded_below_min   — window closed <25; cert addon refunded
//   digital_only         — order arrived post-window; no print row produced
//   cancelled            — operator-cancelled before close
export const CERT_RESERVATION_STATUSES = [
  "reserved",
  "in_production",
  "fulfilled",
  "refunded_below_min",
  "digital_only",
  "cancelled",
] as const;
export type CertReservationStatus = (typeof CERT_RESERVATION_STATUSES)[number];

export const certReservations = pgTable(
  "cert_reservations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
    orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    shopifyOrderId: text("shopify_order_id"),
    shopifyLineItemId: text("shopify_line_item_id"),
    goodDeedNumber: integer("good_deed_number"),
    variantKind: text("variant_kind").notNull().default("printed"),
    status: text("status").notNull().default("reserved"),
    refundedAt: timestamp("refunded_at"),
    refundShopifyId: text("refund_shopify_id"),
    refundedCents: integer("refunded_cents"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    orderUniq: unique("cert_reservations_order_uniq").on(t.orderId),
    albumStatusIdx: index("cert_reservations_album_status_idx").on(t.albumId, t.status),
  }),
);

export type CertReservation = typeof certReservations.$inferSelect;
export type InsertCertReservation = typeof certReservations.$inferInsert;

// ─── Task #246 — Signed-cert tier true-up ledger ───────────────────────
// At window close we compute the delta between the wholesale rung that
// was *projected* at sale time (label's Push-to-Shopify earnings preview)
// and the rung the batch actually clears (which depends on the final
// reservation count). The auto-charge engine from Task #4 isn't yet
// implemented, so for now this table records the math and leaves status
// = "pending_no_engine" — once the engine ships, a sweep will translate
// these rows into Stripe Connect transfers / invoices.
//
// `totalDeltaCents` is signed: positive means the label owes GoodTunes
// more than the projected amount already settled (we charge), negative
// means we owe the label (we credit). Status flips to `applied` when
// the engine eventually settles.
export const CERT_TRUEUP_STATUSES = [
  "pending_no_engine",
  "applied",
  "skipped",
] as const;
export type CertTrueupStatus = (typeof CERT_TRUEUP_STATUSES)[number];

export const certTrueupLedger = pgTable("cert_trueup_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  batchSize: integer("batch_size").notNull(),
  projectedRungLabel: text("projected_rung_label"),
  projectedWholesaleCents: integer("projected_wholesale_cents"),
  actualRungLabel: text("actual_rung_label"),
  actualWholesaleCents: integer("actual_wholesale_cents"),
  deltaCentsPerUnit: integer("delta_cents_per_unit").notNull(),
  totalDeltaCents: integer("total_delta_cents").notNull(),
  ownerKind: text("owner_kind"),
  ownerId: varchar("owner_id"),
  status: text("status").notNull().default("pending_no_engine"),
  appliedAt: timestamp("applied_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CertTrueupLedgerRow = typeof certTrueupLedger.$inferSelect;
export type InsertCertTrueupLedgerRow = typeof certTrueupLedger.$inferInsert;

// ──────────────────────────────────────────────────────────────────────────
// Task #530 — Fan recents + recent searches (server-backed, per-fan).
//
// `fan_recents`: a capped (~200) running log of entities a fan has opened
// or played (album, song, artist, person, instrument, vendor, label,
// playlist, bonus video/photo). Drives the new Recents tab — replaces the
// PlayerContext.recentAlbums in-memory list so history survives logout +
// device switch. `entityKind` + `entityId` is the natural id; titles +
// thumbnails are denormalized so the Recents tab can paint without N
// joins (a deleted album row should still render its strikethrough
// "Recently played" entry until the fan dismisses it).
//
// `fan_recent_searches`: last ~10 distinct search queries the fan typed,
// shown on the Search landing surface as Apple Music's "Recently
// Searched" chips. We store the trimmed lowercase form for dedupe; the
// `displayQuery` keeps the original casing for re-display.
//
// `userId` is a loose FK to `customer_users.id` — same pattern as
// playlists / user_albums / song_favorites. Drizzle pgTable can't hold a
// dual-table FK and only fans use these surfaces; we leave the DB
// constraint off so a stray admin probe can't 500 the route.
// ──────────────────────────────────────────────────────────────────────────

export const FAN_RECENT_KINDS = [
  "album",
  "song",
  "artist",
  "person",
  "instrument",
  "vendor",
  "label",
  "playlist",
  "video",
  "photo",
] as const;
export type FanRecentKind = (typeof FAN_RECENT_KINDS)[number];

export const fanRecents = pgTable(
  "fan_recents",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    entityKind: text("entity_kind").notNull(),
    entityId: varchar("entity_id").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    thumbUrl: text("thumb_url"),
    href: text("href").notNull(),
    lastAt: timestamp("last_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("fan_recents_user_lastat_idx").on(t.userId, t.lastAt),
    natural: uniqueIndex("fan_recents_user_kind_entity_uniq").on(
      t.userId,
      t.entityKind,
      t.entityId,
    ),
  }),
);

export type FanRecent = typeof fanRecents.$inferSelect;
export type InsertFanRecent = typeof fanRecents.$inferInsert;
export const insertFanRecentSchema = createInsertSchema(fanRecents).omit({
  id: true,
  userId: true,
  lastAt: true,
});

// Each row is either a free-text query the fan typed (entity_* null)
// OR an entity the fan tapped from search results (entity_* set,
// display_query mirrors the entity title). Search-landing reads both
// from this one table so "Clear" really does clear everything the fan
// sees on the search surface — distinct from fan_recents, which
// powers the standalone Recents tab (everything opened or played
// anywhere in the app).
export const fanRecentSearches = pgTable(
  "fan_recent_searches",
  {
    userId: varchar("user_id").notNull(),
    queryNorm: text("query_norm").notNull(),
    displayQuery: text("display_query").notNull(),
    entityKind: text("entity_kind"),
    entityId: varchar("entity_id"),
    title: text("title"),
    subtitle: text("subtitle"),
    thumbUrl: text("thumb_url"),
    href: text("href"),
    lastAt: timestamp("last_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.queryNorm] }),
    userIdx: index("fan_recent_searches_user_lastat_idx").on(t.userId, t.lastAt),
  }),
);

export type FanRecentSearch = typeof fanRecentSearches.$inferSelect;
