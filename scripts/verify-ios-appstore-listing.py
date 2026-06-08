#!/usr/bin/env python3
"""Fail fast (up front) when the in-prep App Store LISTING metadata is incomplete.

The `iOS → App Store (submit for review)` workflow (PUBLISH_MODE=appstore) doesn't
just upload to TestFlight — it also submits the version to PUBLIC App Store review.
Apple rejects that submission when the version's listing metadata is incomplete:
missing screenshots, description, keywords, a support URL, a privacy-policy URL, or
an unanswered age-rating questionnaire. Like the TestFlight Test Information case,
that rejection only surfaces at the VERY END of a ~10-25 minute Mac build + sign +
upload (scripts/publish-ios.sh submits, then Apple rejects). This guard asks App
Store Connect whether the in-prep version's listing is complete BEFORE the
expensive build runs, so a forgotten field fails in seconds with an actionable
message instead of wasting the whole build.

This is the APP-STORE analogue of scripts/verify-ios-testflight-info.py and shares
its FAIL-OPEN posture (mirroring verify-ios-marketing-version.py): on any
uncertainty (missing credentials, no JWT library, an API/network hiccup, an
unexpected response shape, or simply no version currently in PREPARE_FOR_SUBMISSION)
it WARNS and exits 0 rather than blocking a legitimate build. It only HARD-FAILS
(exit 1) when App Store Connect returns the listing data and we can PROVE a required
field is empty across every locale.

Auth: reads the same App Store Connect API key env vars the codemagic CLI uses
(APP_STORE_CONNECT_ISSUER_ID / APP_STORE_CONNECT_KEY_IDENTIFIER /
APP_STORE_CONNECT_PRIVATE_KEY), exported by the `app_store_connect` integration,
plus APP_STORE_APPLE_ID (the numeric app id from the apple_app group).

Usage:
    verify-ios-appstore-listing.py
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

ASC_API = "https://api.appstoreconnect.apple.com"
DISTRIBUTION_URL_TMPL = "https://appstoreconnect.apple.com/apps/{app_id}/distribution"

# App Store version states whose listing is still being prepared / re-prepared and
# therefore must carry complete metadata before the appstore submit can succeed.
IN_PREP_STATES = (
    "PREPARE_FOR_SUBMISSION",
    "DEVELOPER_REJECTED",
    "REJECTED",
    "METADATA_REJECTED",
)


def warn_skip(message):
    """Fail-open: warn and exit 0 so a transient/uncertain state never blocks."""
    print(f"WARNING: {message} Skipping the App Store listing guard.")
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


def is_blank(value):
    return not (str(value).strip() if value is not None else "")


def pick_in_prep_version(versions):
    """Return the (id, attributes) of the first version in an in-prep state."""
    data = versions.get("data") if isinstance(versions, dict) else None
    if not isinstance(data, list):
        return None, None
    for item in data:
        if not isinstance(item, dict):
            continue
        attrs = item.get("attributes") or {}
        if attrs.get("appStoreState") in IN_PREP_STATES and item.get("id"):
            return item["id"], attrs
    return None, None


def any_locale_has(loc_items, field):
    """True if at least one localization carries a non-blank value for `field`."""
    return any(
        not is_blank((item.get("attributes") or {}).get(field))
        for item in loc_items
        if isinstance(item, dict)
    )


def screenshots_present(loc_items, token):
    """(known, present): can we PROVE at least one screenshot exists anywhere?

    `known` is False when any nested API call errors — in that case we never flag
    screenshots as missing (fail-open). `present` is True as soon as we find one
    screenshot in any screenshot set of any localization.
    """
    try:
        for item in loc_items:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            sets = api_get(
                f"/v1/appStoreVersionLocalizations/{item['id']}/appScreenshotSets?limit=50",
                token,
            )
            set_items = sets.get("data") if isinstance(sets, dict) else None
            if not isinstance(set_items, list):
                return False, False
            for sset in set_items:
                if not isinstance(sset, dict) or not sset.get("id"):
                    continue
                shots = api_get(
                    f"/v1/appScreenshotSets/{sset['id']}/appScreenshots?limit=1",
                    token,
                )
                shot_items = shots.get("data") if isinstance(shots, dict) else None
                if isinstance(shot_items, list) and shot_items:
                    return True, True
        return True, False
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError, OSError):
        return False, False


def age_rating_set(version_id, token):
    """(known, set): can we PROVE the age-rating questionnaire is unanswered?

    Returns known=False (fail-open) on any error or an unexpected shape; only
    returns set=False when App Store Connect explicitly reports no declaration.
    """
    try:
        decl = api_get(
            f"/v1/appStoreVersions/{version_id}/ageRatingDeclaration", token
        )
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError, OSError):
        return False, False
    if not isinstance(decl, dict) or "data" not in decl:
        return False, False
    data = decl.get("data")
    if data is None:
        return True, False
    # A declaration resource with an id means the questionnaire has been started.
    return True, bool(isinstance(data, dict) and data.get("id"))


def privacy_policy_set(app_id, token):
    """(known, set): can we PROVE no app-info locale carries a privacy-policy URL?

    Privacy Policy URL lives on the app-level App Information (appInfoLocalizations),
    not on the version. Fail-open (known=False) on any error or unexpected shape.
    """
    try:
        app_infos = api_get(f"/v1/apps/{app_id}/appInfos?limit=10", token)
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError, OSError):
        return False, False
    info_items = app_infos.get("data") if isinstance(app_infos, dict) else None
    if not isinstance(info_items, list) or not info_items:
        return False, False
    try:
        for info in info_items:
            if not isinstance(info, dict) or not info.get("id"):
                continue
            locs = api_get(
                f"/v1/appInfos/{info['id']}/appInfoLocalizations?limit=50", token
            )
            loc_items = locs.get("data") if isinstance(locs, dict) else None
            if not isinstance(loc_items, list):
                return False, False
            if any_locale_has(loc_items, "privacyPolicyUrl"):
                return True, True
        return True, False
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError, OSError):
        return False, False


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
        versions = api_get(
            f"/v1/apps/{app_id}/appStoreVersions?filter[platform]=IOS&limit=20", token
        )
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError, OSError) as exc:
        return warn_skip(
            f"could not read App Store versions from App Store Connect ({exc})."
        )

    version_id, version_attrs = pick_in_prep_version(versions)
    if not version_id:
        # No version is being prepared for submission right now — we can't prove
        # any listing field is missing, so don't block the build.
        return warn_skip(
            "no App Store version is in a prepare-for-submission state, so there is "
            "no in-prep listing to check."
        )

    state = (version_attrs or {}).get("appStoreState")
    print(f"Checking listing metadata for the in-prep App Store version ({state}).")

    missing = []

    # Version-localized text: description, keywords, support URL (per locale; Apple
    # requires each, so flag a field only when NO locale carries it).
    try:
        locs = api_get(
            f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations?limit=50",
            token,
        )
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError, OSError) as exc:
        return warn_skip(
            f"could not read the version's localizations from App Store Connect ({exc})."
        )

    loc_items = locs.get("data") if isinstance(locs, dict) else None
    if isinstance(loc_items, list) and loc_items:
        for field, label in (
            ("description", "Description"),
            ("keywords", "Keywords"),
            ("supportUrl", "Support URL"),
        ):
            if not any_locale_has(loc_items, field):
                missing.append(label)

        shots_known, shots_present = screenshots_present(loc_items, token)
        if shots_known and not shots_present:
            missing.append("Screenshots")
    # else: unexpected shape → can't prove these are missing, leave them be.

    age_known, age_set = age_rating_set(version_id, token)
    if age_known and not age_set:
        missing.append("Age rating")

    pp_known, pp_set = privacy_policy_set(app_id, token)
    if pp_known and not pp_set:
        missing.append("Privacy Policy URL")

    if not missing:
        print(
            "OK: the in-prep App Store listing has its required metadata "
            "(screenshots, description, keywords, support + privacy URLs, age rating)."
        )
        return 0

    distribution_url = DISTRIBUTION_URL_TMPL.format(app_id=app_id)
    print("=" * 72)
    print("BUILD BLOCKED: the in-prep App Store listing is incomplete.")
    print("=" * 72)
    print("App Store Connect is missing these required listing field(s):")
    for label in missing:
        print(f"  - {label}")
    print()
    print("Apple will reject the App Store review submission for this AFTER the full")
    print("~10-25 minute Mac build + upload, so we stop now to save the build.")
    print()
    print("FIX: open App Store Connect -> your app -> the version being prepared, fill")
    print("in the missing listing field(s) above (screenshots, description, keywords,")
    print("support URL, privacy-policy URL in App Information, and the age-rating")
    print("questionnaire), then re-run the build:")
    print(f"  {distribution_url}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
