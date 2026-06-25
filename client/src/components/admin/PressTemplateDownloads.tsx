// Task #2115 — artist/operator-facing download list for a press's uploaded
// print templates (Jacket / Center labels / Inner sleeve). The rows come
// from the album's invited-press payload (`templates`), which is already
// artist-readable, so this surface renders inside the album's Package
// (SellPanel) and Physical (PressPanel) tabs. Download-only — uploading /
// editing the templates lives in the press Catalog editor.
import { Download, FileText } from "lucide-react";
import type { AlbumFormat } from "@shared/schema";

export type PressTemplate = {
  id: string;
  format: AlbumFormat | string;
  componentKey: "jacket" | "labels" | "inner_sleeve";
  variantKey: string;
  discCount: number;
  templateFileUrl: string;
};

const COMPONENT_LABEL: Record<PressTemplate["componentKey"], string> = {
  jacket: "Jacket",
  labels: "Center labels",
  inner_sleeve: "Inner sleeve",
};
const COMPONENT_ORDER: PressTemplate["componentKey"][] = ["jacket", "labels", "inner_sleeve"];

function fileLabel(url: string): string {
  const last = url.split("/").pop() || url;
  const ext = last.includes(".") ? last.split(".").pop()!.toUpperCase() : "FILE";
  return ext;
}

export function PressTemplateDownloads({
  templates,
  format,
  pressName,
  className,
}: {
  templates: PressTemplate[] | undefined;
  format: AlbumFormat;
  pressName?: string | null;
  className?: string;
}) {
  const rows = (templates ?? [])
    .filter((t) => t.format === format && !!t.templateFileUrl)
    .sort(
      (a, b) =>
        COMPONENT_ORDER.indexOf(a.componentKey) - COMPONENT_ORDER.indexOf(b.componentKey),
    );
  if (rows.length === 0) return null;

  return (
    <div className={className} data-testid="press-template-downloads">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
        Print templates{pressName ? ` · ${pressName}` : ""}
      </div>
      <p className="text-xs text-slate-400 mb-2">
        Download your press's print templates and design your artwork on them before uploading
        finished files.
      </p>
      <ul className="space-y-1.5">
        {rows.map((t) => (
          <li key={t.id}>
            <a
              href={t.templateFileUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-[var(--brand-blue)] hover:text-[var(--brand-blue)] transition-colors"
              data-testid={`link-template-download-${t.componentKey}`}
            >
              <FileText className="w-4 h-4 shrink-0 text-slate-400" />
              <span className="font-medium">{COMPONENT_LABEL[t.componentKey]}</span>
              <span className="text-slate-400">{fileLabel(t.templateFileUrl)}</span>
              <Download className="w-4 h-4 ml-auto shrink-0" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
