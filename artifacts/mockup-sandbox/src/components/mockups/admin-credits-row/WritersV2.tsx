import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Check,
  Plus,
  AlertCircle,
  ShieldCheck,
  Mail,
  ExternalLink,
  GripVertical,
  Trash2,
  Building2,
  Hash,
} from "lucide-react";

/**
 * Credits · Writers & publishing — v2 (exploration).
 *
 * Sibling to ProgressiveV3 Section B. Bakes in three things the IPI/PRO/admin
 * data dump surfaced as schema gaps:
 *
 *   1. IPI / CAE number per writer  — global writer id used by every PRO.
 *   2. "Admin by" publisher chain   — publisher → admin publisher → contact.
 *   3. Verified-PRO trust signal    — emerald shield on Songview/SESAC-confirmed
 *                                     writers; amber "double-check" hint on
 *                                     best-guess matches.
 *
 * Seed data is real: Track 1 "Made for Us" from Love Life Tragedy, three
 * writers at 33.33 / 33.33 / 33.34, IPIs and PROs from the consolidated
 * Songview / SESAC lookup. Skellington Music → BMG admin chain example is
 * included as a fourth illustrative writer row (collapsed by default) so you
 * can see the admin-by sub-row in action without expanding everything.
 */
export function WritersV2() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[720px] mx-auto space-y-3">
        {/* ============================ HEADER ============================ */}
        <div className="space-y-1 pb-1">
          <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
            Track 1 of 17 · Love Life Tragedy · Nick Carter
          </div>
          <h2 className="text-slate-900 text-[20px] font-bold">
            Made for Us — Writers &amp; publishing (v2)
          </h2>
          <p className="text-slate-500 text-[12px]">
            Explores IPI / admin-by / verified additions before they graduate
            into ProgressiveV3.
          </p>
        </div>

        {/* ============================ SECTION HEADER ============================ */}
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
                    · 3 writers · 3 publishers · 100.00%
                  </span>
                </div>
                <p className="text-slate-500 text-[11.5px] mt-0.5">
                  Composer / lyricist / producer credits — plus IPI numbers
                  and publisher chains so mechanicals can actually reach a
                  human.
                </p>
              </div>
              <button className="px-2.5 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-medium hover:bg-[#2890c8] inline-flex items-center gap-1 flex-shrink-0">
                <Plus className="w-3.5 h-3.5" /> Add writer
              </button>
            </div>
          </header>

          {/* ============================ TOTAL BAR ============================ */}
          <div className="px-4 py-2.5 bg-emerald-50/40 border-b border-emerald-100 flex items-center justify-between text-[11.5px]">
            <span className="text-emerald-700 font-semibold inline-flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              Splits balance — 100.00% across 3 writers
            </span>
            <span className="text-slate-500">
              Apply to all 17 tracks <span className="text-slate-300">·</span>{" "}
              <button className="text-[#319ED8] font-medium hover:underline">
                Even split
              </button>
            </span>
          </div>

          {/* ============================ WRITER ROWS ============================ */}
          <div className="divide-y divide-slate-100">
            <WriterRow
              initials="NC"
              name="Nickolas Gene Carter"
              displayName="Nick Carter"
              role="Writer · Composer"
              pro="ASCAP"
              ipi="341391286"
              verified
              percent="33.33"
              publisher={{
                name: "Nickelnotes Music",
                pro: "ASCAP",
                ipi: "578120914",
                admin: { name: "BMG Rights Management (US)", email: "licensing.us@bmg.com" },
              }}
              defaultOpen
            />
            <WriterRow
              initials="BN"
              name="Beck McCabe Nebel"
              displayName="Beck Nebel"
              role="Writer · Producer"
              pro="BMI"
              ipi="734699795"
              verified
              percent="33.33"
              publisher={{
                name: "Grumblyrumpus Music",
                pro: "BMI",
                ipi: "1210523125",
                admin: {
                  name: "Beck Nebel (self-admin)",
                  email: "becknebel@gmail.com",
                },
              }}
            />
            <WriterRow
              initials="BS"
              name="Bryan Shackle"
              displayName="Bryan Shackle"
              role="Writer"
              pro="ASCAP"
              ipi="493805132"
              verified
              percent="33.34"
              publisher={{
                name: "Shackle Songs",
                pro: "ASCAP",
                admin: {
                  name: "Concord Music Publishing ANZ",
                  email: "stuart.crichton@concord.com",
                },
              }}
            />
            <WriterRow
              initials="DJ"
              name="Daren Jay Ashba"
              displayName="DJ Ashba"
              role="Writer · Co-producer"
              pro="SESAC"
              proNum="393570"
              unverified={true}
              percent="0.00"
              empty
              publisher={{
                name: "Skellington Music",
                pro: "SESAC",
                proNum: "393570",
                admin: { name: "BMG Rights Management (US)", email: "licensing.us@bmg.com" },
              }}
              note="Carried from Track 3 — not on Made for Us. Remove or set % if intentional."
            />
          </div>

          {/* ============================ ADD-ROW SEARCH ============================ */}
          <div className="px-3 py-2.5 bg-slate-50/40 border-t border-slate-100">
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-white border border-dashed border-slate-300">
              <Plus className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <input
                className="flex-1 bg-transparent text-[12.5px] text-slate-700 placeholder-slate-400 focus:outline-none"
                placeholder="Add a writer — search your roster, paste an IPI, or type a new name…"
              />
              <span className="text-slate-400 text-[10.5px] italic flex-shrink-0">
                12 in roster
              </span>
            </div>
          </div>
        </section>

        {/* ============================ FOOTNOTES ============================ */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-slate-900 text-[13px] font-bold inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              What changed vs. ProgressiveV3
            </h3>
          </header>
          <div className="px-4 py-3 space-y-2 text-[12px] text-slate-600 leading-relaxed">
            <Change
              tone="ok"
              label="IPI / CAE per writer"
              body="Adds the unique writer id every PRO worldwide uses. Stored on people (global) with optional per-credit snapshot. Pulled from Songview / SESAC."
            />
            <Change
              tone="ok"
              label="Publisher admin chain"
              body="publisher → adm. by → contact email. Skellington Music / BMG is the canonical example. Renders inline under each writer; not its own table row to keep density low."
            />
            <Change
              tone="ok"
              label="Verified-PRO shield"
              body="Emerald shield on Songview/SESAC-confirmed writers. Amber AlertCircle on best-guess matches (e.g. Paul Dawson — multiple BMI hits). Click the shield to open Member Access."
            />
            <Change
              tone="note"
              label="Carried-from warning"
              body="When 'Apply to all 17 tracks' pushed a writer onto a song they didn't actually write, the row shows a soft slate note instead of an error — the admin chooses to keep or remove."
            />
          </div>
        </section>
      </div>
    </div>
  );
}

/* =============================== writer row =============================== */

type Publisher = {
  name: string;
  pro: string;
  ipi?: string;
  proNum?: string;
  admin?: { name: string; email?: string };
};

function WriterRow({
  initials,
  name,
  displayName,
  role,
  pro,
  proNum,
  ipi,
  verified,
  unverified,
  percent,
  publisher,
  defaultOpen,
  empty,
  note,
}: {
  initials: string;
  name: string;
  displayName: string;
  role: string;
  pro: string;
  proNum?: string;
  ipi?: string;
  verified?: boolean;
  unverified?: boolean;
  percent: string;
  publisher?: Publisher;
  defaultOpen?: boolean;
  empty?: boolean;
  note?: string;
}) {
  const [open, setOpen] = useState(!!defaultOpen);

  return (
    <div className={empty ? "bg-slate-50/60" : ""}>
      {/* primary line */}
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="text-slate-300 hover:text-slate-500 cursor-grab flex-shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </span>

        <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-[10.5px] font-semibold flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-900 text-[13.5px] font-semibold truncate">
              {displayName}
            </span>
            <span className="text-slate-400 text-[11px]">·</span>
            <span className="text-slate-500 text-[11.5px] truncate">
              {role}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <ProChip pro={pro} proNum={proNum} />
            {ipi && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10.5px] font-mono tabular-nums">
                <Hash className="w-2.5 h-2.5 text-slate-400" />
                IPI {ipi}
              </span>
            )}
            {verified && (
              <button
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold hover:bg-emerald-100"
                title="Verified via Songview / SESAC repertory"
              >
                <ShieldCheck className="w-2.5 h-2.5" />
                Verified
              </button>
            )}
            {unverified && (
              <button
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold hover:bg-amber-100"
                title="Best-guess IPI — confirm in PRO Member Access"
              >
                <AlertCircle className="w-2.5 h-2.5" />
                Confirm in Member Access
              </button>
            )}
            <span className="text-slate-300 text-[10.5px] hidden sm:inline">
              · legal: {name}
            </span>
          </div>
          {note && (
            <div className="text-slate-500 text-[10.5px] mt-1 italic">
              {note}
            </div>
          )}
        </div>

        {/* split % */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <input
            className={[
              "w-16 text-right rounded-md border px-2 py-1 text-[12px] font-semibold tabular-nums focus:outline-none",
              empty
                ? "border-slate-200 text-slate-400 bg-white"
                : "border-slate-300 text-slate-900 bg-white focus:border-[#319ED8]",
            ].join(" ")}
            defaultValue={percent}
          />
          <span className="text-slate-400 text-[11.5px]">%</span>
        </div>

        {/* expand */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-slate-400 hover:text-slate-700 flex-shrink-0"
        >
          {open ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* expanded publisher block */}
      {open && publisher && (
        <div className="px-3.5 pb-3 pl-[60px]">
          <PublisherBlock publisher={publisher} />
        </div>
      )}
    </div>
  );
}

/* =============================== publisher block ========================== */

function PublisherBlock({ publisher }: { publisher: Publisher }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* publisher line */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100">
        <span className="w-6 h-6 rounded bg-slate-900/5 text-slate-600 inline-flex items-center justify-center flex-shrink-0">
          <Building2 className="w-3.5 h-3.5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
              Publisher
            </span>
            <span className="text-slate-900 text-[12.5px] font-semibold truncate">
              {publisher.name}
            </span>
            <ProChip pro={publisher.pro} proNum={publisher.proNum} small />
            {publisher.ipi && (
              <span className="text-slate-400 text-[10.5px] font-mono tabular-nums">
                IPI {publisher.ipi}
              </span>
            )}
          </div>
        </div>
        <button className="text-slate-400 hover:text-rose-600 flex-shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* admin chain */}
      {publisher.admin ? (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50/60">
          <span className="w-6 h-6 rounded bg-[#319ED8]/10 text-[#319ED8] inline-flex items-center justify-center flex-shrink-0 text-[10px] font-bold">
            ↳
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
                Adm. by
              </span>
              <span className="text-slate-900 text-[12.5px] font-semibold truncate">
                {publisher.admin.name}
              </span>
            </div>
            {publisher.admin.email && (
              <a
                href={`mailto:${publisher.admin.email}`}
                className="text-[#319ED8] text-[11px] hover:underline inline-flex items-center gap-1 mt-0.5"
              >
                <Mail className="w-2.5 h-2.5" />
                {publisher.admin.email}
                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
              </a>
            )}
          </div>
        </div>
      ) : (
        <button className="w-full px-3 py-2 bg-slate-50/60 text-[#319ED8] text-[11px] font-medium hover:underline inline-flex items-center gap-1 justify-center">
          <Plus className="w-3 h-3" /> Add admin publisher
        </button>
      )}
    </div>
  );
}

/* =============================== bits ===================================== */

function ProChip({
  pro,
  proNum,
  small,
}: {
  pro: string;
  proNum?: string;
  small?: boolean;
}) {
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
      className={[
        "inline-flex items-center gap-1 rounded border font-bold",
        small
          ? "px-1 py-px text-[9.5px]"
          : "px-1.5 py-0.5 text-[10px]",
        tone,
      ].join(" ")}
    >
      {pro}
      {proNum && (
        <span className="font-mono font-normal opacity-70">
          #{proNum}
        </span>
      )}
    </span>
  );
}

function Change({
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
        className={[
          "w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
          tone === "ok"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-slate-100 text-slate-500",
        ].join(" ")}
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
