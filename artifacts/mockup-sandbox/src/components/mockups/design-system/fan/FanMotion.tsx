import "./_group.css";

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 py-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
      <code className="text-sm w-52 shrink-0" style={{ color: "var(--brand-mint)" }}>{k}</code>
      <span className="text-sm" style={{ color: "var(--fan-text-secondary)" }}>{v}</span>
    </div>
  );
}

export function FanMotion() {
  return (
    <div className="gt-ds min-h-screen p-8" style={{ background: "var(--brand-bg)" }}>
      <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--brand-mint)" }}>Fan styles · motion</p>
      <h1 className="text-3xl font-bold mb-6" style={{ color: "var(--fan-text-primary)" }}>One motion language</h1>

      <div className="max-w-3xl rounded-2xl p-5 mb-6" style={{ background: "var(--fan-surface)" }}>
        <h2 className="font-semibold mb-2" style={{ color: "var(--fan-text-primary)" }}>client/src/lib/motion.ts — the single source</h2>
        <Row k="sheetOpen / sheetClose" v="Bottom-sheet slide: springy overshoot on open, quick eased settle on close. Panel translateY(100%→0) + scrimFade on the backdrop." />
        <Row k="popBounce" v="Small anchored popovers/menus (e.g. the Player 'Go to Album / Artist' menu)." />
        <Row k="PRESS_SCALE = 0.96" v="Framer whileTap 'give' for fan tappable surfaces (motion.ts). Plain CSS controls use active:scale-[0.94] instead — never stack both (framer owns inline transform). Admin stays press-flat." />
        <Row k="reduce arg" v="Every helper takes useReducedMotion() and falls back to a short non-overshoot tween — always pass it." />
        <Row k="Never animate backdrop-filter" v="Animate transform/opacity only. One blur surface per overlay — stacked blurs crash iOS WebKit." />
      </div>

      <div className="max-w-3xl rounded-2xl p-5 mb-6" style={{ background: "var(--fan-surface)" }}>
        <h2 className="font-semibold mb-2" style={{ color: "var(--fan-text-primary)" }}>ChromeScrim — gradient at rest, one frosted band on action</h2>
        <p className="text-sm" style={{ color: "var(--fan-text-secondary)" }}>
          Every fan top/bottom control bar sits on a soft navy gradient fade (via --brand-bg-rgb) with zero blur at rest.
          When a mode engages (search, selection, open menu), exactly one frosted band cross-fades in by opacity, and any
          overlapping control drops its own blur while active. The PlayerDock pill is the shared admin+fan floating
          transport — compact density is the fan mini-player, never collapses, and centers on the rail channel, not the window.
        </p>
      </div>

      <div className="max-w-3xl rounded-2xl p-5" style={{ background: "var(--fan-surface)" }}>
        <h2 className="font-semibold mb-2" style={{ color: "var(--fan-text-primary)" }}>Ship checklist (design:lint enforces the mechanical half)</h2>
        <ul className="space-y-1.5 text-sm list-disc pl-5" style={{ color: "var(--fan-text-secondary)" }}>
          <li>No raw brand hex outside index.css + primitives — use <code>var(--brand-*)</code>.</li>
          <li>Icons: Lucide for UI chrome, react-icons/si for company logos. Nothing else.</li>
          <li>Lone-icon buttons use the IconButton primitive; sub-44px circles on fan surfaces are flagged.</li>
          <li>Every Trash/Delete pairs with an AlertDialog in the same file.</li>
          <li>Surface judgment: the player is Apple Music. Never bring slate chrome onto the navy.</li>
          <li>Mockups prove patterns in the sandbox first, then graduate to <code>client/src/components/ui/</code>.</li>
        </ul>
      </div>
    </div>
  );
}
