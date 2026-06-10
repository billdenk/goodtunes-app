import type { CSSProperties, ReactNode } from "react";
import {
  MINT,
  BLUE,
  PURPLE,
  PINK,
  T,
  PAGE_BG,
  FONT,
  ALBUMS,
  type AlbumRec,
  type OrderCopy,
  FilledPanel,
  VinylPeekArt,
  StackArt,
  NumberMenu,
  money,
} from "./_shared";

// ===========================================================================
// DESKTOP GoodDeed buyer-journey + gifting — "square / centered-card" look.
// ---------------------------------------------------------------------------
// The fan desktop app is a wide, two-rail shell — never a stretched phone
// column. So every screen here is a centered, roughly-square CARD floating on
// the navy backdrop, with a two-column inner layout that keeps the page short
// and balanced (Bill's "more square look on desktop"). All color comes from
// the raw brand-hex consts in _shared (this group has no _group.css, so
// var(--brand-*) would render transparent).
// ===========================================================================

const TITLE = "You\u2019re in.";

// ── Centered navy stage. ───────────────────────────────────────────────────
function DesktopStage({
  children,
  maxW = 940,
  center = true,
}: {
  children: ReactNode;
  maxW?: number;
  center?: boolean;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        boxSizing: "border-box",
        background: PAGE_BG,
        color: T.primary,
        fontFamily: FONT,
        WebkitFontSmoothing: "antialiased",
        display: "flex",
        alignItems: center ? "center" : "flex-start",
        justifyContent: "center",
        padding: "44px 36px",
      }}
    >
      <div style={{ width: "100%", maxWidth: maxW }}>{children}</div>
    </div>
  );
}

// ── The floating square card. ──────────────────────────────────────────────
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: "rgba(8,15,46,0.66)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 30,
        padding: 38,
        boxShadow: "0 36px 90px rgba(0,0,0,0.5)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={MINT} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconPlay() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={T.primary} style={{ flexShrink: 0 }}>
      <path d="M7 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" />
    </svg>
  );
}
function IconShuffle() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.primary} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M16 3h5v5M4 20l17-17M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  );
}
function IconHeart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={PINK} stroke="none" style={{ flexShrink: 0 }}>
      <path d="M12 21s-7.5-4.7-10-9.2C.6 9 1.6 5.5 5 5c2-.3 3.5 1 4 2 .5-1 2-2.3 4-2 3.4.5 4.4 4 3 6.8C19.5 16.3 12 21 12 21z" />
    </svg>
  );
}

// ── "You're in." header. ───────────────────────────────────────────────────
function ConfirmHeader({ title = TITLE, sub }: { title?: ReactNode; sub: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 26 }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "rgba(74,255,202,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        <CheckIcon />
      </div>
      <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800, letterSpacing: -0.8, color: T.primary }}>{title}</h1>
      <p style={{ margin: "9px 0 0", fontSize: 16, color: T.secondary, lineHeight: 1.4, maxWidth: 460 }}>{sub}</p>
    </div>
  );
}

const labelCap: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1.4,
  color: T.faint,
  textTransform: "uppercase",
};

// ── GoodDeed mint hero. ────────────────────────────────────────────────────
function GoodDeedHero({ copies }: { copies: OrderCopy[] }) {
  const multi = copies.length > 1;
  return (
    <FilledPanel style={{ textAlign: "center", padding: "28px 22px" }}>
      <p style={{ ...labelCap, color: MINT, letterSpacing: 1.6 }}>{multi ? "Your GoodDeeds\u00ae" : "Your GoodDeed\u00ae"}</p>
      {multi ? (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: 12,
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: -0.5,
            color: MINT,
          }}
        >
          {copies.map((c, i) => (
            <span key={c.number} style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
              {i > 0 && <span style={{ color: T.faint, fontSize: 22, fontWeight: 400 }}>&middot;</span>}
              #{c.number}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 6, fontSize: 68, fontWeight: 800, letterSpacing: -1, color: MINT, lineHeight: 1 }}>#{copies[0].number}</div>
      )}
      <p style={{ margin: "14px 0 0", fontSize: 13.5, color: T.faint }}>Numbered for life.</p>
    </FilledPanel>
  );
}

const rowS: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "baseline" };

type ExtraLine = { label: ReactNode; value: number; accent?: string };

// ── Order summary panel (taxes album + shipping; donations untaxed). ────────
function OrderPanel({
  copies,
  extras = [],
}: {
  copies: OrderCopy[];
  extras?: ExtraLine[];
}) {
  const rec = ALBUMS[0];
  const copiesTotal = copies.reduce((s, c) => s + c.priceCents, 0);
  const extrasTotal = extras.reduce((s, e) => s + e.value, 0);
  const shipping = 1200;
  const tax = Math.round(0.075 * (copiesTotal + shipping));
  const total = copiesTotal + extrasTotal + shipping + tax;

  const lbl: CSSProperties = { fontSize: 15, color: T.primary };
  const mut: CSSProperties = { fontSize: 14.5, color: T.secondary };
  const val: CSSProperties = { fontSize: 15, color: T.primary, fontVariantNumeric: "tabular-nums" };
  const valMut: CSSProperties = { fontSize: 14.5, color: T.secondary, fontVariantNumeric: "tabular-nums" };

  return (
    <FilledPanel>
      <p style={{ ...labelCap, marginBottom: 14 }}>Order</p>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <VinylPeekArt rec={rec} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.primary }}>Metallic Marble</p>
          <p style={{ margin: "3px 0 0", fontSize: 14, color: T.secondary }}>Hope &mdash; 7&Prime; Single</p>
        </div>
      </div>

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 11 }}>
        {copies.map((c, i) => (
          <div key={c.number} style={rowS}>
            <span style={lbl}>
              Copy {i + 1}
              {c.signed && <span style={{ color: PINK, fontWeight: 600 }}> &middot; Signed</span>}
              <span style={{ color: MINT, fontWeight: 700 }}> &middot; #{c.number}</span>
            </span>
            <span style={val}>{money(c.priceCents)}</span>
          </div>
        ))}
        {extras.map((e, i) => (
          <div key={i} style={rowS}>
            <span style={{ fontSize: 15, color: e.accent ?? T.primary, fontWeight: 600 }}>{e.label}</span>
            <span style={val}>{money(e.value)}</span>
          </div>
        ))}
        <div style={rowS}>
          <span style={mut}>Shipping</span>
          <span style={valMut}>{money(shipping)}</span>
        </div>
        <div style={rowS}>
          <span style={mut}>Sales tax</span>
          <span style={valMut}>{money(tax)}</span>
        </div>
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.12)", margin: "16px 0" }} />
      <div style={rowS}>
        <span style={{ fontSize: 16, color: T.primary, fontWeight: 600 }}>Total</span>
        <span style={{ fontSize: 19, color: T.primary, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(total)}</span>
      </div>
    </FilledPanel>
  );
}

// ── Pick-your-handle panel. ────────────────────────────────────────────────
function HandlePanel({ handle }: { handle: string }) {
  return (
    <FilledPanel>
      <p style={{ ...labelCap, marginBottom: 12 }}>Pick your handle</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderRadius: 14, background: "rgba(0,0,0,0.28)" }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: `linear-gradient(135deg,${BLUE},${PURPLE})`, flexShrink: 0 }} />
        <span style={{ fontSize: 17, color: T.primary, fontWeight: 600 }}>@{handle}</span>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 13, color: T.faint }}>We picked this from your email &mdash; change it any time.</p>
    </FilledPanel>
  );
}

// ── Primary gradient CTA. ──────────────────────────────────────────────────
function PrimaryCta({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      style={{
        marginTop: 22,
        width: "100%",
        padding: "16px 0",
        border: "none",
        borderRadius: 16,
        background: `linear-gradient(135deg,#1D5E8F,${BLUE})`,
        color: "#fff",
        fontSize: 17,
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: "0 12px 30px rgba(43,134,196,0.4)",
      }}
    >
      {children}
    </button>
  );
}

// ===========================================================================
// Gift composer (the gifting flow) + the card the recipient receives.
// ===========================================================================

// Read-only "filled input" look matching the real Welcome.tsx gift form.
function Field({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: "11px 13px",
        fontSize: 14,
        color: T.primary,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function GiftComposer({
  first,
  last,
  contactKind,
  contact,
  message,
  deliverOn,
  charitable = false,
}: {
  first: string;
  last: string;
  contactKind: "email" | "phone";
  contact: string;
  message: string;
  deliverOn?: string;
  charitable?: boolean;
}) {
  const accent = charitable ? PINK : PURPLE;
  return (
    <FilledPanel style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      {/* toggle row (on) */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {charitable ? <IconHeart /> : <span aria-hidden style={{ fontSize: 18 }}>{"\uD83C\uDF81"}</span>}
        <span style={{ flex: 1, fontSize: 15.5, color: T.primary, fontWeight: 600 }}>
          {charitable ? "Give this in someone\u2019s honor" : "This is a gift"}
        </span>
        <span style={{ width: 42, height: 24, borderRadius: 999, background: accent, position: "relative", flexShrink: 0 }}>
          <span style={{ position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: "50%", background: "#fff" }} />
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field>{first}</Field>
        <Field>{last}</Field>
      </div>

      {/* email / phone segmented */}
      <div style={{ display: "flex", padding: 3, gap: 3, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
        {(["email", "phone"] as const).map((k) => (
          <span
            key={k}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "7px 0",
              borderRadius: 9,
              fontSize: 12.5,
              fontWeight: 600,
              textTransform: "capitalize",
              color: contactKind === k ? T.primary : T.secondary,
              background: contactKind === k ? "rgba(255,255,255,0.15)" : "transparent",
            }}
          >
            {k}
          </span>
        ))}
      </div>
      <Field style={{ color: T.primary }}>{contact}</Field>

      <Field style={{ minHeight: 56, color: message ? T.primary : T.faint, lineHeight: 1.4 }}>
        {message || "Optional message (500 chars)"}
      </Field>

      <div>
        <p style={{ ...labelCap, marginBottom: 6, fontSize: 11 }}>Deliver on (optional)</p>
        <Field style={{ color: deliverOn ? T.primary : T.faint }}>{deliverOn || "Send right away"}</Field>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: T.faint, lineHeight: 1.45 }}>
        We&rsquo;ll generate a one-time claim link to send to {first || "them"}.
        {deliverOn ? ` It unlocks on ${deliverOn}.` : " You can share it right away."}
      </p>

      <button
        type="button"
        style={{
          marginTop: 2,
          width: "100%",
          padding: "13px 0",
          border: "none",
          borderRadius: 13,
          background: accent,
          color: "#fff",
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {charitable ? "Create Gift of Hope link" : "Create gift link"}
      </button>
    </FilledPanel>
  );
}

// What the recipient sees when they open the claim link.
function GiftCardPreview({
  rec,
  number,
  fromName,
  toName,
  message,
  charitable = false,
}: {
  rec: AlbumRec;
  number: number;
  fromName: string;
  toName: string;
  message: string;
  charitable?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 20,
        overflow: "hidden",
        border: charitable ? "1px solid rgba(255,84,112,0.4)" : "1px solid rgba(127,16,167,0.45)",
        background: charitable ? "rgba(255,84,112,0.10)" : "rgba(127,16,167,0.12)",
      }}
    >
      <div style={{ padding: "16px 18px 14px", display: "flex", alignItems: "center", gap: 8 }}>
        {charitable ? <IconHeart /> : <span aria-hidden style={{ fontSize: 16 }}>{"\uD83C\uDF81"}</span>}
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: charitable ? PINK : "#c98fe0" }}>
          {charitable ? "A Gift of Hope" : "A gift for you"}
        </span>
      </div>
      <div style={{ padding: "0 18px 18px", display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{ width: 76, height: 76, borderRadius: 12, background: rec.gradient, flexShrink: 0, boxShadow: "0 6px 18px rgba(0,0,0,0.45)" }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.primary }}>
            {rec.title} <span style={{ color: T.secondary, fontWeight: 500 }}>&middot; {rec.artist}</span>
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: T.secondary }}>
            From {fromName} to {toName}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 13.5, fontWeight: 700, color: MINT }}>GoodDeed #{number}</p>
        </div>
      </div>
      {message && (
        <div style={{ margin: "0 18px 16px", padding: "12px 14px", borderRadius: 12, background: "rgba(0,0,0,0.25)" }}>
          <p style={{ margin: 0, fontSize: 13.5, color: T.primary, lineHeight: 1.45, fontStyle: "italic" }}>&ldquo;{message}&rdquo;</p>
        </div>
      )}
      {charitable && (
        <p style={{ margin: "0 18px 14px", fontSize: 12, color: T.faint, lineHeight: 1.45 }}>
          A donation to the Nightbirde Foundation was made in {toName}&rsquo;s honor.
        </p>
      )}
      <div style={{ padding: "0 18px 18px" }}>
        <div
          style={{
            width: "100%",
            padding: "12px 0",
            textAlign: "center",
            borderRadius: 12,
            background: `linear-gradient(135deg,#1D5E8F,${BLUE})`,
            color: "#fff",
            fontSize: 14.5,
            fontWeight: 700,
          }}
        >
          Claim your album
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// SCREENS
// ===========================================================================

// 1 / 2 — Order confirmation (self purchase). ───────────────────────────────
export function DesktopConfirmationScreen({
  copies,
  handle = "bill",
}: {
  copies: OrderCopy[];
  handle?: string;
}) {
  const multi = copies.length > 1;
  return (
    <DesktopStage maxW={940}>
      <Card>
        <ConfirmHeader sub="Your album is unlocked and your record is on its way." />
        <div style={{ display: "grid", gridTemplateColumns: "1.02fr 1fr", gap: 22, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <GoodDeedHero copies={copies} />
            <HandlePanel handle={handle} />
          </div>
          <OrderPanel copies={copies} />
        </div>
        <PrimaryCta>Open my player</PrimaryCta>
        <p style={{ margin: "12px 0 0", textAlign: "center", fontSize: 13, color: T.faint }}>
          {multi ? "Each copy is its own entitlement." : "Your record ships to the address you entered."}
        </p>
      </Card>
    </DesktopStage>
  );
}

// 3 — Album-purchase gift. ──────────────────────────────────────────────────
export function DesktopGiftScreen() {
  const rec = ALBUMS[0];
  const copies: OrderCopy[] = [{ number: 313, signed: false, priceCents: 4500 }];
  return (
    <DesktopStage maxW={980}>
      <Card>
        <ConfirmHeader
          title={"You\u2019re in. Make it a gift."}
          sub={"Send the album and its GoodDeed number to someone \u2014 they\u2019ll claim it to their own account."}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ ...labelCap, marginLeft: 4 }}>Compose the gift</p>
            <GiftComposer
              first="Maya"
              last="Reyes"
              contactKind="email"
              contact="maya@email.com"
              message={"Saw her sing this and thought of you. Happy birthday. \u2764"}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <OrderPanel copies={copies} />
            <div>
              <p style={{ ...labelCap, margin: "0 0 10px 4px" }}>What Maya will get</p>
              <GiftCardPreview rec={rec} number={313} fromName="Bill" toName="Maya" message="Saw her sing this and thought of you. Happy birthday." />
            </div>
          </div>
        </div>
        <PrimaryCta>Open my player</PrimaryCta>
      </Card>
    </DesktopStage>
  );
}

// 4 — Gift of Hope (Nightbirde Foundation charitable add-on). ────────────────
export function DesktopGiftOfHopeScreen() {
  const rec = ALBUMS[0];
  const copies: OrderCopy[] = [{ number: 314, signed: false, priceCents: 4500 }];
  const extras: ExtraLine[] = [{ label: "Gift of Hope \u00b7 donation", value: 2500, accent: PINK }];
  return (
    <DesktopStage maxW={980}>
      <Card style={{ border: "1px solid rgba(255,84,112,0.28)" }}>
        {/* charitable banner */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "13px 16px",
            marginBottom: 22,
            borderRadius: 16,
            background: "rgba(255,84,112,0.12)",
            border: "1px solid rgba(255,84,112,0.3)",
          }}
        >
          <IconHeart />
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: T.primary }}>Gift of Hope</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: T.secondary }}>
              A charitable donation to the Nightbirde Foundation, added to your order.
            </p>
          </div>
        </div>

        <ConfirmHeader
          title={"You\u2019re in \u2014 and so is hope."}
          sub="Your album is on its way and your Gift of Hope supports the Nightbirde Foundation."
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ ...labelCap, marginLeft: 4 }}>Send it in their honor</p>
            <GiftComposer
              first="Maya"
              last="Reyes"
              contactKind="email"
              contact="maya@email.com"
              message={"In honor of your strength this year. \u2764"}
              charitable
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <OrderPanel copies={copies} extras={extras} />
            <div>
              <p style={{ ...labelCap, margin: "0 0 10px 4px" }}>What Maya will get</p>
              <GiftCardPreview
                rec={rec}
                number={314}
                fromName="Bill"
                toName="Maya"
                message="In honor of your strength this year."
                charitable
              />
            </div>
          </div>
        </div>
        <PrimaryCta>Open my player</PrimaryCta>
      </Card>
    </DesktopStage>
  );
}

// GoodDeed meta line for a library card.
function metaLine(rec: AlbumRec) {
  const n = rec.numbers;
  if (n.length === 1) return `GoodDeed #${n[0]}`;
  if (n.length <= 3) return `GoodDeeds ${n.map((x) => `#${x}`).join(" \u00b7 ")}`;
  return `${n.length} GoodDeeds`;
}

// 5 — Library / collection (wide grid). ─────────────────────────────────────
export function DesktopLibraryScreen() {
  return (
    <DesktopStage maxW={1160} center={false}>
      <div style={{ padding: "4px 4px 0" }}>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: -0.8, color: T.primary }}>Your Collection</h1>
        <p style={{ margin: "8px 0 0", fontSize: 16, color: T.secondary }}>Every record you own &mdash; numbered for life.</p>
      </div>
      <div
        style={{
          marginTop: 28,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 30,
        }}
      >
        {ALBUMS.map((rec) => (
          <div key={rec.id}>
            <StackArt rec={rec} />
            <div style={{ marginTop: 14, padding: "0 2px" }}>
              <p style={{ margin: 0, fontSize: 15.5, color: T.primary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.title}</p>
              <p style={{ margin: "2px 0 0", fontSize: 13.5, color: T.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.artist}</p>
              <p style={{ margin: "5px 0 0", fontSize: 12.5, fontWeight: 600, color: MINT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {metaLine(rec)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </DesktopStage>
  );
}

// 6 / 7 — Album opened, numbers revealed (+ optional action menu). ───────────
export function DesktopAlbumNumbersScreen({ openMenuFor }: { openMenuFor?: number }) {
  const rec = ALBUMS[0]; // Hope — owns #310 #311 #312
  const menuOpen = openMenuFor != null;
  return (
    <DesktopStage maxW={940}>
      <Card>
        {/* back row */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 20 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.secondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span style={{ fontSize: 15, color: T.secondary }}>Library</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 32, alignItems: "start" }}>
          <StackArt rec={rec} radius={18} />

          <div>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: -0.5, color: T.primary }}>{rec.title}</h1>
            <p style={{ margin: "5px 0 0", fontSize: 17, color: BLUE, fontWeight: 500 }}>{rec.artist}</p>

            {/* play / shuffle */}
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              {[
                { icon: <IconPlay />, label: "Play" },
                { icon: <IconShuffle />, label: "Shuffle" },
              ].map((b) => (
                <div
                  key={b.label}
                  style={{
                    flex: 1,
                    maxWidth: 160,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "11px 0",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.08)",
                    color: T.primary,
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  {b.icon}
                  {b.label}
                </div>
              ))}
            </div>

            {/* GoodDeed reveal */}
            <div style={{ marginTop: 24, padding: "18px 20px", borderRadius: 16, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p style={{ ...labelCap, fontSize: 11, letterSpacing: 1.2 }}>Your GoodDeeds&reg;</p>
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 24, fontWeight: 800, letterSpacing: -0.3 }}>
                {rec.numbers.map((n, i) => (
                  <span key={n} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {i > 0 && <span style={{ color: T.faint, fontSize: 16, fontWeight: 400 }}>&middot;</span>}
                    <span
                      style={{
                        color: MINT,
                        padding: "2px 9px",
                        borderRadius: 10,
                        background: openMenuFor === n ? "rgba(74,255,202,0.16)" : "transparent",
                        boxShadow: openMenuFor === n ? "0 0 0 1px rgba(74,255,202,0.45)" : "none",
                      }}
                    >
                      #{n}
                    </span>
                  </span>
                ))}
              </div>
              <p style={{ margin: "12px 0 0", fontSize: 12.5, color: T.faint }}>
                {menuOpen ? "Tap a number for its certificate." : "Tap a number for its certificate \u2014 PDF or social card."}
              </p>
              {menuOpen && <NumberMenu n={openMenuFor!} />}
            </div>
          </div>
        </div>
      </Card>
    </DesktopStage>
  );
}
