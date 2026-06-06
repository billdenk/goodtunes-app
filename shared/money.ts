// Single source of truth for USD money formatting (Task #1359).
//
// Every dollar amount shown anywhere in the app — fan pages, admin/CMS,
// partner dashboards, emails, PDFs, CSV exports — formats through here so
// values render with thousands separators (e.g. `$1,016.00`,
// `$1,250,000.00`). Usable from both client and server. Values stay
// integer cents in storage; this is a presentation-layer concern only.
//
// `Intl.NumberFormat` handles grouping + negative signs correctly:
//   formatUsdCents(101600)  → "$1,016.00"
//   formatUsdCents(999)     → "$9.99"
//   formatUsdCents(0)       → "$0.00"
//   formatUsdCents(-120000) → "-$1,200.00"

export interface UsdFormatOptions {
  /** Minimum fraction digits. Defaults to min(2, maximumFractionDigits). */
  minimumFractionDigits?: number;
  /** Maximum fraction digits. Defaults to 2. Pass 0 for whole-dollar rounding. */
  maximumFractionDigits?: number;
  /** Drop the leading "$" but keep comma grouping (for CSV numeric columns). */
  noSymbol?: boolean;
}

// Intl.NumberFormat construction isn't free; cache instances by their
// resolved option signature.
const formatterCache = new Map<string, Intl.NumberFormat>();
function getFormatter(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(opts);
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", opts);
    formatterCache.set(key, f);
  }
  return f;
}

function resolveDigits(opts: UsdFormatOptions): { min: number; max: number } {
  const max = opts.maximumFractionDigits ?? 2;
  const min = opts.minimumFractionDigits ?? Math.min(2, max);
  return { min, max };
}

/** Format whole dollars as comma-grouped USD, e.g. `1016` → "$1,016.00". */
export function formatUsd(dollars: number, opts: UsdFormatOptions = {}): string {
  const n = Number.isFinite(dollars) ? dollars : 0;
  const { min, max } = resolveDigits(opts);
  const fmt = getFormatter(
    opts.noSymbol
      ? { minimumFractionDigits: min, maximumFractionDigits: max }
      : {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: min,
          maximumFractionDigits: max,
        },
  );
  return fmt.format(n);
}

/** Format integer cents as comma-grouped USD, e.g. `101600` → "$1,016.00". */
export function formatUsdCents(cents: number, opts: UsdFormatOptions = {}): string {
  const n = Number.isFinite(cents) ? cents : 0;
  return formatUsd(n / 100, opts);
}
