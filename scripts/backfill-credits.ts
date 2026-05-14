/**
 * One-shot backfill of the SuperCredits™ catalog from the legacy static seed
 * (client/src/data/musicData.ts). Idempotent — re-running is safe; rows are
 * matched on stable string ids (people/instruments) or natural keys (vendor
 * name within an instrument; song id for writers/performers).
 *
 * The structural data is mirrored inline here rather than imported from
 * musicData.ts because that module pulls Vite `@assets/...` imports that
 * tsx can't resolve. Photos/logos that referenced bundled assets are left
 * null on purpose — the admin CMS can fill them in. Plain-URL favicons
 * (fav(...)) are reconstructed from the affiliate host.
 *
 * Run:   npx tsx scripts/backfill-credits.ts
 */
import { db } from "../server/db";
import { people, instruments, instrumentVendors, trackWriters, trackPerformers, songs } from "../shared/schema";
import { eq, and } from "drizzle-orm";

const fav = (urlOrHost: string) => {
  try {
    const u = new URL(urlOrHost);
    return `https://www.google.com/s2/favicons?sz=128&domain=${u.hostname}`;
  } catch {
    return `https://www.google.com/s2/favicons?sz=128&domain=${urlOrHost}`;
  }
};

const PEOPLE_SEED = [
  { id: "p-tim-snider",   name: "Timothy Michael Snider",      accent: "#319ED8" },
  { id: "p-wolfgang",     name: "Wolfgang Timber",             accent: "#7F10A7" },
  { id: "p-joe-hall",     name: "Joe Hall",                    accent: "#4AFFCA" },
  { id: "p-zach-teran",   name: "Zachary Christopher Teran",   accent: "#FF5470" },
  { id: "p-miguel-cruz",  name: "Miguel Jimenez Cruz",         accent: "#319ED8" },
  { id: "p-chance-utter", name: "Chance Chester Utter",        accent: "#7F10A7" },
];

interface InstSeed {
  id: string;
  name: string;
  category: string;
  shortCategory: string;
  about: string;
  artistNote: string;
  vendors: Array<{ name: string; affiliateUrl: string; aboutUrl?: string; tagline?: string; location?: string; bio?: string }>;
}

const INSTRUMENTS_SEED: InstSeed[] = [
  {
    id: "i-martin-1973-d28",
    name: "1973 Martin D-28",
    category: "Acoustic Guitar",
    shortCategory: "Guitar",
    about: "The D-28 is the dreadnought that defined American acoustic guitar tone. Sitka spruce top, East Indian rosewood back and sides, and the unmistakable bloom that has anchored country, folk, and rock recordings since 1931. 1973 examples sit in the sweet spot of the post-Brazilian-rosewood era — broken-in, resonant, and increasingly collectible.",
    artistNote: "Selected for its warm low-end and the unmistakable spruce-and-rosewood bloom that anchors the rhythm bed on this record.",
    vendors: [
      { name: "ish.guitars", affiliateUrl: "https://ish.guitars/products/1973-martin-d-28-acoustic-guitar", aboutUrl: "https://ish.guitars/", tagline: "Curated vintage & boutique acoustics", location: "Online · Ships worldwide", bio: "ish.guitars is a small-batch dealer focused on hand-picked vintage Martins, Gibsons, and boutique acoustics. Every instrument is set up in-house, photographed in detail, and described honestly — including the dings. Shipping is fully insured, and trial periods are standard." },
      { name: "Carter Vintage Guitars", affiliateUrl: "https://cartervintage.com/shop/martin-d-28-1974-shadetop/3C5kGDIqU4PSAX8mXAKHxZe02KK", aboutUrl: "https://cartervintage.com/", bio: "Founded in Nashville by Walter and Christie Carter, Carter Vintage Guitars is one of the world's leading dealers of vintage and used guitars, basses, mandolins, banjos and amplifiers. Walter's decades as a writer and historian for Gibson and Gruhn Guitars inform every listing — instruments are individually inspected, photographed in detail, and described with the kind of historical context most shops skip." },
      { name: "Martin Guitar (official)", affiliateUrl: "https://www.martinguitar.com/guitars/standard-series/d-28.html", aboutUrl: "https://www.martinguitar.com/", bio: "Founded in 1833 by German immigrant C. F. Martin Sr. and still family-owned in Nazareth, Pennsylvania, Martin is the company that invented the dreadnought and shaped the sound of American acoustic music. Six generations in, every standard-series Martin is still built by hand in the Nazareth factory using woods, bracing patterns, and dovetail joinery refined over nearly 200 years." },
    ],
  },
  {
    id: "i-gretsch-1967-6071",
    name: "1967 Gretsch 6071 \"Monkees\" Bass Walnut",
    category: "Hollow-body Bass",
    shortCategory: "Bass",
    about: "The 6071 is Gretsch's hollow-body bass from the late '60s, immortalized by The Monkees' Peter Tork. Walnut finish, mute system at the bridge, and the warm thumpy tone that only a 30½-inch scale hollow can give you.",
    artistNote: "Selecting this guitar for its unparalleled blend of classic resonance and modern versatility.",
    vendors: [
      { name: "Norman's Rare Guitars", affiliateUrl: "https://www.normansrareguitars.com/", aboutUrl: "https://www.normansrareguitars.com/about", bio: "Norman's Rare Guitars opened in Reseda, California in 1975 and has spent five decades selling vintage guitars to working musicians and the studios that record them — Bob Dylan, Tom Petty, Joe Walsh, and the rotating cast of session players you've heard on a thousand records have all walked through the door. Norman Harris and his team specialize in pre-CBS Fenders, pre-1965 Gibsons, and the kind of one-of-one pieces that only surface in shops with this much history." },
      { name: "The Twelfth Fret", affiliateUrl: "https://www.12fret.com/?s=gretsch+6071", aboutUrl: "https://www.12fret.com/", bio: "The Twelfth Fret has been Toronto's destination for guitarists since 1977. The shop sells new, used, and vintage guitars, and runs a full repair and restoration department staffed by luthiers who have been there for decades — from refrets and neck resets to complete vintage restorations. The company's motto, \"Guitarists' Pro Shop,\" is meant literally." },
      { name: "Reverb", affiliateUrl: "https://reverb.com/marketplace?query=Gretsch%206071", aboutUrl: "https://reverb.com/", bio: "Launched in Chicago in 2013 by Music Makers founder David Kalt, Reverb is the global online marketplace dedicated to making, buying, and selling music gear. Tens of thousands of dealers and individual sellers list new, used, vintage, and handmade instruments, amps, effects, recording gear, and parts. Buyer protection, transparent pricing data via the Reverb Price Guide, and music-specialist customer support are core to the platform." },
    ],
  },
  {
    id: "i-violin-strad-copy",
    name: "German Strad-copy Violin (c. 1910)",
    category: "Violin",
    shortCategory: "Violin",
    about: "Late-19th and early-20th-century German workshops produced thousands of \"Strad copies\" — well-built, full-size violins built on Stradivarius patterns. They've quietly become the workhorse instrument of working studio and folk players for over a century.",
    artistNote: "Tuned standard. Mic'd close on the bridge for the verses, room mic for the choruses.",
    vendors: [
      { name: "Shar Music", affiliateUrl: "https://www.sharmusic.com/violins.html", aboutUrl: "https://www.sharmusic.com/", bio: "Founded in 1962 in Ann Arbor, Michigan by Charles Avsharian — a Juilliard-trained violinist — Shar Music has grown into one of the largest dedicated string-instrument retailers in North America. Shar carries violins, violas, cellos, and basses across every level from student to professional, and is widely used by school music programs, conservatory students, and orchestral players for its rental program, repair shop, and sheet music catalog." },
      { name: "Fiddlershop", affiliateUrl: "https://fiddlershop.com/collections/violins", aboutUrl: "https://fiddlershop.com/", bio: "Fiddlershop is a family-owned string instrument shop in Pompano Beach, Florida, founded by brothers Pierre and Michael Holstein. Every violin, viola, cello, and bass is set up in-house by their luthiers before it ships, and they're known online for their detailed YouTube playthroughs and head-to-head instrument comparisons — a level of transparency rare in the string world." },
      { name: "Reverb", affiliateUrl: "https://reverb.com/marketplace?query=german%20violin", aboutUrl: "https://reverb.com/", bio: "Launched in Chicago in 2013 by Music Makers founder David Kalt, Reverb is the global online marketplace dedicated to making, buying, and selling music gear." },
    ],
  },
  {
    id: "i-bass-fender-p",
    name: "1976 Fender Precision Bass",
    category: "Electric Bass",
    shortCategory: "Bass",
    about: "The Precision Bass is the bass that defined the electric bass guitar. Mid-'70s P-Basses are known for their heavier ash bodies, three-bolt necks, and that deep, throaty thump.",
    artistNote: "Flatwounds, no pick. Sat right behind the kick on every track.",
    vendors: [
      { name: "Fender", affiliateUrl: "https://www.fender.com/en-US/electric-basses/precision-bass/", aboutUrl: "https://www.fender.com/", bio: "Founded by Leo Fender in Fullerton, California in 1946, Fender Musical Instruments Corporation invented the solid-body electric guitar (the Telecaster, 1950), the electric bass guitar (the Precision Bass, 1951), and the Stratocaster (1954) — instruments that became the foundation of modern popular music. Today Fender designs and manufactures guitars, basses, amplifiers, and gear played by everyone from first-time students to the world's most recorded artists." },
      { name: "Andy Baxter Bass", affiliateUrl: "https://www.andybaxterbass.com/", aboutUrl: "https://www.andybaxterbass.com/", bio: "Andy Baxter Bass & Guitars is a London-based dealer specializing in vintage and second-hand basses — Fender, Music Man, Rickenbacker, Höfner, Wal, Alembic, and the rare boutique pieces working bassists actually want. Andy Baxter himself is a touring bassist, and the shop's listings are written by players, for players, with detail on weight, electronics, and feel that mainstream retailers don't bother with." },
      { name: "Reverb", affiliateUrl: "https://reverb.com/marketplace?query=1976%20fender%20precision%20bass", aboutUrl: "https://reverb.com/", bio: "Launched in Chicago in 2013 by Music Makers founder David Kalt, Reverb is the global online marketplace dedicated to making, buying, and selling music gear." },
    ],
  },
  {
    id: "i-drums-gretsch-kit",
    name: "Gretsch USA Custom Kit",
    category: "Drum Kit",
    shortCategory: "Drums",
    about: "Gretsch's USA Custom is built in Ridgeland, South Carolina — 6-ply maple/gum shells with the legendary Gretsch \"silver sealer\" interior. The studio kit of choice for players who want round, focused, recording-ready tone.",
    artistNote: "22\" kick, 13\" rack, 16\" floor. Calf heads on the toms for a softer attack.",
    vendors: [
      { name: "Gretsch Drums", affiliateUrl: "https://www.gretschdrums.com/series/usa-custom", aboutUrl: "https://www.gretschdrums.com/", bio: "Founded in Brooklyn in 1883 by 27-year-old German immigrant Friedrich Gretsch, Gretsch is one of the oldest American musical instrument makers — and \"That Great Gretsch Sound\" has anchored jazz, country, and rock recordings for well over a century. USA Custom drums are still built in Ridgeland, South Carolina using the company's classic 6-ply maple/gum shells, 30-degree bearing edges, and the legendary silver-sealer interior." },
      { name: "Sweetwater", affiliateUrl: "https://www.sweetwater.com/c1066--Gretsch_Drums", aboutUrl: "https://www.sweetwater.com/", bio: "Started by Chuck Surack out of a VW bus in 1979, Sweetwater is now the largest online retailer of musical instruments and pro-audio gear in the United States, headquartered on a 175-acre campus in Fort Wayne, Indiana. Every customer is assigned a personal Sales Engineer — a working musician trained to give real advice — and every guitar over $299 receives a complimentary 55-Point Inspection by Sweetwater's Guitar Gallery before it ships." },
      { name: "Bentley's Drum Shop", affiliateUrl: "https://bentleysdrumshop.com/collections/gretsch-drums", aboutUrl: "https://bentleysdrumshop.com/", bio: "Bentley's Drum Shop has served Fresno, California and the touring/recording community since 1962 — a true drummer's drum shop. The Bentley family stocks deep across kits, snares, cymbals, hardware, and hand percussion from the major makers and the boutique builders, and runs a repair and restoration department for vintage drums." },
    ],
  },
  {
    id: "i-perc-lp-congas",
    name: "LP Matador Series Congas",
    category: "Hand Percussion",
    shortCategory: "Percussion",
    about: "The Matador Series is LP's mid-tier conga line — Siam Oak shells, traditional rims, and the rich open tone that makes them a studio standard. Used by everyone from Sheila E. to Poncho Sanchez.",
    artistNote: "A pair of quintos plus a bongo for the bridge fills.",
    vendors: [
      { name: "Latin Percussion", affiliateUrl: "https://lpmusic.com/collections/matador-series", aboutUrl: "https://lpmusic.com/", bio: "Latin Percussion was founded in 1964 by Martin Cohen, an engineer who couldn't find decent congas in New York and started building his own. Sixty years later, LP is the world's leading maker of hand percussion — congas, bongos, timbales, cowbells, shakers, and the rest of the Afro-Cuban toolkit — and the brand of choice for everyone from Tito Puente to Sheila E. to the modern session world." },
      { name: "Sweetwater", affiliateUrl: "https://www.sweetwater.com/c777--Conga_Drums", aboutUrl: "https://www.sweetwater.com/", bio: "Started by Chuck Surack out of a VW bus in 1979, Sweetwater is now the largest online retailer of musical instruments and pro-audio gear in the United States." },
      { name: "Drums Etc.", affiliateUrl: "https://www.drumsetc.com/", aboutUrl: "https://www.drumsetc.com/", bio: "Drums Etc. has been Charlotte, North Carolina's full-line drum shop since 1989, owned and run by drummers. Beyond kits and cymbals from every major maker, the shop is known for its hand-percussion wall — congas, djembes, cajóns, frame drums, world percussion — and a teaching studio that's brought in clinicians from across the country." },
    ],
  },
];

// PersonId resolution for writers — the static seed uses display names like
// "Timothy Michael Snider" but the credits sheet links them to a personId.
const TRACK_CREDITS_SEED: Record<string, {
  writers: Array<{ name: string; personId?: string; role: string }>;
  performers: Array<{ personId: string; role: string; instrumentId: string; tuningNotes?: string }>;
}> = {
  "song-1-1": {
    writers: [
      { name: "Timothy Michael Snider", personId: "p-tim-snider", role: "Composer" },
      { name: "Wolfgang Timber",        personId: "p-wolfgang",   role: "Composer · Lyricist" },
    ],
    performers: [
      { personId: "p-tim-snider",   role: "Composer · Violin", instrumentId: "i-violin-strad-copy" },
      { personId: "p-joe-hall",     role: "Guitar",            instrumentId: "i-martin-1973-d28",   tuningNotes: "Standard" },
      { personId: "p-zach-teran",   role: "Bass",              instrumentId: "i-bass-fender-p" },
      { personId: "p-miguel-cruz",  role: "Drums",             instrumentId: "i-drums-gretsch-kit" },
      { personId: "p-chance-utter", role: "Percussion",        instrumentId: "i-perc-lp-congas" },
    ],
  },
  "song-1-2": {
    writers: [{ name: "Wolfgang Timber", personId: "p-wolfgang", role: "Composer · Lyricist" }],
    performers: [
      { personId: "p-tim-snider",  role: "Violin",  instrumentId: "i-violin-strad-copy" },
      { personId: "p-joe-hall",    role: "Guitar",  instrumentId: "i-martin-1973-d28", tuningNotes: "Dropped D" },
      { personId: "p-zach-teran",  role: "Bass",    instrumentId: "i-bass-fender-p" },
      { personId: "p-miguel-cruz", role: "Drums",   instrumentId: "i-drums-gretsch-kit" },
    ],
  },
  "song-1-3": {
    writers: [{ name: "Timothy Michael Snider", personId: "p-tim-snider", role: "Composer" }],
    performers: [
      { personId: "p-tim-snider", role: "Composer · Violin", instrumentId: "i-violin-strad-copy" },
      { personId: "p-joe-hall",   role: "Guitar",            instrumentId: "i-martin-1973-d28", tuningNotes: "DADGAD" },
      { personId: "p-zach-teran", role: "Bass",              instrumentId: "i-bass-fender-p" },
    ],
  },
  "song-1-4": {
    writers: [{ name: "Wolfgang Timber", personId: "p-wolfgang", role: "Composer · Lyricist" }],
    performers: [
      { personId: "p-joe-hall",     role: "Guitar",     instrumentId: "i-martin-1973-d28" },
      { personId: "p-zach-teran",   role: "Bass",       instrumentId: "i-bass-fender-p" },
      { personId: "p-chance-utter", role: "Percussion", instrumentId: "i-perc-lp-congas" },
    ],
  },
  "song-1-5": {
    writers: [
      { name: "Timothy Michael Snider", personId: "p-tim-snider", role: "Composer" },
      { name: "Wolfgang Timber",        personId: "p-wolfgang",   role: "Composer" },
    ],
    performers: [
      { personId: "p-tim-snider",  role: "Violin", instrumentId: "i-violin-strad-copy" },
      { personId: "p-joe-hall",    role: "Guitar", instrumentId: "i-martin-1973-d28" },
      { personId: "p-miguel-cruz", role: "Drums",  instrumentId: "i-drums-gretsch-kit" },
    ],
  },
  "song-1-6": {
    writers: [
      { name: "Timothy Michael Snider", personId: "p-tim-snider", role: "Composer" },
      { name: "Wolfgang Timber",        personId: "p-wolfgang",   role: "Composer · Lyricist" },
    ],
    performers: [
      { personId: "p-tim-snider",   role: "Composer · Violin", instrumentId: "i-violin-strad-copy" },
      { personId: "p-joe-hall",     role: "Guitar",            instrumentId: "i-martin-1973-d28" },
      { personId: "p-zach-teran",   role: "Bass",              instrumentId: "i-bass-fender-p" },
      { personId: "p-miguel-cruz",  role: "Drums",             instrumentId: "i-drums-gretsch-kit" },
      { personId: "p-chance-utter", role: "Percussion",        instrumentId: "i-perc-lp-congas" },
    ],
  },
};

async function main() {
  let inserts = 0, skips = 0;

  // 1. People — match by stable id, upsert-style insert that no-ops on conflict.
  for (const p of PEOPLE_SEED) {
    const [existing] = await db.select().from(people).where(eq(people.id, p.id));
    if (existing) { skips++; continue; }
    await db.insert(people).values({ id: p.id, name: p.name, accent: p.accent });
    inserts++;
    console.log(`  + person ${p.id} (${p.name})`);
  }

  // 2. Instruments — same pattern.
  for (const i of INSTRUMENTS_SEED) {
    const [existing] = await db.select().from(instruments).where(eq(instruments.id, i.id));
    if (!existing) {
      await db.insert(instruments).values({
        id: i.id,
        name: i.name,
        category: i.category,
        shortCategory: i.shortCategory,
        about: i.about,
        artistNote: i.artistNote,
      });
      inserts++;
      console.log(`  + instrument ${i.id} (${i.name})`);
    } else {
      skips++;
    }

    // 3. Vendors — natural key (instrumentId, name). Skip if a row with the
    //    same (instrumentId, name) already exists so re-runs don't duplicate.
    for (let pos = 0; pos < i.vendors.length; pos++) {
      const v = i.vendors[pos];
      const [vExisting] = await db
        .select()
        .from(instrumentVendors)
        .where(and(eq(instrumentVendors.instrumentId, i.id), eq(instrumentVendors.name, v.name)));
      if (vExisting) { skips++; continue; }
      await db.insert(instrumentVendors).values({
        instrumentId: i.id,
        name: v.name,
        affiliateUrl: v.affiliateUrl,
        aboutUrl: v.aboutUrl ?? null,
        logoUrl: fav(v.affiliateUrl),
        tagline: v.tagline ?? null,
        bio: v.bio ?? null,
        location: v.location ?? null,
        coverUrl: null,
        position: pos,
      });
      inserts++;
      console.log(`    + vendor ${i.id} :: ${v.name}`);
    }
  }

  // 4. Track credits. Only insert when the song has no existing
  //    writer or performer rows — keeps the script idempotent and never
  //    clobbers data the admin has already entered through the CMS.
  for (const [songId, credits] of Object.entries(TRACK_CREDITS_SEED)) {
    // Make sure the song row actually exists in this DB. The static seed
    // assumed song-1-1..song-1-6 which the dev DB has, but be defensive.
    const [song] = await db.select().from(songs).where(eq(songs.id, songId));
    if (!song) {
      console.log(`  ! skipping ${songId} — song row not present`);
      skips++;
      continue;
    }

    const existingW = await db.select().from(trackWriters).where(eq(trackWriters.songId, songId));
    if (existingW.length === 0) {
      for (let i = 0; i < credits.writers.length; i++) {
        const w = credits.writers[i];
        await db.insert(trackWriters).values({
          songId,
          personId: w.personId ?? null,
          name: w.name,
          role: w.role,
          position: i,
        });
        inserts++;
      }
      console.log(`  + ${credits.writers.length} writers for ${songId}`);
    } else { skips++; }

    const existingP = await db.select().from(trackPerformers).where(eq(trackPerformers.songId, songId));
    if (existingP.length === 0) {
      for (let i = 0; i < credits.performers.length; i++) {
        const p = credits.performers[i];
        // Resolve the display name from PEOPLE_SEED so the snapshot column
        // is always populated (renders correctly even after a person row
        // is later deleted).
        const person = PEOPLE_SEED.find((x) => x.id === p.personId);
        await db.insert(trackPerformers).values({
          songId,
          personId: p.personId,
          instrumentId: p.instrumentId,
          name: person?.name ?? p.personId,
          role: p.role,
          tuningNotes: p.tuningNotes ?? null,
          position: i,
        });
        inserts++;
      }
      console.log(`  + ${credits.performers.length} performers for ${songId}`);
    } else { skips++; }
  }

  console.log(`\nDone. ${inserts} inserted, ${skips} skipped.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
