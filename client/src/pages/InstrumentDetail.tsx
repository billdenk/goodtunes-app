import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { INSTRUMENTS, type Instrument } from "@/data/musicData";
import {
  GearDetailBody,
  type GearArtist,
  type GearArtistNote,
  type GearMaker,
  type GearVendor,
} from "@/components/gear/GearDetailBody";

// Task #174 — fan-side gear page started life on the static
// INSTRUMENTS catalog (demo content). Task #604 — also resolve
// live admin-created gear by id, so a fan bookmarking a real DB
// entry (e.g. the PRS Silver Sky) renders with the admin-saved
// per-attachment product URLs from `instrument_vendors.affiliate_url`,
// not the vendor's homepage. Live wins when present; static is the
// fallback for the seeded demo rows.

// Shape of GET /api/instruments/:id/profile — the maker (builder), the
// scraped source listing, and the SuperCredits-derived "played by" artists.
interface LiveMakerProfile {
  instrument?: {
    sourceUrl?: string | null;
    maker?: { id: string; name: string; domain?: string | null; logoUrl: string | null } | null;
  };
  artists?: Array<{ id: string; name: string; photoUrl: string | null; bio: string | null; trackCount: number }>;
}

// Shape of GET /api/instruments/:id — the live row from admin CMS.
// `vendors[].affiliateUrl` is the per-attachment product URL the admin
// saved; never the vendor's `home_url`.
interface ApiInstrumentVendor {
  id: string;
  vendorId: string;
  instrumentId: string;
  affiliateUrl: string;
  name: string;
  domain: string | null;
  homeUrl: string | null;
  aboutUrl: string | null;
  logoUrl: string | null;
  tagline: string | null;
  bio: string | null;
  location: string | null;
  coverUrl: string | null;
  position: number;
}
interface ApiInstrument {
  id: string;
  name: string;
  category: string;
  shortCategory: string | null;
  photoUrl: string | null;
  photoUrls: string[] | null;
  about: string | null;
  artistNote: string | null;
  vendors: ApiInstrumentVendor[];
}

function liveToInstrument(i: ApiInstrument): Instrument {
  return {
    id: i.id,
    name: i.name,
    category: i.category,
    shortCategory: i.shortCategory ?? undefined,
    photoUrl: i.photoUrl ?? undefined,
    photoUrls: i.photoUrls ?? undefined,
    about: i.about ?? undefined,
    artistNote: i.artistNote ?? undefined,
    vendors: i.vendors.map((v) => ({
      name: v.name,
      // Per-attachment product URL from instrument_vendors.affiliate_url.
      affiliateUrl: v.affiliateUrl,
      aboutUrl: v.aboutUrl ?? undefined,
      logoUrl: v.logoUrl ?? undefined,
      tagline: v.tagline ?? undefined,
      bio: v.bio ?? undefined,
      location: v.location ?? undefined,
      coverUrl: v.coverUrl ?? undefined,
      id: v.id,
      vendorId: v.vendorId,
      instrumentId: v.instrumentId,
      homeUrl: v.homeUrl ?? undefined,
      domain: v.domain ?? undefined,
    })),
  };
}
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { track } from "@/lib/analytics";
import { useRecordRecent } from "@/hooks/useRecents";

export function InstrumentDetail() {
  const [, params] = useRoute<{ id: string }>("/instrument/:id");
  const [, navigate] = useLocation();
  const staticInstrument: Instrument | undefined = params?.id ? INSTRUMENTS[params.id] : undefined;
  const isStaticId = !!staticInstrument;
  const { data: liveApi, isLoading: liveLoading } = useQuery<ApiInstrument>({
    queryKey: ["/api/instruments", params?.id],
    enabled: !!params?.id && !isStaticId,
  });
  const liveInstrument: Instrument | undefined = useMemo(
    () => (liveApi ? liveToInstrument(liveApi) : undefined),
    [liveApi],
  );
  const instrument: Instrument | undefined = liveInstrument ?? staticInstrument;

  // Maker (builder) + scraped source + "played by" rail. Works for signed-out
  // fans (public read) and for static demo ids that exist in the live DB.
  const { data: profile } = useQuery<LiveMakerProfile>({
    queryKey: ["/api/instruments", params?.id, "profile"],
    enabled: !!params?.id,
  });
  const maker: GearMaker | null = profile?.instrument?.maker ?? null;
  const sourceUrl = profile?.instrument?.sourceUrl ?? null;
  const playedBy: GearArtist[] = (profile?.artists ?? []).map((a) => ({
    id: a.id, name: a.name, photoUrl: a.photoUrl,
  }));

  useEffect(() => {
    if (instrument?.id) {
      track("gear_viewed", { instrumentId: instrument.id, instrumentName: instrument.name });
    }
  }, [instrument?.id, instrument?.name]);

  const recordRecent = useRecordRecent();
  useEffect(() => {
    if (!instrument?.id) return;
    recordRecent({
      entityKind: "instrument",
      entityId: instrument.id,
      title: instrument.name,
      subtitle: "Gear",
      thumbUrl: instrument.photoUrl ?? null,
      href: `/instrument/${instrument.id}`,
    });
  }, [instrument?.id, instrument?.name, instrument?.photoUrl, recordRecent]);

  const [isBookmarked, setIsBookmarked] = useState<boolean>(() => {
    if (!params?.id || typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem("gt:bookmarked-instruments");
      const ids: string[] = raw ? JSON.parse(raw) : [];
      return ids.includes(params.id);
    } catch { return false; }
  });
  useEffect(() => {
    if (!params?.id) return;
    try {
      const raw = window.localStorage.getItem("gt:bookmarked-instruments");
      const ids: string[] = raw ? JSON.parse(raw) : [];
      setIsBookmarked(ids.includes(params.id));
    } catch { /* ignore */ }
  }, [params?.id]);
  const toggleBookmark = () => {
    if (!params?.id) return;
    try {
      const raw = window.localStorage.getItem("gt:bookmarked-instruments");
      const ids: string[] = raw ? JSON.parse(raw) : [];
      const next = ids.includes(params.id)
        ? ids.filter((x) => x !== params.id)
        : [...ids, params.id];
      window.localStorage.setItem("gt:bookmarked-instruments", JSON.stringify(next));
      setIsBookmarked(next.includes(params.id));
    } catch { /* ignore */ }
  };

  const handleShare = async () => {
    if (!instrument) return;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    const shareText = `${instrument.name} — featured on GoodTunes Credits`;
    try {
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (typeof navigator !== "undefined" && nav.share) {
        await nav.share({ title: instrument.name, text: shareText, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(`${shareText} — ${shareUrl}`);
    } catch { /* cancelled / unavailable */ }
  };

  if (!instrument) {
    if (liveLoading) {
      return (
        <main className="relative h-screen w-full flex justify-center overflow-hidden" style={{ background: "#00062B" }}>
          <section className="relative w-full max-w-[390px] h-screen" />
        </main>
      );
    }
    return (
      <main className="relative h-screen w-full flex justify-center overflow-hidden" style={{ background: "#00062B" }}>
        <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col items-center justify-center px-8 text-center">
          <p className="text-white/70 text-[15px]">This bookmark is no longer available.</p>
          <button
            type="button"
            onClick={() => navigate("/account")}
            className="mt-6 px-5 py-2 rounded-full border border-white/20 text-white/80 text-sm font-medium active:opacity-70"
            data-testid="button-instrument-back"
          >
            Back to Account
          </button>
        </section>
      </main>
    );
  }

  const openExternal = (url?: string) => {
    if (!url || typeof window === "undefined") return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const artistNote: GearArtistNote | null = instrument.artistNote
    ? { quote: instrument.artistNote }
    : null;

  return (
    <main className="relative h-screen w-full flex justify-center overflow-hidden" style={{ background: "#00062B" }}>
      <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col">
        <GearDetailBody
          instrument={instrument}
          maker={maker}
          vendors={instrument.vendors ?? []}
          artistNote={artistNote}
          playedBy={playedBy}
          sourceUrl={sourceUrl}
          isBookmarked={isBookmarked}
          onToggleBookmark={toggleBookmark}
          onShare={handleShare}
          onBack={() => navigate("/account")}
          onOpenMaker={maker ? () => openExternal(maker.domain ? (maker.domain.startsWith("http") ? maker.domain : `https://${maker.domain}`) : undefined) : undefined}
          onOpenBuy={(v: GearVendor) => openExternal(v.affiliateUrl)}
          scrollPaddingClassName="pb-[170px]"
        />
        <MiniPlayer />
        <BottomNav />
      </section>
    </main>
  );
}
