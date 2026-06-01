import {
  SheetShell,
  ServiceIcon,
  STREAMING_SERVICES,
} from "./_shared";

// Frame 3 — Make default? Right after the fan opens a service for the first
// time, we ask once whether to remember it. The service glyph sits above the
// headline so it's unmistakable which app we mean. Primary "yes" in the
// brand mint; a quiet "maybe later" ghost so saying no costs nothing.
export function MakeDefault() {
  const spotify = STREAMING_SERVICES.find((s) => s.name === "Spotify")!;

  return (
    <SheetShell bg="#0E1334" textColor="#fff">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          paddingLeft: 28,
          paddingRight: 28,
          paddingTop: 40,
          paddingBottom: 8,
        }}
      >
        <ServiceIcon src={spotify.src} name={spotify.name} size={64} />
        <h3
          style={{
            marginTop: 22,
            fontSize: 21,
            fontWeight: 700,
            letterSpacing: -0.2,
            lineHeight: 1.25,
            color: "#fff",
          }}
        >
          Always open in Spotify?
        </h3>
        <p
          style={{
            marginTop: 10,
            fontSize: 14,
            fontWeight: 400,
            color: "rgba(255,255,255,0.6)",
            lineHeight: 1.45,
            maxWidth: 300,
          }}
        >
          We&apos;ll take you straight there next time. You can change your
          default anytime from the menu.
        </p>

        <button
          type="button"
          style={{
            marginTop: 28,
            width: "100%",
            height: 54,
            borderRadius: 27,
            background: "#4AFFCA",
            color: "#00062B",
            border: "none",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: -0.2,
            cursor: "pointer",
          }}
        >
          Yes, make it my default
        </button>
        <button
          type="button"
          style={{
            marginTop: 10,
            width: "100%",
            height: 54,
            borderRadius: 27,
            background: "transparent",
            color: "rgba(255,255,255,0.7)",
            border: "none",
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Maybe later
        </button>
      </div>
    </SheetShell>
  );
}
