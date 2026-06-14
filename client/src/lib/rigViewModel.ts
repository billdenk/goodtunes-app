/* Shared per-song rig/gear view-model logic for the fan credits surfaces.
 *
 * Both the mobile <SongCreditsSheet> (bottom sheet) and the desktop
 * <AlbumCreditsPage> (centered card) render the same "On this track" gear
 * doors → RigDetailSheet drill-down. The data plumbing that turns a raw
 * GET /api/albums/:id/credits payload into a fully-hydrated RigDetailView
 * encodes real business rules (re-resolving the base instrument because rigs
 * ship instruments WITHOUT vendors, accessory→catalog linking, and the
 * same-rig track scan). Keeping it here — instead of duplicating the resolver
 * on each surface — is what keeps mobile and desktop in lockstep. */
import { INSTRUMENTS, type Instrument, type Person } from "@/data/musicData";
import type { SongRig } from "@/components/ui/AlbumCreditsSheet";

// ── Enriched credits payload (GET /api/albums/:id/credits) ───────────────
// Person/instrument joins are already done server-side, so the fan credits
// surface renders from a single fetch.
export type ApiPerson = {
  id: string;
  name: string;
  photoUrl?: string | null;
  bio?: string | null;
};
export type ApiVendor = {
  id: string;
  instrumentId: string;
  vendorId: string;
  name: string;
  domain?: string;
  affiliateUrl: string;
  aboutUrl?: string | null;
  homeUrl?: string | null;
  logoUrl?: string | null;
  tagline?: string | null;
  bio?: string | null;
  location?: string | null;
  coverUrl?: string | null;
  position: number;
};
export type ApiInstrument = {
  id: string;
  name: string;
  category: string;
  shortCategory?: string | null;
  photoUrl?: string | null;
  photoUrls?: string[] | null;
  about?: string | null;
  artistNote?: string | null;
  vendors: ApiVendor[];
};
export type ApiSongCredits = {
  writers: Array<{
    id: string;
    songId: string;
    personId: string | null;
    name: string;
    role: string;
    position: number;
    person: ApiPerson | null;
  }>;
  performers: Array<{
    id: string;
    songId: string;
    personId: string | null;
    instrumentId: string | null;
    name: string;
    role: string;
    tuningNotes: string | null;
    position: number;
    person: ApiPerson | null;
    instrument: ApiInstrument | null;
  }>;
  rigs?: SongRig[];
};
export type ApiAlbumProductionCredit = {
  id: string;
  albumId: string;
  personId: string | null;
  name: string;
  role: string;
  position: number;
  person: ApiPerson | null;
};
export type AlbumCreditsApiPayload = {
  bySongId: Record<string, ApiSongCredits>;
  production?: ApiAlbumProductionCredit[];
};

// API rows use `string | null` for optional columns; the static types use
// `string | undefined`. These tiny coercions keep TS happy and match the
// static-seed shapes the credits sheets already consume.
const nu = <T,>(v: T | null | undefined): T | undefined => v ?? undefined;

export function normalizePerson(p: ApiPerson): Person {
  return { id: p.id, name: p.name, photoUrl: nu(p.photoUrl), bio: nu(p.bio) };
}

export function normalizeInstrument(i: ApiInstrument): Instrument {
  return {
    id: i.id,
    name: i.name,
    category: i.category,
    shortCategory: nu(i.shortCategory),
    photoUrl: nu(i.photoUrl),
    photoUrls: nu(i.photoUrls),
    about: nu(i.about),
    artistNote: nu(i.artistNote),
    vendors: i.vendors.map((v) => ({
      // Static-shape fields the static seed data also fills in.
      name: v.name,
      affiliateUrl: v.affiliateUrl,
      aboutUrl: nu(v.aboutUrl),
      logoUrl: nu(v.logoUrl),
      tagline: nu(v.tagline),
      bio: nu(v.bio),
      location: nu(v.location),
      coverUrl: nu(v.coverUrl),
      // API-only fields needed by VendorSheet (profile fetch + bookmark
      // keying). Static seed rows leave these undefined and fall back
      // gracefully.
      id: v.id,
      vendorId: v.vendorId,
      instrumentId: v.instrumentId,
      homeUrl: v.homeUrl ?? undefined,
      domain: v.domain,
    })),
  };
}

/* The fully-resolved data the dumb RigDetailSheet renders. Built at tap time
 * by makeResolveRigView(). */
export type RigDetailView = {
  /* Inner rig.id — the request-quote target (POST /api/rigs/:id/request-quote)
     and the key used to find the same rig across other tracks on this album. */
  rigId: string;
  rigName: string;
  /* Per-take tweak note or the rig's own notes, if any. */
  notes?: string | null;
  /* Hero photo: performer photo → base-instrument photo → album art. */
  heroPhotoUrl?: string;
  /* The track this rig was opened from (small lead-in over the hero). */
  trackTitle?: string;
  /* Performer name (falls back to the album artist for an orphan rig). */
  artistName: string;
  /* Vendor-enriched base instrument (resolved via instrumentsById). */
  instrument?: Instrument | null;
  /* Accessory entries; `instrument` is set when the accessory itself links to
     a catalog instrument the fan can open. */
  accessories: Array<{
    id: string;
    type: string;
    value: string;
    instrument?: Instrument | null;
  }>;
  /* Other tracks on THIS album that use the same rig (≥2 to render). */
  tracks: Array<{ id: string; title: string; artUrl?: string }>;
  /* Album title (track-row subtitle) + the song this was opened from
     (request-quote context). */
  albumTitle: string;
  songId?: string;
};

/* Build the instrument index that drives gear resolution: seed with the
 * static roster first so API-supplied (vendor-enriched) rows override it. The
 * base instrument carried on a rig ships WITHOUT vendors, so the rig view
 * re-resolves it through this map to recover the availability CTA's vendors. */
export function buildInstrumentsById(
  apiCredits:
    | {
        bySongId?: Record<
          string,
          | {
              performers?: Array<{ instrument?: ApiInstrument | null }>;
              rigs?: Array<{
                rig?: {
                  accessories?: Array<{ instrument?: ApiInstrument | null }>;
                } | null;
              }>;
            }
          | undefined
        >;
      }
    | null
    | undefined,
): Map<string, Instrument> {
  const instrumentsById = new Map<string, Instrument>();
  for (const [iid, i] of Object.entries(INSTRUMENTS)) instrumentsById.set(iid, i);
  if (apiCredits?.bySongId) {
    for (const api of Object.values(apiCredits.bySongId)) {
      for (const p of api?.performers ?? []) {
        if (p.instrument)
          instrumentsById.set(p.instrument.id, normalizeInstrument(p.instrument));
      }
      // Accessory-linked catalog instruments (e.g. a signature pick) ride
      // embedded on each accessory, vendor-enriched server-side. Index them so
      // the rig resolver can fill `accessory.instrument` and make the row
      // clickable. Performer instruments win (set-if-absent) since they're the
      // same enriched shape.
      for (const tr of api?.rigs ?? []) {
        for (const a of tr.rig?.accessories ?? []) {
          if (a.instrument && !instrumentsById.has(a.instrument.id))
            instrumentsById.set(a.instrument.id, normalizeInstrument(a.instrument));
        }
      }
    }
  }
  return instrumentsById;
}

/* Factory: returns the (rig, ctx) → RigDetailView resolver shared by both fan
 * surfaces. Param shapes are primitive so both the static Album (mobile) and
 * the ApiAlbum (desktop) feed it directly. */
export function makeResolveRigView(deps: {
  instrumentsById: Map<string, Instrument>;
  /* The full album credits payload — scanned for other tracks using the
     same rig. Only `bySongId[*].rigs` is read. */
  credits:
    | { bySongId?: Record<string, { rigs?: SongRig[] } | undefined> }
    | null
    | undefined;
  songs: Array<{ id: string; title: string }>;
  album: { title: string; artist: string; artwork?: string | null };
  /* The song the rig was opened from (request-quote + lead-in context). */
  songId: string;
  songTitle: string;
}): (
  rig: SongRig,
  ctx: { performerName?: string; performerPhotoUrl?: string | null },
) => RigDetailView {
  const { instrumentsById, credits, songs, album, songId, songTitle } = deps;
  return (tr, ctx) => {
    const innerRig = tr.rig;
    const baseInst = innerRig?.instrument ?? null;
    // Re-resolve the base instrument through instrumentsById so it carries the
    // vendor list (rigs ship the instrument WITHOUT vendors); that resolved
    // copy drives the availability CTA.
    const base = baseInst ? instrumentsById.get(baseInst.id) ?? baseInst : null;
    const accessories = (innerRig?.accessories ?? []).map((a) => ({
      id: a.id,
      type: a.type,
      value: a.value,
      instrument: a.instrumentId
        ? instrumentsById.get(a.instrumentId) ?? null
        : null,
    }));
    // Other tracks on THIS album using the same rig (shared rig id).
    const seen = new Set<string>();
    const tracks: Array<{ id: string; title: string; artUrl?: string }> = [];
    if (innerRig && credits?.bySongId) {
      for (const [sid, api] of Object.entries(credits.bySongId)) {
        if (!api || seen.has(sid)) continue;
        if (!(api.rigs ?? []).some((r) => r.rig?.id === innerRig.id)) continue;
        seen.add(sid);
        tracks.push({
          id: sid,
          title: songs.find((s) => s.id === sid)?.title ?? "",
          artUrl: album.artwork ?? undefined,
        });
      }
    }
    return {
      rigId: innerRig?.id ?? tr.id,
      rigName: tr.rigName || innerRig?.name || "Rig",
      notes: tr.tweakNote ?? innerRig?.notes ?? null,
      heroPhotoUrl:
        ctx.performerPhotoUrl ?? base?.photoUrl ?? album.artwork ?? undefined,
      trackTitle: songTitle,
      artistName: ctx.performerName ?? album.artist,
      instrument: base,
      accessories,
      tracks,
      albumTitle: album.title,
      songId,
    };
  };
}
