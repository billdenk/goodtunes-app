#!/usr/bin/env tsx
/**
 * Design conformance linter (Task #186).
 *
 * Walks UI source under `client/src/**` and `artifacts/mockup-sandbox/src/**`,
 * applies the mechanical rules extracted from `docs/design-system.md`,
 * and prints a pretty + JSON report of violations.
 *
 * Baseline-aware: violations recorded in `.design-lint-baseline.json` at
 * the repo root are subtracted from the live run, so only NEW drift
 * fails the check. Legacy pages can be migrated opportunistically per
 * the "migrate each time you touch the file" rule.
 *
 * Refresh the baseline (only after legacy pages get migrated):
 *   npm run design:lint -- --update-baseline
 *
 * Exit codes:
 *   0  no new violations
 *   1  new violations found
 *   2  internal error (parser/IO)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { globSync } from "glob";

type Violation = {
  rule: string;
  file: string;
  line: number;
  message: string;
  snippet: string;
};

const ROOT = resolve(process.cwd());
const BASELINE_PATH = join(ROOT, ".design-lint-baseline.json");

const TARGET_GLOBS = [
  "client/src/**/*.{ts,tsx,jsx}",
  "artifacts/mockup-sandbox/src/**/*.{ts,tsx,jsx}",
];

// Files that legitimately host the raw tokens / primitive definitions
// and must be skipped to avoid self-flagging.
const FILE_ALLOWLIST: Array<RegExp> = [
  /client\/src\/index\.css$/,
  /client\/src\/components\/ui\/IconButton\.tsx$/,
  /client\/src\/components\/ui\/button\.tsx$/,
  // shadcn primitives — they wrap radix and own the canonical h-9 sizing.
  /client\/src\/components\/ui\/[a-z-]+\.tsx$/,
  // Canonical JS-side brand palette — mirrors the CSS vars in
  // index.css for recharts / other JS consumers that need plain
  // hex strings. Allowlisted so the tokens it defines aren't
  // self-flagged as raw hex literals.
  /client\/src\/lib\/brand-tokens\.ts$/,
];

const BRAND_HEX = [
  "#319ED8",
  "#7F10A7",
  "#4AFFCA",
  "#FF5470",
  "#00062B",
];

const ALLOWED_ICON_LIBS = new Set<string>([
  "lucide-react",
  "react-icons/si", // company logos
]);

const ICON_LIB_PREFIXES = ["react-icons/", "@heroicons/", "@radix-ui/react-icons", "@tabler/icons", "@phosphor-icons", "react-feather", "@mui/icons-material"];

function isAllowlistedFile(rel: string): boolean {
  return FILE_ALLOWLIST.some((re) => re.test(rel));
}

function isShadcnPrimitive(rel: string): boolean {
  // shadcn primitive files live under client/src/components/ui/ and use
  // lowercase-kebab filenames (e.g. button.tsx, select.tsx). The custom
  // primitives (IconButton.tsx, LyricsIcon.tsx, PlayerDock.tsx) start
  // uppercase and ARE linted.
  return /client\/src\/components\/ui\/[a-z][a-z0-9-]*\.tsx$/.test(rel);
}

// --- rules ----------------------------------------------------------------

function lintFile(rel: string, src: string): Violation[] {
  const out: Violation[] = [];
  const lines = src.split("\n");
  const isAdmin =
    /client\/src\/(pages\/Admin|components\/admin)/.test(rel) ||
    /gt-admin/.test(src);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // R1: raw brand-hex literals outside index.css / primitives.
    for (const hex of BRAND_HEX) {
      const re = new RegExp(hex.replace("#", "#"), "i");
      if (re.test(line)) {
        out.push({
          rule: "brand-hex-literal",
          file: rel,
          line: lineNum,
          message: `Raw brand hex ${hex} — use var(--brand-*) or the primitive.`,
          snippet: line.trim().slice(0, 200),
        });
      }
    }

    // R2: admin density — no h-10/h-11/h-12 on Button/<button> in admin.
    if (isAdmin) {
      if (/<Button\b[^>]*\bclassName=("[^"]*|'[^']*|`[^`]*)\bh-(10|11|12)\b/.test(line) ||
          /<button\b[^>]*\bclassName=("[^"]*|'[^']*|`[^`]*)\bh-(10|11|12)\b/.test(line)) {
        out.push({
          rule: "admin-button-too-tall",
          file: rel,
          line: lineNum,
          message: `Admin buttons use h-8/h-9 — found h-10/11/12.`,
          snippet: line.trim().slice(0, 200),
        });
      }
    }

    // R12: fan text-tone scale (Task #1089). On fan (non-admin) surfaces,
    // raw `text-white/NN` and `text-slate-NNN` text tones must move onto the
    // shared Apple-style scale: `text-fan-primary` / `text-fan-secondary` /
    // `text-fan-faint` (see docs/design-system.md → Text tone). Pure
    // `text-white` (on-accent button labels) is intentionally NOT flagged;
    // `placeholder:text-white/NN` is skipped (placeholders, not body tone).
    if (!isAdmin) {
      const toneMatches = line.match(/(?<!placeholder:)\btext-white\/\d+\b|\btext-slate-(?:100|200|300|400|500|600)\b/g);
      if (toneMatches) {
        for (const m of toneMatches) {
          out.push({
            rule: "fan-text-tone",
            file: rel,
            line: lineNum,
            message: `Raw fan text tone ${m} — use text-fan-primary / text-fan-secondary / text-fan-faint. See docs/design-system.md → Text tone.`,
            snippet: line.trim().slice(0, 200),
          });
        }
      }
    }

    // R3: hard-coded font sizes — text-[Npx] is forbidden everywhere
    // except shadcn primitives. The shadcn type scale + Apple HIG sizes
    // already in docs cover the legit needs. NOTE: docs/design-system.md
    // shows text-[13px]/[15px] are used widely in admin chrome today
    // — those land in the baseline, so this catches NEW drift only.
    const fontMatches = line.match(/text-\[\d+(?:\.\d+)?px\]/g);
    if (fontMatches) {
      for (const m of fontMatches) {
        out.push({
          rule: "hardcoded-font-size",
          file: rel,
          line: lineNum,
          message: `Hardcoded font size ${m} — use shadcn type scale (text-xs/sm/base/lg/xl) or HIG sizes.`,
          snippet: line.trim().slice(0, 200),
        });
      }
    }

    // R4: native <select> on admin surfaces — use shadcn Select.
    if (isAdmin && /<select(\s|>)/.test(line) && !/<selection/i.test(line)) {
      out.push({
        rule: "native-select-on-admin",
        file: rel,
        line: lineNum,
        message: `Native <select> on admin — use shadcn <Select> from @/components/ui/select.`,
        snippet: line.trim().slice(0, 200),
      });
    }

    // R7: sub-44px circular buttons on player surfaces. Anything with
    // `rounded-full` AND a width class smaller than `w-11` (44px) is
    // below the Apple HIG floor. Common offenders: w-8, w-9, w-10.
    if (!isAdmin && /rounded-full/.test(line)) {
      const m2 = line.match(/\bw-(\d+)\b/);
      if (m2) {
        const n = Number(m2[1]);
        if (n > 0 && n < 11) {
          out.push({
            rule: "player-touch-target-too-small",
            file: rel,
            line: lineNum,
            message: `Circular control w-${n} (~${n * 4}px) below 44pt HIG floor on a fan surface — use IconButton size="md".`,
            snippet: line.trim().slice(0, 200),
          });
        }
      }
    }

    // R8: admin inline <Link> without the shared link treatment. The
    // shared treatment inherits text color at rest and adds the brand-
    // blue hover underline. Heuristic: any <Link ...> on an admin file
    // whose className doesn't mention `hover:text-[color:var(--brand-blue)]`
    // / `hover:underline` / `underline-offset` is flagged. Bare <Link>
    // with no className at all is also flagged.
    if (isAdmin && /<Link\b/.test(line)) {
      const classMatch = line.match(/<Link\b[^>]*\bclassName=("[^"]*"|'[^']*'|`[^`]*`|\{[^}]*\})/);
      const className = classMatch?.[1] ?? "";
      const hasSharedTreatment =
        /hover:text-\[color:var\(--brand-blue\)\]/.test(className) ||
        /hover:underline/.test(className) ||
        /underline-offset/.test(className) ||
        /\bgt-link\b/.test(className);
      // Skip nav/sidebar Links — those use their own button-like chrome.
      const looksLikeNav =
        /\bgt-nav\b/.test(className) ||
        /sidebar/i.test(rel) ||
        /Nav(bar|igation)?\.tsx$/.test(rel);
      if (!hasSharedTreatment && !looksLikeNav) {
        out.push({
          rule: "admin-link-missing-shared-treatment",
          file: rel,
          line: lineNum,
          message: `Admin <Link> missing shared inline-link treatment (inherit color + brand-blue hover underline). See docs/design-system.md → Inline text links.`,
          snippet: line.trim().slice(0, 200),
        });
      }
    }

    // R9: hand-rolled dropdown menus on admin — flag absolute-positioned
    // popups that aren't using shadcn DropdownMenu/Popover. Heuristic:
    // `className="absolute … z-` paired with `role="menu"` or a parent
    // file that doesn't import any of DropdownMenu/Popover/Select from
    // @/components/ui.
    if (isAdmin && /role=["']menu["']/.test(line)) {
      // We'll check whole-file presence of shadcn menu imports below.
      out.push({
        rule: "hand-rolled-dropdown-on-admin",
        file: rel,
        line: lineNum,
        message: `Hand-rolled role="menu" element on admin — use shadcn DropdownMenu from @/components/ui/dropdown-menu.`,
        snippet: line.trim().slice(0, 200),
      });
    }
  }

  // R10: naked <button> rendering a single Lucide icon child should
  // use IconButton. Heuristic: a `<button …>` open tag whose body up to
  // the next `</button>` contains exactly one `<Icon … />` self-closing
  // JSX tag (PascalCase, single tag) and no other text/elements. We
  // skip files that already export/use IconButton-equivalent primitives
  // (button.tsx, IconButton.tsx) — those are allowlisted at file level.
  const btnRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
  let bm: RegExpExecArray | null;
  while ((bm = btnRe.exec(src)) !== null) {
    const attrs = bm[1];
    const body = bm[2].trim();
    // single self-closing PascalCase tag, e.g. <Trash className="…" />
    const single = body.match(/^<([A-Z][A-Za-z0-9]*)\b[^>]*\/>$/);
    if (!single) continue;
    // Skip if the consumer is clearly an icon-button wrapper (aria-label
    // present + Icon name is "Icon" suffix is fine — still naked).
    const lineNum = src.slice(0, bm.index).split("\n").length;
    // Avoid double-flagging if the button is already inside an
    // IconButton render path: check the surrounding 200 chars for an
    // IconButton wrapper.
    const ctx = src.slice(Math.max(0, bm.index - 200), bm.index);
    if (/IconButton\b/.test(ctx)) continue;
    out.push({
      rule: "naked-icon-button",
      file: rel,
      line: lineNum,
      message: `Naked <button> with a single <${single[1]} /> icon child — use IconButton from @/components/ui/IconButton instead.`,
      snippet: bm[0].replace(/\s+/g, " ").trim().slice(0, 200),
    });
  }

  // R5: icon library imports — only lucide-react + react-icons/si allowed.
  const importRe = /^\s*import\s+[^;]+from\s+['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src)) !== null) {
    const mod = m[1];
    const isIconLib = ICON_LIB_PREFIXES.some((p) => mod === p || mod.startsWith(p)) ||
      mod === "lucide-react";
    if (!isIconLib) continue;
    if (ALLOWED_ICON_LIBS.has(mod)) continue;
    // react-icons/si is fine; everything else under react-icons isn't.
    if (mod.startsWith("react-icons/") && mod !== "react-icons/si") {
      // allow nothing else under react-icons
    } else if (mod === "lucide-react" || mod === "react-icons/si") {
      continue;
    }
    const lineNum = src.slice(0, m.index).split("\n").length;
    out.push({
      rule: "icon-library-not-allowed",
      file: rel,
      line: lineNum,
      message: `Icon import from "${mod}" — use lucide-react (UI chrome) or react-icons/si (company logos).`,
      snippet: m[0].trim().slice(0, 200),
    });
  }

  // R11: explicit "Save" buttons on admin surfaces (Task #344). The
  // design system defaults to **auto-save** on field blur/change; an
  // explicit `<Button …>Save</Button>` is reserved for destructive /
  // multi-field / post-sale-locked submits, or for per-row Save which
  // must use the `SaveLink` primitive (brand-blue ghost link, dirty-
  // only). Naked admin Save buttons train operators to expect nothing
  // is saved until clicked, which undermines the auto-save fields
  // around them. Heuristic: literal `>Save</Button>` text on admin
  // files. The baseline absorbs existing legitimate uses (forms,
  // confirms) — only NEW additions fail and must be justified in the
  // baseline refresh.
  if (isAdmin) {
    const saveBtnRe = />\s*Save(?:\s+[A-Za-z]+){0,2}\s*<\/Button>/g;
    let sm: RegExpExecArray | null;
    while ((sm = saveBtnRe.exec(src)) !== null) {
      const lineNum = src.slice(0, sm.index).split("\n").length;
      const snippet = lines[lineNum - 1]?.trim().slice(0, 200) ?? "";
      // SaveLink is the canonical per-row primitive — don't flag it.
      if (/SaveLink/.test(snippet)) continue;
      out.push({
        rule: "admin-explicit-save-button",
        file: rel,
        line: lineNum,
        message: `Admin <Button>Save</Button> — default is auto-save on blur/change; reserve explicit Save for destructive / multi-field / post-sale-locked submits, or use SaveLink for per-row. See docs/design-system.md → Save semantics.`,
        snippet,
      });
    }
  }

  // R6: destructive button without a confirm primitive in the same file.
  // Heuristic: file contains "Trash" import from lucide-react AND a string
  // like "Delete" / "Remove forever" inside a Button label/text, but no
  // AlertDialog / confirm sheet import.
  const usesTrashOrDelete =
    /\bTrash\b/.test(src) ||
    /["'`]\s*(Delete|Remove forever|Delete forever)\s*["'`]/.test(src);
  if (usesTrashOrDelete) {
    const hasConfirm =
      /AlertDialog/.test(src) ||
      /ConfirmSheet|ConfirmDialog|useConfirm|confirmDestructive/.test(src) ||
      /window\.confirm\s*\(/.test(src);
    if (!hasConfirm) {
      // Locate first occurrence for line-number reporting.
      const idx = src.search(/\bTrash\b|["'`]\s*(Delete|Remove forever|Delete forever)\s*["'`]/);
      const lineNum = idx >= 0 ? src.slice(0, idx).split("\n").length : 1;
      out.push({
        rule: "destructive-without-confirm",
        file: rel,
        line: lineNum,
        message: `Destructive action (Trash/Delete/Remove forever) found without AlertDialog/confirm primitive in this file.`,
        snippet: lines[lineNum - 1]?.trim().slice(0, 200) ?? "",
      });
    }
  }

  return out;
}

// --- baseline helpers -----------------------------------------------------

type BaselineEntry = Pick<Violation, "rule" | "file" | "snippet">;

function keyOf(v: BaselineEntry): string {
  return `${v.rule}\u0001${v.file}\u0001${v.snippet}`;
}

function loadBaseline(): Set<string> {
  if (!existsSync(BASELINE_PATH)) return new Set();
  try {
    const raw = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as BaselineEntry[];
    return new Set(raw.map(keyOf));
  } catch {
    return new Set();
  }
}

function writeBaseline(violations: Violation[]): void {
  // De-dupe on (rule, file, snippet) — line numbers shift constantly,
  // so they're not part of the key.
  const seen = new Map<string, BaselineEntry>();
  for (const v of violations) {
    const e: BaselineEntry = { rule: v.rule, file: v.file, snippet: v.snippet };
    seen.set(keyOf(e), e);
  }
  const arr = Array.from(seen.values()).sort((a, b) =>
    a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule),
  );
  writeFileSync(BASELINE_PATH, JSON.stringify(arr, null, 2) + "\n");
}

// --- main -----------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const updateBaseline = args.includes("--update-baseline");
  const jsonOnly = args.includes("--json");

  const files = TARGET_GLOBS.flatMap((g) => globSync(g, { cwd: ROOT, nodir: true }))
    .map((f) => relative(ROOT, resolve(ROOT, f)))
    .filter((rel) => !isAllowlistedFile(rel) && !isShadcnPrimitive(rel));

  const allViolations: Violation[] = [];
  for (const rel of files) {
    let src: string;
    try {
      src = readFileSync(join(ROOT, rel), "utf8");
    } catch {
      continue;
    }
    allViolations.push(...lintFile(rel, src));
  }

  if (updateBaseline) {
    writeBaseline(allViolations);
    process.stdout.write(
      `design:lint — wrote baseline with ${allViolations.length} entries to ${relative(ROOT, BASELINE_PATH)}\n`,
    );
    process.exit(0);
  }

  const baseline = loadBaseline();
  const fresh = allViolations.filter((v) => !baseline.has(keyOf(v)));

  if (jsonOnly) {
    process.stdout.write(JSON.stringify({ total: allViolations.length, baseline: baseline.size, new: fresh.length, violations: fresh }, null, 2) + "\n");
  } else {
    if (fresh.length === 0) {
      process.stdout.write(`design:lint — clean (${allViolations.length} known violations in baseline)\n`);
    } else {
      process.stdout.write(`design:lint — ${fresh.length} NEW violation(s) (baseline: ${baseline.size}, total: ${allViolations.length})\n\n`);
      const byRule = new Map<string, Violation[]>();
      for (const v of fresh) {
        const list = byRule.get(v.rule) ?? [];
        list.push(v);
        byRule.set(v.rule, list);
      }
      for (const [rule, list] of byRule) {
        process.stdout.write(`  [${rule}] ${list.length}\n`);
        for (const v of list.slice(0, 25)) {
          process.stdout.write(`    ${v.file}:${v.line}  ${v.message}\n`);
          process.stdout.write(`        ${v.snippet}\n`);
        }
        if (list.length > 25) {
          process.stdout.write(`    … and ${list.length - 25} more\n`);
        }
        process.stdout.write("\n");
      }
      process.stdout.write(
        `To accept these as known (only after migration of the affected file is intentionally deferred):\n` +
        `  npm run design:lint -- --update-baseline\n`,
      );
    }
  }

  process.exit(fresh.length === 0 ? 0 : 1);
}

main();
