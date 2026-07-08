#!/bin/bash
# Deploy the mobile apps to the stores through fastlane.
#
# Usage: ./scripts/deploy-mobile.sh <ios|android|all> <dev|prod> [-m "release notes"]
#
# Release notes are mandatory (they become TestFlight "What to Test" and the
# Play release notes); when -m is omitted the script prompts for them.
# Version bumping is a separate, deliberate step: run
# `yarn mobile:version <major|minor|patch|build>` first.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE_DIR="$REPO_ROOT/apps/mobile"
ENV_FILE="$MOBILE_DIR/fastlane/.env"

PLATFORM="$1"
TARGET_ENV="$2"
shift 2 2>/dev/null || true

RELEASE_NOTES=""
while [ $# -gt 0 ]; do
    case "$1" in
        -m)
            RELEASE_NOTES="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown argument: $1${NC}"
            exit 1
            ;;
    esac
done

usage() {
    echo "Usage: $0 <ios|android|all> <dev|prod> [-m \"release notes\"]"
    exit 1
}

case "$PLATFORM" in ios | android | all) ;; *) usage ;; esac
case "$TARGET_ENV" in dev | prod) ;; *) usage ;; esac

if ! command -v fastlane >/dev/null 2>&1; then
    echo -e "${RED}fastlane not found. Install it first: brew install fastlane${NC}"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Missing $ENV_FILE${NC}"
    echo "Copy apps/mobile/fastlane/.env.example to .env and fill in the credentials."
    exit 1
fi

# Prompt for release notes when not passed via -m; they must not be empty.
while [ -z "$(echo "$RELEASE_NOTES" | tr -d '[:space:]')" ]; do
    echo -e "${BLUE}Enter release notes (TestFlight 'What to Test' / Play release notes):${NC}"
    read -r RELEASE_NOTES
done
export RELEASE_NOTES

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Deploying: ${PLATFORM} / ${TARGET_ENV}${NC}"
echo -e "${BLUE}  Release notes: ${RELEASE_NOTES}${NC}"
echo -e "${BLUE}================================================${NC}"

cd "$MOBILE_DIR"

# Run platforms sequentially so a failure stops before the next upload.
if [ "$PLATFORM" = "ios" ] || [ "$PLATFORM" = "all" ]; then
    fastlane ios "$TARGET_ENV"
fi
if [ "$PLATFORM" = "android" ] || [ "$PLATFORM" = "all" ]; then
    fastlane android "$TARGET_ENV"
fi

echo -e "${GREEN}Done: ${PLATFORM} / ${TARGET_ENV} uploaded.${NC}"
