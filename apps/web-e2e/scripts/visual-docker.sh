#!/usr/bin/env bash
# Runs the visual regression scenarios with the browsers inside Playwright's Linux image — the image CI
# runs the suite in — so a Mac compares (and, with --update-snapshots, renders baselines) exactly as
# CI does. The tests and the Vite dev server stay on this machine; only the browsers are in the
# container, reached through Playwright's run-server, with the page's localhost tunnelled back here.
#
#   scripts/visual-docker.sh                      compare against the baselines
#   scripts/visual-docker.sh --update-snapshots   render the baselines again
#
# Any argument is passed to `playwright test`. Needs docker. The image runs on this machine's own
# architecture; WEB_E2E_DOCKER_PLATFORM=linux/amd64 asks for CI's, which a VM emulating amd64 through
# QEMU may not run — the browsers can crash under it.
set -euo pipefail

cd "$(dirname "$0")/.."
version=$(node -p "require('@playwright/test/package.json').version")
port=${WEB_E2E_BROWSER_PORT:-3790}
name="web-e2e-browsers-$$"

# Named explicitly: a tag pulled once for another architecture is otherwise reused, emulated.
case "$(uname -m)" in arm64 | aarch64) native=linux/arm64 ;; *) native=linux/amd64 ;; esac
platform=${WEB_E2E_DOCKER_PLATFORM:-$native}

docker run -d --rm --init --pull missing --platform "$platform" --name "$name" -p "127.0.0.1:${port}:3000" \
    "mcr.microsoft.com/playwright:v${version}-noble" \
    /bin/sh -c "cd /tmp && npx -y playwright@${version} run-server --port 3000 --host 0.0.0.0" >/dev/null
trap 'docker stop "$name" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 120); do
    if curl -s "http://127.0.0.1:${port}/" >/dev/null 2>&1; then break; fi
    sleep 1
done

WEB_E2E_BROWSER_SERVER="ws://127.0.0.1:${port}/" ../../node_modules/.bin/playwright test --grep @visual "$@"
