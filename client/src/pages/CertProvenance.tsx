// Task #128 — Public per-deed provenance page reached via the QR on
// the printed certificate (path /g/:shortId). No auth required: the
// short id IS the access token, the QR is the distribution channel,
// and we never leak the buyer's address or email — just the album,
// GoodDeed number, the printed name, and the issued date.
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Award } from "lucide-react";

type Provenance = {
  shortId: string;
  goodDeedNumber: number | null;
  issuedAt: string;
  albumTitle: string;
  albumArtist: string;
  albumArtwork: string | null;
  recipientName: string | null;
  nameStatus: string;
};

export function CertProvenance() {
  const [, params] = useRoute("/g/:shortId");
  const shortId = params?.shortId;
  const { data, isLoading, error } = useQuery<Provenance>({
    queryKey: ["/api/g", shortId],
    queryFn: async () => {
      const r = await fetch(`/api/g/${shortId}`);
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    enabled: !!shortId,
  });

  return (
    <main className="min-h-screen bg-[#00062B] text-white" data-testid="page-cert-provenance">
      <div className="max-w-[480px] mx-auto px-5 pt-10 pb-16">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 text-[11px] uppercase tracking-widest text-white/65">
            <Award className="w-4 h-4 text-[#4AFFCA]" />
            GoodTunes GoodDeed
          </div>
        </div>

        {isLoading && <div className="text-center text-white/55" data-testid="loading">Looking up GoodDeed…</div>}
        {error && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center" data-testid="not-found">
            <div className="text-white/85 font-semibold">Certificate not found</div>
            <div className="text-white/55 text-[13px] mt-1">
              The QR code or link may be mistyped. Double-check the URL on the printed certificate.
            </div>
          </div>
        )}

        {data && (
          <div data-testid="provenance-card">
            {data.albumArtwork && (
              <img
                src={data.albumArtwork}
                alt=""
                className="w-44 h-44 mx-auto rounded-2xl object-cover shadow-2xl"
              />
            )}
            <h1 className="text-[24px] font-bold text-center mt-5" data-testid="text-album-title">
              {data.albumTitle}
            </h1>
            <div className="text-white/65 text-center text-[14px]" data-testid="text-album-artist">
              by {data.albumArtist}
            </div>

            <div className="rounded-2xl bg-white/5 border border-white/10 px-5 py-4 mt-6 flex flex-col gap-3">
              <Row label="GoodDeed">
                <span className="text-[20px] font-bold text-[#4AFFCA]" data-testid="text-good-deed">
                  {data.goodDeedNumber !== null ? `No. ${data.goodDeedNumber}` : data.shortId.toUpperCase()}
                </span>
              </Row>
              <Row label="Presented to">
                <span className="text-white font-semibold" data-testid="text-recipient">
                  {data.recipientName ?? "—"}
                </span>
              </Row>
              <Row label="Issued">
                <span className="text-white/85" data-testid="text-issued">
                  {new Date(data.issuedAt).toLocaleDateString()}
                </span>
              </Row>
            </div>

            <p className="text-center text-[13px] text-white/55 mt-6 leading-relaxed">
              A GoodDeed is a record bought direct from the artist on GoodTunes — supporting the people who made it.
            </p>

            <Link
              href="/"
              className="mt-6 inline-flex items-center justify-center w-full py-3 rounded-full bg-[#319ED8] text-white font-semibold active:opacity-80"
              data-testid="link-home"
            >
              Visit GoodTunes
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] uppercase tracking-widest text-white/45">{label}</span>
      <span className="text-right min-w-0">{children}</span>
    </div>
  );
}

export default CertProvenance;
