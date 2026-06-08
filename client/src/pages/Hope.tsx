import type { ReactNode } from "react";

/**
 * "Get Hope. Give Hope." campaign registry.
 *
 * The redesigned campaign rendering chrome (CampaignFlow + its steps) was
 * retired once every campaign link — fan and family — was routed to the shared
 * locked Preview & Purchase AlbumDetail surface. What remains here is the
 * campaign registry: the per-release content map plus `isCampaignRelease`, which
 * App.tsx uses to decide between the campaign notify-only teaser and the normal
 * share-link album page on the shared /:artistSlug/:albumSlug route. Adding a
 * future campaign is a new RELEASES entry — not a new page.
 */

/* ── per-release content registry ─────────────────────────────────── */

type Edition = { label: string; items: { head: string; body: string }[] };

type ReleaseContent = {
  artistName: string;
  releaseName: string;
  launchLabel: string;
  previewNote: string;
  imageBase: string;
  images: { hero: string; cert: string; box: string; logo: string; cover: string };
  org: string;
  prices: { bundle: number; signed: number };
  gift: { min: number; presets: number[] };
  tracklist: { title: string; len: string }[];
  overview: {
    heading: string;
    paragraphs: ReactNode[];
    panelTitle: string;
    panelBody: string;
    editions: Edition[];
  };
  buy: {
    heading: string;
    intro: string;
    bundleName: string;
    bundleBody: string;
    signedName: string;
    signedBody: string;
    whyMore: string;
  };
  give: {
    heading: string;
    intro: string;
    boxName: string;
    boxBody: ReactNode;
    notes: ReactNode[];
  };
};

const RELEASES: Record<string, ReleaseContent> = {
  "nightbirde/hope": {
    artistName: "Nightbirde",
    releaseName: "Hope",
    launchLabel: "Coming today",
    previewNote: "Preview — ordering opens June 8, 2026.",
    imageBase: "/campaigns/nightbirde",
    images: {
      hero: "hope-get-hope.png",
      cert: "hope-cert-framed.jpg",
      box: "hope-gift-box.png",
      logo: "goodtunes-logo-white.png",
      cover: "hope-cover.png",
    },
    org: "Nightbirde Foundation",
    prices: { bundle: 25, signed: 25 },
    gift: { min: 75, presets: [75, 100, 250] },
    tracklist: [
      { title: "Gold", len: "3:20" },
      { title: "Better Days", len: "3:21" },
      { title: "It's OK", len: "3:22" },
      { title: "Girl in a Bubble", len: "3:23" },
      { title: "Brave", len: "3:24" },
    ],
    overview: {
      heading: "Get Hope. Give Hope.",
      paragraphs: [
        <>
          It's been five years since <strong className="text-white">Nightbirde</strong> (Jane
          Marczewski) appeared on <strong className="text-white">America's Got Talent</strong> (AGT)
          and received the <strong className="text-white">Golden Buzzer</strong> from{" "}
          <strong className="text-white">Simon Cowell.</strong>
        </>,
        <>
          Before she passed, Jane provided her family with all of her journals, photos, artwork, and
          music and gave them a mission — use whatever you can to help women with breast cancer.
        </>,
        <>
          The "Get Hope. Give Hope." campaign was built to do just that — proceeds from every
          purchase go to Nightbirde Foundation. You can also donate a "Gift of Hope" box to someone
          you know with cancer, or let us choose someone in need on your behalf.
        </>,
      ],
      panelTitle: "Here's what you'll get",
      panelBody:
        "This package has been hand curated by Jane's family for you. Digital arrives instantly. Physical ships 8–10 weeks after ordering.",
      editions: [
        {
          label: "Digital Collector Edition",
          items: [
            { head: "Music", body: "Instant access to the music with the free GoodTunes® Player." },
            { head: "GoodDeed®", body: "A numbered, personalized printable PDF GoodDeed® Certificate suitable for framing." },
            { head: "Bonus", body: "Photos and videos curated by Jane's family." },
          ],
        },
        {
          label: "Physical Collector Edition",
          items: [
            { head: "Music", body: "7\" vinyl tracks \"Gold\" & \"Better Days\"." },
            { head: "Booklet", body: "Special-edition companion booklet featuring lyrics, Jane's poems, exclusive photos and more." },
          ],
        },
      ],
    },
    buy: {
      heading: "Get Hope",
      intro:
        "The first in a limited-edition series — a 7\" Physical Collector Edition plus the full Digital Collector Edition. Proceeds benefit the Nightbirde Foundation.",
      bundleName: "Hope Bundle",
      bundleBody:
        "Physical 7\" vinyl + companion booklet, plus the Digital Collector Edition with GoodDeed® certificate and bonus content from Jane's family.",
      signedName: "Signed GoodDeed® Certificate",
      signedBody:
        "Hand-signed by Jane's family, personalized with your name and unique number, finished with a holographic seal + QR provenance. Ships with your vinyl.",
      whyMore:
        "Some people buy more than one as a gift for friends — sharing the music, and the chance to help women facing cancer.",
    },
    give: {
      heading: "Give Hope",
      intro:
        "Send a Gift of Hope box to someone facing cancer — or let us choose someone in need on your behalf. Every box is a donation to the Nightbirde Foundation.",
      boxName: "Gift of Hope Box",
      boxBody: (
        <>
          A stainless-steel Nightbirde cup, a copy of her debut album "It's OK," and Jane's book of
          poetry, <em>Poems for the Dark</em>.
        </>
      ),
      notes: [
        "Giving more than one? Tell us who each gift is for after checkout — we'll make it easy.",
        "Personalize after purchase: keep a gift anonymous or add a message, and choose who receives each box.",
      ],
    },
  },
};

/* ── registry helpers ─────────────────────────────────────────────── */

// Registry key from an artist/release pair (case-insensitive). null when the
// pair points at no campaign, so the 2-segment share route can fall through to
// the album-by-slug resolver instead.
function releaseKey(artist?: string, release?: string): string | null {
  const key = `${artist ?? ""}/${release ?? ""}`.toLowerCase();
  return key in RELEASES ? key : null;
}

// True when an artist/release pair is a known campaign. Lets App.tsx decide
// between the campaign teaser and the normal share-link album page on the
// shared /:artistSlug/:albumSlug route.
export function isCampaignRelease(artist?: string, release?: string): boolean {
  return releaseKey(artist, release) !== null;
}
