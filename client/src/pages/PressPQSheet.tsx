// PQ / cutting-master sheet — ONLINE twin of Ruby's verbatim mock:
// handoff/pq-sheet/PressPQSheetMRP.tsx.
//
// Handoff law: layout, states, and copy stay the mock's; MOCK_ consts are
// replaced by the signed-out /api/pq/:token payload. The token link is the
// credential. iPad-first, chrome-free. One filled action: Download PDF.
// Every ready Mux master plays in-row; unavailable masters fail honestly.
import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import Hls from "hls.js";
import {
  Check,
  Download,
  Pause,
  Play,
  TriangleAlert,
} from "lucide-react";
import mrpLogo from "@/pages/mrp/assets/mrp-logo.svg";

const CANVAS = "#f5f5f7";
const CARD = "#ffffff";
const INK = "#1d1d1f";
const SUBINK = "#6e6e73";
const FAINT = "#aeaeb2";
const HAIRLINE = "#e8e8ed";
const BLUE = "#319ED8";
const WARN = "#b25000";
const READY = "#1f7a33";
const PILL_SHADOW = "0 1px 2px rgba(0,0,0,0.08)";
const FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif";

type Confirmation = {
  key: "lossless" | "levels" | "approved";
  label: string;
  confirmed: boolean;
};
type Track = {
  songId: string;
  no: string;
  title: string;
  file: string;
  start: string;
  end: string;
  len: string;
  lenSec: number;
  playable: boolean;
};
type Side = {
  side: string;
  tracks: Track[];
  totalSec: number;
  total: string;
  verdict: {
    status: "ready" | "warn";
    icon: "check" | "triangle";
    text: string;
  };
};
type PqData = {
  album: string;
  artist: string;
  press: string | null;
  project: string;
  date: string;
  format: string;
  catalog: string;
  matrix: string;
  gap: string;
  cutSpeed: string;
  confirmations: Confirmation[];
  sides: Side[];
  reference: { loud: number; average: number; lower: number };
  notes: string | null;
  tokenLink: string;
};

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-[10.5px] font-semibold uppercase tracking-wider"
        style={{ color: FAINT }}
      >
        {label}
      </div>
      <div
        className="text-[13.5px] font-semibold"
        style={{ color: INK, marginTop: 3 }}
      >
        {value}
      </div>
    </div>
  );
}

function SideCard({
  side,
  playing,
  loading,
  playError,
  onPlay,
}: {
  side: Side;
  playing: string | null;
  loading: string | null;
  playError: { songId: string; message: string } | null;
  onPlay: (tr: Track) => void;
}) {
  const VIcon =
    side.verdict.icon === "check" ? Check : TriangleAlert;
  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ background: CARD, border: `1px solid ${HAIRLINE}` }}
      data-testid={`side-${side.side.toLowerCase()}`}
    >
      <div
        className="flex items-center justify-between gap-4 flex-wrap"
        style={{
          padding: "18px 22px",
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <h2
          className="text-[17px] font-semibold"
          style={{ color: INK, letterSpacing: -0.2, margin: 0 }}
        >
          Side {side.side}
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="text-[13.5px] font-semibold"
            style={{ color: INK, fontVariantNumeric: "tabular-nums" }}
          >
            {side.total} total
          </span>
          <span
            className="inline-flex items-center gap-1.5 text-[12px] font-medium"
            style={{ color: SUBINK }}
            data-testid={`verdict-${side.side.toLowerCase()}`}
          >
            <VIcon
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{
                color: side.verdict.status === "ready" ? READY : WARN,
              }}
            />
            {side.verdict.text}
          </span>
        </div>
      </div>
      {side.tracks.map((tr, i) => {
        const isPlaying = playing === tr.songId;
        const isLoading = loading === tr.songId;
        const rowError =
          playError?.songId === tr.songId ? playError.message : null;
        return (
          <div
            key={tr.songId}
            className="flex items-center gap-4 flex-wrap"
            style={{
              padding: "14px 22px",
              borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}`,
              background: isPlaying ? "#f4faff" : "transparent",
            }}
            data-testid={`track-${tr.no.toLowerCase()}`}
          >
            <button
              type="button"
              onClick={() => onPlay(tr)}
              aria-label={
                isPlaying
                  ? `Pause ${tr.title}`
                  : tr.playable
                    ? `Play ${tr.title}`
                    : `${tr.title} isn't ready to play online yet`
              }
              className="flex items-center justify-center flex-shrink-0 rounded-full transition-colors disabled:opacity-45"
              style={{
                width: 34,
                height: 34,
                background: isPlaying ? BLUE : CARD,
                border: `1px solid ${isPlaying ? BLUE : HAIRLINE}`,
              }}
              disabled={isLoading || !tr.playable}
              data-testid={`play-${tr.no.toLowerCase()}`}
            >
              {isPlaying ? (
                <Pause
                  style={{ color: "#ffffff", width: 14, height: 14 }}
                  fill="#ffffff"
                />
              ) : (
                <Play
                  style={{ color: INK, width: 14, height: 14, marginLeft: 2 }}
                  fill={INK}
                />
              )}
            </button>
            <span
              className="text-[13px] font-semibold flex-shrink-0"
              style={{
                color: SUBINK,
                width: 26,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {tr.no}
            </span>
            <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
              <div
                className="text-[14.5px] font-semibold truncate"
                style={{ color: INK }}
              >
                {tr.title}
                {isPlaying && (
                  <span
                    className="text-[11.5px] font-semibold"
                    style={{ color: BLUE, marginLeft: 8 }}
                  >
                    Now playing
                  </span>
                )}
              </div>
              <div
                className="text-[12px] truncate"
                style={{ color: SUBINK, marginTop: 2 }}
              >
                {tr.file}
                {!tr.playable ? " · Not ready to play online" : ""}
              </div>
              {rowError && (
                <div
                  className="text-[11.5px]"
                  style={{ color: WARN, marginTop: 3 }}
                  role="status"
                >
                  {rowError}
                </div>
              )}
            </div>
            <div
              className="flex items-center gap-5 flex-shrink-0 text-[12.5px]"
              style={{ color: SUBINK, fontVariantNumeric: "tabular-nums" }}
            >
              <span>
                {tr.start} – {tr.end}
              </span>
              <span className="font-semibold" style={{ color: INK }}>
                {tr.len}
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function PressPQSheet() {
  const { token = "" } = useParams<{ token: string }>();
  const [data, setData] = useState<PqData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [playError, setPlayError] = useState<{
    songId: string;
    message: string;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/pq/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.message || "PQ sheet not found");
        }
        return r.json();
      })
      .then((v) => {
        if (live) setData(v);
      })
      .catch((e) => {
        if (live) setError(e?.message || "PQ sheet not found");
      });
    return () => {
      live = false;
      audioRef.current?.pause();
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [token]);

  async function togglePlay(tr: Track) {
    if (playing === tr.songId) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    setPlayError(null);
    setLoading(tr.songId);
    audioRef.current?.pause();
    hlsRef.current?.destroy();
    hlsRef.current = null;
    try {
      const r = await fetch(
        `/api/pq/${encodeURIComponent(token)}/play/${encodeURIComponent(tr.songId)}`,
      );
      const body = await r.json().catch(() => null);
      if (!r.ok || !body?.url) {
        throw new Error(
          body?.message || "This track isn't ready to play online yet",
        );
      }
      const audio = new Audio(body.url);
      audioRef.current = audio;
      audio.onended = () => setPlaying(null);
      audio.onerror = () => {
        setPlaying(null);
        setPlayError({
          songId: tr.songId,
          message: "Playback failed. Ask the operator to prepare this master.",
        });
      };
      const isHls = /\.m3u8(\?|$)/i.test(body.url);
      if (
        isHls &&
        Hls.isSupported() &&
        !audio.canPlayType("application/vnd.apple.mpegurl")
      ) {
        // Same signed-Mux / hls.js branch as the main PlayerContext:
        // iPad/Safari plays HLS natively; Chrome/Firefox use MSE.
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        await new Promise<void>((resolve, reject) => {
          hls.on(Hls.Events.MANIFEST_PARSED, () => resolve());
          hls.on(Hls.Events.ERROR, (_event, details) => {
            if (details?.fatal) reject(new Error("The master stream couldn't load"));
          });
          hls.loadSource(body.url);
          hls.attachMedia(audio);
        });
      } else {
        audio.src = body.url;
      }
      await audio.play();
      setPlaying(tr.songId);
    } catch (e: any) {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      setPlaying(null);
      setPlayError({
        songId: tr.songId,
        message: e?.message || "Playback failed",
      });
    } finally {
      setLoading(null);
    }
  }

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-6 text-center"
        style={{ background: CANVAS, color: INK, fontFamily: FONT }}
      >
        <div>
          <h1 className="text-[24px] font-semibold">PQ sheet not found</h1>
          <p className="text-[13.5px] mt-2" style={{ color: SUBINK }}>
            {error}
          </p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: CANVAS, color: SUBINK, fontFamily: FONT }}
      >
        <span className="text-[13px]">Loading PQ sheet…</span>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: CANVAS, color: INK, fontFamily: FONT }}
    >
      <header
        className="sticky top-0 z-40 flex items-center justify-between gap-4"
        style={{
          padding: "14px 28px",
          background: "rgba(245,245,247,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={mrpLogo}
            alt={data.press || "Press"}
            className="w-8 h-8 flex-shrink-0"
          />
          <div className="min-w-0">
            <div
              className="text-[14px] font-semibold truncate"
              style={{ color: INK }}
            >
              Cutting master — PQ sheet
            </div>
            <div
              className="text-[11.5px] truncate"
              style={{ color: SUBINK }}
            >
              Project {data.project}
            </div>
          </div>
        </div>
        <a
          href={`/api/pq/${encodeURIComponent(token)}/pdf`}
          className="inline-flex items-center gap-2 rounded-full text-[13px] font-semibold text-white flex-shrink-0 transition-transform hover:-translate-y-px"
          style={{
            padding: "9px 18px",
            background: BLUE,
            boxShadow: PILL_SHADOW,
          }}
          data-testid="button-download-pdf"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </a>
      </header>

      <main
        className="mx-auto w-full"
        style={{ maxWidth: 880, padding: "32px 28px 96px" }}
      >
        <h1
          className="tracking-tight"
          style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.08 }}
        >
          <span style={{ color: INK }}>{data.album}. </span>
          <span style={{ color: FAINT, fontWeight: 600 }}>
            {data.artist}.
          </span>
        </h1>
        <p
          className="text-[13.5px]"
          style={{ marginTop: 8, color: SUBINK }}
        >
          {data.format} · Prepared for the cutting engineer · {data.date}
        </p>

        <section
          className="rounded-2xl"
          style={{
            marginTop: 24,
            padding: "20px 22px",
            background: CARD,
            border: `1px solid ${HAIRLINE}`,
          }}
          data-testid="sheet-meta"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
              gap: 18,
            }}
          >
            <MetaCell
              label="Catalogue no — run-out scribing"
              value={data.catalog}
            />
            <MetaCell label="Matrix numbers" value={data.matrix} />
            <MetaCell label="Gap between tracks" value={data.gap} />
            <MetaCell label="Cut speed" value={data.cutSpeed} />
          </div>
        </section>

        <section
          className="rounded-2xl"
          style={{
            marginTop: 16,
            padding: "18px 22px",
            background: CARD,
            border: `1px solid ${HAIRLINE}`,
          }}
          data-testid="sheet-confirmations"
        >
          <div
            className="text-[10.5px] font-semibold uppercase tracking-wider"
            style={{ color: FAINT }}
          >
            Confirmed by the artist
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {data.confirmations.map((c) => (
              <div
                key={c.key}
                className="inline-flex items-start gap-2 text-[13px]"
                style={{ color: c.confirmed ? INK : SUBINK }}
              >
                {c.confirmed ? (
                  <Check
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: READY, marginTop: 1 }}
                    strokeWidth={2.5}
                  />
                ) : (
                  <TriangleAlert
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: FAINT, marginTop: 1 }}
                  />
                )}
                {c.label}
              </div>
            ))}
          </div>
        </section>

        <div
          style={{
            marginTop: 24,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {data.sides.map((side) => (
            <SideCard
              key={side.side}
              side={side}
              playing={playing}
              loading={loading}
              playError={playError}
              onPlay={togglePlay}
            />
          ))}
        </div>

        <section
          className="rounded-2xl"
          style={{
            marginTop: 20,
            padding: "18px 22px",
            background: CARD,
            border: `1px solid ${HAIRLINE}`,
          }}
          data-testid="sheet-reference"
        >
          <div
            className="text-[10.5px] font-semibold uppercase tracking-wider"
            style={{ color: FAINT }}
          >
            Side length reference — album LP, 33⅓ rpm
          </div>
          <div
            className="flex items-center gap-6 flex-wrap text-[13px]"
            style={{ marginTop: 10, color: SUBINK }}
          >
            <span>
              <span className="font-semibold" style={{ color: INK }}>
                {data.reference.loud} min
              </span>{" "}
              loud level
            </span>
            <span>
              <span className="font-semibold" style={{ color: INK }}>
                {data.reference.average} min
              </span>{" "}
              average level
            </span>
            <span>
              <span className="font-semibold" style={{ color: INK }}>
                {data.reference.lower} min
              </span>{" "}
              lower level
            </span>
          </div>
        </section>

        <section
          className="rounded-2xl"
          style={{
            marginTop: 20,
            padding: "18px 22px",
            background: CARD,
            border: `1px solid ${HAIRLINE}`,
          }}
          data-testid="sheet-notes"
        >
          <div
            className="text-[10.5px] font-semibold uppercase tracking-wider"
            style={{ color: FAINT }}
          >
            Mastering notes &amp; run-out scribing
          </div>
          <p
            className="text-[13.5px]"
            style={{
              marginTop: 10,
              color: data.notes ? INK : SUBINK,
              lineHeight: 1.65,
              maxWidth: 720,
            }}
          >
            {data.notes ??
              "No mastering notes recorded for this cut. Add notes on the project before sending to the lathe."}
          </p>
        </section>

        <p
          className="text-[12px]"
          style={{ marginTop: 24, color: FAINT }}
        >
          Generated from the artist&rsquo;s uploaded masters and project
          details · View this sheet online: {data.tokenLink}
        </p>
      </main>
    </div>
  );
}

export default PressPQSheet;