import {
  Trash2,
  GripVertical,
  Plus,
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  CircleAlert,
  CircleCheck,
} from "lucide-react";

/**
 * Credits editor — Progressive disclosure v2
 *
 * Two distinct sections:
 *   A) Performance credits — one PERSON row, with N ROLE sub-rows nested under it.
 *      Each role may optionally carry gear + tuning notes. Multi-role people stay
 *      tidy in collapsed form: "Stevie Wonder · Vocals, Clavinet, Harmonica".
 *
 *   B) Publishing & Writers — writer name + publisher / PRO + % split + license
 *      status. Splits live together so the row totals to 100%.
 */
export function Progressive() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[680px] mx-auto space-y-6">
        {/* =================================================================== */}
        {/* A · PERFORMANCE                                                     */}
        {/* =================================================================== */}
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
              Performance credits
              <span className="text-slate-300 font-normal normal-case tracking-normal"> (3 people · 6 roles)</span>
            </h3>
            <button className="text-[#319ED8] text-[12px] font-medium hover:underline flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Person
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
            {/* ---------- COLLAPSED PERSON ROW — backup vocal, no gear ------- */}
            <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60 group">
              <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 flex-shrink-0" />
              <img
                src="https://i.pravatar.cc/64?img=47"
                alt=""
                className="w-7 h-7 rounded-full object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0 flex items-baseline gap-2 text-[13px]">
                <span className="text-slate-900 font-semibold truncate">Tommy Lee James</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-600 truncate">Backup vocals</span>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-300" />
            </div>

            {/* ---------- EXPANDED PERSON ROW — Stevie Wonder, 3 roles -------- */}
            <div className="bg-[#FAFBFC]">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                <img
                  src="https://i.pravatar.cc/64?img=68"
                  alt=""
                  className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0 flex items-baseline gap-2 text-[13px]">
                  <span className="text-slate-900 font-semibold truncate">Stevie Wonder</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-600 truncate">
                    Lead vocals, Clavinet, Harmonica
                  </span>
                </div>
                <ChevronUp className="w-4 h-4 text-slate-400" />
              </div>

              {/* nested role list */}
              <div className="ml-10 mr-2 pb-2 space-y-1.5">
                {/* role 1: vocals, no gear */}
                <RoleRow
                  role="Lead vocals"
                  gear={null}
                  notes={null}
                />
                {/* role 2: clavinet with gear */}
                <RoleRow
                  role="Clavinet"
                  gear="1973 Hohner Clavinet D6"
                  gearSwatch="from-amber-700 to-amber-950"
                  notes="Wah pedal, half-step down"
                />
                {/* role 3: harmonica with gear */}
                <RoleRow
                  role="Harmonica"
                  gear="Hohner Marine Band, key of C"
                  gearSwatch="from-slate-400 to-slate-700"
                  notes={null}
                />

                <button className="ml-2 mt-1 inline-flex items-center gap-1 text-[#319ED8] text-[11px] font-medium hover:underline">
                  <Plus className="w-3 h-3" /> Add another role for Stevie
                </button>

                <div className="flex items-center justify-between pt-1 pr-1">
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 text-[11px] font-medium">Saved</span>
                  </div>
                  <button className="text-slate-300 hover:text-red-500 transition-colors p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* ---------- COLLAPSED PERSON ROW — Nick Carter, 2 roles --------- */}
            <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60 group">
              <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 flex-shrink-0" />
              <img
                src="https://i.pravatar.cc/64?img=12"
                alt=""
                className="w-7 h-7 rounded-full object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0 flex items-baseline gap-2 text-[13px]">
                <span className="text-slate-900 font-semibold truncate">Nick Carter</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-600 truncate">Lead vocals, Acoustic guitar</span>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-300" />
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* B · PUBLISHING & WRITERS                                            */}
        {/* =================================================================== */}
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
              Publishing &amp; writers
              <span className="text-slate-300 font-normal normal-case tracking-normal"> · splits total 100%</span>
            </h3>
            <button className="text-[#319ED8] text-[12px] font-medium hover:underline flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Writer
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
            {/* writer 1 — collapsed */}
            <WriterRow
              avatarSrc="https://i.pravatar.cc/64?img=12"
              name="Nickolas Gene Carter"
              publisher="Songs of Kaotic"
              pro="ASCAP"
              split={50}
              statusOk
              statusText="Hipgnosis covers Kaotic"
            />

            {/* writer 2 — expanded inline editor */}
            <div className="bg-[#FAFBFC]">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                <img
                  src="https://i.pravatar.cc/64?img=23"
                  alt=""
                  className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0 flex items-baseline gap-2 text-[13px]">
                  <span className="text-slate-900 font-semibold truncate">Stuart John Crichton</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-600 truncate">Concord Music Publishing ANZ (APRA)</span>
                </div>
                <span className="text-slate-900 text-[13px] font-semibold tabular-nums">25%</span>
                <ChevronUp className="w-4 h-4 text-slate-400" />
              </div>

              <div className="ml-10 mr-2 pb-3 space-y-2.5">
                <div className="grid grid-cols-[1.5fr_1fr_0.5fr] gap-2">
                  <Field label="Publisher">
                    <input
                      defaultValue="Concord Music Publishing ANZ"
                      className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 focus:outline-none focus:border-[#319ED8]"
                    />
                  </Field>
                  <Field label="PRO">
                    <select
                      defaultValue="APRA"
                      className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 focus:outline-none focus:border-[#319ED8]"
                    >
                      <option>ASCAP</option>
                      <option>BMI</option>
                      <option>SESAC</option>
                      <option>APRA</option>
                      <option>GMR</option>
                    </select>
                  </Field>
                  <Field label="Split %">
                    <div className="flex items-center rounded-md border border-slate-200 bg-white px-2 py-1.5">
                      <input
                        defaultValue="25"
                        className="w-full bg-transparent text-[13px] text-slate-900 text-right tabular-nums focus:outline-none"
                      />
                      <span className="text-slate-400 text-[12px] pl-1">%</span>
                    </div>
                  </Field>
                </div>

                <Field label="License status">
                  <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                    <CircleAlert className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span className="flex-1 text-amber-800 text-[12px]">
                      Need Crichton clearance — not yet covered by Hipgnosis
                    </span>
                    <button className="text-amber-700 text-[11px] font-medium hover:underline">
                      Mark cleared
                    </button>
                  </div>
                </Field>

                <div className="flex items-center justify-between pt-0.5">
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 text-[11px] font-medium">Saved</span>
                  </div>
                  <button className="text-slate-300 hover:text-red-500 transition-colors p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* writer 3 — collapsed */}
            <WriterRow
              avatarSrc="https://i.pravatar.cc/64?img=44"
              name="Tommy Lee James"
              publisher="Songs From Lenwood (admin Kobalt)"
              pro="BMI"
              split={25}
              statusOk={false}
              statusText="Pending clearance"
            />

            {/* totals footer */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50/60 text-[12px]">
              <span className="text-slate-500 font-medium">Total split</span>
              <span className="text-emerald-600 font-semibold tabular-nums">100%</span>
            </div>
          </div>

          <p className="mt-3 text-slate-400 text-[11px] leading-relaxed">
            <span className="font-semibold text-slate-500">Why split:</span> performance
            credits and publishing answer different questions. A backup singer needs no
            publisher; a writer who never performed needs no gear. Keeping them in two
            lists makes splits sum cleanly to 100% and stops the row from sprouting
            empty fields no one fills in.
          </p>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------ sub-components ------------------------------ */

function RoleRow({
  role,
  gear,
  gearSwatch = "from-slate-400 to-slate-700",
  notes,
}: {
  role: string;
  gear: string | null;
  gearSwatch?: string;
  notes: string | null;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
      <span className="px-1.5 py-0.5 rounded bg-sky-50 text-[#319ED8] text-[10.5px] font-semibold tracking-wide flex-shrink-0">
        {role.toUpperCase()}
      </span>
      {gear ? (
        <>
          <div
            className={`w-5 h-5 rounded bg-gradient-to-br ${gearSwatch} flex-shrink-0`}
          />
          <span className="text-slate-900 text-[12.5px] truncate">{gear}</span>
          {notes ? (
            <>
              <span className="text-slate-300 text-[12px]">·</span>
              <span className="text-slate-500 text-[11.5px] truncate">{notes}</span>
            </>
          ) : null}
        </>
      ) : (
        <span className="text-slate-400 text-[11.5px] italic">No gear (voice only)</span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button className="text-slate-300 text-[11px] hover:text-slate-700 px-1">
          Edit
        </button>
        <button className="text-slate-300 hover:text-red-500 p-0.5">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function WriterRow({
  avatarSrc,
  name,
  publisher,
  pro,
  split,
  statusOk,
  statusText,
}: {
  avatarSrc: string;
  name: string;
  publisher: string;
  pro: string;
  split: number;
  statusOk: boolean;
  statusText: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60 group">
      <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 flex-shrink-0" />
      <img src={avatarSrc} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 text-[13px]">
          <span className="text-slate-900 font-semibold truncate">{name}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11.5px] mt-0.5">
          <span className="text-slate-500 truncate">
            {publisher} <span className="text-slate-300">·</span> {pro}
          </span>
          {statusOk ? (
            <span className="flex items-center gap-1 text-emerald-600 flex-shrink-0">
              <CircleCheck className="w-3 h-3" />
              <span className="text-[10.5px]">{statusText}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-600 flex-shrink-0">
              <CircleAlert className="w-3 h-3" />
              <span className="text-[10.5px]">{statusText}</span>
            </span>
          )}
        </div>
      </div>
      <span className="text-slate-900 text-[13px] font-semibold tabular-nums">{split}%</span>
      <ChevronDown className="w-4 h-4 text-slate-300" />
    </div>
  );
}
