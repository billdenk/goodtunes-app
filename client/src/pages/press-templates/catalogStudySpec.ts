// Task #3079 — Preview eligibility for the press-catalog Print prep template
// tiles. Adapts the catalog's slot row (a plain press_template_specs row,
// no joined history) to the study-spec builder's contract and decides
// whether the ••• menu shows a Preview item: only when the slot has an
// attached file AND buildStudySpec can produce a meaningful study (at least
// one zone and one page panel) from the measured PDF facts.
//
// Lives beside buildStudySpec (not in the 4,700-line catalog page) so it
// stays importable by plain node tests — the catalog page's dependency
// chain pulls raw image assets that only Vite can load.
import type { StudySpec } from "@/components/press/PrintedAreasStudy";
import { buildStudySpec } from "./buildStudySpec";
import type { TemplateSpecWithHistory } from "./types";

/** The catalog page's slot row — the subset buildStudySpec actually reads. */
export type CatalogTemplateSpecRow = {
  id: string;
  format: string;
  componentKey: string;
  variantKey: string;
  discCount: number;
  artboardWInches: number | null;
  artboardHInches: number | null;
  expectedPages: number | null;
  templateFileUrl: string | null;
  templateFileName: string | null;
  printRules: Record<string, unknown> | null;
  bleedLineInches?: number | null;
  measuredArtboardWInches?: number | null;
  measuredArtboardHInches?: number | null;
  measuredPages?: number | null;
  measuredBleedLineInches?: number | null;
  // Task #3097 — dieline-guide facts; the study draws Bleed/Safe/Fold from
  // these when present (shared/templateGuides.ts shape).
  measuredGuides?: Record<string, unknown> | null;
};

export function templateStudySpecFor(
  spec: CatalogTemplateSpecRow | null,
  lead: string,
  rest: string,
): StudySpec | null {
  if (!spec?.templateFileUrl) return null;
  // The study must be built from the MEASURED PDF facts — never from
  // operator-entered dims alone (buildStudySpec falls back to those, which
  // would preview a study for a file we never actually measured).
  if (
    typeof spec.measuredArtboardWInches !== "number" ||
    typeof spec.measuredArtboardHInches !== "number" ||
    !(typeof spec.measuredPages === "number" && spec.measuredPages > 0)
  ) {
    return null;
  }
  // buildStudySpec only reads component/variant, dims, pages, bleed,
  // printRules and measured facts; history arrays are unused, so empties
  // are honest here.
  const built = buildStudySpec(
    { ...spec, revisions: [], runs: [] } as unknown as TemplateSpecWithHistory,
    lead,
    rest,
  );
  // "Meaningful" = at least one measured zone AND at least one page panel;
  // otherwise there is nothing to study yet (e.g. an unmeasured booklet).
  if ((built.zones?.length ?? 0) === 0 || (built.panels?.length ?? 0) === 0) return null;
  return built;
}
