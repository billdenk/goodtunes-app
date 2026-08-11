# Handoff notes — press specs & prepress review

    Updated: 2026-08-11 (supersedes the earlier drop; the old NOTES described a
    stale shell and a pre-redesign artwork dialog).

    ## Rules
    - These mock files are the source of truth for PRESENTATION. Replace your
    presentational code verbatim; wire real data where the MOCK_ consts are.
    - Colorblind rule (founder): every status = icon + word, never color alone.

    ## ArtworkCheckUpgraded.tsx — "Prepress review" dialog (NEW)
    - Rebuild of today's artwork check dialog. Both artist and team see it.
    - Header: two-tone title "Prepress review." + component ("Cover: 12″ (gatefold).")
    with the standard gray-circle close chip, same line. No other header actions.
    - Full-width verdict card: soft rose, filled red circle + white ✕,
    "Not ready — N blockers, N warning." + one gray action sentence.
    - Left: preview pane with ONE gray ··· circle over the art (top-right). Menu =
    Replace file / Refresh for preview / Download artwork / Download report.
    Below: release title + artist, then filename · pages · size caption.
    - Right, urgency order: Needs attention → Check by eye (no per-row tags) →
    Passed · N checks (collapsed by default; the only collapsible section).
    - Rows: hairline-divided quiet table; verdict = icon + word (Pass/Warning/Fail)
    right-aligned in a fixed gutter.
    - Footer: outline pill "Override with justification" + ⓘ. Operator-only —
    never rendered for artists. Keep the existing override behavior untouched:
    min-8-char justification, who/why/when stamped, rollup = "overridden" (not a
    clean pass), justification shown inline afterward. Mock shows the
    pre-override state; an overridden-state variant will follow — don't wait.
    - Theme-aware: THEMES map holds light + dark token sets. Light for
    artist-facing contexts, dark inside the charcoal admin. The floating
    "View dark" toggle is mock-only chrome — do not ship it.

    ## SuperAdminPressSpecsDark.tsx — corrected super-admin shell
    - Full-width top bar: logo left (dark asset, white via CSS invert), bell +
    avatar right, bg = rail color, hairline bottom.
    - Rail below top bar, starts with rounded-full ⌘K search. No "Find a press"
    in the rail.
    - Catalog tab itself is the pull-down (wired open/close) — no separate
    heading pull-down.
    