import { useRef, useState, type CSSProperties } from "react";
import {
  ALBUM,
  AlbumArt,
  PrimaryButton,
  SERVICES,
  SheetCard,
  SvcGlyph,
  captionStyle,
  serviceById,
  type ServiceId,
} from "./_shared";

type Persona = "first" | "returning";
type Screen = "sheet" | "confirm" | "menu" | "going" | "later";

const PAGE_BG =
  "radial-gradient(circle at 30% 0%, rgba(255,138,61,0.16), transparent 55%), radial-gradient(circle at 80% 25%, rgba(123,91,224,0.22), transparent 60%), #050926";

function initialParams() {
  if (typeof window === "undefined") return {} as Record<string, string>;
  const p = new URLSearchParams(window.location.search);
  return Object.fromEntries(p.entries());
}

export default function StreamingLaunch() {
  const params = initialParams();
  const startPersona: Persona = params.persona === "returning" ? "returning" : "first";
  const [persona, setPersona] = useState<Persona>(startPersona);
  const [screen, setScreen] = useState<Screen>(
    (["sheet", "confirm", "menu", "going", "later"] as Screen[]).includes(
      params.screen as Screen,
    )
      ? (params.screen as Screen)
      : "sheet",
  );
  const [defaultService, setDefaultService] = useState<ServiceId | null>(
    startPersona === "returning" ? "spotify" : null,
  );
  const [pending, setPending] = useState<ServiceId | null>(
    (params.pending as ServiceId) || (params.screen === "confirm" ? "tidal" : null),
  );

  // long-press detection for the returning "tap & go" button
  const holdTimer = useRef<number | null>(null);
  const didHold = useRef(false);

  function resetTo(p: Persona) {
    setPersona(p);
    setScreen("sheet");
    setPending(null);
    setDefaultService(p === "returning" ? "spotify" : null);
  }

  function pickService(id: ServiceId) {
    setPending(id);
    // already the default → no need to ask, go straight there
    if (id === defaultService) {
      setScreen("going");
    } else {
      setScreen("confirm");
    }
  }

  function confirmDefault(makeDefault: boolean) {
    if (makeDefault && pending) setDefaultService(pending);
    setScreen("going");
  }

  function startHold() {
    didHold.current = false;
    holdTimer.current = window.setTimeout(() => {
      didHold.current = true;
      setScreen("menu");
    }, 420);
  }
  function endHold(goId: ServiceId) {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (!didHold.current) pickService(goId);
  }
  function cancelHold() {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: PAGE_BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      <PreviewControls
        persona={persona}
        onPersona={resetTo}
        onReset={() => resetTo(persona)}
      />

      <SheetCard onClose={() => setScreen("later")}>
        {screen === "sheet" && persona === "first" && (
          <FirstOpen onPick={pickService} onLater={() => setScreen("later")} />
        )}
        {screen === "sheet" && persona === "returning" && (
          <Returning
            defaultService={defaultService ?? "spotify"}
            onHoldStart={startHold}
            onHoldEnd={endHold}
            onHoldCancel={cancelHold}
            onLater={() => setScreen("later")}
          />
        )}
        {screen === "confirm" && pending && (
          <ConfirmDefault service={pending} onChoose={confirmDefault} />
        )}
        {screen === "menu" && (
          <ChooseAnother
            current={defaultService}
            onPick={pickService}
            onCancel={() => setScreen("sheet")}
          />
        )}
        {screen === "going" && pending && (
          <Going
            service={pending}
            isDefault={pending === defaultService}
            onDone={() => resetTo(persona)}
          />
        )}
        {screen === "later" && <Later onUndo={() => setScreen("sheet")} />}
      </SheetCard>
    </div>
  );
}

/* ----------------------------- screens ----------------------------- */

function Header({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "6px 28px 0" }}>
      <h2
        style={{
          margin: 0,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: -0.4,
          lineHeight: 1.18,
        }}
      >
        {title}
      </h2>
      {sub && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            lineHeight: 1.4,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function AlbumStrip({ small = false }: { small?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginTop: small ? 14 : 20,
        marginBottom: 18,
      }}
    >
      <AlbumArt size={small ? 76 : 104} />
      <div style={{ marginTop: 12, textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>
          {ALBUM.title}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
          {ALBUM.artist} · {ALBUM.year}
        </div>
      </div>
    </div>
  );
}

function FirstOpen({
  onPick,
  onLater,
}: {
  onPick: (id: ServiceId) => void;
  onLater: () => void;
}) {
  return (
    <div>
      <Header
        title="Now available on streaming!"
        sub="Pick where you’d like to listen — we’ll take you straight there."
      />
      <AlbumStrip />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
          padding: "0 24px",
        }}
      >
        {SERVICES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            style={tileBtn()}
          >
            <SvcGlyph id={s.id} size={54} />
            <span style={tileLabel()}>{s.label}</span>
          </button>
        ))}
      </div>
      <LaterLink onLater={onLater} />
    </div>
  );
}

function Returning({
  defaultService,
  onHoldStart,
  onHoldEnd,
  onHoldCancel,
  onLater,
}: {
  defaultService: ServiceId;
  onHoldStart: () => void;
  onHoldEnd: (id: ServiceId) => void;
  onHoldCancel: () => void;
  onLater: () => void;
}) {
  const svc = serviceById(defaultService);
  return (
    <div>
      <Header title="Now available on streaming!" />
      <AlbumStrip />
      <div style={{ padding: "0 24px" }}>
        <button
          type="button"
          onPointerDown={onHoldStart}
          onPointerUp={() => onHoldEnd(defaultService)}
          onPointerLeave={onHoldCancel}
          style={{
            width: "100%",
            minHeight: 58,
            borderRadius: 16,
            border: "none",
            background: "#ffffff",
            color: "#0B0E24",
            fontSize: 16.5,
            fontWeight: 700,
            letterSpacing: -0.2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 11,
            cursor: "pointer",
            touchAction: "none",
            userSelect: "none",
          }}
        >
          <SvcGlyph id={defaultService} size={26} />
          Open in {svc.label}
        </button>
        <p style={{ ...captionStyle(), marginTop: 12 }}>
          Press &amp; hold to choose another service
        </p>
      </div>
      <LaterLink onLater={onLater} />
    </div>
  );
}

function ConfirmDefault({
  service,
  onChoose,
}: {
  service: ServiceId;
  onChoose: (makeDefault: boolean) => void;
}) {
  const svc = serviceById(service);
  return (
    <div style={{ paddingBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
        <SvcGlyph id={service} size={72} />
      </div>
      <Header
        title={`Make ${svc.label} your default?`}
        sub="We’ll connect you straight to it from here next time. You can change it anytime in Settings."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "24px 24px 0" }}>
        <PrimaryButton tone="white" onClick={() => onChoose(true)}>
          Yes, set as default
        </PrimaryButton>
        <PrimaryButton tone="ghost" onClick={() => onChoose(false)}>
          Maybe later
        </PrimaryButton>
      </div>
    </div>
  );
}

function ChooseAnother({
  current,
  onPick,
  onCancel,
}: {
  current: ServiceId | null;
  onPick: (id: ServiceId) => void;
  onCancel: () => void;
}) {
  return (
    <div>
      <Header
        title="Listen on another service"
        sub="Tap any service to open this release there."
      />
      <div style={{ marginTop: 18, padding: "0 16px" }}>
        {SERVICES.map((s) => {
          const isDefault = s.id === current;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s.id)}
              style={rowBtn()}
            >
              <SvcGlyph id={s.id} size={40} />
              <span style={{ flex: 1, textAlign: "left", fontSize: 16, fontWeight: 600 }}>
                {s.label}
              </span>
              {isDefault && <span style={defaultChip()}>Default</span>}
            </button>
          );
        })}
      </div>
      <div style={{ padding: "16px 24px 0" }}>
        <PrimaryButton tone="ghost" onClick={onCancel}>
          Cancel
        </PrimaryButton>
      </div>
    </div>
  );
}

function Going({
  service,
  isDefault,
  onDone,
}: {
  service: ServiceId;
  isDefault: boolean;
  onDone: () => void;
}) {
  const svc = serviceById(service);
  return (
    <div style={{ textAlign: "center", padding: "8px 28px 0" }}>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
        <SvcGlyph id={service} size={72} />
      </div>
      <h2 style={{ margin: "18px 0 0", fontSize: 21, fontWeight: 700, letterSpacing: -0.3 }}>
        Opening {svc.label}…
      </h2>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
        Handing you off to listen to “{ALBUM.title}.”
        {isDefault ? " This is your saved service." : ""}
      </p>
      <div style={{ padding: "26px 0 0" }}>
        <PrimaryButton tone="ghost" onClick={onDone}>
          Restart demo
        </PrimaryButton>
      </div>
    </div>
  );
}

function Later({ onUndo }: { onUndo: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "8px 28px 0" }}>
      <AlbumArt size={72} />
      <h2 style={{ margin: "18px 0 0", fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>
        No problem — we’ll remind you
      </h2>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
        Next time you open “{ALBUM.title}” we’ll offer streaming again.
      </p>
      <div style={{ padding: "26px 0 0" }}>
        <PrimaryButton tone="ghost" onClick={onUndo}>
          Back
        </PrimaryButton>
      </div>
    </div>
  );
}

function LaterLink({ onLater }: { onLater: () => void }) {
  return (
    <div style={{ textAlign: "center", marginTop: 20 }}>
      <button
        type="button"
        onClick={onLater}
        style={{
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.5)",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          padding: 8,
        }}
      >
        Remind me later
      </button>
    </div>
  );
}

/* --------------------------- preview chrome --------------------------- */

function PreviewControls({
  persona,
  onPersona,
  onReset,
}: {
  persona: Persona;
  onPersona: (p: Persona) => void;
  onReset: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 18,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderRadius: 999,
        padding: 5,
      }}
    >
      <Seg active={persona === "first"} onClick={() => onPersona("first")}>
        First open
      </Seg>
      <Seg active={persona === "returning"} onClick={() => onPersona("returning")}>
        Returning fan
      </Seg>
      <button
        type="button"
        onClick={onReset}
        style={{
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.55)",
          fontSize: 12.5,
          cursor: "pointer",
          padding: "6px 12px",
        }}
      >
        Reset
      </button>
    </div>
  );
}

function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "#ffffff" : "transparent",
        color: active ? "#0B0E24" : "rgba(255,255,255,0.7)",
        border: "none",
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 600,
        padding: "7px 14px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------ styles ------------------------------ */

function tileBtn(): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: "16px 6px 12px",
    cursor: "pointer",
    transition: "transform 0.14s ease, background 0.14s ease",
  };
}
function tileLabel(): CSSProperties {
  return {
    fontSize: 12.5,
    fontWeight: 600,
    color: "rgba(255,255,255,0.82)",
    textAlign: "center",
  };
}
function rowBtn(): CSSProperties {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "transparent",
    border: "none",
    borderRadius: 14,
    padding: "12px 12px",
    cursor: "pointer",
  };
}
function defaultChip(): CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: "rgba(74,255,202,0.95)",
    background: "rgba(74,255,202,0.12)",
    borderRadius: 999,
    padding: "4px 9px",
  };
}
