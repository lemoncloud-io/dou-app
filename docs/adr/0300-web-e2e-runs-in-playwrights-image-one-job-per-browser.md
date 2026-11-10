# ADR-0300: Web e2e runs in Playwright's image, one job per browser

> Status: Accepted · Decided: 2026-11-10 · Implemented: `ci/e2e-playwright-container`
> · Scope: `.github/workflows/verify.yml` (`base` and `e2e` jobs), `apps/web-e2e/README.md`

## Context

The `e2e` job in `verify.yml` (ADR-0180) installed Chromium and WebKit with
`npx playwright install --with-deps` on every run, then ran the 90 scenarios of both browser projects
in one job with two workers.

The install step usually took 35–65 s. In 5 of the 20 runs measured, it took 7 to 17 minutes. The
log of the slowest run shows where the time went. The browsers themselves downloaded in seconds. The
`--with-deps` half spent 16 minutes fetching 139 MB of system packages from the runner's apt mirror,
at about 140 kB/s. On a develop push, that turned a 9-minute gate into a 23-minute one.

The scenarios took 5–7 minutes. The two projects shared one machine's two workers, and they were the
other half of the job's time.

ADR-0299 also changed how a develop push picks the commit it compares with, but only for the
`verify` job. The `e2e` job still used the commit before the push.

## Decision

- **The `e2e` job runs in `mcr.microsoft.com/playwright:v<version>-noble`.** That image already holds
  the browsers and the system libraries they need, and nothing is installed from apt.
- **The tag names the same version that `yarn.lock` installs, and a step checks it.** The image
  deletes its own Playwright package when it is built, so the step cannot read the image's version.
  Instead it asks the installed `@playwright/test` which browser revisions it expects, and looks for
  them in the image. If one is missing, the step fails and names the tag to set. Bumping one means
  bumping the other in the same change.
- **One job per browser project** (`webkit-ios`, `chromium-android`), running side by side, with
  `fail-fast: false` so that one browser's failure does not hide the other's result.
- **A small `base` job resolves the comparison commit once, for both jobs.** It applies ADR-0299's
  rule: the PR's base branch, or the commit that the last successful develop push run checked. The
  `e2e` job now applies the same rule.
- The image's `node_modules` cache has its own key, so the runner's and the image's installs do not
  overwrite each other.

## Alternatives

- **Cache `~/.cache/ms-playwright`.** This would cache what was already fast. The slow part is the
  apt half, and that has to be installed again on every fresh runner.
- **Cache the apt packages.** That means restoring `.deb` files into the runner's apt directories by
  hand, and keeping that list in step with what Playwright asks for. The image is that list,
  maintained upstream.
- **Shard with `--shard=1/2` inside each project instead.** A shard boots its own dev server either
  way. Splitting by project keeps a failing job's name saying which engine failed.

## Consequences

- No apt download on any run, so the 7–17-minute outliers are gone. The cost is pulling
  the image at the start of each of the two jobs.
- Each of the two jobs restores dependencies and starts its own Vite server. The suite's wall-clock
  time roughly halves, and its runner minutes go up somewhat.
- A Playwright bump that forgets the image tag fails CI. The message names the missing browsers and
  the tag to set.
- Steps in the container run with bash, set explicitly, because a container job's default shell is
  `sh`.
- Both jobs wait on `base`, which is a checkout and one API call.
