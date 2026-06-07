import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Minus, Plus, Check, Heart, Apple, Lock } from "lucide-react";

/**
 * "Get Hope. Give Hope." — Nightbirde · Hope · clickable fan offer flow.
 *
 * A sandbox mockup of the redesigned Preview & Purchase flow Bill sketched:
 * a centered modal over the album page that steps through
 *   overview → buy bundle → add-ons → sign in & pay.
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

const img = (name: string) =>
  `${import.meta.env.BASE_URL.replace(/\/$/, "")}/images/${name}`;

type Step = "overview" | "buy" | "addons" | "pay";
const ORDER: Step[] = ["overview", "buy", "addons", "pay"];

/* ── small primitives ─────────────────────────────────────────────── */

function QtyStepper({
  value,
  onChange,
  testid,
}: {
  value: number;
  onChange: (n: number) => void;
  testid: string;
}) {
  return (
    <div
      className="inline-flex items-center rounded-full border border-white/20 bg-white/[0.04] h-10 px-1"
      data-testid={testid}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-8 h-8 rounded-full inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
        disabled={value === 0}
      >
        <Minus className="w-4 h-4" strokeWidth={2.4} />
      </button>
      <span className="w-7 text-center text-white text-[15px] font-semibold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(value + 1)}
        className="w-8 h-8 rounded-full inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
      >
        <Plus className="w-4 h-4" strokeWidth={2.4} />
      </button>
    </div>
  );
}

function AddButton({
  added,
  onClick,
  testid,
}: {
  added: boolean;
  onClick: () => void;
  testid: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className="h-10 px-5 rounded-full inline-flex items-center gap-2 text-[14px] font-semibold transition-colors active:scale-[0.97]"
      style={
        added
          ? { background: "rgba(74,255,202,0.14)", color: MINT, border: `1px solid ${MINT}55` }
          : { background: "#fff", color: BG }
      }
    >
      {added ? (
        <>
          <Check className="w-4 h-4" strokeWidth={2.6} />
          Added
        </>
      ) : (
        "Add to order"
      )}
    </button>
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

/* ── product row (buy + add-ons) ──────────────────────────────────── */

function ProductRow({
  image,
  title,
  desc,
  qty,
  onQty,
  testid,
  imgClass = "",
}: {
  image: string;
  title: string;
  desc: React.ReactNode;
  qty: number;
  onQty: (n: number) => void;
  testid: string;
  imgClass?: string;
}) {
  return (
    <div className="flex gap-5" data-testid={`row-${testid}`}>
      <div
        className="flex-shrink-0 rounded-2xl overflow-hidden bg-white"
        style={{ width: 168, height: 168, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}
      >
        <img
          src={image}
          alt={title}
          className={"w-full h-full object-cover " + imgClass}
          draggable={false}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <h3 className="text-white text-[19px] font-bold tracking-[-0.01em]">{title}</h3>
        <div className="text-white/65 text-[13px] leading-[1.5] mt-1.5 max-w-[340px]">
          {desc}
        </div>
        <div className="mt-auto pt-4 flex items-center gap-3">
          <QtyStepper value={qty} onChange={onQty} testid={`stepper-${testid}`} />
          <AddButton
            added={qty > 0}
            onClick={() => onQty(qty > 0 ? qty : 1)}
            testid={`add-${testid}`}
          />
        </div>
      </div>
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
            The "Get Hope. Give Hope." campaign has been built to do just that. Proceeds from every
            purchase go to Nightbirde Foundation. Plus, you can donate a "Gift of Hope" box to be
            shipped to someone you know who has cancer, or allow us to choose someone in need on your
            behalf.
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

function BuyStep({ qty, onQty }: { qty: number; onQty: (n: number) => void }) {
  return (
    <div data-testid="step-buy">
      <h1 className="text-white text-[28px] font-bold tracking-[-0.02em] mb-6">
        Get Nightbirde's Hope Bundle
      </h1>
      <ProductRow
        testid="bundle"
        image={img("hope-get-hope.png")}
        title="Get Hope"
        desc={
          <>
            The first in a limited-edition series. Includes the Digital Collector Edition and the 7"
            Physical Collector Edition. Proceeds benefit Nightbirde Foundation.
          </>
        }
        qty={qty}
        onQty={onQty}
      />
    </div>
  );
}

function AddonsStep({
  certQty,
  onCert,
  boxQty,
  onBox,
}: {
  certQty: number;
  onCert: (n: number) => void;
  boxQty: number;
  onBox: (n: number) => void;
}) {
  return (
    <div data-testid="step-addons">
      <h1 className="text-white text-[28px] font-bold tracking-[-0.02em] mb-6">Add-ons</h1>
      <div className="flex flex-col gap-8">
        <ProductRow
          testid="cert"
          image={img("hope-cert-framed.jpg")}
          title="Signed GoodDeed® Certificate"
          desc={
            <>
              Printed on museum-quality heavy stock, this deed of your good is personalized with your
              name and your unique number. Signed by Jane's family and authenticated with a GoodTunes
              holographic seal and a QR code for digital provenance. Ships with your vinyl order. Frame
              not included.
            </>
          }
          qty={certQty}
          onQty={onCert}
        />
        <div className="h-px bg-white/10" />
        <ProductRow
          testid="box"
          image={img("hope-gift-box.png")}
          title="Gift of Hope Box"
          desc={
            <>
              Each box includes a stainless-steel Nightbirde cup, a copy of her debut album "It's OK,"
              and Jane's book of poetry, <em>Poems for the Dark</em>. Add a note of your own, or let
              the Nightbirde team write one — and we'll send it to someone you love who's facing
              cancer, or someone in need we choose on your behalf.
            </>
          }
          qty={boxQty}
          onQty={onBox}
        />
      </div>
    </div>
  );
}

function PayStep({
  bundleQty,
  certQty,
  boxQty,
}: {
  bundleQty: number;
  certQty: number;
  boxQty: number;
}) {
  const lines = [
    { label: "Get Hope — Hope Bundle", qty: bundleQty },
    { label: "Signed GoodDeed® Certificate", qty: certQty },
    { label: "Gift of Hope Box", qty: boxQty },
  ].filter((l) => l.qty > 0);

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
        <div className="flex flex-col gap-2.5">
          {lines.map((l) => (
            <div key={l.label} className="flex items-center justify-between">
              <span className="text-white text-[14px]">{l.label}</span>
              <span className="text-white/60 text-[13px] tabular-nums">×{l.qty}</span>
            </div>
          ))}
        </div>
        <div className="h-px bg-white/10 my-4" />
        <div className="flex items-center gap-2 text-white/55 text-[12.5px]">
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
  const [bundleQty, setBundleQty] = useState(seeded ? 1 : 0);
  const [certQty, setCertQty] = useState(seeded ? 1 : 0);
  const [boxQty, setBoxQty] = useState(seeded ? 1 : 0);

  const idx = ORDER.indexOf(step);
  const go = (s: Step) => {
    setStep(s);
    console.log(`[mockup] step → ${s}`);
  };

  const primary = (() => {
    switch (step) {
      case "overview":
        return { label: "Get Hope", onClick: () => go("buy"), enabled: true };
      case "buy":
        return {
          label: "Continue to add-ons",
          onClick: () => go("addons"),
          enabled: bundleQty > 0,
        };
      case "addons":
        return { label: "Review order", onClick: () => go("pay"), enabled: true };
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
          <div className="flex items-center gap-1.5 text-white/45 text-[12px] font-medium">
            <Heart className="w-3.5 h-3.5" style={{ color: "#FF5470" }} fill="#FF5470" strokeWidth={0} />
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
          {step === "buy" && <BuyStep qty={bundleQty} onQty={setBundleQty} />}
          {step === "addons" && (
            <AddonsStep
              certQty={certQty}
              onCert={setCertQty}
              boxQty={boxQty}
              onBox={setBoxQty}
            />
          )}
          {step === "pay" && (
            <PayStep bundleQty={bundleQty} certQty={certQty} boxQty={boxQty} />
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

          {step === "buy" && bundleQty === 0 && (
            <span className="text-white/40 text-[12.5px]">Add the bundle to continue</span>
          )}

          {primary && (
            <button
              type="button"
              onClick={primary.enabled ? primary.onClick : undefined}
              disabled={!primary.enabled}
              data-testid="button-primary"
              className="h-11 pl-6 pr-5 rounded-full inline-flex items-center gap-2 text-white font-semibold text-[14.5px] transition-all active:scale-[0.97] disabled:opacity-35 disabled:cursor-not-allowed"
              style={{ background: BLUE }}
            >
              {primary.label}
              <ChevronRight className="w-4 h-4" strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
