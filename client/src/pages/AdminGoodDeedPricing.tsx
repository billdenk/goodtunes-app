// Task #737 — read-only GoodDeed pricing summary.
//
// One consolidated, read-only mirror of every GoodDeed pricing matrix
// that already lives (spread across edit cards) on the super-admin-only
// Platform Pricing page. Readable by *any* admin role — the underlying
// GET endpoints (`/api/admin/payout-settings`,
// `/api/admin/gooddeed-cost-stack`, the Quickprinter
// `/api/admin/vendors/:id/gooddeed-services`) are all `requireAdmin`,
// not super-admin-gated; only the writes on Platform Pricing are.
//
// This view never writes. For roles that *can* edit (super_admin) it
// surfaces a link out to /admin/platform-pricing. Four sections:
//   1. Signed-cert wholesale ladder (what the artist pays).
//   2. Quickprinter ladder (per-unit printing cost, US Letter).
//   3. Hologram + shrinkwrap and Insertion (flat per-unit legs).
//   4. Resolved per-cert total at a chosen run size (live recompute
//      off the cost-stack endpoint).
import { useState } from "react";
import { formatUsdCents } from "@shared/money";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import type { PayoutSettings } from "@shared/schema";
import {
  DEFAULT_SIGNED_CERT_LADDER,
  SIGNED_CERT_MIN_BATCH,
  lookupSignedCertRung,
} from "@shared/signedCertLadder";
import { ExternalLink, Pencil } from "lucide-react";

type RoleInfo = { role: string; roleScopeId: string | null };

// Thousands separators + cents via Intl, per the task's formatting note.
const dollars = (cents: number) => formatUsdCents(cents);
const qtyFmt = new Intl.NumberFormat("en-US");

const QP_RUNGS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

type CostStackLeg = {
  vendorId: string;
  vendorName: string;
  perUnitCents: number | null;
  updatedAt: string | null;
};
type CostStack = {
  runQty: number;
  printing: CostStackLeg | null;
  hologram: CostStackLeg | null;
  insertion: CostStackLeg | null;
  totalPerUnitCents: number;
};

async function fetchCostStack(runQty: number): Promise<CostStack> {
  const r = await fetch(`/api/admin/gooddeed-cost-stack?runQty=${runQty}`, {
    credentials: "include",
  });
  if (!r.ok) throw new Error("Failed to load cost stack");
  return r.json();
}

export function AdminGoodDeedPricing({ embedded = false }: { embedded?: boolean } = {}) {
  const { user, isLoading: authLoading } = useAuth();

  const { data: role } = useQuery<RoleInfo>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });

  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsIsError,
    error: settingsError,
    refetch: refetchSettings,
    isFetching: settingsIsFetching,
  } = useQuery<PayoutSettings>({
    queryKey: ["/api/admin/payout-settings"],
    enabled: !!user?.isAdmin,
    retry: false,
  });

  if (authLoading) {
    const spinner = (
      <div className="py-20 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[color:var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
    return embedded ? spinner : <AdminFrame active="gooddeed-pricing">{spinner}</AdminFrame>;
  }
  if (!user?.isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <p className="text-[var(--apple-subink)] text-sm">Admin only.</p>
      </main>
    );
  }

  const isSuperAdmin = role?.role === "super_admin";

  const body = (
      <div className="space-y-5">
        <AdminPageHeader
          title="GoodDeed pricing"
          subtitle="Read-only view of every GoodDeed cost matrix in one place — the wholesale ladder the artist pays, the Quickprinter ladder, the flat hologram and insertion legs, and the resolved per-cert total at any run size."
        />

        {settingsLoading ? (
          <div className="py-10 text-[var(--apple-subink)] text-sm">Loading…</div>
        ) : settingsIsError ? (
          <ErrorState
            error={settingsError}
            onRetry={() => refetchSettings()}
            title="Couldn't load GoodDeed pricing"
            testId="admin-gooddeed-pricing-error"
          />
        ) : !settings ? (
          <div className="py-10 text-[var(--apple-subink)] text-sm">
            {settingsIsFetching ? "Loading…" : "No pricing settings available."}
          </div>
        ) : (
          <>
            {isSuperAdmin && (
              <Link href="/admin/platform-pricing" className="inline-flex items-center gap-1.5 text-sm text-[var(--apple-subink)] hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
                data-testid="link-edit-platform-pricing"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit these on Platform pricing
              </Link>
            )}

            <ResolvedTotalCard settings={settings} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              <WholesaleLadderCard settings={settings} />
              <FlatLegsCard />
            </div>

            {settings.defaultPrintVendorId ? (
              <QuickprinterLadderCard vendorId={settings.defaultPrintVendorId} />
            ) : (
              <Card testId="panel-quickprinter-ladder">
                <SectionTitle
                  title="Quickprinter ladder"
                  subtitle="Per-unit printing cost across the fixed quantity rungs (US Letter)."
                />
                <p className="text-sm text-[var(--apple-faint)] mt-3">
                  No routing-default Quickprinter is set yet.
                </p>
              </Card>
            )}
          </>
        )}
      </div>
  );
  // Task #2075 — rendered inline inside the scoped press portal (no
  // operator /admin chrome); operators still get the full AdminFrame.
  return embedded ? body : <AdminFrame active="gooddeed-pricing">{body}</AdminFrame>;
}

// --- Shared chrome ---------------------------------------------------------

function Card({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-5"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold text-[var(--apple-ink)]">{title}</h2>
      {subtitle && <p className="text-[13px] text-[var(--apple-subink)] mt-1">{subtitle}</p>}
    </div>
  );
}

const LABEL_CLASS =
  "block text-[var(--apple-subink)] text-[11px] font-semibold uppercase tracking-wider";

function VendorLink({
  leg,
  name,
}: {
  leg: CostStackLeg | null;
  name: string;
}) {
  if (!leg) {
    return (
      <span className="text-sm text-[var(--apple-faint)]" data-testid={`text-${name}-empty`}>
        — No vendor assigned —
      </span>
    );
  }
  return (
    <Link href={`/admin/vendors/${leg.vendorId}?tab=gooddeed`} className="inline-flex items-center gap-1 text-sm text-[var(--apple-ink)] hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
      data-testid={`link-${name}-vendor`}
    >
      {leg.vendorName}
      <ExternalLink className="w-3 h-3 opacity-60" />
    </Link>
  );
}

// --- 1. Signed-cert wholesale ladder ---------------------------------------

function WholesaleLadderCard({ settings }: { settings: PayoutSettings }) {
  const rungs = settings.signedCertLadder ?? DEFAULT_SIGNED_CERT_LADDER;
  return (
    <Card testId="panel-wholesale-ladder">
      <SectionTitle
        title="Signed-cert wholesale ladder"
        subtitle="Per-unit price GoodTunes charges artists and labels for printed, signed, hologrammed GoodDeed certificates — snapped to the actual run size at window close."
      />
      <div className="overflow-hidden rounded-xl border border-[var(--apple-hairline)] mt-4">
        <table className="w-full text-sm">
          <thead className="bg-[var(--apple-track)] text-[var(--apple-subink)]">
            <tr>
              <th className="text-left font-semibold uppercase tracking-wider text-xs px-3 py-2">
                Batch
              </th>
              <th className="text-right font-semibold uppercase tracking-wider text-xs px-3 py-2 w-[140px]">
                Wholesale / unit
              </th>
            </tr>
          </thead>
          <tbody>
            {rungs.map((r, i) => (
              <tr
                key={`${r.minQty}-${i}`}
                className="border-t border-[var(--apple-hairline)]"
                data-testid={`row-wholesale-rung-${i}`}
              >
                <td className="px-3 py-2 text-[var(--apple-ink)]">{r.label}</td>
                <td
                  className="px-3 py-2 text-right text-[var(--apple-ink)] font-semibold tabular-nums"
                  data-testid={`text-wholesale-rung-${i}`}
                >
                  {dollars(r.wholesaleCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--apple-subink)] mt-3">
        <span className="text-[var(--apple-ink)] font-medium">
          {SIGNED_CERT_MIN_BATCH}-unit minimum.
        </span>{" "}
        If fewer than {SIGNED_CERT_MIN_BATCH} sell at window close, the cert
        add-on auto-refunds and no print run happens.
      </p>
    </Card>
  );
}

// --- 2. + 3. Flat legs (hologram + insertion) ------------------------------
// Flat per-unit cost is quantity-independent, so we read it off the
// cost-stack at a representative run size.

function FlatLegsCard() {
  const { data, isLoading } = useQuery<CostStack>({
    queryKey: ["/api/admin/gooddeed-cost-stack", { runQty: 100 }],
    queryFn: () => fetchCostStack(100),
  });

  const legs: Array<{ key: "hologram" | "insertion"; label: string }> = [
    { key: "hologram", label: "Hologram + shrinkwrap" },
    { key: "insertion", label: "Insertion" },
  ];

  return (
    <Card testId="panel-flat-legs">
      <SectionTitle
        title="Hologram + insertion"
        subtitle="Flat per-unit cost of each leg for the current routing-default vendors."
      />
      <div className="rounded-xl border border-[var(--apple-hairline)] divide-y divide-[var(--apple-hairline)] mt-4">
        {isLoading ? (
          <div className="px-3 py-6 text-sm text-[var(--apple-subink)]">
            Loading vendor pricing…
          </div>
        ) : (
          legs.map(({ key, label }) => {
            const leg = data?.[key] ?? null;
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-3 px-3 py-3"
                data-testid={`row-flat-${key}`}
              >
                <div className="min-w-0">
                  <span className={LABEL_CLASS}>{label}</span>
                  <div className="mt-1">
                    <VendorLink leg={leg} name={`flat-${key}`} />
                  </div>
                </div>
                <div
                  className="text-sm font-semibold text-[var(--apple-ink)] tabular-nums shrink-0"
                  data-testid={`text-flat-${key}-cost`}
                >
                  {leg?.perUnitCents != null ? dollars(leg.perUnitCents) : "—"}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

// --- 2. Quickprinter ladder ------------------------------------------------

type QuickprinterLadder = {
  vendor: { id: string; name: string } | null;
  paperSize: string;
  ladder: Array<{ qty: number; perUnitCents: number }>;
};

function QuickprinterLadderCard({ vendorId }: { vendorId: string }) {
  const { data, isLoading, isError } = useQuery<QuickprinterLadder>({
    queryKey: ["/api/admin/gooddeed-quickprinter-ladder"],
  });
  const ladder = data?.ladder ?? [];
  const hasLadder = ladder.length > 0;
  const priceAt = (rung: number): number | null =>
    ladder.find((t) => t.qty === rung)?.perUnitCents ?? null;

  return (
    <Card testId="panel-quickprinter-ladder">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle
          title={`Quickprinter ladder${data?.vendor ? ` — ${data.vendor.name}` : ""}`}
          subtitle="Per-unit printing cost at each quantity rung (US Letter). Quantities between rungs walk down to the next-lower rung's price."
        />
        {data?.vendor && (
          <Link href={`/admin/vendors/${vendorId}?tab=gooddeed`} className="inline-flex items-center gap-1 text-sm text-[var(--apple-subink)] hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors shrink-0"
            data-testid="link-quickprinter-vendor"
          >
            View vendor
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>
        )}
      </div>

      <div className="flex items-center gap-1.5 border-b border-[var(--apple-hairline)] mt-4">
        <span
          className="px-3 h-8 inline-flex items-center text-xs font-semibold border-b-2 border-[color:var(--brand-blue)] text-[var(--apple-ink)]"
          data-testid="tab-paper-letter"
        >
          US Letter (8.5×11)
        </span>
        <span
          className="px-3 h-8 inline-flex items-center text-xs font-medium text-[var(--apple-faint)]"
          data-testid="tab-paper-12x18"
          title="Scaffolded — wired up in a future task"
        >
          12×18 (coming soon)
        </span>
      </div>

      {isLoading ? (
        <div className="py-6 text-[var(--apple-subink)] text-sm">Loading ladder…</div>
      ) : isError ? (
        <div className="py-6 text-[var(--apple-faint)] text-sm" data-testid="text-qp-error">
          Couldn't load the Quickprinter ladder.
        </div>
      ) : !hasLadder ? (
        <div className="py-6 text-[var(--apple-faint)] text-sm">
          The routing-default Quickprinter has no US Letter ladder configured
          yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-3">
          {QP_RUNGS.map((rung) => {
            const cents = priceAt(rung);
            return (
              <div key={rung} data-testid={`field-qp-rung-${rung}`}>
                <span className={LABEL_CLASS + " mb-1"}>
                  {qtyFmt.format(rung)} units
                </span>
                <div
                  className="text-right text-sm font-medium text-[var(--apple-ink)] tabular-nums"
                  data-testid={`text-qp-rung-${rung}`}
                >
                  {cents != null ? (
                    dollars(cents)
                  ) : (
                    <span className="text-[var(--apple-faint)]">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// --- 4. Resolved per-cert total --------------------------------------------

function ResolvedTotalCard({ settings }: { settings: PayoutSettings }) {
  const [qtyStr, setQtyStr] = useState("100");
  const runQty = Math.max(1, Number.parseInt(qtyStr, 10) || 0);
  const validQty = Number.isFinite(runQty) && runQty >= 1;

  const { data, isLoading, isError } = useQuery<CostStack>({
    queryKey: ["/api/admin/gooddeed-cost-stack", { runQty }],
    queryFn: () => fetchCostStack(runQty),
    enabled: validQty,
  });

  const rungs = settings.signedCertLadder ?? DEFAULT_SIGNED_CERT_LADDER;
  const rung = lookupSignedCertRung(runQty, rungs);
  const wholesaleCents = rung?.wholesaleCents ?? null;
  const vendorPerUnit = data?.totalPerUnitCents ?? 0;
  const marginCents =
    wholesaleCents != null ? wholesaleCents - vendorPerUnit : null;
  const belowMin = runQty < SIGNED_CERT_MIN_BATCH;

  const Row = ({
    label,
    value,
    testId,
    strong,
    negative,
  }: {
    label: string;
    value: string;
    testId: string;
    strong?: boolean;
    negative?: boolean;
  }) => (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-sm text-[var(--apple-subink)]">{label}</span>
      <span
        className={[
          "text-sm tabular-nums",
          strong ? "font-semibold" : "font-medium",
          negative ? "text-[color:var(--brand-heart)]" : "text-[var(--apple-ink)]",
        ].join(" ")}
        data-testid={testId}
      >
        {value}
      </span>
    </div>
  );

  return (
    <Card testId="panel-resolved-total">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <SectionTitle
          title="Resolved per-cert total"
          subtitle="Enter a run size to see the resolved wholesale rung, the live vendor cost stack, and the per-run totals."
        />
        <div className="shrink-0">
          <label
            htmlFor="input-resolved-runqty"
            className={LABEL_CLASS + " mb-1"}
          >
            Run size
          </label>
          <input
            id="input-resolved-runqty"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={qtyStr}
            onChange={(e) => setQtyStr(e.target.value)}
            className="w-32 h-9 border border-slate-200 rounded-md px-2 text-sm text-right tabular-nums focus:outline-none focus:border-[color:var(--brand-blue)]"
            data-testid="input-resolved-runqty"
          />
        </div>
      </div>

      {belowMin && (
        <div
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          data-testid="text-resolved-below-min"
        >
          Below the {SIGNED_CERT_MIN_BATCH}-unit minimum — the cert add-on
          auto-refunds and no print run happens at this run size.
        </div>
      )}

      <div className="mt-4 rounded-xl border border-[var(--apple-hairline)] divide-y divide-[var(--apple-hairline)]">
        <Row
          label="Wholesale per cert (artist pays)"
          value={wholesaleCents != null ? dollars(wholesaleCents) : "—"}
          testId="text-resolved-wholesale"
          strong
        />
        {isLoading ? (
          <div className="px-3 py-2 text-sm text-[var(--apple-subink)]">
            Loading cost stack…
          </div>
        ) : isError ? (
          <div className="px-3 py-2 text-sm text-[var(--apple-faint)]">
            Couldn't load the cost stack.
          </div>
        ) : (
          <>
            <Row
              label="Vendor cost per cert"
              value={dollars(vendorPerUnit)}
              testId="text-resolved-vendor-cost"
            />
            <Row
              label="GoodTunes margin per cert"
              value={marginCents != null ? dollars(marginCents) : "—"}
              testId="text-resolved-margin"
              negative={marginCents != null && marginCents < 0}
            />
          </>
        )}
      </div>

      {!isLoading && !isError && (
        <div className="mt-3 rounded-xl border border-[var(--apple-hairline)] divide-y divide-[var(--apple-hairline)]">
          <Row
            label={`Per-run wholesale (× ${qtyFmt.format(runQty)})`}
            value={
              wholesaleCents != null
                ? dollars(wholesaleCents * runQty)
                : "—"
            }
            testId="text-resolved-run-wholesale"
            strong
          />
          <Row
            label={`Per-run vendor cost (× ${qtyFmt.format(runQty)})`}
            value={dollars(vendorPerUnit * runQty)}
            testId="text-resolved-run-vendor-cost"
          />
        </div>
      )}

      <p className="text-xs text-[var(--apple-subink)] mt-3">
        Shipping (print → hologram → insertion → fulfillment) is bundled into
        the Quickprinter rung today.
      </p>
    </Card>
  );
}
