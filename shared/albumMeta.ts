export type AlbumMeta = {
  id: string;
  title: string;
  artist: string;
  description: string;
  artwork: string;
};

export const ALBUM_META: AlbumMeta[] = [
  {
    id: "album-1",
    title: "When the World Stops",
    artist: "Tim Snider & Wolfgang Timber",
    description:
      "A sweeping collection of songs about stillness, change, and the moments between.",
    artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500.png",
  },
  {
    id: "album-2",
    title: "Guitar as a Voice",
    artist: "Fernando Perdomo",
    description:
      "Instrumental mastery meets emotional storytelling. Each track a conversation without words.",
    artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-2.png",
  },
  {
    id: "album-3",
    title: "Love Spell EP",
    artist: "Whitney Lyman",
    description:
      "Four songs that cast a spell. Lush pop production meets deeply personal lyrics.",
    artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-1.png",
  },
  {
    id: "album-4",
    title: "California Way",
    artist: "TOMMYGUNN",
    description:
      "Sunshine, highways, and the stories only California can tell. A West Coast state of mind.",
    artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500-3.png",
  },
];

export function getAlbumMeta(id: string): AlbumMeta | undefined {
  return ALBUM_META.find((a) => a.id === id);
}
