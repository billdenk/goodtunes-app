#!/usr/bin/env bash
#
# Scripted iOS publish that tolerates App Store Connect's transient 500s.
#
# WHY THIS EXISTS
#   App Store Connect intermittently returns a `500 internal server error` on the
#   post-upload "RETRIEVE UPLOAD OPERATIONS (ASSET_UPLOAD)" poll *after* the binary
#   already transferred ("UPLOAD SUCCEEDED with no errors"). Codemagic's declarative
#   `publishing.app_store_connect:` block treats that 500 as fatal and marks the
#   whole ~10-minute Mac build red — even though the upload often DID register.
#   Build 65 failed exactly this way and never reached TestFlight.
#
#   This script replaces that declarative block with a scripted publish so we can:
#     1. Let the codemagic CLI auto-retry transient 5xx itself
#        (--api-server-error-retries / --altool-retries).
#     2. On failure, CHECK whether the binary actually registered on App Store
#        Connect (compare the latest TestFlight build number to the one we just
#        stamped). If it registered, we DO NOT re-upload (a duplicate binary is
#        rejected by Apple) — we retry only the submission with --skip-package-upload.
#        If it did NOT register, we retry the full upload.
#     3. Fail fast (no pointless retries) on DETERMINISTIC errors that a retry can
#        never fix — e.g. missing TestFlight "Beta App Review Information", which is
#        an operator setup task in App Store Connect, not a transient hiccup. This
#        also covers "Another build is in review" (422) — a prior build in the same
#        version train is still awaiting Apple's beta review decision, so retrying
#        the submission just repeats the same 422 every time (build 74 burned all
#        4 attempts / ~8.5 min this way). That case gets its own actionable message
#        (see is_stale_beta_review_failure below) with a link to check/cancel the
#        pending review in App Store Connect.
#     4. Still fail clearly if the binary genuinely never publishes.
#
# AUTH
#   The `app_store_connect: GoodTunes ASC API key` integration on each workflow
#   exports the API-key env vars into the build, so the scripted `app-store-connect`
#   commands below authenticate exactly like the other scripted calls in this
#   pipeline (e.g. fetch-signing-files, get-latest-testflight-build-number).
#
# CONFIG (env vars)
#   PUBLISH_MODE        required: "testflight" or "appstore"
#   APP_STORE_APPLE_ID  required: numeric App Apple ID (from the apple_app group)
#   PUBLISH_IPA_GLOB    optional: defaults to build/ios/ipa/*.ipa
#   PUBLISH_BETA_GROUP  optional: defaults to "GoGoods Test Group"
#
# The submission flags below mirror the OLD declarative publishing blocks 1:1, so
# TestFlight / beta-group / App-Store-submit behavior is unchanged from before.

set -euo pipefail

: "${APP_STORE_APPLE_ID:?APP_STORE_APPLE_ID must be set (apple_app variable group).}"
: "${PUBLISH_MODE:?PUBLISH_MODE must be 'testflight' or 'appstore'.}"

IPA_GLOB="${PUBLISH_IPA_GLOB:-build/ios/ipa/*.ipa}"
BETA_GROUP="${PUBLISH_BETA_GROUP:-GoGoods Test Group}"

MAX_ATTEMPTS=4
BACKOFF=30 # seconds; doubles each retry

# Resolve the produced .ipa.
IPA_PATH="$(ls -t $IPA_GLOB 2>/dev/null | head -n1 || true)"
if [ -z "$IPA_PATH" ]; then
  echo "ERROR: no .ipa found matching '$IPA_GLOB'. Did 'Build the signed .ipa' run?"
  exit 1
fi

# The build number we just stamped (CFBundleVersion = latest-on-ASC + 1). We use
# it to detect whether THIS binary registered after a 500.
EXPECTED_BUILD="$(cd ios/App && agvtool what-version -terse 2>/dev/null | tail -n1 | tr -d '[:space:]')"

echo "Publishing '$IPA_PATH' (build number $EXPECTED_BUILD) for app $APP_STORE_APPLE_ID in mode '$PUBLISH_MODE'."

# Build the submission flags to mirror the previous declarative publishing blocks.
SUBMIT_ARGS=()
case "$PUBLISH_MODE" in
  testflight)
    # was: submit_to_testflight: true + beta_groups: [GoGoods Test Group]
    SUBMIT_ARGS+=(--testflight --beta-group "$BETA_GROUP")
    ;;
  appstore)
    # was: submit_to_testflight: true + submit_to_app_store: true
    #      + release_type: AFTER_APPROVAL + phased_release: true
    #      + cancel_previous_submissions: true
    SUBMIT_ARGS+=(--testflight --app-store --release-type AFTER_APPROVAL --phased-release --cancel-previous-submissions)
    ;;
  *)
    echo "ERROR: PUBLISH_MODE must be 'testflight' or 'appstore' (got '$PUBLISH_MODE')."
    exit 1
    ;;
esac

# Returns 0 if App Store Connect already has our build number (i.e. the binary
# registered despite a 500), else 1.
build_registered() {
  local latest
  latest="$(app-store-connect get-latest-testflight-build-number "$APP_STORE_APPLE_ID" 2>/dev/null | tail -n1 | tr -d '[:space:]' || echo "")"
  echo "  registration check: latest on App Store Connect = '${latest:-unknown}', this build = '$EXPECTED_BUILD'"
  if [[ "$latest" =~ ^[0-9]+$ && "$EXPECTED_BUILD" =~ ^[0-9]+$ ]]; then
    [ "$latest" -ge "$EXPECTED_BUILD" ]
    return $?
  fi
  return 1
}

# Detects deterministic publish failures that a retry can NEVER fix, so we fail
# fast instead of burning attempts (and re-uploading) on a setup problem.
is_deterministic_failure() {
  local log="$1"
  grep -qiE \
    "Complete test information is required|missing required Beta App (Information|Review)|Invalid (Bundle|Code|Provisioning)|ITMS-90|asset has not been uploaded because a binary with the same|redundant binary upload" \
    "$log"
}

# Detects the specific "a prior build in this version train is still awaiting
# Apple's TestFlight beta review" 422. This is a DIFFERENT dead end from the
# other deterministic failures above (missing setup info) — it's not something
# to *fix*, it's something to *wait out or cancel*, so it gets its own message.
is_stale_beta_review_failure() {
  local log="$1"
  grep -qiE "[Aa]nother build is in review|already in beta review" "$log"
}

SKIP_UPLOAD=""
LOG="$(mktemp)"

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if [ -n "$SKIP_UPLOAD" ]; then
    echo "=== Publish attempt $attempt/$MAX_ATTEMPTS (binary already registered — submitting only) ==="
  else
    echo "=== Publish attempt $attempt/$MAX_ATTEMPTS ==="
  fi

  set +e
  # --altool-retries / --api-server-error-retries are the CLI's own first line of
  # defense against transient 5xx; the outer loop is the belt-and-suspenders.
  app-store-connect publish \
    --path "$IPA_PATH" \
    --max-build-processing-wait 20 \
    --altool-retries 3 \
    --altool-retry-wait 30 \
    --api-server-error-retries 5 \
    $SKIP_UPLOAD \
    "${SUBMIT_ARGS[@]}" 2>&1 | tee "$LOG"
  STATUS=${PIPESTATUS[0]}
  set -e

  if [ "$STATUS" -eq 0 ]; then
    echo "Publish succeeded on attempt $attempt."
    rm -f "$LOG"
    exit 0
  fi

  echo "Publish attempt $attempt failed (exit $STATUS)."

  if is_stale_beta_review_failure "$LOG"; then
    echo "------------------------------------------------------------------------"
    echo "DEAD END: a prior build in this version train is still in Apple's"
    echo "TestFlight beta review queue. Retrying the submission can never fix this"
    echo "-- Apple only allows ONE build per version 'train' in beta review at a"
    echo "time -- so we fail fast instead of burning ~8.5 minutes of backoff."
    if build_registered; then
      echo ""
      echo "The binary (build $EXPECTED_BUILD) DID upload and register successfully"
      echo "on App Store Connect -- this is NOT an upload problem. It is only the"
      echo "external beta-review SUBMISSION that failed, because an earlier build in"
      echo "the same version train is still awaiting Apple's review decision."
    fi
    echo ""
    echo "To fix it, in App Store Connect either:"
    echo "  1. Wait for Apple to finish reviewing the pending build (usually 24-48h),"
    echo "     then re-run this workflow -- it will submit build $EXPECTED_BUILD once"
    echo "     the train is clear, OR"
    echo "  2. Cancel that pending beta review yourself (TestFlight -> Builds -> the"
    echo "     build showing 'Waiting for Review' -> ... -> Cancel Beta Review),"
    echo "     then re-run this workflow immediately."
    echo "  https://appstoreconnect.apple.com/apps/$APP_STORE_APPLE_ID/testflight/ios"
    echo ""
    echo "(Automatic cancellation was investigated: the 'app-store-connect' CLI this"
    echo "pipeline uses has no command to cancel/expire a pending Beta App Review"
    echo "Submission, so this is a manual, one-time step in App Store Connect --"
    echo "see docs/codemagic-builds.md.)"
    echo "------------------------------------------------------------------------"
    rm -f "$LOG"
    exit 1
  fi

  if is_deterministic_failure "$LOG"; then
    echo "------------------------------------------------------------------------"
    echo "This is a DETERMINISTIC failure that retrying cannot fix."
    if build_registered; then
      echo "The binary (build $EXPECTED_BUILD) IS uploaded to App Store Connect, so"
      echo "internal TestFlight testers may still get it — but the submission step"
      echo "above failed for a reason that needs a one-time fix in App Store Connect."
      echo "If it's 'Complete test information is required', fill in Beta App"
      echo "Information (Feedback Email) + Beta App Review Information (contact name,"
      echo "phone, email) at:"
      echo "  https://appstoreconnect.apple.com/apps/$APP_STORE_APPLE_ID/testflight/test-info"
    fi
    echo "------------------------------------------------------------------------"
    rm -f "$LOG"
    exit 1
  fi

  echo "Checking whether the binary registered despite the failure (transient 500 case)…"
  if build_registered; then
    echo "Binary build $EXPECTED_BUILD IS registered. Not re-uploading (would be a"
    echo "duplicate-binary rejection). Retrying the SUBMISSION only."
    SKIP_UPLOAD="--skip-package-upload"
  else
    echo "Binary build $EXPECTED_BUILD is NOT registered yet. Will retry the full upload."
    SKIP_UPLOAD=""
  fi

  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    echo "Backing off ${BACKOFF}s before the next attempt…"
    sleep "$BACKOFF"
    BACKOFF=$((BACKOFF * 2))
  fi
done

echo "ERROR: publishing failed after $MAX_ATTEMPTS attempts."
if build_registered; then
  echo "NOTE: the binary (build $EXPECTED_BUILD) IS on App Store Connect — the"
  echo "      failure was in a POST-upload submission step, not the upload itself."
  echo "      Check the log above; if it mentions TestFlight test information, that"
  echo "      is an operator setup task, not a pipeline bug."
fi
rm -f "$LOG"
exit 1
