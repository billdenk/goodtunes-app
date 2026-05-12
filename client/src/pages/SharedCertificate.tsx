import { useEffect, useMemo } from "react";
import { Link } from "wouter";
import certBgUrl from "@assets/Digital_GoodDeed_-_Nick_Carter_1778545442175.svg";

function useQuery() {
  return useMemo(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    return new URLSearchParams(search);
  }, []);
}

export function SharedCertificate(): JSX.Element {
  const q = useQuery();
  const album = q.get("album") ?? "GoodDeed®";
  const artist = q.get("artist") ?? "";
  const owner = q.get("owner") ?? "";
  const numRaw = q.get("num") ?? "01";
  const num = numRaw.padStart(2, "0");
  const art = q.get("art") ?? "/figmaAssets/artworks-000451097049-kerecr-t500x500.png";
  const albumId = q.get("albumId");

  useEffect(() => {
    const prev = document.title;
    document.title = `${album} — GoodDeed® No. ${num}`;
    return () => {
      document.title = prev;
    };
  }, [album, num]);

  const ctaHref = albumId ? `/album/${albumId}` : "/login";

  return (
    <main className="min-h-[100dvh] w-full bg-[#00062B] flex flex-col items-center text-white">
      <div
        className="w-full max-w-[420px] flex flex-col"
        style={{
          paddingTop: "calc(20px + env(safe-area-inset-top, 0px))",
          paddingBottom: "calc(140px + env(safe-area-inset-bottom, 0px))",
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-center mb-5">
          <img
            src="/goodtunes-logo-white.png"
            alt="GoodTunes"
            className="h-7 w-auto object-contain"
            data-testid="img-goodtunes-logo"
          />
        </div>

        <p className="text-center text-white/65 text-sm mb-4" data-testid="text-shared-eyebrow">
          {owner ? `${owner} shared a GoodDeed® with you` : "A GoodDeed® was shared with you"}
        </p>

        {/* Certificate card */}
        <div
          className="rounded-3xl overflow-hidden shadow-2xl mx-auto"
          style={{
            width: "100%",
            aspectRatio: "9 / 16",
            boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
            backgroundColor: "#00062B",
            backgroundImage: `url(${certBgUrl})`,
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
          }}
          data-testid="card-shared-certificate"
        >
          <div className="relative w-full" style={{ height: "50%" }}>
            <img src={art} alt={album} className="w-full h-full object-cover" />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, transparent 70%, rgba(13,32,96,0.4) 100%)",
              }}
            />
          </div>

          <div
            className="relative w-full px-6 py-6 flex flex-col"
            style={{ height: "50%" }}
          >
            <div>
              <p className="text-white text-xl font-bold leading-tight" data-testid="text-album-title">
                {album}
              </p>
              <p className="text-white/65 text-sm mt-0.5" data-testid="text-album-artist">
                {artist}
              </p>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
              <p className="text-white/75 text-[13px]">This GoodDeed® certifies that</p>
              <p
                className="text-white text-2xl font-bold mt-1.5 leading-tight"
                data-testid="text-owner-name"
              >
                {owner || "—"}
              </p>
              <p className="text-white/75 text-[13px] mt-1.5">
                owns number {num} of this series.
              </p>
            </div>

            <div className="flex items-end justify-between">
              <p
                className="text-white text-3xl font-bold leading-none"
                style={{ fontVariantNumeric: "tabular-nums" }}
                data-testid="text-cert-number"
              >
                No. {num}
              </p>
              <img
                src="/goodtunes-logo-white.png"
                alt="GoodTunes"
                className="h-9 w-auto object-contain"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sticky bottom CTA */}
      <div
        className="fixed inset-x-0 bottom-0 z-50"
        style={{
          paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          background:
            "linear-gradient(to top, rgba(0,6,43,1) 55%, rgba(0,6,43,0))",
        }}
      >
        <div className="mx-auto w-full max-w-[420px] px-4 pt-6">
          <p className="text-center text-white text-[15px] font-semibold mb-1">
            Want one of your own?
          </p>
          <p className="text-center text-white/60 text-[12px] mb-3">
            Own a numbered, verified GoodDeed® for music you love.
          </p>
          <Link
            href={ctaHref}
            className="block w-full h-12 rounded-full font-semibold text-[15px] flex items-center justify-center transition-opacity active:opacity-80"
            style={{
              background:
                "linear-gradient(90deg, #319ED8 0%, #7F10A7 100%)",
              color: "#fff",
              boxShadow: "0 8px 24px rgba(127,16,167,0.35)",
            }}
            data-testid="link-get-gooddeed"
          >
            Get your GoodDeed®
          </Link>
        </div>
      </div>
    </main>
  );
}
