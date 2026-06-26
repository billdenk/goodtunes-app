#!/usr/bin/env python3
"""Smoke test for scripts/verify-codemagic-android-changeset.py.

Why this exists:
  The guard (verify-codemagic-android-changeset.py) is what catches a future
  edit that adds a NEW native-config path to the repo without listing it in the
  android-internal `when.changeset.includes` allow-list — the silent failure
  mode where a real native change auto-SKIPS its Android build and testers get a
  STALE app shell. If the guard itself regresses (its parser stops finding the
  includes, or its coverage test goes soft) that protection vanishes quietly.

  This smoke test pins the guard's behavior. It:
    1. Asserts the REPO'S REAL codemagic.yaml passes (the current filter is
       complete), so this validation is green today.
    2. Feeds the guard synthetic fixtures — a complete config that should PASS,
       and several drift fixtures (a `capacitor.config.json` that isn't listed, a
       dropped `android/`, a removed `package-lock.json`, a brand-new sibling
       native config) that must each FAIL — so a weakened guard is caught here
       instead of on a stale tester build.

Run with: `python3 scripts/verify-codemagic-android-changeset-smoke.py`
Exit status: 0 = the guard behaved correctly on every case, 1 = one misbehaved.
"""

import os
import subprocess
import sys
import tempfile

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUARD = os.path.join(REPO_ROOT, "scripts", "verify-codemagic-android-changeset.py")
REAL_CONFIG = os.path.join(REPO_ROOT, "codemagic.yaml")


# A minimal but structurally faithful codemagic.yaml: a decoy workflow first (so
# we prove the parser locks onto android-internal, not the first `includes:` it
# sees), then android-internal with a when.changeset.includes list. `{includes}`
# is filled in per fixture.
CONFIG_TEMPLATE = """\
workflows:
  ios-testflight:
    name: iOS
    scripts:
      - name: noop
        script: echo hi
  android-internal:
    name: Android
    triggering:
      events:
        - push
    when:
      changeset:
        includes:
{includes}
          # NOTE: codemagic.yaml is always implicitly included.
    scripts:
      - name: build
        script: echo build
  cleanup:
    name: after
    scripts:
      - name: noop
        script: echo bye
"""


def write_config(path, include_paths):
    body = "".join(f"          - '{p}'\n" for p in include_paths)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(CONFIG_TEMPLATE.format(includes=body))


def make_native_tree(root, *, capacitor_basenames=("capacitor.config.ts",),
                     with_android=True, with_package_json=True,
                     with_lock=True, extra_files=()):
    """Build a fake repo tree with the requested native-shell files present."""
    if with_android:
        os.makedirs(os.path.join(root, "android", "app"), exist_ok=True)
        with open(os.path.join(root, "android", "app", "build.gradle"), "w") as f:
            f.write("// gradle\n")
    if with_package_json:
        with open(os.path.join(root, "package.json"), "w") as f:
            f.write("{}\n")
    if with_lock:
        with open(os.path.join(root, "package-lock.json"), "w") as f:
            f.write("{}\n")
    for basename in capacitor_basenames:
        with open(os.path.join(root, basename), "w") as f:
            f.write("// capacitor config\n")
    for rel in extra_files:
        full = os.path.join(root, rel)
        os.makedirs(os.path.dirname(full) or root, exist_ok=True)
        with open(full, "w") as f:
            f.write("// native config\n")


def run_guard(config_path, repo_root):
    proc = subprocess.run(
        [sys.executable, GUARD, "--config", config_path, "--repo-root", repo_root],
        capture_output=True,
        text=True,
    )
    return proc.returncode, proc.stdout + proc.stderr


class Results:
    def __init__(self):
        self.passed = 0
        self.failed = 0

    def expect(self, name, want_zero, got, output):
        ok = (got == 0) if want_zero else (got != 0)
        label = "exit 0" if want_zero else "non-zero"
        if ok:
            self.passed += 1
            print(f"  ok   {name} (exit {got})")
        else:
            self.failed += 1
            print(f"  FAIL {name}: expected {label}, got {got}", file=sys.stderr)
            for line in output.strip().splitlines():
                print(f"         | {line}", file=sys.stderr)


def main():
    if not os.path.isfile(GUARD):
        print(f"smoke: guard script not found at {GUARD}", file=sys.stderr)
        return 1

    res = Results()

    # ---------------- 1) The REAL repo config must pass ----------------
    print("real codemagic.yaml against the real repo:")
    proc = subprocess.run(
        [sys.executable, GUARD, "--config", REAL_CONFIG, "--repo-root", REPO_ROOT],
        capture_output=True,
        text=True,
    )
    res.expect("current config covers every native path", True,
               proc.returncode, proc.stdout + proc.stderr)

    # ---------------- 2) Synthetic fixtures ----------------
    work = tempfile.mkdtemp(prefix="codemagic-changeset-smoke-")
    try:
        complete = ["android/", "capacitor.config.ts", "package.json",
                    "package-lock.json"]

        print("\nsynthetic fixtures (config + repo tree):")

        # GOOD: complete includes, only capacitor.config.ts on disk.
        good_cfg = os.path.join(work, "good.yaml")
        good_tree = os.path.join(work, "good-tree")
        os.makedirs(good_tree)
        write_config(good_cfg, complete)
        make_native_tree(good_tree)
        code, out = run_guard(good_cfg, good_tree)
        res.expect("complete filter covers a standard tree", True, code, out)

        # BAD: repo migrated to capacitor.config.json but list still says .ts.
        json_tree = os.path.join(work, "json-tree")
        os.makedirs(json_tree)
        make_native_tree(json_tree, capacitor_basenames=("capacitor.config.json",))
        code, out = run_guard(good_cfg, json_tree)
        res.expect("uncovered capacitor.config.json drift", False, code, out)

        # BAD: both .ts and a new .js exist, only .ts listed.
        js_tree = os.path.join(work, "js-tree")
        os.makedirs(js_tree)
        make_native_tree(
            js_tree, capacitor_basenames=("capacitor.config.ts", "capacitor.config.js")
        )
        code, out = run_guard(good_cfg, js_tree)
        res.expect("uncovered capacitor.config.js sibling", False, code, out)

        # BAD: android/ dropped from the includes list.
        no_android_cfg = os.path.join(work, "no-android.yaml")
        write_config(no_android_cfg,
                     ["capacitor.config.ts", "package.json", "package-lock.json"])
        code, out = run_guard(no_android_cfg, good_tree)
        res.expect("android/ missing from filter", False, code, out)

        # BAD: package-lock.json dropped from the includes list.
        no_lock_cfg = os.path.join(work, "no-lock.yaml")
        write_config(no_lock_cfg,
                     ["android/", "capacitor.config.ts", "package.json"])
        code, out = run_guard(no_lock_cfg, good_tree)
        res.expect("package-lock.json missing from filter", False, code, out)

        # GOOD: a directory include with a trailing slash covers files beneath it.
        dir_tree = os.path.join(work, "dir-tree")
        os.makedirs(dir_tree)
        make_native_tree(dir_tree, extra_files=("android/app/src/main/foo.xml",))
        code, out = run_guard(good_cfg, dir_tree)
        res.expect("android/ prefix covers nested native files", True, code, out)

        # SANITY: parser failure on a config with no android-internal workflow.
        broken_cfg = os.path.join(work, "broken.yaml")
        with open(broken_cfg, "w") as f:
            f.write("workflows:\n  ios-testflight:\n    name: iOS\n")
        code, out = run_guard(broken_cfg, good_tree)
        res.expect("missing android-internal workflow is an error", False, code, out)
    finally:
        import shutil

        shutil.rmtree(work, ignore_errors=True)

    total = res.passed + res.failed
    print(f"\ncodemagic-android-changeset-smoke: {res.passed}/{total} cases "
          "behaved correctly")
    if res.failed:
        print(
            "\ncodemagic-android-changeset-smoke FAILED: the guard did not behave "
            "as expected above. Either the guard regressed (it no longer catches a "
            "native path the auto-build filter doesn't cover, or it now rejects a "
            "complete filter), or the REAL codemagic.yaml filter drifted and a "
            "native path is no longer covered — which would silently ship testers a "
            "stale app shell. Investigate before merging.",
            file=sys.stderr,
        )
        return 1
    print(
        "codemagic-android-changeset-smoke: the guard catches every drift fixture "
        "and passes the complete ones (including the live config)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
