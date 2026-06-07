#!/usr/bin/env python3
"""Fail fast when the stamped iOS marketing version isn't above the live store version.

Apple rejects any upload whose marketing version (CFBundleShortVersionString) is not
strictly higher than the version currently live on the App Store (errors 90062 / 90478),
but only AFTER the full ~10-minute Mac build + upload. This guard compares the version
just stamped by `agvtool` against the current live App Store version up front so a
forgotten `MARKETING_VERSION` bump fails in seconds instead.

Usage:
    verify-ios-marketing-version.py <stamped-version> <live-versions.json>

<live-versions.json> is the `--json` output of
`app-store-connect apps app-store-versions list --app-store-state READY_FOR_SALE ...`
(a JSON array of AppStoreVersion resources). If it is empty / unreadable / contains no
version string (e.g. the very first submission, or a transient API hiccup) the guard is
FAIL-OPEN: it warns and exits 0 rather than blocking a legitimate build. It only HARD
FAILS (exit 1) when it can prove the stamped version is <= the live store version.
"""

import json
import re
import sys


def parse_version(value):
    """Turn '3.0.1' into a comparable tuple (3, 0, 1). Returns None if unparseable."""
    if not value:
        return None
    parts = re.findall(r"\d+", str(value))
    if not parts:
        return None
    return tuple(int(p) for p in parts)


def collect_version_strings(node, out):
    """Recursively pull every `versionString` value out of the CLI JSON."""
    if isinstance(node, dict):
        for key, val in node.items():
            if key == "versionString" and isinstance(val, str):
                out.append(val)
            else:
                collect_version_strings(val, out)
    elif isinstance(node, list):
        for item in node:
            collect_version_strings(item, out)


def main():
    if len(sys.argv) != 3:
        print("usage: verify-ios-marketing-version.py <stamped-version> <live-versions.json>")
        return 1

    stamped_raw = sys.argv[1].strip()
    json_path = sys.argv[2]

    stamped = parse_version(stamped_raw)
    if stamped is None:
        print(f"ERROR: could not read the stamped marketing version (got '{stamped_raw}').")
        print("Check the `agvtool new-marketing-version` step ran before this guard.")
        return 1

    try:
        with open(json_path, "r") as handle:
            data = json.load(handle)
    except (OSError, ValueError) as exc:
        print(f"WARNING: could not read live App Store versions ({exc}). Skipping the guard.")
        return 0

    version_strings = []
    collect_version_strings(data, version_strings)
    parsed = [(parse_version(v), v) for v in version_strings]
    parsed = [(p, raw) for (p, raw) in parsed if p is not None]

    if not parsed:
        print("WARNING: no live App Store version found (first submission, or API returned "
              "nothing). Skipping the guard — nothing to compare against.")
        return 0

    live_tuple, live_raw = max(parsed, key=lambda item: item[0])

    if stamped > live_tuple:
        print(f"OK: stamped marketing version {stamped_raw} is above the live App Store "
              f"version {live_raw}.")
        return 0

    print("=" * 72)
    print("BUILD BLOCKED: marketing version is not above the live App Store version.")
    print("=" * 72)
    print(f"  Stamped marketing version : {stamped_raw}")
    print(f"  Live App Store version    : {live_raw}")
    print()
    print("Apple will reject this upload (error 90062 / 90478) because the new version")
    print("is not strictly higher than the version already on the App Store.")
    print()
    print("FIX: bump MARKETING_VERSION in codemagic.yaml (the `agvtool new-marketing-version`")
    print(f"line in the 'Set the marketing version' step) to a value above {live_raw}, then")
    print("re-run the build.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
