import goodtunesLogoWhite from '../assets/goodtunes-logo-white.svg';

type Props = {
  art: string;
  artistPhoto: string;
  artist: string;
  title: string;
  format: 'print' | 'social' | 'texting';
  paper: 'letter' | 'a4';
  signed: boolean;
  social: 'square' | 'portrait' | 'story' | 'safe';
};

const ORANGE = '#FF7C06';
const NAVY = '#00062B';
const SAMPLE_OWNER = 'Jordan Ellis';
const SAMPLE_NUMBER = '12';

function BrandPill() {
  return <div className="flex items-center rounded-full" style={{ gap: 8, padding: '9px 16px', background: 'rgba(0,6,43,.62)', border: '1px solid rgba(255,255,255,.18)' }}>
    <img src={goodtunesLogoWhite} alt="GoodTunes" style={{ height: 24, width: 'auto' }} />
    <span style={{ width: 1, height: 19, background: 'rgba(255,255,255,.3)' }} />
    <strong className="text-white" style={{ fontSize: 15 }}>#{SAMPLE_NUMBER}</strong>
  </div>;
}

function SocialCard({ art, artist, title, social }: Pick<Props, 'art' | 'artist' | 'title' | 'social'>) {
  const story = social === 'story' || social === 'safe';
  const portrait = social === 'portrait';
  const width = story ? 270 : 360;
  const height = story ? 480 : portrait ? 450 : 360;
  const scale = width / 360;
  const artHeight = story ? 270 : portrait ? 230 : 157;
  return <div className="relative flex flex-col overflow-hidden" style={{ width, height, border: `${15 * scale}px solid ${ORANGE}`, borderRadius: 22 * scale, background: NAVY, boxShadow: '0 30px 80px rgba(0,0,0,.45)' }}>
    <div className="relative w-full shrink-0" style={{ height: artHeight }}>
      <img src={art} alt={title} className="block h-full w-full object-cover object-top" />
      <div className="absolute inset-0" style={{ background: `linear-gradient(180deg,rgba(0,6,43,0) 45%,rgba(0,6,43,.6) 76%,${NAVY} 100%)` }} />
    </div>
    <div className="relative z-10 flex flex-1 flex-col items-center px-4 text-center" style={{ paddingBottom: 11 * scale }}>
      <p className="text-white/55" style={{ fontSize: 12 * scale, marginTop: story ? -4 : 3 }}>This GoodDeed® certifies</p>
      <p className="whitespace-nowrap font-bold text-white" style={{ fontSize: 25 * scale, marginTop: 3 }}>{SAMPLE_OWNER}</p>
      <div style={{ marginTop: 10 * scale }}><BrandPill /></div>
      <div className="mt-auto text-white/60" style={{ fontSize: 12 * scale }}>
        <p className="whitespace-nowrap">{title} #{SAMPLE_NUMBER}</p>
        <p className="whitespace-nowrap">by {artist}</p>
      </div>
    </div>
    {social === 'safe' && <div className="pointer-events-none absolute inset-x-4 top-12 bottom-16 rounded-xl border border-dashed border-white/60" aria-label="Story safe-zone reference" />}
  </div>;
}

function PrintCard({ art, artistPhoto, artist, title, paper, signed }: Pick<Props, 'art' | 'artistPhoto' | 'artist' | 'title' | 'paper' | 'signed'>) {
  const a4 = paper === 'a4';
  const width = a4 ? 376 : 386;
  const height = a4 ? 532 : 500;
  const matWidth = 320;
  const matHeight = a4 ? 427 : 400;
  return <div className="relative shrink-0 bg-white" style={{ width, height, boxShadow: '0 24px 70px rgba(0,0,0,.35)' }}>
    <div className="absolute" style={{ width: matWidth + 16, height: matHeight + 16, left: (width - matWidth - 16) / 2, top: (height - matHeight - 16) / 2, background: ORANGE }} />
    <div className="absolute overflow-hidden" style={{ width: matWidth, height: matWidth, left: (width - matWidth) / 2, top: (height - matHeight) / 2 }}>
      <img src={art} alt={title} className="block h-full w-full object-cover" />
    </div>
    <div className="absolute text-white" style={{ width: matWidth, height: matHeight - matWidth, left: (width - matWidth) / 2, top: (height - matHeight) / 2 + matWidth, background: NAVY, padding: 10 }}>
      <div className="flex items-center gap-2">
        <img src={artistPhoto} alt={artist} className="h-10 w-10 rounded-full object-cover" />
        <div className="min-w-0"><p className="truncate text-xs">{artist}</p><p className="truncate text-sm font-bold">{title}</p><p className="text-white/60" style={{ fontSize: 7 }}>POP • GOODTUNES RELEASE 2026</p></div>
        <div className="ml-auto">{signed ? <div className="h-10 w-10 rounded-md border border-white/30" aria-label="Holographic sticker placement" /> : <img src={goodtunesLogoWhite} alt="GoodTunes" className="w-16" />}</div>
      </div>
      <p className="ml-12 mt-2 font-bold leading-tight" style={{ fontSize: 9 }}>This GoodDeed® certifies that {SAMPLE_OWNER} owns no. {SAMPLE_NUMBER} of {title}.</p>
      <p className="absolute bottom-2 left-12 right-3 text-white/55" style={{ fontSize: 6 }}>Digital provenance can be confirmed by accessing the QR code on this GoodDeed®. Sample fan owner and certificate number shown.</p>
    </div>
  </div>;
}

function TextingCard({ art, artist, title }: Pick<Props, 'art' | 'artist' | 'title'>) {
  return <div className="overflow-hidden" style={{ width: 560, maxWidth: '100%', borderRadius: 22, boxShadow: '0 30px 80px rgba(0,0,0,.45)' }}>
    <div style={{ padding: 14, background: ORANGE }}><div className="relative overflow-hidden rounded-xl" style={{ height: 372 }}><img src={art} alt={title} className="h-full w-full object-cover object-top" /><div className="absolute bottom-4 right-4"><BrandPill /></div></div></div>
    <div className="bg-neutral-900 px-5 py-4 text-white"><p className="font-semibold">{title} · GoodDeed® #{SAMPLE_NUMBER}</p><p className="text-sm text-white/60">{SAMPLE_OWNER} · {artist} · Sample personalized certificate</p></div>
  </div>;
}

export function GoodDeedArtistPreview(props: Props) {
  if (props.format === 'print') return <PrintCard {...props} />;
  if (props.format === 'texting') return <TextingCard {...props} />;
  return <SocialCard {...props} />;
}