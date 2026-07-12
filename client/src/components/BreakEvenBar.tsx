// Task #1963 — Break-even bar.
//
// ONE reusable, read-only "how many to sell to break even" readout,
// reused on the operator Sell panel, the artist dashboard Catalog tab,
// and the shared quote. It self-fetches the derived break-even payload
// for an album (GET /api/admin/albums/:id/break-even) so every surface
// shows the same numbers without re-deriving anything.
//
// Two numbers ride here:
//   • Break-even — the vinyl-only copy count that recoups the run's
//     fixed cost, plus the lower count once expected GoodDeed™ attach
//     is folded in.
//   • Start the press — the press minimum-run floor (the existing
//     early-cut press-floor), shown for context.
//
// Nothing here is ever written back; it is a pure read.
import { useQuery } from "@tanstack/react-query";
import { Info, Hourglass } from "lucide-react";
import { formatUsdCents } from "@shared/money";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AlbumBreakEven } from "@shared/breakEven";

type Tone = "light" | "dark";
type Variant = "full" | "compact";

export function BreakEvenBar({
  albumId,
  tone = "light",
  variant = "full",
  className = "",
}: {
  albumId: string;
  tone?: Tone;
  variant?: Variant;
  className?: string;
}) {
  const { data, isLoading } = useQuery<AlbumBreakEven>({
    queryKey: ["/api/admin/albums", albumId, "break-even"],
    enabled: !!albumId,
  });

  const dollars = (c: number) =>
    formatUsdCents(Math.max(0, c), { maximumFractionDigits: 0 });

  // Palette per tone so the bar reads correctly on both the light Sell
  // panel and the dark artist dashboard.
  const t =
    tone === "dark"
      ? {
          label: "text-fan-faint",
          strong: "text-fan-primary",
          muted: "text-fan-secondary",
          track: "bg-white/20",
          info: "text-fan-faint hover:text-fan-secondary",
        }
      : {
          label: "text-muted-foreground",
          strong: "text-foreground",
          muted: "text-muted-foreground",
          track: "bg-slate-100",
          info: "text-muted-foreground hover:text-foreground",
        };

  if (isLoading) {
    if (variant === "compact") {
      return <span className={`text-xs ${t.label}`} data-testid={`break-even-loading-${albumId}`}>…</span>;
    }
    return (
      <div className={`text-xs ${t.label} ${className}`} data-testid={`break-even-loading-${albumId}`}>
        Calculating break-even…
      </div>
    );
  }

  // No live, priced press tier yet — nothing to break even against.
  if (!data || !data.computable || data.vinylBreakEvenUnits == null) {
    if (variant === "compact") {
      return <span className={`text-xs ${t.label}`} data-testid={`break-even-na-${albumId}`}>—</span>;
    }
    // Tier is selected but the press hasn't entered pricing rungs yet.
    // Only show this when pressName is set — hasPressTier+!computable can
    // also fire when retail is missing, which is the artist's action item.
    if (data?.pressName) {
      const pressLabel = data.pressName;
      return (
        <div className={`flex items-center gap-1.5 text-xs ${t.label} ${className}`} data-testid={`break-even-na-${albumId}`}>
          <Hourglass className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />
          <span>Break-even fills in once {pressLabel} adds pricing for this tier.</span>
        </div>
      );
    }
    // No tier selected at all.
    return (
      <div className={`flex items-center gap-1.5 text-xs ${t.label} ${className}`} data-testid={`break-even-na-${albumId}`}>
        <Hourglass className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />
        <span>Break-even fills in once you save a priced press tier and retail price.</span>
      </div>
    );
  }

  const vinylBe = data.vinylBreakEvenUnits;
  const gdBe = data.goodDeed?.breakEvenUnits ?? null;
  const hasGd = gdBe != null && gdBe < vinylBe;
  // The bar is scaled to the worst-case (vinyl-only) break-even, so both
  // marks sit on ONE shared scale: the with-GoodDeeds mark lands earlier
  // (lower count, easier target) and the vinyl-only mark sits at the end.
  // Sold progress fills against that same scale, so the fill and the
  // marks can never read against different denominators.
  const scale = vinylBe;
  const pct = scale > 0 ? Math.min(100, Math.round((data.unitsSold / scale) * 100)) : 0;
  const gdMarkPct =
    hasGd && scale > 0 ? Math.min(100, Math.round((gdBe! / scale) * 100)) : null;

  // The two break-even marks, shared by both variants. The vinyl-only
  // mark always pins the right edge (the full target); the with-GoodDeeds
  // mark appears only when cert attach actually lowers the count.
  const marks = (h: string) => (
    <>
      {gdMarkPct != null && (
        <span
          className={`absolute top-0 ${h} w-0.5 bg-[color:var(--brand-blue)]`}
          style={{ left: `${gdMarkPct}%` }}
          title={`With GoodDeeds: ${gdBe}`}
          data-testid={`mark-break-even-gd-${albumId}`}
        />
      )}
      <span
        className={`absolute top-0 right-0 ${h} w-0.5 bg-[color:var(--brand-purple)]`}
        title={`Vinyl only: ${vinylBe}`}
        data-testid={`mark-break-even-vinyl-${albumId}`}
      />
    </>
  );

  if (variant === "compact") {
    return (
      <div className={`min-w-0 ${className}`} data-testid={`break-even-compact-${albumId}`}>
        <div className={`text-xs ${t.strong} font-semibold tabular-nums`}>
          {data.unitsSold}/{vinylBe}
          {hasGd && (
            <span className={`ml-1 font-normal ${t.muted}`}>· {gdBe} w/ GoodDeeds</span>
          )}
        </div>
        <div className="mt-1 relative">
          <div className={`h-1 rounded-full overflow-hidden ${t.track}`}>
            <div
              className="h-full rounded-full bg-[color:var(--brand-mint)] transition-all"
              style={{ width: `${pct}%` }}
              data-testid={`bar-break-even-${albumId}`}
            />
          </div>
          {marks("h-1")}
        </div>
      </div>
    );
  }

  return (
    <div className={className} data-testid={`break-even-${albumId}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold uppercase tracking-wide ${t.label}`}>
          Break-even
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={t.info}
              aria-label="How break-even is calculated"
              data-testid={`button-break-even-info-${albumId}`}
            >
              <Info className="w-3.5 h-3.5" />
              <span className="sr-only">How break-even is calculated</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 text-xs" data-testid={`popover-break-even-${albumId}`}>
            <div className="font-semibold text-foreground mb-1">How break-even is calculated</div>
            <p className="text-muted-foreground mb-2">
              The copies you'd sell to recoup the run's fixed cost —
              manufacturing, masters prep, and mechanicals — given your net
              per copy after the card fee, any donation, and the platform
              fee. GoodDeed™ certificates add margin, so expected cert
              attach lowers the count. This is a read-only estimate; it's
              never saved.
            </p>
            <dl className="space-y-1">
              <div className="flex justify-between"><dt className="text-muted-foreground">Min run</dt><dd className="text-foreground tabular-nums">{data.pressFloorUnits}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Fixed run cost</dt><dd className="text-foreground tabular-nums">{dollars(data.fixedRunCostCents)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Net / vinyl copy</dt><dd className="text-foreground tabular-nums">{dollars(data.vinylNetCents)}</dd></div>
              {data.goodDeed && (
                <div className="flex justify-between"><dt className="text-muted-foreground">Net / certificate</dt><dd className="text-foreground tabular-nums">{dollars(data.goodDeed.netCents)}</dd></div>
              )}
            </dl>
          </PopoverContent>
        </Popover>
      </div>

      <div className={`mt-1 text-sm ${t.strong}`}>
        <span className="font-bold tabular-nums" data-testid={`text-break-even-vinyl-${albumId}`}>
          {vinylBe} {vinylBe === 1 ? "copy" : "copies"}
        </span>
        {gdBe != null && gdBe < vinylBe && (
          <span className={`${t.muted}`} data-testid={`text-break-even-gd-${albumId}`}>
            {" "}or {gdBe} with GoodDeeds
            {data.goodDeed?.goodDeedsAtBreakEven != null && (
              <> (~{data.goodDeed.goodDeedsAtBreakEven} certs)</>
            )}
          </span>
        )}
      </div>

      <div className="mt-2 relative">
        <div className={`h-1.5 rounded-full overflow-hidden ${t.track}`}>
          <div
            className="h-full rounded-full bg-[color:var(--brand-mint)] transition-all"
            style={{ width: `${pct}%` }}
            data-testid={`bar-break-even-${albumId}`}
          />
        </div>
        {marks("h-1.5")}
      </div>

      {/* Legend so the two marks read unambiguously. */}
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs ${t.muted} mt-1.5`}>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-1.5 rounded-sm bg-[color:var(--brand-mint)]" />
          {data.unitsSold} sold
        </span>
        {hasGd && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-0.5 h-2.5 bg-[color:var(--brand-blue)]" />
            {gdBe} with GoodDeeds
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-0.5 h-2.5 bg-[color:var(--brand-purple)]" />
          {vinylBe} vinyl only
        </span>
      </div>

      <div className={`text-xs ${t.muted} mt-1`}>
        <span data-testid={`text-start-press-${albumId}`}>
          Start the press: {data.pressFloorUnits} {data.pressFloorUnits === 1 ? "copy" : "copies"}
          {data.pressFloorTotalCents > 0 && <> (press floor {dollars(data.pressFloorTotalCents)})</>}
        </span>
      </div>
    </div>
  );
}
