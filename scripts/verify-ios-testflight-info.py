#!/usr/bin/env python3
"""Fail fast (up front) when TestFlight "Test Information" is incomplete.

App Store Connect rejects any TestFlight submission whose Beta App Review
Information is missing required fields (Contact First/Last Name, Phone Number,
Email) or whose Beta App Information is missing a Feedback Email — but it only
surfaces that rejection at the VERY END of a ~10-25 minute Mac build, after
build + sign + upload (this is the deterministic failure `scripts/publish-ios.sh`
already catches post-upload). This guard asks App Store Connect whether that
Test Information is complete BEFORE the expensive build runs, so a forgotten
field fails in seconds with an actionable message instead of wasting the build.

It mirrors the FAIL-OPEN posture of `verify-ios-marketing-version.py`: on any
uncertainty (missing credentials, no JWT library, an API/network hiccup, or an
unexpected response shape) it WARNS and exits 0 rather than blocking a
legitimate build. It only HARD-FAILS (exit 1) when App Store Connect returns the
review detail and we can PROVE a required field is empty.

Auth: reads the same App Store Connect API key env vars the codemagic CLI uses
(APP_STORE_CONNECT_ISSUER_ID / APP_STORE_CONNECT_KEY_IDENTIFIER /
APP_STORE_CONNECT_PRIVATE_KEY), exported by the `app_store_connect` integration,
plus APP_STORE_APPLE_ID (the numeric app id from the apple_app group).

Usage:
    verify-ios-testflight-info.py
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

ASC_API = "https://api.appstoreconnect.apple.com"
TEST_INFO_URL_TMPL = "https://appstoreconnect.apple.com/apps/{app_id}/testflight/test-info"


def warn_skip(message):
    """Fail-open: warn and exit 0 so a transient/uncertain state never blocks."""
    print(f"WARNING: {message} Skipping the TestFlight Test Information guard.")
    return 0


def mint_token(issuer_id, key_id, private_key_pem):
    """Mint a short-lived ES256 JWT for the App Store Connect API.

    Returns None (→ fail-open) if PyJWT/cryptography aren't importable.
    """
    try:
        import jwt  # PyJWT
    except ImportError:
        return None

    # Codemagic stores the .p8 with real newlines, but tolerate an escaped form.
    if "\\n" in private_key_pem and "\n" not in private_key_pem:
        private_key_pem = private_key_pem.replace("\\n", "\n")

    now = int(time.time())
    payload = {
        "iss": issuer_id,
        "iat": now,
        "exp": now + 600,
        "aud": "appstoreconnect-v1",
    }
    headers = {"kid": key_id, "typ": "JWT"}
    try:
        token = jwt.encode(payload, private_key_pem, algorithm="ES256", headers=headers)
    except Exception:  # bad key, missing cryptography backend, etc.
        return None
    # PyJWT 2.x returns str; 1.x returns bytes.
    return token.decode("utf-8") if isinstance(token, bytes) else token


def api_get(path, token):
    req = urllib.request.Request(
        ASC_API + path,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def main():
    app_id = (os.environ.get("APP_STORE_APPLE_ID") or "").strip()
    issuer = (os.environ.get("APP_STORE_CONNECT_ISSUER_ID") or "").strip()
    key_id = (os.environ.get("APP_STORE_CONNECT_KEY_IDENTIFIER") or "").strip()
    private_key = os.environ.get("APP_STORE_CONNECT_PRIVATE_KEY") or ""

    if not (app_id and issuer and key_id and private_key):
        return warn_skip(
            "App Store Connect API credentials or APP_STORE_APPLE_ID are not in the "
            "environment."
        )

    token = mint_token(issuer, key_id, private_key)
    if not token:
        return warn_skip(
            "could not mint an App Store Connect API token (PyJWT/cryptography "
            "unavailable or the key was unreadable)."
        )

    try:
        review = api_get(f"/v1/apps/{app_id}/betaAppReviewDetail", token)
        locales = api_get(f"/v1/apps/{app_id}/betaAppLocalizations?limit=50", token)
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError, OSError) as exc:
        return warn_skip(
            f"could not read TestFlight Test Information from App Store Connect ({exc})."
        )

    review_data = review.get("data") if isinstance(review, dict) else None
    if not isinstance(review_data, dict):
        # Unexpected shape — can't PROVE anything is missing, so fail-open.
        return warn_skip(
            "App Store Connect returned an unexpected Beta App Review detail shape."
        )

    attrs = review_data.get("attributes") or {}

    def is_blank(value):
        return not (str(value).strip() if value is not None else "")

    missing = []
    for field, label in (
        ("contactFirstName", "Contact First Name"),
        ("contactLastName", "Contact Last Name"),
        ("contactPhone", "Contact Phone Number"),
        ("contactEmail", "Contact Email"),
    ):
        if is_blank(attrs.get(field)):
            missing.append(label)

    # Demo-account fields are only required when the app declares it needs one.
    if attrs.get("demoAccountRequired"):
        for field, label in (
            ("demoAccountName", "Demo Account Name"),
            ("demoAccountPassword", "Demo Account Password"),
        ):
            if is_blank(attrs.get(field)):
                missing.append(label)

    # Feedback Email lives on Beta App Information (per-locale). Apple requires at
    # least one locale to carry it. Only treat it as missing when localizations
    # came back as a list (otherwise we can't prove it's absent → fail-open).
    loc_items = locales.get("data") if isinstance(locales, dict) else None
    if isinstance(loc_items, list):
        has_feedback = any(
            not is_blank((item.get("attributes") or {}).get("feedbackEmail"))
            for item in loc_items
            if isinstance(item, dict)
        )
        if not has_feedback:
            missing.append("Feedback Email")

    if not missing:
        print("OK: TestFlight Test Information is complete (review contact + feedback email).")
        return 0

    test_info_url = TEST_INFO_URL_TMPL.format(app_id=app_id)
    print("=" * 72)
    print("BUILD BLOCKED: TestFlight Test Information is incomplete.")
    print("=" * 72)
    print("App Store Connect is missing these required field(s):")
    for label in missing:
        print(f"  - {label}")
    print()
    print("Apple will reject the TestFlight submission for this AFTER the full")
    print("~10-25 minute Mac build + upload, so we stop now to save the build.")
    print()
    print("FIX: open TestFlight -> Test Information and fill in Beta App Review")
    print("Information (contact name / phone / email), the Beta App Information")
    print("Feedback Email, then re-run the build:")
    print(f"  {test_info_url}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
