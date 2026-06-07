import { useState, useEffect } from "react";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Minus,
  Plus,
  ShoppingBag,
  Info,
  Gift,
  Sparkles,
  Expand,
  Apple,
  Lock,
} from "lucide-react";

/**
 * "Get Hope. Give Hope." — Nightbirde · Hope · clickable fan offer flow.
 *
 * A sandbox mockup of the redesigned Preview & Purchase flow Bill sketched,
 * iterated to remove decision-clutter and lean into the campaign's own
 * two-beat narrative:
 *   overview → GET HOPE (bundle + optional signed upgrade)
 *            → GIVE HOPE (Gift of Hope donation) → sign in & pay.
 *
 * Built in the real GoodTunes design system (brand-navy bg, royal-navy
 * modal, brand-blue CTA, orange section labels, mint confirm). Imagery is
 * lifted from Bill's own concept sketches. Read-only: every control logs
 * to the console; nothing touches real checkout. Served at
 * /__mockup/preview/hope-offer/Flow.
 */

const BG = "#00062B";
const CARD = "#0E1A4E";
const PANEL = "#19295D";
const BLUE = "#319ED8";
const ORANGE = "#F09837";
const MINT = "#4AFFCA";

const PRICE = { bundle: 25, signed: 25 };
const GIFT_MIN = 75;
const GIFT_PRESETS = [75, 100, 250];

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;

const img = (name: string) =>
  `${import.meta.env.BASE_URL.replace(/\/$/, "")}/images/${name}`;

type Step = "overview" | "buy" | "give" | "pay";
const ORDER: Step[] = ["overview", "buy", "give", "pay"];

/* ── small primitives ─────────────────────────────────────────────── */

function QtyStepper({
  value,
  onChange,
  testid,
  min = 0,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  testid: string;
  min?: number;
  max?: number;
}) {
  const atMin = value <= min;
  const atMax = max != null && value >= max;
  return (
    <div
      className="inline-flex items-center rounded-full border border-white/20 bg-white/[0.04] h-10 px-1"
      data-testid={testid}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-full inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        disabled={atMin}
      >
        <Minus className="w-4 h-4" strokeWidth={2.4} />
      </button>
      <span className="w-7 text-center text-white text-[15px] font-semibold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(max != null ? Math.min(max, value + 1) : value + 1)}
        className="w-8 h-8 rounded-full inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        disabled={atMax}
      >
        <Plus className="w-4 h-4" strokeWidth={2.4} />
      </button>
    </div>
  );
}

/** Inline "$25 × 2 = $50" math, sitting where a button used to be. */
function LineMath({ unit, qty, testid }: { unit: number; qty: number; testid: string }) {
  return (
    <span className="text-white/55 text-[14px] tabular-nums" data-testid={testid}>
      {usd(unit)} <span className="text-white/35">×</span> {qty}{" "}
      <span className="text-white/35">=</span>{" "}
      <span className="text-white font-bold">{usd(unit * qty)}</span>
    </span>
  );
}

/** Tap-to-reveal explainer (tap, not hover — this lands on touch). */
function WhyMore() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="link-why-more"
        className="inline-flex items-center gap-1 text-white/45 hover:text-white/75 text-[12px] transition-colors"
      >
        <Info className="w-3.5 h-3.5" strokeWidth={2} />
        Why more than one?
      </button>
      {open && (
        <div
          data-testid="popover-why-more"
          className="absolute z-30 left-0 top-full mt-2 w-[268px] rounded-xl p-3.5 text-[12.5px] leading-[1.55] text-white/85"
          style={{
            background: PANEL,
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
          }}
        >
          Some people buy more than one as a gift for friends — sharing the music, and the
          chance to help women facing cancer.
        </div>
      )}
    </div>
  );
}

function EditionCol({
  label,
  items,
}: {
  label: string;
  items: { head: string; body: string }[];
}) {
  return (
    <div className="flex-1 min-w-0">
      <div
        className="text-[13px] font-bold uppercase tracking-[0.04em] mb-3"
        style={{ color: ORANGE }}
      >
        {label}
      </div>
      <div className="flex flex-col gap-3.5">
        {items.map((it) => (
          <div key={it.head}>
            <div className="text-white text-[13.5px] font-semibold">{it.head}</div>
            <div className="text-white/60 text-[12.5px] leading-[1.45] mt-0.5">
              {it.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Note({ icon: Icon, children }: { icon: typeof Gift; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 items-start text-white/55 text-[12.5px] leading-[1.55]">
      <Icon className="w-4 h-4 mt-px flex-shrink-0" strokeWidth={2} style={{ color: ORANGE }} />
      <span>{children}</span>
    </div>
  );
}

/* ── faint album page behind the modal ────────────────────────────── */

function AlbumBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden style={{ background: BG }}>
      <img
        src={img("goodtunes-logo-white.png")}
        alt=""
        className="absolute top-7 left-8 w-[120px] h-auto opacity-90"
        draggable={false}
      />
      <div className="absolute left-[6%] top-[26%] opacity-25 blur-[1px]">
        <div
          className="rounded-2xl overflow-hidden"
          style={{ width: 230, height: 230, boxShadow: "0 18px 50px rgba(0,0,0,0.5)" }}
        >
          <img src={img("hope-get-hope.png")} alt="" className="w-full h-full object-cover" />
        </div>
      </div>
      <div className="absolute right-[6%] top-[40%] w-[34%] flex flex-col gap-5 opacity-20">
        {["Gold", "Better Days", "It's OK", "Girl in a Bubble", "Brave"].map((t, i) => (
          <div key={t} className="flex items-center gap-4">
            <span className="text-white/50 text-[13px] tabular-nums">{i + 1}.</span>
            <span className="text-white text-[14px] flex-1">{t}</span>
            <span className="text-white/40 text-[13px] tabular-nums">3:{20 + i}</span>
          </div>
        ))}
      </div>
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,3,18,0.6)", backdropFilter: "blur(3px)" }}
      />
    </div>
  );
}

/* ── steps ────────────────────────────────────────────────────────── */

function OverviewStep() {
  return (
    <div data-testid="step-overview">
      <h1 className="text-white text-[30px] font-bold tracking-[-0.02em] mb-5">
        Get Hope. Give Hope.
      </h1>
      <div className="flex gap-6">
        <div
          className="flex-shrink-0 rounded-2xl overflow-hidden bg-white"
          style={{ width: 210, height: 210, boxShadow: "0 12px 36px rgba(0,0,0,0.4)" }}
        >
          <img src={img("hope-get-hope.png")} alt="Nightbirde — Hope" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0 text-white/70 text-[13px] leading-[1.55] flex flex-col gap-3">
          <p>
            It's been five years since <strong className="text-white">Nightbirde</strong> (Jane
            Marczewski) appeared on <strong className="text-white">America's Got Talent</strong> (AGT)
            and received the <strong className="text-white">Golden Buzzer</strong> from{" "}
            <strong className="text-white">Simon Cowell.</strong>
          </p>
          <p>
            Before she passed, Jane provided her family with all of her journals, photos, artwork,
            and music and gave them a mission — use whatever you can to help women with breast cancer.
          </p>
          <p>
            The "Get Hope. Give Hope." campaign was built to do just that — proceeds from every
            purchase go to Nightbirde Foundation. You can also donate a "Gift of Hope" box to someone
            you know with cancer, or let us choose someone in need on your behalf.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl p-6" style={{ background: PANEL }}>
        <h2 className="text-white text-[20px] font-bold tracking-[-0.01em]">Here's what you'll get</h2>
        <p className="text-white/65 text-[13px] leading-[1.5] mt-1.5 max-w-[560px]">
          This package has been hand curated by Jane's family for you. Digital arrives instantly.
          Physical ships 8–10 weeks after ordering.
        </p>
        <div className="flex gap-8 mt-5">
          <EditionCol
            label="Digital Collector Edition"
            items={[
              { head: "Music", body: "Instant access to the music with the free GoodTunes® Player." },
              { head: "GoodDeed®", body: "A numbered, personalized printable PDF GoodDeed® Certificate suitable for framing." },
              { head: "Bonus", body: "Photos and videos curated by Jane's family." },
            ]}
          />
          <div className="w-px self-stretch bg-white/10" />
          <EditionCol
            label="Physical Collector Edition"
            items={[
              { head: "Music", body: "7\" vinyl tracks \"Gold\" & \"Better Days\"." },
              { head: "Booklet", body: "Special-edition companion booklet featuring lyrics, Jane's poems, exclusive photos and more." },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function BuyStep({
  bundleQty,
  onBundle,
  signedQty,
  onSigned,
}: {
  bundleQty: number;
  onBundle: (n: number) => void;
  signedQty: number;
  onSigned: (n: number) => void;
}) {
  return (
    <div data-testid="step-buy">
      <h1 className="text-white text-[28px] font-bold tracking-[-0.02em] mb-1.5">Get Hope</h1>
      <p className="text-white/60 text-[13.5px] leading-[1.5] mb-6 max-w-[520px]">
        The first in a limited-edition series — a 7" Physical Collector Edition plus the full Digital
        Collector Edition. Proceeds benefit the Nightbirde Foundation.
      </p>

      {/* bundle */}
      <div className="flex gap-5">
        <div
          className="flex-shrink-0 rounded-2xl overflow-hidden bg-white"
          style={{ width: 168, height: 168, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}
        >
          <img src={img("hope-get-hope.png")} alt="Hope Bundle" className="w-full h-full object-cover" draggable={false} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-white text-[19px] font-bold tracking-[-0.01em]">Hope Bundle</h3>
            <div className="flex-shrink-0 text-white text-[18px] font-bold tabular-nums" data-testid="price-bundle">
              {usd(PRICE.bundle)}
            </div>
          </div>
          <p className="text-white/65 text-[13px] leading-[1.5] mt-1.5 max-w-[340px]">
            Physical 7" vinyl + companion booklet, plus the Digital Collector Edition with GoodDeed®
            certificate and bonus content from Jane's family.
          </p>
          <div className="mt-auto pt-4 flex items-center gap-4">
            <QtyStepper value={bundleQty} onChange={onBundle} min={1} testid="stepper-bundle" />
            <LineMath unit={PRICE.bundle} qty={bundleQty} testid="linetotal-bundle" />
          </div>
          <div className="mt-2.5">
            <WhyMore />
          </div>
        </div>
      </div>

      {/* signed upgrade — coupled to the bundle count just chosen */}
      <div className="h-px bg-white/10 my-6" />
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={2.2} style={{ color: ORANGE }} />
          <span className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: ORANGE }}>
            Make it official
          </span>
        </div>
        <div className="flex gap-5">
          <div
            className="flex-shrink-0 rounded-2xl overflow-hidden bg-white"
            style={{ width: 132, height: 132, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}
          >
            <img src={img("hope-cert-framed.jpg")} alt="Signed GoodDeed Certificate" className="w-full h-full object-cover" draggable={false} />
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-white text-[16px] font-bold tracking-[-0.01em]">
                Signed GoodDeed® Certificate
              </h3>
              <div className="flex-shrink-0 text-white text-[15px] font-bold tabular-nums" data-testid="price-signed">
                +{usd(PRICE.signed)} each
              </div>
            </div>
            <p className="text-white/65 text-[12.5px] leading-[1.5] mt-1.5 max-w-[360px]">
              Hand-signed by Jane's family, personalized with your name and unique number, finished
              with a holographic seal + QR provenance. Ships with your vinyl.
            </p>
            <div className="mt-auto pt-3.5 flex items-center gap-4">
              <QtyStepper
                value={signedQty}
                onChange={onSigned}
                min={0}
                max={bundleQty}
                testid="stepper-signed"
              />
              <span className="text-[13px] tabular-nums" data-testid="hint-signed">
                {signedQty === 0 ? (
                  <span className="text-white/45">
                    Optional — up to your {bundleQty} cop{bundleQty > 1 ? "ies" : "y"}
                  </span>
                ) : (
                  <span className="text-white/55">
                    {signedQty} of {bundleQty} signed{" "}
                    <span className="text-white/35">=</span>{" "}
                    <span className="text-white font-bold">{usd(PRICE.signed * signedQty)}</span>
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GiftAmount({
  amount,
  onAmount,
}: {
  amount: number;
  onAmount: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {GIFT_PRESETS.map((p) => {
        const active = amount === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onAmount(p)}
            data-testid={`pill-gift-${p}`}
            className="h-10 px-4 rounded-full text-[14px] font-semibold tabular-nums transition-colors"
            style={
              active
                ? { background: "#fff", color: BG }
                : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.16)" }
            }
          >
            {usd(p)}
          </button>
        );
      })}
      <div className="inline-flex items-center rounded-full border border-white/20 bg-white/[0.04] h-10 px-1">
        <button
          type="button"
          aria-label="Give less"
          onClick={() => onAmount(Math.max(GIFT_MIN, amount - 25))}
          disabled={amount <= GIFT_MIN}
          className="w-8 h-8 rounded-full inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Minus className="w-4 h-4" strokeWidth={2.4} />
        </button>
        <span className="px-2 text-center text-white text-[14px] font-semibold tabular-nums" data-testid="text-gift-amount">
          {usd(amount)}
        </span>
        <button
          type="button"
          aria-label="Give more"
          onClick={() => onAmount(amount + 25)}
          className="w-8 h-8 rounded-full inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

function GiveStep({
  boxQty,
  onBox,
  giftAmount,
  onAmount,
}: {
  boxQty: number;
  onBox: (n: number) => void;
  giftAmount: number;
  onAmount: (n: number) => void;
}) {
  const active = boxQty > 0;
  return (
    <div data-testid="step-give">
      <h1 className="text-white text-[28px] font-bold tracking-[-0.02em] mb-1.5">Give Hope</h1>
      <p className="text-white/60 text-[13.5px] leading-[1.5] mb-6 max-w-[540px]">
        Send a Gift of Hope box to someone facing cancer — or let us choose someone in need on your
        behalf. Every box is a donation to the Nightbirde Foundation.
      </p>

      <div className="flex gap-5">
        <div
          className="flex-shrink-0 rounded-2xl overflow-hidden bg-white"
          style={{ width: 168, height: 168, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}
        >
          <img src={img("hope-gift-box.png")} alt="Gift of Hope Box" className="w-full h-full object-cover" draggable={false} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <h3 className="text-white text-[19px] font-bold tracking-[-0.01em]">Gift of Hope Box</h3>
          <p className="text-white/65 text-[13px] leading-[1.5] mt-1.5 max-w-[360px]">
            A stainless-steel Nightbirde cup, a copy of her debut album "It's OK," and Jane's book of
            poetry, <em>Poems for the Dark</em>.
          </p>
          <div className="mt-auto pt-4 flex items-center gap-4">
            <QtyStepper value={boxQty} onChange={onBox} min={0} testid="stepper-box" />
            <span className="text-[13px]" data-testid="hint-box">
              {active ? (
                <span className="text-white/55">
                  {boxQty} box{boxQty > 1 ? "es" : ""}
                </span>
              ) : (
                <span className="text-white/45">Optional</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {active && (
        <div className="mt-6 rounded-2xl p-5" style={{ background: PANEL }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-white text-[14px] font-semibold">
              Your gift{boxQty > 1 ? " (each box)" : ""}
            </span>
            <span className="text-white/45 text-[12.5px]">Minimum {usd(GIFT_MIN)}</span>
          </div>
          <GiftAmount amount={giftAmount} onAmount={onAmount} />
          {boxQty > 1 && (
            <div className="mt-3 text-white/55 text-[13px] tabular-nums" data-testid="text-gift-total">
              {usd(giftAmount)} <span className="text-white/35">×</span> {boxQty}{" "}
              <span className="text-white/35">=</span>{" "}
              <span className="text-white font-bold">{usd(giftAmount * boxQty)}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        <Note icon={Gift}>
          Giving more than one? Tell us who each gift is for after checkout — we'll make it easy.
        </Note>
        <Note icon={Sparkles}>
          Personalize after purchase: keep a gift anonymous or add a message, and choose who
          receives each box.
        </Note>
      </div>
    </div>
  );
}

function PayStep({
  bundleQty,
  signedQty,
  boxQty,
  giftAmount,
}: {
  bundleQty: number;
  signedQty: number;
  boxQty: number;
  giftAmount: number;
}) {
  const lines = [
    { label: "Hope Bundle", sub: '7" + Digital Collector Edition', qty: bundleQty, unit: PRICE.bundle },
    { label: "Signed GoodDeed® Certificate", sub: undefined, qty: signedQty, unit: PRICE.signed },
    { label: "Gift of Hope (donation)", sub: undefined, qty: boxQty, unit: giftAmount },
  ].filter((l) => l.qty > 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit, 0);

  return (
    <div data-testid="step-pay">
      <h1 className="text-white text-[28px] font-bold tracking-[-0.02em] mb-1">Almost there</h1>
      <p className="text-white/60 text-[13.5px] mb-6">
        Sign in to lock in your GoodDeed® number and complete your order.
      </p>

      <div className="rounded-2xl p-5" style={{ background: PANEL }}>
        <div className="text-white/55 text-[11px] font-bold uppercase tracking-[0.12em] mb-3">
          Your order
        </div>
        <div className="flex flex-col gap-3">
          {lines.map((l) => (
            <div key={l.label} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-white text-[14px]">{l.label}</span>
                {l.sub && <div className="text-white/45 text-[12px] mt-0.5">{l.sub}</div>}
                {l.qty > 1 && (
                  <div className="text-white/45 text-[12px] tabular-nums mt-0.5">
                    {usd(l.unit)} × {l.qty}
                  </div>
                )}
              </div>
              <span className="flex-shrink-0 text-white text-[14px] font-semibold tabular-nums">
                {usd(l.unit * l.qty)}
              </span>
            </div>
          ))}
        </div>
        <div className="h-px bg-white/10 my-4" />
        <div className="flex items-center justify-between">
          <span className="text-white/75 text-[14px] font-semibold">Subtotal</span>
          <span className="text-white text-[17px] font-bold tabular-nums" data-testid="text-subtotal">
            {usd(subtotal)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-white/55 text-[12.5px] mt-3">
          <Lock className="w-3.5 h-3.5" strokeWidth={2} />
          Shipping &amp; sales tax calculated at checkout.
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => console.log("[mockup] apple pay")}
          className="h-12 rounded-full inline-flex items-center justify-center gap-2 text-[15px] font-semibold bg-white text-black active:scale-[0.98] transition-transform"
          data-testid="button-applepay"
        >
          <Apple className="w-5 h-5 fill-current" strokeWidth={0} />
          Pay
        </button>
        <button
          type="button"
          onClick={() => console.log("[mockup] sign in to pay")}
          className="h-12 rounded-full inline-flex items-center justify-center gap-2 text-[15px] font-semibold text-white active:scale-[0.98] transition-transform"
          style={{ background: BLUE }}
          data-testid="button-signin-pay"
        >
          Sign in &amp; pay with card
        </button>
        <p className="text-white/40 text-[11.5px] text-center mt-1">
          New here? We'll create your account automatically after purchase.
        </p>
      </div>
    </div>
  );
}

/* ── shell ────────────────────────────────────────────────────────── */

function initialStep(): Step {
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("step") as Step;
    if (q && ORDER.includes(q)) return q;
    const h = window.location.hash.replace("#", "") as Step;
    if (ORDER.includes(h)) return h;
  }
  return "overview";
}

export default function Flow() {
  const seeded = initialStep() !== "overview";
  const [step, setStep] = useState<Step>(initialStep);
  const [bundleQty, setBundleQty] = useState(1);
  const [signedQty, setSignedQty] = useState(seeded ? 1 : 0);
  const [boxQty, setBoxQty] = useState(seeded ? 1 : 0);
  const [giftAmount, setGiftAmount] = useState(GIFT_MIN);

  // signed certs can never exceed the number of copies in the bag.
  useEffect(() => {
    if (signedQty > bundleQty) setSignedQty(bundleQty);
  }, [bundleQty, signedQty]);

  const idx = ORDER.indexOf(step);
  const go = (s: Step) => {
    setStep(s);
    console.log(`[mockup] step → ${s}`);
  };

  const primary = (() => {
    switch (step) {
      case "overview":
        return { label: "Get Hope", onClick: () => go("buy"), Icon: ChevronRight };
      case "buy":
        return {
          label: `Add ${bundleQty} to Bag`,
          onClick: () => go("give"),
          Icon: ShoppingBag,
        };
      case "give":
        return { label: "Review order", onClick: () => go("pay"), Icon: ChevronRight };
      case "pay":
        return null;
    }
  })();

  return (
    <div
      className="relative w-full h-screen overflow-hidden flex items-center justify-center"
      style={{ fontFamily: "system-ui, -apple-system, 'SF Pro Text', sans-serif" }}
      data-testid="hope-offer-flow"
    >
      <AlbumBackdrop />

      {/* Modal */}
      <div
        className="relative z-10 w-[min(720px,calc(100vw-48px))] max-h-[calc(100vh-56px)] rounded-[28px] flex flex-col overflow-hidden"
        style={{
          background: CARD,
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
        }}
        data-testid="offer-modal"
      >
        {/* header: progress + close */}
        <div className="flex items-center gap-3 px-7 pt-5">
          <div className="flex items-center gap-1.5">
            {ORDER.map((s, i) => (
              <span
                key={s}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === idx ? 22 : 7,
                  background: i <= idx ? BLUE : "rgba(255,255,255,0.18)",
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 text-white/55 text-[12px] font-medium">
            <img
              src={img("hope-get-hope.png")}
              alt=""
              className="w-5 h-5 rounded-[5px] object-cover"
              draggable={false}
            />
            Nightbirde · Hope
          </div>
          <div className="flex-1" />
          <button
            type="button"
            aria-label="Close"
            onClick={() => go("overview")}
            data-testid="button-close"
            className="w-9 h-9 -mr-1 rounded-full inline-flex items-center justify-center text-white/55 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={2.2} />
          </button>
        </div>

        {/* body */}
        <div className="px-7 py-6 overflow-y-auto">
          {step === "overview" && <OverviewStep />}
          {step === "buy" && (
            <BuyStep
              bundleQty={bundleQty}
              onBundle={setBundleQty}
              signedQty={signedQty}
              onSigned={setSignedQty}
            />
          )}
          {step === "give" && (
            <GiveStep
              boxQty={boxQty}
              onBox={setBoxQty}
              giftAmount={giftAmount}
              onAmount={setGiftAmount}
            />
          )}
          {step === "pay" && (
            <PayStep
              bundleQty={bundleQty}
              signedQty={signedQty}
              boxQty={boxQty}
              giftAmount={giftAmount}
            />
          )}
        </div>

        {/* footer nav */}
        <div
          className="flex items-center gap-3 px-7 py-4 border-t border-white/8"
          style={{ background: "rgba(0,0,0,0.18)" }}
        >
          {idx > 0 ? (
            <button
              type="button"
              onClick={() => go(ORDER[idx - 1])}
              data-testid="button-back"
              className="h-11 pl-3 pr-5 rounded-full inline-flex items-center gap-1.5 text-white/75 hover:text-white text-[14px] font-semibold transition-colors"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={2.4} />
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={() => console.log("[mockup] maybe later")}
              data-testid="button-later"
              className="h-11 px-2 text-white/45 hover:text-white/75 text-[14px] font-medium transition-colors"
            >
              Maybe later
            </button>
          )}

          <div className="flex-1" />

          {primary && (
            <button
              type="button"
              onClick={primary.onClick}
              data-testid="button-primary"
              className="h-11 pl-6 pr-5 rounded-full inline-flex items-center gap-2 text-white font-semibold text-[14.5px] transition-all active:scale-[0.97]"
              style={{ background: BLUE }}
            >
              {primary.label}
              <primary.Icon className="w-4 h-4" strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
