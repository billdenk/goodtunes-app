import tgPhoto1 from "@assets/640072642_25613245751711176_6571016117939262912_n_1778621365643.jpg";
import tgPhoto2 from "@assets/634243288_25554499034252515_5558112962991228661_n_1778621377317.jpg";
import tgPhoto3 from "@assets/659040451_18574314340025503_4062507424707663101_n_1778621388019.jpg";
import tgPhoto4 from "@assets/653387510_18568733956025503_1400116026168525714_n_1778621392486.jpg";
import tgPhoto5 from "@assets/496254517_9447895035339505_2309388181313327884_n_1778621409155.jpg";
import tgVideo1Thumb from "@assets/612548086_1270168371604759_7665130374696370589_n_1778621383526.jpg";
import tgVideo2Thumb from "@assets/629024765_18558574207025503_6255887094720167360_n_1778621397950.jpg";
import tgVideo3Thumb from "@assets/590183285_1595547188528175_2217542122704006465_n_1778621402722.jpg";

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
  type: "album" | "EP";
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
  // Outbound buy link. Treat as affiliate-aware even if it's plain for now.
  affiliateUrl: string;
}

export interface Instrument {
  id: string;
  name: string;            // e.g. "1967 Gretsch 6071 'Monkees' Bass Walnut"
  category: string;        // e.g. "Bass", "Acoustic Guitar"
  photoUrl?: string;
  artistNote?: string;     // why this instrument was chosen for the track
  vendor?: InstrumentVendor;
}

export interface TrackPerformer {
  personId: string;
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

export const INSTRUMENTS: Record<string, Instrument> = {
  "i-martin-1973-d28": {
    id: "i-martin-1973-d28",
    name: "1973 Martin D-28",
    category: "Acoustic Guitar",
    artistNote: "Selected for its warm low-end and the unmistakable spruce-and-rosewood bloom that anchors the rhythm bed on this record.",
    vendor: { name: "Martin Guitar", affiliateUrl: "https://www.martinguitar.com/" },
  },
  "i-gretsch-1967-6071": {
    id: "i-gretsch-1967-6071",
    name: "1967 Gretsch 6071 \"Monkees\" Bass Walnut",
    category: "Hollow-body Bass",
    artistNote: "Selecting this guitar for its unparalleled blend of classic resonance and modern versatility.",
    vendor: { name: "Norman's Rare Guitars", affiliateUrl: "https://www.normansrareguitars.com/" },
  },
  "i-violin-strad-copy": {
    id: "i-violin-strad-copy",
    name: "German Strad-copy Violin (c. 1910)",
    category: "Violin",
    artistNote: "Tuned standard. Mic'd close on the bridge for the verses, room mic for the choruses.",
    vendor: { name: "Shar Music", affiliateUrl: "https://www.sharmusic.com/" },
  },
  "i-bass-fender-p": {
    id: "i-bass-fender-p",
    name: "1976 Fender Precision Bass",
    category: "Electric Bass",
    artistNote: "Flatwounds, no pick. Sat right behind the kick on every track.",
    vendor: { name: "Fender", affiliateUrl: "https://www.fender.com/" },
  },
  "i-drums-gretsch-kit": {
    id: "i-drums-gretsch-kit",
    name: "Gretsch USA Custom Kit",
    category: "Drum Kit",
    artistNote: "22\" kick, 13\" rack, 16\" floor. Calf heads on the toms for a softer attack.",
    vendor: { name: "Gretsch Drums", affiliateUrl: "https://www.gretschdrums.com/" },
  },
  "i-perc-lp-congas": {
    id: "i-perc-lp-congas",
    name: "LP Matador Series Congas",
    category: "Hand Percussion",
    artistNote: "A pair of quintos plus a bongo for the bridge fills.",
    vendor: { name: "Latin Percussion", affiliateUrl: "https://lpmusic.com/" },
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
      { personId: "p-joe-hall",    role: "Guitar",  instrumentId: "i-gretsch-1967-6071", tuningNotes: "Dropped D" },
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
      { personId: "p-joe-hall",    role: "Guitar", instrumentId: "i-gretsch-1967-6071" },
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
    type: "album",
    description: "A sweeping collection of songs about stillness, change, and the moments between.",
    certificateNumber: 12,
  },
  {
    id: "album-2",
    title: "Guitar as a Voice",
    artist: "Fernando Perdomo",
    artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-2.png",
    year: 2024,
    type: "album",
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
    type: "album",
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
