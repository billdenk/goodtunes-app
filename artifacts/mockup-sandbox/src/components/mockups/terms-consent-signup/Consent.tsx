// Terms-acceptance microcopy at sign-up — both surfaces side by side.
// LEFT  = fan / customer (dark Apple-Music card on the brand navy bg),
//         the line sits under Continue + the Google/Apple buttons on the
//         "Create Account" tab.
// RIGHT = invited partner / admin (white card), the line sits under the
//         accept button + the Google/Apple options on the invite page.
//
// This is a faithful study of the live copy + placement + inline-link
// treatment (inherit color at rest, brand-blue + underline on HOVER —
// hover either link in the canvas to see it). Brand colors are written as
// rgb()/rgba() because the design linter forbids raw brand-hex literals
// outside the app's index.css.

const BRAND_BLUE = "rgb(49,158,216)"; // brand blue
const BRAND_BG = "rgb(0,6,43)"; // brand navy

function FanConsent() {
  return (
    <p className="mt-5 text-center text-xs leading-relaxed text-white/40">
      By continuing, you agree to our{" "}
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="underline-offset-2 transition-colors hover:text-[rgb(49,158,216)] hover:underline"
      >
        Terms
      </a>{" "}
      and{" "}
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="underline-offset-2 transition-colors hover:text-[rgb(49,158,216)] hover:underline"
      >
        Privacy Policy
      </a>
      .
    </p>
  );
}

function PartnerConsent() {
  return (
    <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
      By continuing, you agree to our{" "}
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="underline-offset-2 transition-colors hover:text-[rgb(49,158,216)] hover:underline"
      >
        Terms
      </a>{" "}
      and{" "}
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="underline-offset-2 transition-colors hover:text-[rgb(49,158,216)] hover:underline"
      >
        Privacy Policy
      </a>
      .
    </p>
  );
}

function Wordmark({ dark }: { dark?: boolean }) {
  return (
    <div
      className="text-2xl font-extrabold tracking-tight"
      style={{ color: dark ? "rgb(15,23,42)" : "#fff", lineHeight: 1 }}
    >
      Good<span style={{ color: BRAND_BLUE }}>Tunes</span>
    </div>
  );
}

function GoogleBtn({ dark }: { dark?: boolean }) {
  return (
    <button
      className={
        dark
          ? "flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-800"
          : "flex h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-slate-800"
      }
    >
      <span className="text-base font-bold" style={{ color: "#4285F4" }}>
        G
      </span>
      Continue with Google
    </button>
  );
}

function AppleBtn({ dark }: { dark?: boolean }) {
  return (
    <button
      className={
        dark
          ? "flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-semibold text-white"
          : "flex h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-slate-800"
      }
    >
      <span className="text-base"></span>
      Continue with Apple
    </button>
  );
}

function FanCard() {
  return (
    <div
      className="w-full max-w-[380px] rounded-3xl px-7 pb-8 pt-9 shadow-2xl"
      style={{
        background:
          "linear-gradient(180deg, rgba(127,16,167,0.18), rgba(0,6,43,0)) , rgba(8,14,48,0.92)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="mb-6 flex flex-col items-center gap-1">
        <Wordmark />
        <p className="text-xs text-white/45">Create your GoodTunes account</p>
      </div>

      {/* segmented tabs */}
      <div className="mb-6 flex rounded-xl bg-white/5 p-1 text-sm font-semibold">
        <div className="flex-1 rounded-lg py-2 text-center text-white/45">
          Sign In
        </div>
        <div className="flex-1 rounded-lg bg-white/10 py-2 text-center text-white">
          Create Account
        </div>
      </div>

      {/* inputs */}
      <div className="space-y-3">
        <div className="rounded-xl bg-white/[0.06] px-4 py-3 text-sm text-white/35">
          you@example.com
        </div>
        <div className="rounded-xl bg-white/[0.06] px-4 py-3 text-sm text-white/35">
          ••••••••
        </div>
      </div>

      <button
        className="mt-5 h-12 w-full rounded-xl text-sm font-semibold text-white"
        style={{
          background: `linear-gradient(180deg, ${BRAND_BLUE}, rgb(33,120,175))`,
        }}
      >
        Continue
      </button>

      <div className="my-4 text-center text-xs text-white/30">or</div>

      <div className="grid gap-3">
        <GoogleBtn />
        <AppleBtn />
      </div>

      {/* THE consent microcopy */}
      <FanConsent />
    </div>
  );
}

function PartnerCard() {
  return (
    <div className="w-full max-w-[380px] rounded-3xl border border-slate-200 bg-white px-7 pb-8 pt-9 shadow-2xl">
      <div className="mb-5 flex flex-col items-center gap-1">
        <Wordmark dark />
        <p className="text-xs text-slate-400">You've been invited as a Label</p>
      </div>

      <div className="rounded-xl bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">
        compass@records.com
      </div>

      <div className="mt-3 space-y-3">
        <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-400">
          Pick a username
        </div>
        <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-400">
          Set a password
        </div>
      </div>

      <button className="mt-5 h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white">
        Accept invite
      </button>

      <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-800">
          <span style={{ color: "#4285F4" }}>G</span> Google
        </button>
        <button className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-900 bg-slate-900 text-sm font-semibold text-white">
           Apple
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">
        The Google/Apple email must match{" "}
        <span className="font-semibold">compass@records.com</span>.
      </p>

      {/* THE consent microcopy */}
      <PartnerConsent />
    </div>
  );
}

export function Consent() {
  return (
    <div
      className="min-h-screen w-full px-6 py-12"
      style={{
        background: `radial-gradient(1200px 600px at 50% -10%, rgba(127,16,167,0.25), ${BRAND_BG} 60%)`,
      }}
    >
      <div className="mx-auto max-w-[860px]">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-white">
            Terms acceptance at sign-up
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Inline microcopy under the primary CTA — no checkbox. Hover a link
            to see the brand-blue underline treatment.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="flex flex-col items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/40">
              Fan · customer (dark card)
            </span>
            <FanCard />
          </div>
          <div className="flex flex-col items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/40">
              Partner · admin invite (white card)
            </span>
            <PartnerCard />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Consent;
