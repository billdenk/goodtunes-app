// Task #2258 — shared campaign link-builder.
//
// Mints UTM-tagged share links for a release per channel, with one-tap copy.
// Used in BOTH the partner Acquisition tab (AcquisitionTab.tsx) and the operator
// report (AdminReports.tsx FunnelsTab) so the tag conventions stay identical —
// utm_source MUST match the funnel's deriveSource key (`utm:<source>|<campaign>`,
// server lower-cases both) so a fan who clicks a generated link self-attributes
// into the funnel's "By source" breakdown.
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Copy, Check, Megaphone } from "lucide-react";
import { shareUrlForSlug } from "@shared/shareSlug";

export type LinkBuilderRelease = {
  albumId: string;
  title: string;
  artist: string;
  shareSlug: string | null;
};

// Player host fans actually land on when no clean per-release slug exists.
// (window.location.origin here is the admin/partner host — never a fan host —
// so we never fall back to it.)
const PLAYER_HOST = "https://my.goodtunes.music";

export function baseShareUrl(r: LinkBuilderRelease): string {
  return r.shareSlug ? shareUrlForSlug(r.shareSlug) : `${PLAYER_HOST}/album/${r.albumId}`;
}

export function slugifyTag(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildUtmUrl(
  base: string,
  { source, medium, campaign }: { source: string; medium?: string; campaign: string },
): string {
  const sep = base.includes("?") ? "&" : "?";
  const params = new URLSearchParams();
  params.set("utm_source", slugifyTag(source));
  if (medium) params.set("utm_medium", slugifyTag(medium));
  params.set("utm_campaign", slugifyTag(campaign) || "launch");
  return `${base}${sep}${params.toString()}`;
}

// Pre-built common channels → one-tap-copy links. `source` is what shows up
// in the funnel's "By source" column.
const COMMON_CHANNELS: { source: string; label: string; medium: string }[] = [
  { source: "instagram", label: "Instagram", medium: "social" },
  { source: "facebook", label: "Facebook", medium: "social" },
  { source: "twitter", label: "X / Twitter", medium: "social" },
  { source: "tiktok", label: "TikTok", medium: "social" },
  { source: "youtube", label: "YouTube", medium: "social" },
  { source: "threads", label: "Threads", medium: "social" },
  { source: "email", label: "Email", medium: "email" },
  { source: "sms", label: "Text / SMS", medium: "sms" },
  { source: "whatsapp", label: "WhatsApp", medium: "messaging" },
  { source: "newsletter", label: "Newsletter", medium: "email" },
];

function CopyLinkButton({ url, testId }: { url: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked — the link is visible in the field to copy by hand */
        }
      }}
      data-testid={testId}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-[color:var(--apple-hairline)] bg-white text-xs font-medium text-[color:var(--apple-ink)] hover:border-[color:var(--apple-faint)] hover:bg-[color:var(--apple-tile)] transition-colors flex-shrink-0"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-[color:var(--apple-ready)]" /> Copied
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5 text-[color:var(--apple-faint)]" /> Copy
        </>
      )}
    </button>
  );
}

/**
 * Self-contained campaign link-builder card. Works for any owned release,
 * including a brand-new one with zero funnel traffic — that's exactly when a
 * partner needs the tagged link.
 */
export function CampaignLinkBuilder({ release }: { release: LinkBuilderRelease }) {
  // Campaign defaults to the release title so generated links group tidily;
  // the user can rename it (e.g. "spring_tour") to split campaigns.
  const [campaign, setCampaign] = useState(() => slugifyTag(release.title) || "launch");
  const [customSource, setCustomSource] = useState("");
  const base = baseShareUrl(release);
  const customUrl =
    customSource.trim().length > 0
      ? buildUtmUrl(base, { source: customSource, campaign })
      : "";

  return (
    <div
      className="rounded-xl border border-[color:var(--apple-hairline)] bg-white p-5"
      data-testid="link-builder"
    >
      <div className="flex items-start gap-2 mb-4">
        <Megaphone className="w-4 h-4 text-[var(--brand-blue)] mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-[color:var(--apple-ink)]">Campaign link builder</h3>
          <p className="text-xs text-[color:var(--apple-subink)] mt-0.5">
            Share these links instead of the plain release URL. Each one tags the
            channel so clicks show up by source in the funnel above.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 mb-4 max-w-xs">
        <Label
          htmlFor="campaign-name"
          className="text-xs uppercase tracking-wider text-[color:var(--apple-subink)] font-semibold"
        >
          Campaign name
        </Label>
        <input
          id="campaign-name"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          data-testid="input-campaign-name"
          className="h-9 rounded-md border border-[color:var(--apple-hairline)] bg-white px-3 text-sm text-[color:var(--apple-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
          placeholder="launch"
        />
        <span className="text-xs text-[color:var(--apple-faint)]">
          Tagged as <code className="text-[color:var(--apple-subink)]">{slugifyTag(campaign) || "launch"}</code>
        </span>
      </div>

      <div className="space-y-2">
        {COMMON_CHANNELS.map((ch) => {
          const url = buildUtmUrl(base, { source: ch.source, medium: ch.medium, campaign });
          return (
            <div
              key={ch.source}
              className="flex items-center gap-3"
              data-testid={`channel-link-${ch.source}`}
            >
              <span className="w-24 flex-shrink-0 text-sm font-medium text-[color:var(--apple-ink)]">{ch.label}</span>
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                data-testid={`text-channel-url-${ch.source}`}
                className="flex-1 min-w-0 h-8 rounded-md border border-[color:var(--apple-hairline)] bg-[color:var(--apple-tile)] px-2.5 text-xs text-[color:var(--apple-subink)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]"
              />
              <CopyLinkButton url={url} testId={`button-copy-${ch.source}`} />
            </div>
          );
        })}

        <div className="flex items-center gap-3 pt-2 border-t border-[color:var(--apple-hairline)] mt-3">
          <input
            value={customSource}
            onChange={(e) => setCustomSource(e.target.value)}
            data-testid="input-custom-source"
            placeholder="Other channel…"
            className="w-24 flex-shrink-0 h-8 rounded-md border border-[color:var(--apple-hairline)] bg-white px-2.5 text-sm text-[color:var(--apple-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
          />
          <input
            readOnly
            value={customUrl}
            onFocus={(e) => e.currentTarget.select()}
            data-testid="text-custom-url"
            placeholder="Type a channel name to generate a link"
            className="flex-1 min-w-0 h-8 rounded-md border border-[color:var(--apple-hairline)] bg-[color:var(--apple-tile)] px-2.5 text-xs text-[color:var(--apple-subink)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]"
          />
          {customUrl ? (
            <CopyLinkButton url={customUrl} testId="button-copy-custom" />
          ) : (
            <span className="w-[72px] flex-shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
}
