#!/usr/bin/env python3
"""Guard: the android-internal `when.changeset` filter must cover every native path.

Why this exists:
  `codemagic.yaml`'s `android-internal` workflow auto-builds the Android `.aab`
  ONLY when the merge touched a native-shell path, using a `when.changeset`
  `includes:` allow-list (`android/`, `capacitor.config.ts`, `package.json`,
  `package-lock.json`; `codemagic.yaml` itself is always implicitly included).
  This saves ~$0.50 per no-op Linux build — almost every merge touches zero
  native files (see docs/codemagic-builds.md → "Android builds").

  The dangerous failure mode is silent: `includes:` DISABLES Codemagic's default
  include-all, so if a NEW native-config path ever appears in the repo but nobody
  adds it to the list, a real native change would auto-SKIP its build and testers
  would keep running a STALE app shell with no error anywhere. Today nothing
  catches that drift — it relies on a human remembering to update the list.

  This guard closes that gap. It parses `codemagic.yaml`, reads the
  `android-internal` `when.changeset.includes`, and HARD-FAILS if a native-shell
  path that exists on disk is not covered by the list — e.g. someone migrates to
  `capacitor.config.json`/`.js`, or `android/`/`package.json`/`package-lock.json`
  silently drops off the list. The bias matches the filter's own bias: when in
  doubt, demand a BUILD (a wasted ~$0.50 beats shipping a stale shell).

Native-shell paths it insists on:
  - Always-required (these always exist and always affect the .aab):
      android/, package.json, package-lock.json
  - The Capacitor config, in whatever form it takes on disk:
      capacitor.config.{ts,js,cjs,mjs,json}
    Every variant present in the repo must be listed. This is the exact drift the
    task calls out (a migration to .json/.js that the allow-list doesn't know).

Usage:
  python3 scripts/verify-codemagic-android-changeset.py
      Check the repo's real codemagic.yaml against the repo's real files.
  python3 scripts/verify-codemagic-android-changeset.py --config PATH --repo-root DIR
      Check an arbitrary config against an arbitrary tree (used by the smoke test).

Exit status: 0 = the filter covers every native path on disk, 1 = drift found
(or the config could not be parsed).
"""

import argparse
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

WORKFLOW_NAME = "android-internal"

# Native-shell paths that ALWAYS exist and ALWAYS affect the produced .aab, so
# the changeset filter must always list them. A directory entry ends with "/".
REQUIRED_NATIVE_PATHS = ("android/", "package.json", "package-lock.json")

# The Capacitor config can legitimately be authored in any of these forms. The
# guard requires EVERY variant that exists on disk to be covered — this is the
# headline drift the task protects against (a future migration off .ts).
CAPACITOR_CONFIG_BASENAMES = (
    "capacitor.config.ts",
    "capacitor.config.js",
    "capacitor.config.cjs",
    "capacitor.config.mjs",
    "capacitor.config.json",
)


def _indent(line):
    return len(line) - len(line.lstrip(" "))


def _strip_list_item_value(raw):
    """Given the text after a leading '- ', return the (unquoted) path value.

    Handles single/double quotes and trailing inline `# comments`.
    """
    raw = raw.strip()
    if not raw:
        return ""
    if raw[0] in ("'", '"'):
        quote = raw[0]
        end = raw.find(quote, 1)
        if end != -1:
            return raw[1:end]
        return raw[1:].strip()  # unterminated quote — best effort
    # Unquoted: value runs until whitespace or an inline comment.
    token = raw.split("#", 1)[0]
    return token.strip()


def parse_android_changeset_includes(config_path):
    """Parse codemagic.yaml and return the android-internal changeset includes.

    Returns a list of include strings. Raises ValueError if the workflow or its
    `when.changeset.includes:` block cannot be found (a structural change the
    operator must look at, not silently pass).
    """
    with open(config_path, "r", encoding="utf-8") as handle:
        lines = handle.readlines()

    # 1) Find the workflow key `  android-internal:` (a top-level workflow, so it
    #    sits at indent 2 under `workflows:`).
    wf_start = None
    wf_indent = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.rstrip() == f"{WORKFLOW_NAME}:":
            wf_start = i
            wf_indent = _indent(line)
            break
    if wf_start is None:
        raise ValueError(
            f"could not find the `{WORKFLOW_NAME}:` workflow in {config_path}"
        )

    # 2) Determine where the workflow block ends (next non-blank, non-comment line
    #    at an indent <= the workflow key's indent).
    wf_end = len(lines)
    for i in range(wf_start + 1, len(lines)):
        line = lines[i]
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if _indent(line) <= wf_indent:
            wf_end = i
            break

    block = lines[wf_start:wf_end]

    # 3) Inside the workflow block, find the `includes:` line (it lives under
    #    when: -> changeset: -> includes:). The workflow has exactly one
    #    when.changeset.includes, so the first `includes:` is the one we want.
    includes_idx = None
    includes_indent = None
    for j, line in enumerate(block):
        if line.strip() == "includes:":
            includes_idx = j
            includes_indent = _indent(line)
            break
    if includes_idx is None:
        raise ValueError(
            f"`{WORKFLOW_NAME}` has no `when.changeset.includes:` block in "
            f"{config_path} (did the filter get removed?)"
        )

    # 4) Collect list items beneath `includes:` until the block dedents.
    includes = []
    for line in block[includes_idx + 1:]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if _indent(line) <= includes_indent:
            break
        if stripped.startswith("- "):
            value = _strip_list_item_value(stripped[2:])
            if value:
                includes.append(value)
        elif stripped == "-":
            continue
        else:
            # A non-list key at a deeper indent means the list ended.
            break
    return includes


def is_covered(path, includes):
    """True if `path` is matched by some include pattern.

    A directory include ending in "/" covers anything beneath it; otherwise the
    match is exact. (Codemagic also supports globs, but the native paths we guard
    are concrete files / one directory, so exact + dir-prefix is sufficient and
    avoids false-passing on an unrelated glob.)
    """
    for pattern in includes:
        if pattern.endswith("/"):
            if path == pattern or path.startswith(pattern):
                return True
        elif path == pattern:
            return True
    return False


def discover_native_paths(repo_root):
    """Native-shell paths present on disk that the filter must cover."""
    paths = []
    for required in REQUIRED_NATIVE_PATHS:
        on_disk = required.rstrip("/")
        if os.path.exists(os.path.join(repo_root, on_disk)):
            paths.append(required)
    for basename in CAPACITOR_CONFIG_BASENAMES:
        if os.path.isfile(os.path.join(repo_root, basename)):
            paths.append(basename)
    return paths


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        default=os.path.join(REPO_ROOT, "codemagic.yaml"),
        help="path to codemagic.yaml (default: repo codemagic.yaml)",
    )
    parser.add_argument(
        "--repo-root",
        default=REPO_ROOT,
        help="repo tree to scan for native paths (default: this repo)",
    )
    args = parser.parse_args(argv)

    if not os.path.isfile(args.config):
        print(f"codemagic-android-changeset: config not found at {args.config}",
              file=sys.stderr)
        return 1

    try:
        includes = parse_android_changeset_includes(args.config)
    except ValueError as exc:
        print(f"codemagic-android-changeset: {exc}", file=sys.stderr)
        print(
            "  The android-internal auto-build filter could not be read. If the "
            "workflow or its when.changeset.includes block was intentionally "
            "restructured, update scripts/verify-codemagic-android-changeset.py "
            "to match.",
            file=sys.stderr,
        )
        return 1

    native_paths = discover_native_paths(args.repo_root)
    uncovered = [p for p in native_paths if not is_covered(p, includes)]

    print(f"android-internal when.changeset.includes: {includes}")
    print(f"native-shell paths on disk: {native_paths}")

    if uncovered:
        print(
            "\ncodemagic-android-changeset FAILED: these native-shell paths exist "
            "in the repo but are NOT covered by the android-internal "
            "when.changeset.includes allow-list:",
            file=sys.stderr,
        )
        for path in uncovered:
            print(f"  - {path}", file=sys.stderr)
        print(
            "\nWhy this is dangerous: `includes:` disables Codemagic's default "
            "include-all, so a merge that touches an uncovered native path would "
            "auto-SKIP its Android build and ship testers a STALE app shell with no "
            "error. Fix: add the path(s) above to the `when.changeset.includes` "
            "list of the `android-internal` workflow in codemagic.yaml (and refresh "
            "docs/codemagic-builds.md + .agents/memory/codemagic-changeset-android.md "
            "if the native-config surface changed).",
            file=sys.stderr,
        )
        return 1

    print(
        "codemagic-android-changeset: every native-shell path on disk is covered "
        "by the android-internal auto-build filter."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
