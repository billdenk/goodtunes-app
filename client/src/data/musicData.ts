import tgPhoto1 from "@assets/640072642_25613245751711176_6571016117939262912_n_1778621365643.jpg";
import tgPhoto2 from "@assets/634243288_25554499034252515_5558112962991228661_n_1778621377317.jpg";
import tgPhoto3 from "@assets/659040451_18574314340025503_4062507424707663101_n_1778621388019.jpg";
import tgPhoto4 from "@assets/653387510_18568733956025503_1400116026168525714_n_1778621392486.jpg";
import tgPhoto5 from "@assets/496254517_9447895035339505_2309388181313327884_n_1778621409155.jpg";
import tgVideo1Thumb from "@assets/612548086_1270168371604759_7665130374696370589_n_1778621383526.jpg";
import tgVideo2Thumb from "@assets/629024765_18558574207025503_6255887094720167360_n_1778621397950.jpg";
import tgVideo3Thumb from "@assets/590183285_1595547188528175_2217542122704006465_n_1778621402722.jpg";
import martinD28Photo from "@assets/instruments/martin-d28.jpg";
import gretsch6071Photo from "@assets/instruments/gretsch-6071.jpg";
import violinPhoto from "@assets/instruments/violin.jpg";
import fenderPPhoto from "@assets/instruments/fender-p.jpg";
import gretschKitPhoto from "@assets/instruments/gretsch-kit.jpg";
import lpCongasPhoto from "@assets/instruments/lp-congas.jpg";
import nickCarterPhoto from "@assets/nick_carter_compressed.jpg";
import nickCarterAlbumCover from "@assets/nick_carter_album_cover.jpg";
import fenderTelecasterCover from "@assets/image_1778731986270.png";
import fenderLogo from "@assets/461125233_1058013002493273_1591653497522534890_n_1778732472335.jpg";
import martinLogo from "@assets/317491717_240990641664216_6413553804796243039_n_1778732477205.jpg";
import carterVintageLogo from "@assets/255891541_412002907097842_7782375590964949093_n_1778732681632.jpg";
import sweetwaterLogo from "@assets/476244395_1665981424127038_1061684299279554240_n_1778732759333.jpg";
import bentleysLogo from "@assets/447880907_328086196999345_3196707581570307705_n_1778732794265.jpg";
import lpLogo from "@assets/489126077_677900001854920_6115099447711243943_n_1778732825168.jpg";
import drumsEtcLogo from "@assets/275563945_531328368414479_4350121964457415153_n_1778732859335.jpg";
import twelfthFretLogo from "@assets/49857260_217283972556499_8769671160792088576_n-2_1778732933481.jpg";
import gretschDrumsLogo from "@assets/40601513_297256864334777_6021362072443420672_n_1778732967447.jpg";
import normansLogo from "@assets/685006621_18582612778000748_3694874442677560108_n_1778733016560.jpg";
import fiddlershopLogo from "@assets/296480923_990510464955559_4835927508089831312_n_1778733043794.jpg";
import reverbLogo from "@assets/491440339_1219621203075331_1388987368263062983_n_1778733063798.jpg";
import andyBaxterLogo from "@assets/55778932_330879441110144_6072972594200444928_n_1778733121471.jpg";

export const ARTIST_PHOTOS: Record<string, string> = {
  "Nick Carter": nickCarterPhoto,
};

export interface AlbumVideo {
  id: string;
  title: string;
  thumbnail: string;
  url: string;
  duration?: string;
}

export interface AlbumPhoto {
  id: string;
  url: string;
  caption?: string;
}

export interface CertPurchase {
  num: number;
  price: number;
  date: string;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  year: number;
  type: "Single" | "EP" | "LP";
  description: string;
  certificateNumber?: number;
  ownedCertificates?: number[];
  purchases?: CertPurchase[];
  videos?: AlbumVideo[];
  photos?: AlbumPhoto[];
}

export interface Song {
  id: string;
  albumId: string;
  title: string;
  trackNumber: number;
  duration: number;
  lyrics?: string;
  audioUrl?: string;
}

// SuperCredits™
export interface Person {
  id: string;
  name: string;
  photoUrl?: string;
  bio?: string;
  // Used for the initial-circle avatar fallback (HSL-friendly hex from the brand palette).
  accent?: string;
}

export interface InstrumentVendor {
  name: string;
  // Direct product URL for this exact instrument. Treat as affiliate-aware.
  affiliateUrl: string;
  // Vendor's own homepage / about page. Tapping the logo opens this.
  aboutUrl?: string;
  // Logo URL. We default to Google's S2 favicon endpoint so we always get something
  // recognizable without shipping a logo asset for every vendor.
  logoUrl?: string;
  // Vendor profile fields (concept) — optional; the VendorSheet falls back gracefully when missing.
  tagline?: string;          // one-liner under the name
  bio?: string;              // longer "About {vendor}" copy
  location?: string;         // e.g. "Nashville, TN"
  coverUrl?: string;         // hero background photo (Apple Music artist style)
  usedByPersonIds?: string[]; // ids from PEOPLE for the "Artists who use them" rail
  // Fields populated only when the row comes from the API
  // (EnrichedInstrumentVendor server-side). Optional here so static data
  // in this file stays valid without them — runtime usage that requires
  // them (vendor profile fetch, bookmark id) checks before using.
  id?: string;               // instrument_vendors.id (the join row id)
  vendorId?: string;         // vendors.id (the vendor entity id)
  instrumentId?: string;
  homeUrl?: string | null;
  domain?: string;
}

export interface Instrument {
  id: string;
  name: string;            // e.g. "1967 Gretsch 6071 'Monkees' Bass Walnut"
  category: string;        // e.g. "Bass", "Acoustic Guitar"
  shortCategory?: string;  // e.g. "Violin", "Guitar" — what we show inline next to a performer
  photoUrl?: string;
  about?: string;          // neutral "About" copy (history, model facts)
  artistNote?: string;     // why this artist chose THIS instrument for THIS track
  vendors?: InstrumentVendor[];
}

export interface TrackPerformer {
  // personId is optional because the DB allows it to be null after a Person
  // row is deleted (FK is SET NULL). When that happens we render from the
  // `name` snapshot instead. The static seed always supplies personId.
  personId?: string;
  name?: string;           // snapshot from the API so deleted-person credits still render
  // Stable DB row id (only present for API-sourced rows). Used by the fan
  // surface to match an unlinked performer across sheets when personId is
  // null. Static seed rows leave this undefined.
  creditId?: string;
  role: string;            // e.g. "Guitar", "Bass", "Composer · Violin"
  instrumentId?: string;
  tuningNotes?: string;    // e.g. "DADGAD", "Dropped D, capo 3"
}

export interface TrackWriter {
  personId?: string;       // optional — sometimes writer isn't a performer
  name: string;            // always present for display
  role: string;            // "Composer", "Lyricist", "Producer"
}

export interface TrackCredits {
  writers: TrackWriter[];
  performers: TrackPerformer[];
}

export const PEOPLE: Record<string, Person> = {
  "p-tim-snider":   { id: "p-tim-snider",   name: "Timothy Michael Snider", accent: "#319ED8" },
  "p-wolfgang":     { id: "p-wolfgang",     name: "Wolfgang Timber",        accent: "#7F10A7" },
  "p-joe-hall":     { id: "p-joe-hall",     name: "Joe Hall",               accent: "#4AFFCA" },
  "p-zach-teran":   { id: "p-zach-teran",   name: "Zachary Christopher Teran", accent: "#FF5470" },
  "p-miguel-cruz":  { id: "p-miguel-cruz",  name: "Miguel Jimenez Cruz",    accent: "#319ED8" },
  "p-chance-utter": { id: "p-chance-utter", name: "Chance Chester Utter",   accent: "#7F10A7" },
};

// Helper: stable favicon URL for a vendor. Cheap, recognizable, no asset shipping.
const fav = (domain: string) => `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;

export const INSTRUMENTS: Record<string, Instrument> = {
  "i-martin-1973-d28": {
    id: "i-martin-1973-d28",
    name: "1973 Martin D-28",
    category: "Acoustic Guitar",
    shortCategory: "Guitar",
    photoUrl: martinD28Photo,
    about:
      "The D-28 is the dreadnought that defined American acoustic guitar tone. Sitka spruce top, East Indian rosewood back and sides, and the unmistakable bloom that has anchored country, folk, and rock recordings since 1931. 1973 examples sit in the sweet spot of the post-Brazilian-rosewood era — broken-in, resonant, and increasingly collectible.",
    artistNote:
      "Selected for its warm low-end and the unmistakable spruce-and-rosewood bloom that anchors the rhythm bed on this record.",
    vendors: [
      {
        name: "ish.guitars",
        affiliateUrl: "https://ish.guitars/products/1973-martin-d-28-acoustic-guitar",
        aboutUrl: "https://ish.guitars/",
        logoUrl: fav("ish.guitars"),
        tagline: "Curated vintage & boutique acoustics",
        location: "Online · Ships worldwide",
        bio: "ish.guitars is a small-batch dealer focused on hand-picked vintage Martins, Gibsons, and boutique acoustics. Every instrument is set up in-house, photographed in detail, and described honestly — including the dings. Shipping is fully insured, and trial periods are standard.",
        usedByPersonIds: ["p-tim-snider", "p-joe-hall", "p-wolfgang"],
      },
      {
        name: "Carter Vintage Guitars",
        affiliateUrl: "https://cartervintage.com/shop/martin-d-28-1974-shadetop/3C5kGDIqU4PSAX8mXAKHxZe02KK",
        aboutUrl: "https://cartervintage.com/",
        logoUrl: carterVintageLogo,
        bio: "Founded in Nashville by Walter and Christie Carter, Carter Vintage Guitars is one of the world's leading dealers of vintage and used guitars, basses, mandolins, banjos and amplifiers. Walter's decades as a writer and historian for Gibson and Gruhn Guitars inform every listing — instruments are individually inspected, photographed in detail, and described with the kind of historical context most shops skip.",
      },
      {
        name: "Martin Guitar (official)",
        affiliateUrl: "https://www.martinguitar.com/guitars/standard-series/d-28.html",
        aboutUrl: "https://www.martinguitar.com/",
        logoUrl: martinLogo,
        bio: "Founded in 1833 by German immigrant C. F. Martin Sr. and still family-owned in Nazareth, Pennsylvania, Martin is the company that invented the dreadnought and shaped the sound of American acoustic music. Six generations in, every standard-series Martin is still built by hand in the Nazareth factory using woods, bracing patterns, and dovetail joinery refined over nearly 200 years.",
      },
    ],
  },
  "i-gretsch-1967-6071": {
    id: "i-gretsch-1967-6071",
    name: "1967 Gretsch 6071 \"Monkees\" Bass Walnut",
    category: "Hollow-body Bass",
    shortCategory: "Bass",
    photoUrl: gretsch6071Photo,
    about:
      "The 6071 is Gretsch's hollow-body bass from the late '60s, immortalized by The Monkees' Peter Tork. Walnut finish, mute system at the bridge, and the warm thumpy tone that only a 30½-inch scale hollow can give you.",
    artistNote:
      "Selecting this guitar for its unparalleled blend of classic resonance and modern versatility.",
    vendors: [
      {
        name: "Norman's Rare Guitars",
        affiliateUrl: "https://www.normansrareguitars.com/",
        aboutUrl: "https://www.normansrareguitars.com/about",
        logoUrl: normansLogo,
        bio: "Norman's Rare Guitars opened in Reseda, California in 1975 and has spent five decades selling vintage guitars to working musicians and the studios that record them — Bob Dylan, Tom Petty, Joe Walsh, and the rotating cast of session players you've heard on a thousand records have all walked through the door. Norman Harris and his team specialize in pre-CBS Fenders, pre-1965 Gibsons, and the kind of one-of-one pieces that only surface in shops with this much history.",
      },
      {
        name: "The Twelfth Fret",
        affiliateUrl: "https://www.12fret.com/?s=gretsch+6071",
        aboutUrl: "https://www.12fret.com/",
        logoUrl: twelfthFretLogo,
        bio: "The Twelfth Fret has been Toronto's destination for guitarists since 1977. The shop sells new, used, and vintage guitars, and runs a full repair and restoration department staffed by luthiers who have been there for decades — from refrets and neck resets to complete vintage restorations. The company's motto, \"Guitarists' Pro Shop,\" is meant literally.",
      },
      {
        name: "Reverb",
        affiliateUrl: "https://reverb.com/marketplace?query=Gretsch%206071",
        aboutUrl: "https://reverb.com/",
        logoUrl: reverbLogo,
        bio: "Launched in Chicago in 2013 by Music Makers founder David Kalt, Reverb is the global online marketplace dedicated to making, buying, and selling music gear. Tens of thousands of dealers and individual sellers list new, used, vintage, and handmade instruments, amps, effects, recording gear, and parts. Buyer protection, transparent pricing data via the Reverb Price Guide, and music-specialist customer support are core to the platform.",
      },
    ],
  },
  "i-violin-strad-copy": {
    id: "i-violin-strad-copy",
    name: "German Strad-copy Violin (c. 1910)",
    category: "Violin",
    shortCategory: "Violin",
    photoUrl: violinPhoto,
    about:
      "Late-19th and early-20th-century German workshops produced thousands of \"Strad copies\" — well-built, full-size violins built on Stradivarius patterns. They've quietly become the workhorse instrument of working studio and folk players for over a century.",
    artistNote:
      "Tuned standard. Mic'd close on the bridge for the verses, room mic for the choruses.",
    vendors: [
      {
        name: "Shar Music",
        affiliateUrl: "https://www.sharmusic.com/violins.html",
        aboutUrl: "https://www.sharmusic.com/",
        logoUrl: fav("sharmusic.com"),
        bio: "Founded in 1962 in Ann Arbor, Michigan by Charles Avsharian — a Juilliard-trained violinist — Shar Music has grown into one of the largest dedicated string-instrument retailers in North America. Shar carries violins, violas, cellos, and basses across every level from student to professional, and is widely used by school music programs, conservatory students, and orchestral players for its rental program, repair shop, and sheet music catalog.",
      },
      {
        name: "Fiddlershop",
        affiliateUrl: "https://fiddlershop.com/collections/violins",
        aboutUrl: "https://fiddlershop.com/",
        logoUrl: fiddlershopLogo,
        bio: "Fiddlershop is a family-owned string instrument shop in Pompano Beach, Florida, founded by brothers Pierre and Michael Holstein. Every violin, viola, cello, and bass is set up in-house by their luthiers before it ships, and they're known online for their detailed YouTube playthroughs and head-to-head instrument comparisons — a level of transparency rare in the string world.",
      },
      {
        name: "Reverb",
        affiliateUrl: "https://reverb.com/marketplace?query=german%20violin",
        aboutUrl: "https://reverb.com/",
        logoUrl: reverbLogo,
        bio: "Launched in Chicago in 2013 by Music Makers founder David Kalt, Reverb is the global online marketplace dedicated to making, buying, and selling music gear. Tens of thousands of dealers and individual sellers list new, used, vintage, and handmade instruments, amps, effects, recording gear, and parts. Buyer protection, transparent pricing data via the Reverb Price Guide, and music-specialist customer support are core to the platform.",
      },
    ],
  },
  "i-bass-fender-p": {
    id: "i-bass-fender-p",
    name: "1976 Fender Precision Bass",
    category: "Electric Bass",
    shortCategory: "Bass",
    photoUrl: fenderPPhoto,
    about:
      "The Precision Bass is the bass that defined the electric bass guitar. Mid-'70s P-Basses are known for their heavier ash bodies, three-bolt necks, and that deep, throaty thump.",
    artistNote:
      "Flatwounds, no pick. Sat right behind the kick on every track.",
    vendors: [
      {
        name: "Fender",
        affiliateUrl: "https://www.fender.com/en-US/electric-basses/precision-bass/",
        aboutUrl: "https://www.fender.com/",
        logoUrl: fenderLogo,
        coverUrl: fenderTelecasterCover,
        bio: "Founded by Leo Fender in Fullerton, California in 1946, Fender Musical Instruments Corporation invented the solid-body electric guitar (the Telecaster, 1950), the electric bass guitar (the Precision Bass, 1951), and the Stratocaster (1954) — instruments that became the foundation of modern popular music. Today Fender designs and manufactures guitars, basses, amplifiers, and gear played by everyone from first-time students to the world's most recorded artists.",
      },
      {
        name: "Andy Baxter Bass",
        affiliateUrl: "https://www.andybaxterbass.com/",
        aboutUrl: "https://www.andybaxterbass.com/",
        logoUrl: andyBaxterLogo,
        bio: "Andy Baxter Bass & Guitars is a London-based dealer specializing in vintage and second-hand basses — Fender, Music Man, Rickenbacker, Höfner, Wal, Alembic, and the rare boutique pieces working bassists actually want. Andy Baxter himself is a touring bassist, and the shop's listings are written by players, for players, with detail on weight, electronics, and feel that mainstream retailers don't bother with.",
      },
      {
        name: "Reverb",
        affiliateUrl: "https://reverb.com/marketplace?query=1976%20fender%20precision%20bass",
        aboutUrl: "https://reverb.com/",
        logoUrl: reverbLogo,
        bio: "Launched in Chicago in 2013 by Music Makers founder David Kalt, Reverb is the global online marketplace dedicated to making, buying, and selling music gear. Tens of thousands of dealers and individual sellers list new, used, vintage, and handmade instruments, amps, effects, recording gear, and parts. Buyer protection, transparent pricing data via the Reverb Price Guide, and music-specialist customer support are core to the platform.",
      },
    ],
  },
  "i-drums-gretsch-kit": {
    id: "i-drums-gretsch-kit",
    name: "Gretsch USA Custom Kit",
    category: "Drum Kit",
    shortCategory: "Drums",
    photoUrl: gretschKitPhoto,
    about:
      "Gretsch's USA Custom is built in Ridgeland, South Carolina — 6-ply maple/gum shells with the legendary Gretsch \"silver sealer\" interior. The studio kit of choice for players who want round, focused, recording-ready tone.",
    artistNote:
      "22\" kick, 13\" rack, 16\" floor. Calf heads on the toms for a softer attack.",
    vendors: [
      {
        name: "Gretsch Drums",
        affiliateUrl: "https://www.gretschdrums.com/series/usa-custom",
        aboutUrl: "https://www.gretschdrums.com/",
        logoUrl: gretschDrumsLogo,
        bio: "Founded in Brooklyn in 1883 by 27-year-old German immigrant Friedrich Gretsch, Gretsch is one of the oldest American musical instrument makers — and \"That Great Gretsch Sound\" has anchored jazz, country, and rock recordings for well over a century. USA Custom drums are still built in Ridgeland, South Carolina using the company's classic 6-ply maple/gum shells, 30-degree bearing edges, and the legendary silver-sealer interior.",
      },
      {
        name: "Sweetwater",
        affiliateUrl: "https://www.sweetwater.com/c1066--Gretsch_Drums",
        aboutUrl: "https://www.sweetwater.com/",
        logoUrl: sweetwaterLogo,
        bio: "Started by Chuck Surack out of a VW bus in 1979, Sweetwater is now the largest online retailer of musical instruments and pro-audio gear in the United States, headquartered on a 175-acre campus in Fort Wayne, Indiana. Every customer is assigned a personal Sales Engineer — a working musician trained to give real advice — and every guitar over $299 receives a complimentary 55-Point Inspection by Sweetwater's Guitar Gallery before it ships.",
      },
      {
        name: "Bentley's Drum Shop",
        affiliateUrl: "https://bentleysdrumshop.com/collections/gretsch-drums",
        aboutUrl: "https://bentleysdrumshop.com/",
        logoUrl: bentleysLogo,
        bio: "Bentley's Drum Shop has served Fresno, California and the touring/recording community since 1962 — a true drummer's drum shop. The Bentley family stocks deep across kits, snares, cymbals, hardware, and hand percussion from the major makers and the boutique builders, and runs a repair and restoration department for vintage drums.",
      },
    ],
  },
  "i-perc-lp-congas": {
    id: "i-perc-lp-congas",
    name: "LP Matador Series Congas",
    category: "Hand Percussion",
    shortCategory: "Percussion",
    photoUrl: lpCongasPhoto,
    about:
      "The Matador Series is LP's mid-tier conga line — Siam Oak shells, traditional rims, and the rich open tone that makes them a studio standard. Used by everyone from Sheila E. to Poncho Sanchez.",
    artistNote:
      "A pair of quintos plus a bongo for the bridge fills.",
    vendors: [
      {
        name: "Latin Percussion",
        affiliateUrl: "https://lpmusic.com/collections/matador-series",
        aboutUrl: "https://lpmusic.com/",
        logoUrl: lpLogo,
        bio: "Latin Percussion was founded in 1964 by Martin Cohen, an engineer who couldn't find decent congas in New York and started building his own. Sixty years later, LP is the world's leading maker of hand percussion — congas, bongos, timbales, cowbells, shakers, and the rest of the Afro-Cuban toolkit — and the brand of choice for everyone from Tito Puente to Sheila E. to the modern session world.",
      },
      {
        name: "Sweetwater",
        affiliateUrl: "https://www.sweetwater.com/c777--Conga_Drums",
        aboutUrl: "https://www.sweetwater.com/",
        logoUrl: sweetwaterLogo,
        bio: "Started by Chuck Surack out of a VW bus in 1979, Sweetwater is now the largest online retailer of musical instruments and pro-audio gear in the United States, headquartered on a 175-acre campus in Fort Wayne, Indiana. Every customer is assigned a personal Sales Engineer — a working musician trained to give real advice — and every guitar over $299 receives a complimentary 55-Point Inspection by Sweetwater's Guitar Gallery before it ships.",
      },
      {
        name: "Drums Etc.",
        affiliateUrl: "https://www.drumsetc.com/",
        aboutUrl: "https://www.drumsetc.com/",
        logoUrl: drumsEtcLogo,
        bio: "Drums Etc. has been Charlotte, North Carolina's full-line drum shop since 1989, owned and run by drummers. Beyond kits and cymbals from every major maker, the shop is known for its hand-percussion wall — congas, djembes, cajóns, frame drums, world percussion — and a teaching studio that's brought in clinicians from across the country.",
      },
    ],
  },
};

// Per-song credits. Songs not in this map fall back to "Credits coming soon."
export const TRACK_CREDITS: Record<string, TrackCredits> = {
  // — When the World Stops —
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
    writers: [
      { name: "Timothy Michael Snider", personId: "p-tim-snider", role: "Composer" },
    ],
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

export function getCreditsForSong(songId: string): TrackCredits | undefined {
  return TRACK_CREDITS[songId];
}

// Returns every track on the same album where `personId` is credited as a performer.
export function getTracksForPerformerOnAlbum(personId: string, albumId: string): Array<{ song: Song; performer: TrackPerformer }> {
  const songs = SONGS.filter((s) => s.albumId === albumId);
  const out: Array<{ song: Song; performer: TrackPerformer }> = [];
  for (const song of songs) {
    const credits = TRACK_CREDITS[song.id];
    if (!credits) continue;
    const perf = credits.performers.find((p) => p.personId === personId);
    if (perf) out.push({ song, performer: perf });
  }
  return out.sort((a, b) => a.song.trackNumber - b.song.trackNumber);
}

export const ALBUMS: Album[] = [
  {
    id: "album-1",
    title: "When the World Stops",
    artist: "Tim Snider & Wolfgang Timber",
    artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500.png",
    year: 2024,
    type: "LP",
    description: "A sweeping collection of songs about stillness, change, and the moments between.",
    certificateNumber: 12,
  },
  {
    id: "album-2",
    title: "Guitar as a Voice",
    artist: "Fernando Perdomo",
    artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-2.png",
    year: 2024,
    type: "LP",
    description: "Instrumental mastery meets emotional storytelling. Each track a conversation without words.",
    certificateNumber: 7,
  },
  {
    id: "album-3",
    title: "Love Spell EP",
    artist: "Whitney Lyman",
    artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-1.png",
    year: 2024,
    type: "EP",
    description: "Four songs that cast a spell. Lush pop production meets deeply personal lyrics.",
    certificateNumber: 3,
  },
  {
    id: "album-4",
    title: "California Way",
    artist: "TOMMYGUNN",
    artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-3.png",
    year: 2024,
    type: "LP",
    description: "Sunshine, highways, and the stories only California can tell. A West Coast state of mind.",
    certificateNumber: 21,
    ownedCertificates: [21, 47, 88],
    purchases: [
      { num: 21, price: 12.0, date: "Aug 30, 2024" },
      { num: 47, price: 12.0, date: "Sep 14, 2024" },
      { num: 88, price: 14.0, date: "Nov 02, 2024" },
    ],
    videos: [
      {
        id: "vid-4-1",
        title: "Pacific Drive — Venice Beach",
        thumbnail: tgVideo1Thumb,
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        duration: "3:28",
      },
      {
        id: "vid-4-2",
        title: "Live at The Corktown",
        thumbnail: tgVideo2Thumb,
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
        duration: "5:12",
      },
      {
        id: "vid-4-3",
        title: "Stage Lights — Full Set",
        thumbnail: tgVideo3Thumb,
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        duration: "5:11",
      },
    ],
    photos: [
      { id: "p-4-1", url: tgPhoto1, caption: "In the studio" },
      { id: "p-4-2", url: tgPhoto2, caption: "Backstage" },
      { id: "p-4-3", url: tgPhoto3, caption: "On the road" },
      { id: "p-4-4", url: tgPhoto4, caption: "Alleyway portrait" },
      { id: "p-4-5", url: tgPhoto5, caption: "Up close" },
    ],
  },
  {
    id: "album-5",
    title: "Love Life Tragedy",
    artist: "Nick Carter",
    artwork: nickCarterAlbumCover,
    year: 2025,
    type: "LP",
    description:
      "Love. Life. Tragedy. And everything in between. Nick Carter's most personal album to date is finally here — a raw, reflective collection of pop-rock anthems and heartfelt ballads, capturing the highs and heartbreaks of a life lived in the spotlight. With tracks like \u201CStorms,\u201D \u201CCold Night,\u201D and \u201CHurts To Love You,\u201D this album dives deep \u2013 and comes back stronger.",
  },
];

export const SONGS: Song[] = [
  {
    id: "song-1-1",
    albumId: "album-1",
    title: "The Quiet Before",
    trackNumber: 1,
    duration: 214,
    lyrics: `[Verse 1]\nIn the space between the seconds\nWhere the clocks forget to breathe\nI found a version of the stillness\nThat I never thought to seek\n\n[Pre-Chorus]\nAnd the world was holding something\nAnd I didn't know the name\n\n[Chorus]\nWhen the world stops, I'll be here\nWhen the world stops, I'll be near\nIn the silence that surrounds us\nIn the peace that comes to ground us\nWhen the world stops\n\n[Verse 2]\nThere's a light beyond the mountains\nAnd a song inside the rain\nAnd I've been chasing all the echoes\nOf a life I can't explain\n\n[Chorus]\nWhen the world stops, I'll be here\nWhen the world stops, I'll be near\nIn the silence that surrounds us\nIn the peace that comes to ground us\nWhen the world stops`,
  },
  {
    id: "song-1-2",
    albumId: "album-1",
    title: "Paper Sky",
    trackNumber: 2,
    duration: 198,
    lyrics: `[Verse 1]\nFolded dreams on a paper sky\nWatching clouds that never ask you why\nEvery crease a memory sealed\nEvery line a wound that time has healed\n\n[Chorus]\nPaper sky, you hold my story\nPaper sky, in all your glory\nTear the edges, let the light in\nPaper sky, where do I begin\n\n[Bridge]\nAnd if the rain should come and soften\nAll the words I've written there\nI'll fold another, start again\nWith the same but lighter air`,
  },
  {
    id: "song-1-3",
    albumId: "album-1",
    title: "River North",
    trackNumber: 3,
    duration: 241,
    lyrics: `[Verse 1]\nHeading north where the river bends\nWhere the old road meets its ends\nGot a map that's out of date\nAnd a heart that's running late\n\n[Chorus]\nRiver North, carry me through\nRiver North, I'm coming to you\nPast the valleys, past the stone\nRiver North, I'm almost home\n\n[Verse 2]\nSaw a heron in the morning\nStanding still as frozen time\nReminded me of all the patience\nThat I left somewhere behind`,
  },
  {
    id: "song-1-4",
    albumId: "album-1",
    title: "Anchor",
    trackNumber: 4,
    duration: 187,
    lyrics: `[Verse 1]\nYou are my anchor in the gray\nWhen the tide would take me away\nI've been drifting all my life\nThrough the calm and through the strife\n\n[Chorus]\nBut you anchor me down\nYou anchor me here\nEvery time I'm drowning\nYou make the surface clear\nYou anchor me, anchor me`,
  },
  {
    id: "song-1-5",
    albumId: "album-1",
    title: "Last Light",
    trackNumber: 5,
    duration: 223,
    lyrics: `[Verse 1]\nStand here in the last light\nWatch the day surrender gold\nEvery dusk a story\nEvery dusk a story told\n\n[Chorus]\nLast light on the water\nLast light on your face\nLast light of the summer\nFilling every space\n\n[Outro]\nAnd as the light fades slowly\nAnd the stars begin to show\nI'm grateful for the moments\nThat only twilight knows`,
  },
  {
    id: "song-1-6",
    albumId: "album-1",
    title: "When the World Stops",
    trackNumber: 6,
    duration: 265,
    lyrics: `[Verse 1]\nTitle track. Full circle, everything we said\nEverything we meant and didn't mean\nLaid out in the open like a bed\nOf flowers that nobody's ever seen\n\n[Chorus]\nWhen the world stops turning\nAnd the clocks stop running\nAnd there's nothing left to prove\nI'll still be here loving you\nWhen the world stops`,
  },

  {
    id: "song-2-1",
    albumId: "album-2",
    title: "First Conversation",
    trackNumber: 1,
    duration: 193,
    lyrics: `[Instrumental]\nNo words needed. The guitar speaks what language cannot.\n\nFernando Perdomo - guitar\nRecorded live in one take.`,
  },
  {
    id: "song-2-2",
    albumId: "album-2",
    title: "Dialogue in Blue",
    trackNumber: 2,
    duration: 247,
    lyrics: `[Instrumental]\nA conversation between melody and harmony.\nTwo voices, one instrument.\n\nArranged and performed by Fernando Perdomo.`,
  },
  {
    id: "song-2-3",
    albumId: "album-2",
    title: "Confession",
    trackNumber: 3,
    duration: 178,
    lyrics: `[Instrumental]\nSometimes the things you can't say out loud\nFind their way through six strings\nand the space between the notes.\n\nFernando Perdomo - acoustic guitar`,
  },
  {
    id: "song-2-4",
    albumId: "album-2",
    title: "The Answer",
    trackNumber: 4,
    duration: 209,
    lyrics: `[Instrumental]\nEvery question deserves an answer.\nThis is mine.\n\nFernando Perdomo - guitar, producer`,
  },
  {
    id: "song-2-5",
    albumId: "album-2",
    title: "Soliloquy",
    trackNumber: 5,
    duration: 234,
    lyrics: `[Instrumental]\nA solo piece in every sense of the word.\nAlone with the music. Alone with the meaning.\n\nFernando Perdomo`,
  },

  {
    id: "song-3-1",
    albumId: "album-3",
    title: "Love Spell",
    trackNumber: 1,
    duration: 197,
    lyrics: `[Verse 1]\nYou walked in like a summer storm\nChanged the shape of everything I thought I knew\nI was standing in the calm before\nAnd then I only wanted you\n\n[Pre-Chorus]\nCast it on me, cast it on me\nI don't mind if I can't break free\n\n[Chorus]\nYou put a love spell on me\nSomething I can't see\nEvery single word you say\nPulls me more your way\nYou put a love spell on me\nAnd I'm falling willingly\nInto everything you are\nMy lucky star\n\n[Verse 2]\nThere's a magic in the way you move\nLike the universe is guiding every step\nAnd I've been searching for the proof\nThat love is more than what I've kept`,
  },
  {
    id: "song-3-2",
    albumId: "album-3",
    title: "Golden Hour",
    trackNumber: 2,
    duration: 211,
    lyrics: `[Verse 1]\nWrap me in the golden hour light\nWhere the soft meets the bright\nAll the edges of the world go warm\nIn this small beautiful storm\n\n[Chorus]\nGolden hour, golden hour\nMake this moment last\nGolden hour, golden hour\nBefore it slips too fast\n\n[Bridge]\nPhotographs can't hold it\nMemory can't fold it\nOnly love can keep the golden alive`,
  },
  {
    id: "song-3-3",
    albumId: "album-3",
    title: "Magnetic",
    trackNumber: 3,
    duration: 188,
    lyrics: `[Verse 1]\nNorth and south, push and pull\nBetween us nothing's neutral\nEvery time I try to step away\nYou pull me back, what can I say\n\n[Chorus]\nMagnetic, you and I\nMagnetic, I won't deny\nNo matter what direction that I go\nYou're always where I end up, don't you know\n\n[Post-Chorus]\nPull me in, let me go\nPull me in, you already know`,
  },
  {
    id: "song-3-4",
    albumId: "album-3",
    title: "Still Here",
    trackNumber: 4,
    duration: 224,
    lyrics: `[Verse 1]\nAfter all the seasons we have been\nThrough the in-between\nAll the chapters that we wrote and crossed\nAll the things we've won and lost\n\n[Chorus]\nAnd I'm still here\nStill standing in your light\nStill here\nGetting through the night\nAll the storms have cleared\nAnd I'm still here\n\n[Outro]\nStill here with you\nStill believing it's true\nThat we were made for this\nEvery little bit`,
  },

  {
    id: "song-4-1",
    albumId: "album-4",
    title: "Pacific Drive",
    trackNumber: 1,
    duration: 208,
    lyrics: `[Verse 1]\nWindows down on the PCH\nSun burning through the morning haze\nGot the stereo up and nowhere to be\nJust the road and the ocean and me\n\n[Chorus]\nPacific drive, I'm alive\nOn this coast where the dreams survive\nEvery mile a story to tell\nOn the California spell\n\n[Verse 2]\nSeagulls tracing invisible lines\nMalibu in the rearview signs\nHeading south but I don't know why\nJust chasing that California sky`,
  },
  {
    id: "song-4-2",
    albumId: "album-4",
    title: "Venice Beach",
    trackNumber: 2,
    duration: 195,
    lyrics: `[Verse 1]\nSkateboards on the boardwalk\nArtists painting futures on the wall\nEverybody's got a story here\nEverybody answers to the call\n\n[Chorus]\nVenice Beach, you taught me something\nVenice Beach, you showed me free\nAll the colors of your people\nPainting who I want to be\n\n[Bridge]\nThe sun sets in the Pacific\nAnd the lights come on the strand\nAnd for a second everything is perfect\nIn this wild and golden land`,
  },
  {
    id: "song-4-3",
    albumId: "album-4",
    title: "Canyon Road",
    trackNumber: 3,
    duration: 231,
    lyrics: `[Verse 1]\nWinding up the canyon road\nWhere the redwoods touch the clouds\nFar from all the city noise\nFar from all the city crowds\n\n[Chorus]\nCanyon road, take me higher\nCanyon road, light my fire\nWhere the eagles soar and the rivers talk\nOn this ancient canyon walk\n\n[Verse 2]\nThere are voices in the ancient stone\nThere are songs in the silent breeze\nAnd I've been listening all my life\nFor exactly this—for exactly these`,
  },
  {
    id: "song-4-4",
    albumId: "album-4",
    title: "Sunset Strip",
    trackNumber: 4,
    duration: 212,
    lyrics: `[Verse 1]\nNeon signs and broken dreams\nNothing here is what it seems\nBut I love it all the same\nThis city's always been my flame\n\n[Chorus]\nSunset Strip, you never sleep\nSunset Strip, your promises keep\nFor every star that fell and rose\nOn this boulevard that never slows\n\n[Bridge]\nAnd when the night is done\nAnd the Strip goes home\nI'll still be here\nCalling this my own`,
  },
  {
    id: "song-4-5",
    albumId: "album-4",
    title: "California Way",
    trackNumber: 5,
    duration: 248,
    lyrics: `[Verse 1]\nThis is the California way\nDream it in the light of day\nChase it down the golden road\nTill you find what you've been owed\n\n[Chorus]\nCalifornia way, California way\nEverything is gonna be okay\nJust live it and breathe it\nBelieve it today\nThe California way\n\n[Outro]\nSunshine on the mountain\nMoonlight on the bay\nEverything I've ever wanted\nIn the California way`,
  },
];

// --- Nick Carter — Love Life Tragedy (album-5) ---
// Audio is streamed directly from Dropbox via dl.dropboxusercontent.com,
// which serves audio/x-wav with proper HTTP Range support so the <audio>
// element can seek. Links below were refreshed 2026-05-13 after the prior
// shared-folder rlkeys expired.
const NC_BASE = "https://dl.dropboxusercontent.com/scl/fi";
const NICK_CARTER_TRACKS: Array<{ title: string; path?: string; rlkey?: string }> = [
  { title: "Made for Us", path: "x2g5scvmvraplv7ivvfze/Nick-Carter-Made-For-Us-REMASTER_4824.wav", rlkey: "e4fcygvoxqbuzmoh6eh115tma" },
  { title: "Nothing Without Your Love", path: "fqic08najjyppkui53rkn/Nick-Carter-Nothing-Without-Your-Love-MASTER_4824.wav", rlkey: "7undfka2sgvhjsa9j4c7nylks" },
  { title: "Good Love", path: "w298zyauorr51pw7z8dez/Good-Love-24Bit-Master.wav", rlkey: "i0fdrur2a2m0nzojxvuxlp0ol" },
  { title: "Hey Kid", path: "zku3e5jle91km7hilila3/Nick-Carter-Hey-Kid-MASTER_4824.wav", rlkey: "asfsln611yz69czzxm03fft0p" },
  { title: "Searchlight", path: "qb7noy2utdoosuoc4fmaf/Nick-Carter_Searchlight_REMASTER-2_4824.wav", rlkey: "j0l7jpiq9gckfg9gpe1mipdc8" },
  { title: "Never Break My Heart (Not Again)", path: "wfgbzfeolf7ge7w2xva73/Never-Break-My-Heart-6-24Bit-Master.wav", rlkey: "01gwmcwusph1gyhqfvru3addq" },
  { title: "Easy (Home Version)", path: "poak2tr8vwgmvrshpsubi/Easy-4-24Bit-Master.wav", rlkey: "fj05djtj8rsecwt26ebp53hvb" },
  { title: "Hurts to Love You (Remastered 2025)", path: "1k52fuvihhc46ojfh050z/Nick-Carter-Hurts-To-Love-You-REMASTER_BMN_4424.wav", rlkey: "xaom3s7la4duq3uqyk6acwfiz" },
  { title: "Superman", path: "ffvy2hhhrm24wvd2h6bz2/Superman-2-24Bit-Master.wav", rlkey: "lmczfrl1sma22qdy4eb9u6ps5" },
  { title: "Dirty Laundry (feat. ASHBA)", path: "lse9iode84uf5tnfrb7b5/Dirty-Laundry-2-24Bit-Master.wav", rlkey: "iw8fln52ylj337ug7rpoffyzx" },
  { title: "Wild Heart", path: "a6dyofc0e47hg23st9xu4/Wildhearts-2-24Bit-Master.wav", rlkey: "9v2b7qlmgu0isembnmckdtui6" },
  { title: "Cold Night (Zero Degrees)", path: "tka7p4i1d9th0wdw9uztf/Cold-NIght-7-24Bit-Master.wav", rlkey: "yig44bx56xhzrqrgtpb803735" },
  { title: "Storms", path: "1u8gvmfgg0wywoqcncf8n/Nick-Carter-Storms-MASTER_4824.wav", rlkey: "kyou2jrlgrlaabaqtl6wp4kfn" },
  { title: "Don\u2019t Let Go", path: "ta9c8yc6qetlm2vhsfstf/Nick-Carter-Don-t-Let-Go-MASTER_4824.wav", rlkey: "1fhaldrlmileb8dhyrjm13e95" },
  { title: "Cold Night (Winter Mix)", path: "c2rlithw8qctt6ax0ezcm/Cold-Night-acoustic-version-24Bit-Master.wav", rlkey: "5ovbhhdt6t3c05sc9nxrsyozc" },
  { title: "Help Me (Re - Record)", path: "h6gaatvz8yoo6e5gs29yg/Nick_Carter_01_Help_Me_HRA_24bit_96kHz_042925.wav", rlkey: "zowno7rvvhn86n100v9uhxbf8" },
  { title: "Take You with Me (Bonus Track)", path: "sbmp7eo3dyvzjksr3sabo/Nick-Carter-Take-Me-With-You_MASTER-v0.wav", rlkey: "dfutyuccz5squrpa29jc9bzpc" },
];

// Lyrics for Nick Carter — Love Life Tragedy (album-5).
// Provided by the artist as PDF/DOCX documents and parsed at build time.
const NC_LYRICS: Partial<Record<string, string>> = {
  "song-5-1": "V1\nMoonlight\nTwo hearts\nBeat closer than they did before\n\nYou and I\nFrom the start\nHad something but we wanted more\n\nPRE1\nAlways said maybe in another life\nYeah, I could be your love and baby you could be mine\nOne time, once the sun comes up its over\n\nBut before its over\u2026.\n\nCHORUS\nHold on and make me believe in a world that never was\nHold on and take me cuz baby tonight was made for us\nWe\u2019re flying over the angels, and dancing to the edge of the night\nHold on and make me believe in a world that never was\nMade for us\n\nV2\nDont stop\nStay close\nI promise that I\u2019ll never let\n\nYou get\nToo far\nThis touch is what we\u2019re living in\n\nPRE2\nNow we\u2019re running like the rain on fire\nSlow motion every moment in the blink of an eye\nOne night, once the sun comes up its over\nBut before its over\n\nCHORUS\n\nBRIDGE\nWere flying over the angels\n\nAnd dancing to the edge of the night\nYou\u2019ve given all of your halos\nAnd without you I can\u2019t survive\n\nSo\u2026..\n\nCHORUS\n\n\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026",
  "song-5-2": "V1\nStreet light, caught you\nDancing in the dark alone\n\nBreak lights, rearview\nDriving by to see you more\n\nPRE\nI gotta know you more so I get out of the car\nNow we\u2019re standing in a line for another dirty bar\n\nCHORUS\nYeah I\u2019ve been waiting\nTo call you baby\nCuz Now I\u2019m nothing without your love\nIt\u2019s underrated\nThat kiss you gave me\nAnd now I\u2019m nothing without your love\nI feel it in my head\nNo controlling it\nNow I cant forget\nI\u2019m nothing without your love\nI kinda hate it\nI need you baby\nYeah Now Im nothing without your love\n\nV2\nSweet smoke, in the back room\nPretending not to see you go\n\nYou left me too soon\nNow I cant help but long for more\n\nPRE\nI gotta get you back, like an 80s movie scene\nCant forget about you, don\u2019t you forget about me\n\nCHORUS\n\nBRIDGE\nNow I cant stop playing\nthe song you were singing on the boombox stereo\n\nIt was the best sound ever\nthe night we were together and you wrote every note\nI gotta let you know\n\nCHORUS\n\n\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026..",
  "song-5-3": "Verse 1\n\nToday feels a little different\n\nlike the moment feels right\n\nfeels a little different\n\nLike the sun changed overnight\n\nwhen there's too much going on\n\nyou've been singing too many sad songs\n\nit's time to take it back\n\noh I gotta take you back\n\nHook\n\nlet me give you that good love\n\nwhen your heart's giving up\n\nI\u2019m gonna give you that good\n\nwhen enough is enough\n\nwhen there's too much going on\n\nYou been singing too many sad songs\n\nI\u2019m going to take you back\n\nOh I'm gonna take you back\n\ntake you back to that good love good love baby\n\n(ohh ohh ohh ohh oh )\n\nI\u2019m gonna give you that good love good love baby\n\n(ohh ohh ohh ohh oh)\n\ncause it's too much going on you been singing too many sad songs\n\nlet me take you back\n\noh it's time to get back\n\nVerse 2\n\ntoday feels a little different\n\nLike the morning feels right\n\nFeels a little different\n\nI can see you shining your light\n\ncause it's too much going on\n\nAnd you been singing too many sad songs\n\nI\u2019m gonna take you back\n\noh I'm gonna take you back\n\nHook\n\nHook\n\nlet me give you that good love\n\nwhen your heart's giving up\n\nI\u2019m gonna give you that good\n\nwhen enough is enough\n\nwhen there's too much going on\n\nYou been singing too many sad songs\n\nI\u2019m going to take you back\n\nOh I'm gonna take you back\n\ntake you back to that good love good love baby\n\n(ohh ohh ohh ohh oh )\n\nI\u2019m gonna give you that good love good love baby\n\n(ohh ohh ohh ohh oh)\n\ncause it's too much going on you been singing too many sad songs\n\nlet me take you back\n\noh it's time to get back\n\nVamp Hook\n\nwhen your love is gone and you can't carry on\n\nbaby count on me I'll give you good love\n\nwhen your love is gone\n\nAnd you can't carry on\n\nI'll give I'll give\n\nwhen your love is gone and you can't carry on\n\nbaby count on me I'll give you good love\n\nwhen your love is gone\n\nAnd you can't carry on\n\nI'll give I'll give give you good love",
  "song-5-5": "Every darkness has a day\nJust like every heartache has a break\nJust like me to think it wouldn\u2019t happen to me and you\n\nThe love we had fell away\nFeel it streaming down, down my face\nEvery drop I gave you could\u2019ve filled a swimming pool\n\nNow you say you wanna come back\nAnd I wanna try so bad\nBut I gave you all that I had\nNow I got nothing left\n\nBaby tonight\nCant get you out my mind\nSomeone tell me why cant I find one more tear to cry?\n\nBaby tonight\nCant hear you say goodbye\nSomeone tell me why cant I find one more tear to cry?\nSend out a searchlight\n\nSend out, send out a searchlight\nSend out, send out a searchlight\nSend out, send out a searchlight\nFor one more tear to cry\n\nYoure the air I wanna breathe\nYoure my everything, I believe\nI did everything every inch, all of it for you and me\n\nI said I wont go back again\nThe touch of your skin, a kiss then you\u2019re pulling me in\n\nYou say you wont leave me again\nNow Im seeing red\nCuz I know that this is the end tonight\n\nBaby tonight\nCant get you out my mind\nSomeone tell me why cant I find one more tear to cry?\n\nBaby tonight\nCant hear you say goodbye\nSomeone tell me why cant I find one more tear to cry?\nSend out a searchlight\n\nSend out, send out a searchlight\nSend out, send out a searchlight\nSend out, send out a searchlight\nFor one more tear to cry\n\nSend out, send out a searchlight\nSend out, send out a searchlight\nSend out, send out a searchlight\nFor one more tear to cry\n\nNo more, one more tear to cry\nNo more, I gave you all mine\nNo more, all this love went dry\n\nNo more, one more tear to cry\nNo more, one last goodbye\nNo more, no matter how hard I try\n\nBaby tonight\nCant get you out my mind\nSomeone tell me why cant I find one more tear to cry?\n\nBaby tonight\nCant hear you say goodbye\nSomeone tell me why cant I find one more tear to cry?\nSend out a searchlight\n\nSend out, send out a searchlight\nSend out, send out a searchlight\nSend out, send out a searchlight\nFor one more tear to cry\n\nSend out, send out a searchlight\nSend out, send out a searchlight\nSend out, send out a searchlight\nFor one more tear to cry",
  "song-5-6": "NEVER BREAK MY HEART (Not Again)\n\nI know\nThat me and you were never meant to be\nBut the real enemy beats inside of me\nHow could you let me down?\nBut it's not your fault, it's what my heart allow\n\nI can't take this\nFeel like I'm breaking down, ooh\nWhat I thought was true happiness was a lie\nSo the next time won't be next time\nI'm telling you\n\nYou'll never break my heart\nYou'll never never break my heart\nMy heart again, not again (no, no)\nYou'll never break my heart\nYou'll never, never, break my heart\nMy heart again, not again\n'Cause I gave up on love\nIt's the thing that's frail to me\nNext one would never do what you did to me\nI swear we love that type of chemistry (no, no)\nYou'll never break my heart\nYou'll never, never, break my heart\nMy heart again, not again\n\nYou'll never, ever, ever, break my heart again\nYou'll never, ever, ever, break my heart again\nNot again\n\nThe late night fight I let you win, right?\nJust to hear you're not gonna be alright\nI wish I'd let it go but I just wanted more\nI don't know why I got to stay with you\nThinking to myself I got to see you through\nYou're never what I need\nI don't need your sympathy, no\n\nI can't take this\nFeel like I'm breaking down, ooh\nWhat I thought was true happiness was a lie\nSo the next time won't be next time\nI'm telling you\n\nYou'll never break my heart\nYou'll never, never, break my heart\nMy heart again, not again (yeah, yeah)\nYou'll never break my heart\nYou'll never, never, break my heart\nMy heart again, not again\n'Cause I gave up on love\nIt's the thing that's frail to me\nNext one would never do what you did to me\nI swear we love that type of chemistry (no, no)\nYou'll never break my heart\nYou'll never, never, break my heart\nMy heart again (nah-ah), not again (oh, yeah)\n\nYou'll never, ever, ever, break my heart again\nYou'll never, ever, ever, break my heart again\nNot again\n\nOh, no, no\nOh, no, no\nNot again, not again, not again\n\nYou'll never break my heart\nYou'll never, never, break my heart\nMy heart again, not again (no, no)\nYou'll never break my heart\nYou'll never, never, break my heart\nMy heart again, not again\n\nYou'll never, ever, ever, break my heart again\nNot again\nYou'll never, ever, ever, break my heart again\nNot again",
  "song-5-7": "EASY (home Version)\n\nverse 1\n\nAt 7:30 in the morning I smell eggs over easy\n\nin those pajamas that you like girl\n\nLil mama knows how to please me\n\nI hear the kids waking up screaming mom and daddy where you at (downstairs)\n\ngive her a kiss on the cheek as she winks said I'll see you later on\n\n(Hell Yeah)\n\nHook\n\nI swear that you got something special love\n\nThat comes from up above\n\nI'll never give you up\n\nBecause you make this\n\nyou make this look easy\n\n(ohh ohh ohh)\n\nyou make this look easy\n\n(ohh ohh ohh)\n\nand how you do everything with style and grace\n\nI thank God that you're for me\n\n(yeah yeah yeah)\n\ncause you make it easy to love you\n\n(easy to love you easy to love you easy to love you baby\n\nEasy to love you easy to la la la la love you baby )\n\nVerse2\n\nat 7:30 in the evening got off of work for the weekend\n\ngirl I know what you've been thinking\n\nyou grabbed the wine for the drinking\n\noops almost forgot get the kids off the bed 'cause tonight it's you and me (hell yeah)\n\nand then she pulled me on the couch whispered in my ear you ain't playing fair (nah yeah)\n\nHook\n\nI swear that you got something special love\n\nThat comes from up above\n\nI'll never give you up\n\nBecause you make this\n\nyou make this look easy\n\n(ohh ohh ohh)\n\nyou make this look easy\n\n(ohh ohh ohh)\n\nand how you do everything with style and grace\n\nI thank God that you're for me\n\n(yeah yeah yeah)\n\ncause you make it easy to love you\n\n(easy to love you easy to love you easy to love you baby\n\nEasy to love you easy to la la la la love you baby )\n\nand how you do everything with style and grace\n\nI thank God that you're for me\n\n(yeah yeah yeah)\n\ncause you make it easy to love you\n\n( can you say la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la la love you)\n\nAt 7:30 in the morning I smell eggs over easy\n\nin those pajamas that you like girl\n\nLil mama knows how to please me",
  "song-5-8": "Hurts To Love You\n\n(Nick Carter/Tommy Lee James/Stuart Crichton)\n\nFelt like we went through some wars together\n\nNobody else could understand\n\nWay too many nightmares to remember\n\nBut that was real life back then\n\nAlways hoped your tomorrows\n\nWould be better than the days before\n\nI hoped you\u2019d find a road to follow\n\nTo a place you were happy in this world\n\nCause it hurts to love you but I love you still\n\nMiss you with all my heart you know I always will\n\nAlways prayed for peace somehow your soul could feel\n\nYou know it hurts to love you but I love you still\n\nHurts to love you\n\nIt\u2019s hard to let go of the anger\n\nI know for me it took some time\n\nSometimes the darkness lasts forever\n\nFeels like the light won\u2019t ever shine\n\nAlways hoped your tomorrows\n\nWould be better than the days before\n\nI hoped you\u2019d find a road to follow\n\nTo a place you were happy in this world\n\nCause it hurts to love you but I love you still\n\nMiss you with all my heart I know I always will\n\nAlways prayed for peace somehow your soul could feel\n\nYou know it hurts to love you but I love you still",
  "song-5-9": "In a flash, he was running 'round, burning down to the ground\nEverything in this same old town\nNever thinking what it would do to you\nA selfish lie to your eyes made you cry, and had you falling from the sky\nMasking all these feelings to make it through\n\nNow I'm exposed, my armor's broke\nCan I still save the day?\n\nI ain't nobody's superhero, but I can be your Superman\nYou might think your heart is kryptonite, but I'm the one who's drained\nYou know that all I want to do is rescue you from this burning place of pain\nI ain't nobody's superhero, but I can be your Superman\n\nOh-oh, oh-oh-oh, oh-oh, oh-oh-oh, oh-oh, oh-oh, oh-oh, oh (oh)\nOh-oh, oh-oh-oh, oh-oh, oh-oh-oh (oh), oh-oh, oh-oh, oh-oh, oh (oh)\n\nNow my fall from grace was just a little late to rescue you\nDodging the speeding bullets to get to you\nI guess there's nothing that I can do (why?)\nBut if I can take the criticism and the rocks aimed to hit ya\nWhat if it doesn't weaken me\nI guess there's nothing there left to prove\n\nNow I'm exposed, my armor's broke\nCan I still save the day?\n\nI ain't nobody's superhero, but I can be your Superman\nYou might think your heart is kryptonite, but I'm the one who's drained\nYou know that all I want to do is rescue you from this burning place of pain\nI ain't nobody's superhero, but I can be your Superman, oh\n\nI'm yours\nI'm only human, but I'm yours\nI never thought I was a superhero\n\nI ain't nobody's superhero, but I can be your Superman\nI know you think your heart is kryptonite, but I'm the one who's drained\nYou know that all I want to do is rescue you from this burning place of pain\nI never thought I was a superhero, but I can be your Superman\n\nOh-oh, oh-oh-oh, oh-oh, oh-oh-oh, oh-oh, oh-oh, oh-oh, oh (oh)\nI can be your Superman\nOh-oh, oh-oh-oh, oh-oh, oh-oh-oh, oh-oh, oh-oh, oh-oh, oh (oh)",
  "song-5-10": "Verse 1\n\nI make my living off the evening news\n\njust give me something something I can use\n\npeople love it when you lose\n\nThey love dirty laundry\n\nWell I could've been an actor but I wound up here\n\nI just have to look good I don't have to be clear\n\nComing and whisper in my ear\n\nGive us dirty laundry\n\nHook\n\nkick them when they're up\n\nKick them when they're down\n\nKick them when they're up kick them when they're down\n\n(dirty laundry dirty laundry)\n\nkicking with they're up kicking when they're down kicking when they're up kick them all around\n\n(dirty laundry dirty laundry)\n\nVerse 2\n\nwe got the bubble headed bleach blonde comes on at five\n\nshe can tell you 'bout the plane crash with a gleam in her eye\n\nit's interesting when people die\n\ngive us dirty laundry\n\nHook\n\nkick them when they're up\n\nKick them when they're down\n\nKick them when they're up kick them when they're down\n\n(dirty laundry dirty laundry)\n\nkicking with they're up kicking when they're down kicking when they're up kick them all around\n\n(dirty laundry dirty laundry)\n\n(Kick 'em when their down\n\nKick 'em when their down)\n\nVerse 3\n\nDirty little secrets dirty little lies\n\nwe got our dirty little fingers in everybody's pie\n\nlove to cut you down to size\n\nWe love dirty laundry\n\n(yeah yeah)\n\nwe can do the innuendo\n\nwe can dance and sing\n\nwhen it's said and done we haven't showed you a thing\n\nwe all know that crap is King\n\nGive us dirty laundry\n\nHook\n\nkick them when they're up\n\nKick them when they're down\n\nKick them when they're up kick them when they're down\n\n(dirty laundry dirty laundry)\n\nkicking with they're up kicking when they're down kicking when they're up kick them all around\n\n(dirty laundry dirty laundry)\n\nBridge\n\nYeah Yeah Yeah\n\nohh gonna kick you when you're down\n\ngonna kick you when you're down\n\nI know you feel it\n\nI know you feel it\n\nYou gotta deal with it now\n\nYou gotta kick 'em when their down\n\nYou gotta kick 'em when their down\n\nYeah yeah ahh ahh ahhh\n\nCome on\n\n(Dirty Laundry Dirty Laundry)\n\nYeah Yeah Yeah\n\nHook\n\nkick them when they're up\n\nKick them when they're down\n\nKick them when they're up kick them when they're down\n\n(dirty laundry dirty laundry)",
  "song-5-11": "Wild Heart\n\nVerse 1\n\nshots heard two hearts dead on the scene\n\nshoot out bloodbath a casualty\n\nI placed your love in front of me\n\nLet you take the bullet for it even though I knew I pulled it\n\nAnd I knew it was over before we said it was over\n\nbut I was so loved drunk that I tried to play it sober for her for her\n\nbut eventually we would be\n\nThe winners of losers don't you agree\n\nHook\n\nshe got me with a wild heart\n\nSomebody with a quick draw yeah\n\ncause her poker face will break your heart\n\nand leave one poster with your love\n\nYou got me with your wild heart\n\ndidn't have to take it this far Girl\n\nthough I never meant to show my cards\n\nAnd let you ride off into the sunset\n\nVerse 2\n\nis a tug-of-war fight for something we both know will just wither away yeah\n\nTryna live up to the expectation imagination\n\nof someone that just wasn't me\n\nYou created a lie\n\nand I knew it was over before we said it was over\n\nBut I was so loved drunk that I tried to play it sober for her for her\n\nbut eventually we would be the winners of losers don't you agree?\n\nHook\n\nshe got me with a wild heart\n\nSomebody with a quick draw yeah\n\ncause her poker face will break your heart\n\nand leave one poster with your love\n\nYou got me with your wild heart\n\ndidn't have to take it this far Girl\n\nthough I never meant to show my cards\n\nAnd let you ride off into the sunset\n\nbridge\n\nnow I'm out here riding on my own\n\ntrying to find my best way back home\n\nyou got my heart feeling heavy\n\nbroke me like a levy\n\nbaby girl you know I wasn't ready\n\nI thought you was my ride or die\n\nNever thought that you would say goodbye\n\nyou got my heart feeling heavy\n\nbroke me like a levy\n\nbaby girl you know I wasn't ready\n\nHook\n\nshe got me with a wild heart\n\nSomebody with a quick draw yeah\n\ncause her poker face will break your heart\n\nand leave one poster with your love\n\nYou got me with your wild heart\n\ndidn't have to take it this far Girl\n\nthough I never meant to show my cards\n\nAnd let you ride off into the sunset",
  "song-5-12": "your frozen breath when it was cold outside\nReciting you're leaving and I almost died\nHypothermia setting in I can't lie\nCause you know that I can't live without you\n\nZero degrees will shattered my heart into pieces\npromise if you give me one more chance I'll make it better\nbetter for you\njust tell me what I gotta do\n\nit's going to be a cold cold night\nif I can have you here by my side\nwithout you ain't the same\nthere's nothing I can change\n it's gonna be a cold cold night\n\nI know you're gone but I'll still keep the fire burning\nHoping the silhouette will lead you right back to me\nBack to me\nit's gonna be a cold cold night\n\nPraying that all my angels send me back your heart\nI would give anything\nFor the end to start again\n\nAnd I try to pretend\nYou're leaving didn't affect me\nBut these tears just won't let me\n\nBut your...\nzero degrees is breaking my heart into pieces\nknowing you're hurting and no way that I can make it better\nbetter for you\njust tell me what I Gotta do\n\nit's going to be a cold cold night\nif I can have you here by my side\nwithout you ain't the same\nthere's nothing I can change\n it's gonna be a cold cold night\n\nI know you're gone but I'll still keep the fire burning\nHoping the silhouette will lead you right back to me\nBack to me\nit's gonna be a cold cold night\n\nYeah yeah\nOhh Ohh\nCold Night\nuh huh\n\nit's going to be a cold cold night\nif I can have you here by my side\nwithout you ain't the same\nthere's nothing I can change\n it's gonna be a cold cold night\n\nit's going to be a cold cold night\nif I can have you here by my side\nwithout you ain't the same\nthere's nothing I can change\n it's gonna be a cold cold night\n\nI know you're gone but I'll still keep the fire burning\nHoping the silhouette will lead you right back to me\nBack to me\nit's gonna be a cold cold night\n\nPraying that all my angels send me back your heart\nI would give anything\nFor the end to start again",
  "song-5-13": "Baby I can remember\nI wish that I could forget\nEverything that I\u2019ve been through\nAlmost every step\n\nYeah I don\u2019t know where Im going now\nBut, yeah I know where I\u2019ve been\nAnd when the thunder is rolling it sounds\njust like an old friend\n\nComing back like a ghost on the wrong side of heaven\nI wanna see bluer skies baby just for a second\n\nSo I try to raise a sail and ride the wind\nwhen the dark comes blowing in\nAnd I pray that all the pain of the hurricane\nWill wash away again someday\n\nSomewhere that last tidal wave will crash upon my shore\nBut in my heart I know there\u2019ll always be one more\nCuz all my life Ive been surrounded by the storms\n\nSomewhere on the horizon\nThe flashbulbs burn in the night\nPulling me like beacon\nOut into the spotlight\n\ncant get out of the danger\nfor anywhere safer\nAway from the chasers\nAnd all that im facing\nNo I didnt make em\nBut im gonna make it\n\nSo I try to raise a sail and ride the wind\nwhen the dark comes blowing in\nAnd I pray that all the pain of the hurricane\nWill wash away again someday\n\nSomewhere that last tidal wave will crash upon my shore\nBut in my heart I know there\u2019ll always be one more\nCuz all my life Ive been surrounded by the storms\n\n*Intrumental*\n\nComing back like a ghost on the wrong side of heaven\nI wanna see bluer skies baby just for a second\n\nSo I try to raise a sail and ride the wind\nwhen the dark comes blowing in\nAnd I pray that all the pain of the hurricane\nWill wash away again someday\n\nSomewhere that last tidal wave will crash upon my shore\nBut in my heart I know there\u2019ll always be one more\nAnd I know that its all still worth fighting for\nCuz all my life Ive been surrounded by the storms",
  "song-5-14": "V1\nStay close, till you fall asleep\nDrifting through our memories\nSomeday, yeah this all will be\nGone suddenly\n\nPre/B\nI always knew this moment wouldn\u2019t last forever\nI couldn\u2019t let myself believe\nI knew the end before the story ever started\nYou were always meant to leave\n\nSo....\n\nCHORUS\nDont ever let me go\n(Dont let go)\nDont ever let me go\n(Dont let go)\nI dont want to let you go\nI dont want to think about the end\nI still want to play pretend\n\nV2\nLittle hands, in the back seat\nFloating through the summer breeze\nGoing fast, its hard to see\nWhats in front of me\n\nI always knew this moment wouldn\u2019t last foreved\nYou were always meant to leave\n\nCHORUS x2 OUT\n\u2026\u2026\u2026\u2026\u2026.",
  "song-5-15": "your frozen breath when it was cold outside\nReciting you're leaving and I almost died\nHypothermia setting in I can't lie\nCause you know that I can't live without you\n\nZero degrees will shattered my heart into pieces\npromise if you give me one more chance I'll make it better\nbetter for you\njust tell me what I gotta do\n\nit's going to be a cold cold night\nif I can have you here by my side\nwithout you ain't the same\nthere's nothing I can change\n it's gonna be a cold cold night\n\nI know you're gone but I'll still keep the fire burning\nHoping the silhouette will lead you right back to me\nBack to me\nit's gonna be a cold cold night\n\nPraying that all my angels send me back your heart\nI would give anything\nFor the end to start again\n\nAnd I try to pretend\nYou're leaving didn't affect me\nBut these tears just won't let me\n\nBut your...\nzero degrees is breaking my heart into pieces\nknowing you're hurting and no way that I can make it better\nbetter for you\njust tell me what I Gotta do\n\nit's going to be a cold cold night\nif I can have you here by my side\nwithout you ain't the same\nthere's nothing I can change\n it's gonna be a cold cold night\n\nI know you're gone but I'll still keep the fire burning\nHoping the silhouette will lead you right back to me\nBack to me\nit's gonna be a cold cold night\n\nYeah yeah\nOhh Ohh\nCold Night\nuh huh\n\nit's going to be a cold cold night\nif I can have you here by my side\nwithout you ain't the same\nthere's nothing I can change\n it's gonna be a cold cold night\n\nit's going to be a cold cold night\nif I can have you here by my side\nwithout you ain't the same\nthere's nothing I can change\n it's gonna be a cold cold night\n\nI know you're gone but I'll still keep the fire burning\nHoping the silhouette will lead you right back to me\nBack to me\nit's gonna be a cold cold night\n\nPraying that all my angels send me back your heart\nI would give anything\nFor the end to start again",
  "song-5-16": "I wish I could define\nAll the thoughts that cross my mind\nThey seem too big for me to choose\nI don't know which ones to lose\nWhen I've fallen down so far\nI think I'll never see your light\nBouncing off of me\nShining down here from your eyes\n\nHelp me, figure out the difference\nBetween right and wrong, weak and strong\nDay and night where I belong\nHelp me, make the right decisions\nKnow which way to turn, lessons to learn\nAnd just what my purpose is here (just what my purpose is here)\n\nOh, yeah\n\nIt's like I got the signals crossed\nWith messages I can't decode\nHalf asleep, never wide awake\nI'm in a complete overload\nI've got so much information here\nAnd nothing I can really grasp\nI should know the truth\nBut I'm too afraid, so I have to ask\n\nHelp me, figure out the difference\nBetween right and wrong, weak and strong\nDay and night where I belong\nHelp me, make the right decisions\nKnow which way to turn, lessons to learn\nAnd just what my purpose is here (just what my purpose is here)\n\nI wanna know you, more than anything\nI need you, in my every dream you're there for me\nYou love me, for who I am\nNo angel, just an ordinary man\n\nHelp me figure out why I'm stuck in the middle\nTryin' to understand why I can't, why's it such a riddle\nGot my eyes crossed, thinkin' so hard\nAnd I know I'm missin' the mark\nCan you help me sort out all this information\nI'm just rackin' my brain, payin' attention\nBut I'm still lost and at all costs, I (I)\nI gotta know (I gotta know, oh, oh)\n\nHelp me, figure out the difference\nBetween right and wrong, weak and strong\nDay and night where I belong\nHelp me, make the right decisions\nKnow which way to turn, lessons to learn\nAnd just what my purpose is here (just what my purpose is here)\n\nHelp me figure out why I'm stuck in the middle\nTryin' to understand why I can't\nWhy's it such a riddle\nGot my eyes crossed (eyes crossed)\nThinkin' so hard and I know I'm missin' the mark\nCan you help me sort out all this information\nI'm just rackin' my brain, payin' attention\nBut I'm still lost and at all costs, I\nI gotta know...",
};

NICK_CARTER_TRACKS.forEach((t, i) => {
  const id = `song-5-${i + 1}`;
  SONGS.push({
    id,
    albumId: "album-5",
    title: t.title,
    trackNumber: i + 1,
    // Placeholder duration — the player overrides this with the real duration
    // from the audio element's metadata once the file loads.
    duration: 210,
    audioUrl: t.path && t.rlkey ? `${NC_BASE}/${t.path}?rlkey=${t.rlkey}&dl=1` : undefined,
    lyrics: NC_LYRICS[id],
  });
});

export function getSongsByAlbum(albumId: string): Song[] {
  return SONGS.filter((s) => s.albumId === albumId).sort(
    (a, b) => a.trackNumber - b.trackNumber
  );
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function getAlbumById(id: string): Album | undefined {
  return ALBUMS.find((a) => a.id === id);
}

export function getSongById(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}
