import { useState } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
  Plus,
  ShieldCheck,
  AlertCircle,
  Hash,
  Building2,
  X,
  Loader2,
  ExternalLink,
} from "lucide-react";

/**
 * Credits · Writers v3 — "Pull from ASCAP" staging helper.
 *
 * Sibling to WritersV2. Layers a one-click ASCAP lookup over the Writers
 * section. When the admin types or opens a new track, they hit "Pull from
 * ASCAP" → the server returns every writer + publisher ASCAP has on file
 * for that title, with our roster pre-matched. The admin clicks "Use" to
 * add a writer; name + PRO + publisher prefill; only IPI + split % remain
 * to be confirmed via Songview.
 *
 * Endpoint shape:
 *   GET /api/admin/ascap/lookup?title=Made+for+Us&rosterOnly=1
 *   → { title, writers[], publishers[], rosterMatches[], totalWriters,
 *       totalPublishers, truncated }
 *
 * Real ASCAP data for "Made for Us": 53 writers globally, 2 of which match
 * GoodTunes roster (NEBEL BECK + SHACKLE BRYAN). The 51 others are
 * different works that share the same title.
 */

/* ------------ canned response (matches /api/admin/ascap/lookup) ------------ */

const ASCAP_RESPONSE = {
  title: "MADE FOR US",
  totalWriters: 53,
  totalPublishers: 38,
  rosterMatches: [
    { name: "NEBEL BECK", suggested: "Beck Nebel", role: "Writer · Producer" },
    { name: "SHACKLE BRYAN", suggested: "Bryan Shackle", role: "Writer" },
  ],
  otherWriters: [
    "KEUP CHRISTOPHER WAYNE",
    "MACKENZIE DAN",
    "AXELSSON PATRIK LEIF",
    "CEDER ERIK VIKTOR",
    "LUNDEN MAGNUS CARL",
    "ROSENGREN FREDRIK KURT ROLAND",
    "SUNDBERG STEN OLOF JOHAN SUNE",
    "BARTH LORI R",
    "BERGSTROM JAKOB",
    "HOLTER LEONARD ANDREAS",
  ],
};

/* ============================== component ============================== */

export function WritersV3() {
  const [pulled, setPulled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);

  const pull = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setPulled(true);
    }, 700);
  };
  const reset = () => {
    setPulled(false);
    setAdded([]);
    setShowAll(false);
  };

  const available = ASCAP_RESPONSE.rosterMatches.filter(
    (m) => !added.includes(m.name),
  );

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[720px] mx-auto space-y-3">
        {/* HEADER */}
        <div className="space-y-1 pb-1">
          <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
            Track 1 of 17 · Love Life Tragedy · Nick Carter
          </div>
          <h2 className="text-slate-900 text-[20px] font-bold">
            Made for Us — Writers &amp; publishing (v3)
          </h2>
          <p className="text-slate-500 text-[12px]">
            Adds a one-click <strong>Pull from ASCAP</strong> staging helper to
            the empty state — prefills writer-of-record, PRO, and publisher
            name from the ASCAP catalog slice, with roster cross-check.
          </p>
        </div>

        {/* WRITERS SECTION */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/40">
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-md bg-slate-900 text-white text-[12px] font-bold inline-flex items-center justify-center flex-shrink-0">
                B
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-slate-900 text-[14px] font-bold">
                    Writers &amp; publishing
                  </h3>
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wide">
                    Encouraged
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    · {added.length} writer{added.length === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="text-slate-500 text-[11.5px] mt-0.5">
                  Composer / lyricist / producer credits — plus IPI numbers and
                  publisher chains so mechanicals can actually reach a human.
                </p>
              </div>
              {pulled && (
                <button
                  onClick={reset}
                  className="px-2 py-1.5 rounded-md text-slate-500 hover:text-slate-800 text-[11.5px] inline-flex items-center gap-1 flex-shrink-0"
                  title="Reset demo"
                >
                  <X className="w-3.5 h-3.5" /> Reset
                </button>
              )}
            </div>
          </header>

          {/* PULL CTA — only when empty */}
          {!pulled && (
            <div className="px-4 py-6 text-center bg-gradient-to-b from-white to-slate-50/40">
              <div className="w-12 h-12 rounded-full bg-[#319ED8]/10 inline-flex items-center justify-center mb-3">
                <Sparkles className="w-5 h-5 text-[#319ED8]" />
              </div>
              <h4 className="text-slate-900 text-[14px] font-bold mb-1">
                No writers yet
              </h4>
              <p className="text-slate-500 text-[12px] mb-4 max-w-[420px] mx-auto leading-relaxed">
                We can pre-fill writers + publishers from the ASCAP catalog
                using this track's title. You'll still confirm splits and
                IPIs in Songview.
              </p>
              <button
                onClick={pull}
                disabled={loading}
                className="px-4 py-2 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking
                    up&hellip;
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" /> Pull from ASCAP
                  </>
                )}
              </button>
              <div className="text-slate-400 text-[10.5px] mt-2 font-mono">
                GET /api/admin/ascap/lookup?title=Made+for+Us
              </div>
            </div>
          )}

          {/* RESULTS PANEL */}
          {pulled && (
            <>
              {/* result summary banner */}
              <div className="px-4 py-2.5 bg-emerald-50/40 border-b border-emerald-100 flex items-center gap-2 text-[11.5px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
                <span className="text-emerald-700 font-semibold">
                  ASCAP returned {ASCAP_RESPONSE.totalWriters} writers ·{" "}
                  {ASCAP_RESPONSE.rosterMatches.length} match your roster
                </span>
                <span className="text-slate-500 hidden sm:inline">
                  · the other {ASCAP_RESPONSE.totalWriters -
                    ASCAP_RESPONSE.rosterMatches.length}{" "}
                  are different songs sharing this title
                </span>
              </div>

              {/* roster matches as add-now cards */}
              {available.length > 0 && (
                <div className="px-4 py-3 space-y-2 bg-emerald-50/20">
                  <div className="text-emerald-800 text-[10.5px] font-bold uppercase tracking-wider">
                    Roster matches — ready to add
                  </div>
                  {available.map((m) => (
                    <div
                      key={m.name}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border border-emerald-200 shadow-sm"
                    >
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                        {m.suggested
                          .split(" ")
                          .map((p) => p[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-900 text-[13px] font-semibold truncate">
                            {m.suggested}
                          </span>
                          <ProChip pro="ASCAP" />
                          <span className="text-slate-400 text-[10.5px]">
                            · {m.role}
                          </span>
                        </div>
                        <div className="text-slate-500 text-[10.5px] mt-0.5 truncate">
                          ASCAP filing: <span className="font-mono">{m.name}</span> · IPI
                          will be pulled from Songview
                        </div>
                      </div>
                      <button
                        onClick={() => setAdded((a) => [...a, m.name])}
                        className="px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-[11.5px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1 flex-shrink-0"
                      >
                        <Plus className="w-3 h-3" /> Use
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* already added */}
              {added.length > 0 && (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {added.map((name) => {
                    const m = ASCAP_RESPONSE.rosterMatches.find(
                      (r) => r.name === name,
                    )!;
                    return <AddedRow key={name} match={m} />;
                  })}
                </div>
              )}

              {/* disclosure: other writers ASCAP knows */}
              <div className="border-t border-slate-100">
                <button
                  onClick={() => setShowAll((s) => !s)}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50"
                >
                  <span className="text-slate-600 text-[11.5px] inline-flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3 text-amber-500" />
                    Show the other{" "}
                    {ASCAP_RESPONSE.totalWriters -
                      ASCAP_RESPONSE.rosterMatches.length}{" "}
                    ASCAP writers at this title{" "}
                    <span className="text-slate-400">
                      — likely different songs
                    </span>
                  </span>
                  {showAll ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
                {showAll && (
                  <div className="px-4 pb-3 max-h-56 overflow-y-auto">
                    <div className="rounded-md bg-slate-50 border border-slate-200 divide-y divide-slate-200">
                      {ASCAP_RESPONSE.otherWriters.map((n) => (
                        <div
                          key={n}
                          className="flex items-center justify-between px-3 py-2 text-[11.5px]"
                        >
                          <span className="font-mono text-slate-600 truncate">
                            {n}
                          </span>
                          <button className="text-[#319ED8] text-[10.5px] hover:underline inline-flex items-center gap-0.5 flex-shrink-0">
                            Add anyway <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                      <div className="px-3 py-2 text-slate-400 text-[10.5px] italic">
                        … {ASCAP_RESPONSE.totalWriters -
                          ASCAP_RESPONSE.rosterMatches.length -
                          ASCAP_RESPONSE.otherWriters.length}{" "}
                        more truncated by API (max 50/req)
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* add-row search (always visible) */}
          <div className="px-3 py-2.5 bg-slate-50/40 border-t border-slate-100">
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-white border border-dashed border-slate-300">
              <Plus className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <input
                className="flex-1 bg-transparent text-[12.5px] text-slate-700 placeholder-slate-400 focus:outline-none"
                placeholder="Or add manually — search roster, paste an IPI, type a new name…"
              />
              <span className="text-slate-400 text-[10.5px] italic flex-shrink-0">
                12 in roster
              </span>
            </div>
          </div>
        </section>

        {/* WHAT IT PULLS — small footnote card */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-slate-900 text-[13px] font-bold inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              What "Pull from ASCAP" actually fills in
            </h3>
          </header>
          <div className="px-4 py-3 space-y-2 text-[12px] text-slate-600 leading-relaxed">
            <Note
              tone="ok"
              label="Writer-of-record name"
              body="The legal name as filed with ASCAP (e.g. NEBEL BECK). We map it to the display name in our people roster (Beck Nebel)."
            />
            <Note
              tone="ok"
              label="PRO chip + publisher name"
              body="ASCAP affiliation auto-set; publisher name pulled from the same row of the ASCAP block. Admin chain still entered manually for now."
            />
            <Note
              tone="note"
              label="What's NOT filled in"
              body="Split %, IPI numbers, and 'Adm. by' — those need Songview / SESAC member lookup. The slice doesn't carry IPIs."
            />
            <Note
              tone="note"
              label="Common-title caveat"
              body="Titles like EASY or PIECES have thousands of ASCAP registrations. Roster cross-match avoids binding to the wrong work; the 'Add anyway' escape hatch lets you override when the writer-on-record is a guest you haven't onboarded yet."
            />
          </div>
        </section>
      </div>
    </div>
  );
}

/* =========================== bits =========================== */

function AddedRow({
  match,
}: {
  match: { name: string; suggested: string; role: string };
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white">
      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-[10.5px] font-semibold flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200">
        {match.suggested
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-900 text-[13.5px] font-semibold truncate">
            {match.suggested}
          </span>
          <span className="text-slate-400 text-[11px]">·</span>
          <span className="text-slate-500 text-[11.5px] truncate">
            {match.role}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <ProChip pro="ASCAP" />
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold">
            <Hash className="w-2.5 h-2.5" />
            IPI — confirm in Songview
          </span>
          <a
            href="#"
            className="text-[#319ED8] text-[10.5px] hover:underline inline-flex items-center gap-0.5"
          >
            Open Songview <ExternalLink className="w-2.5 h-2.5 opacity-60" />
          </a>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <input
          className="w-16 text-right rounded-md border border-slate-300 px-2 py-1 text-[12px] font-semibold tabular-nums text-slate-900 bg-white focus:outline-none focus:border-[#319ED8]"
          placeholder="—"
        />
        <span className="text-slate-400 text-[11.5px]">%</span>
      </div>
    </div>
  );
}

function ProChip({ pro }: { pro: string }) {
  const tone =
    pro === "ASCAP"
      ? "bg-[#319ED8]/10 text-[#319ED8] border-[#319ED8]/30"
      : pro === "BMI"
        ? "bg-[#7F10A7]/10 text-[#7F10A7] border-[#7F10A7]/30"
        : pro === "SESAC"
          ? "bg-amber-100 text-amber-800 border-amber-200"
          : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded border font-bold px-1.5 py-0.5 text-[10px] " +
        tone
      }
    >
      <Building2 className="w-2.5 h-2.5 opacity-60" />
      {pro}
    </span>
  );
}

function Note({
  tone,
  label,
  body,
}: {
  tone: "ok" | "note";
  label: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={
          "w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 " +
          (tone === "ok"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-slate-100 text-slate-500")
        }
      >
        {tone === "ok" ? (
          <Check className="w-2.5 h-2.5" />
        ) : (
          <AlertCircle className="w-2.5 h-2.5" />
        )}
      </span>
      <div className="min-w-0">
        <span className="font-semibold text-slate-800">{label}</span>{" "}
        <span className="text-slate-600">— {body}</span>
      </div>
    </div>
  );
}
