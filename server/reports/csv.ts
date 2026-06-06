import { formatUsdCents } from "@shared/money";

/** Minimal CSV writer. RFC 4180 quoting. No deps. */
function esc(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Array<Record<string, any>>, columns?: string[]): string {
  if (rows.length === 0 && !columns) return "";
  const cols = columns ?? Object.keys(rows[0] ?? {});
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
  return lines.join("\n") + "\n";
}

export function dollarsFromCents(cents: number): string {
  return formatUsdCents(cents, { noSymbol: true });
}
