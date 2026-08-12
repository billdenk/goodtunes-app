---
name: Template multi-option = single tile stamp
description: One template file covering multiple physical options (7″ small/large hole) stays ONE spec row with a display-only jsonb stamp — never split into variant rows.
---

The rule: when a press template PDF draws multiple physical options (canon case: 7″ center label with both small spindle + large 45 hole guides), keep ONE `press_template_specs` row and stamp `variant_options` (jsonb `[{key,label}]`, display-only) after the operator confirms the detection prompt. Do NOT mint per-option spec rows.

**Why:** Bill explicitly chose this over two tiles ("could be confusing if people see two and don't realize it's the same template") — the buyer-side hole choice already lives in the package builder quote flow, so per-option spec rows add nothing.

**How to apply:**
- Detection: `detectOptionsInText` / `detectTemplateOptionsForUrl` (pdftotext, conservative: ALL options of a family must be mentioned; object-storage files only — pasted https URLs skip detection). Families list in `server/templateOptions.ts` is the extension point.
- Replace semantics: stamp survives a replace that still detects the same options; clears when the new file no longer mentions them; re-prompts only when unstamped.
- Custom operator slots ride `press_custom_template_slots` (componentKey `custom_<slug>`); their finished-file spec resolves from the row's OWN operator/measured geometry — no baseline, null geometry = honest 422.
- `variant_options` never feeds measurements or checks — the file is one file either way.
