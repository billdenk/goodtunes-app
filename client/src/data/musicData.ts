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
    videos: [
      {
        id: "vid-4-1",
        title: "Pacific Drive — Official Music Video",
        thumbnail: "/figmaAssets/artworks-000451097049-kerecr-t500x500-3.png",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        duration: "3:28",
      },
      {
        id: "vid-4-2",
        title: "Behind the Scenes: Venice Beach",
        thumbnail: "/figmaAssets/artworks-000451097049-kerecr-t500x500-3.png",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
        duration: "5:12",
      },
    ],
    photos: [
      { id: "p-4-1", url: "/figmaAssets/artworks-000451097049-kerecr-t500x500-3.png", caption: "Album cover" },
      { id: "p-4-2", url: "/figmaAssets/artworks-000451097049-kerecr-t500x500.png", caption: "Studio session" },
      { id: "p-4-3", url: "/figmaAssets/artworks-000451097049-kerecr-t500x500-1.png", caption: "On the road" },
      { id: "p-4-4", url: "/figmaAssets/artworks-000451097049-kerecr-t500x500-2.png", caption: "Sunset shoot" },
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
