# ADR-0370: web-e2e runs chaos in CI, load locally, and visual regression as a signal

> Status: Accepted · Decided: 2026-11-23 · Implemented: `feat/web-e2e-chaos-load-visual`
> · Scope: `apps/web-e2e` (targets, `chaos` and `evidence` fixtures, `src/reporter/`, `feature-map.json`,
> `src/specs/{chaos,load,visual}/`, `scripts/visual-docker.sh`), the reporter wiring in `apps/desktop-web-e2e`
> · The behaviour is documented in [apps/web-e2e/README.md](../../apps/web-e2e/README.md)

## Context

Agents are expected to prove a change by running the app, not only its unit tests. The web-e2e suite
already runs `apps/web` inside a fake native shell against a fake relay, in CI, on both platforms
(ADR-0180, ADR-0300). What it lacked was the kinds of check the riskiest code needs and a run an agent can
hand over as evidence: faults (a socket that drops, a relay that answers 5xx, a credential that expires),
bulk data, and a comparison of what the main screens look like.

Each kind has a different relation to CI. A fault scenario asserts recovery and is as deterministic as any
other flow. A load scenario measures time, which a shared runner cannot hold steady. A screenshot
comparison is only stable in the environment its baselines were rendered in, and a visual change is often
exactly what a pull request intends.

## Decision

### 1. Scenarios are tagged by kind, and each kind has its own target

`@chaos`, `@load` and `@visual`, with `e2e-chaos`, `e2e-load` and `e2e-visual` beside the existing `e2e`.
`e2e` runs everything but `@load` and `@visual`, so the chaos scenarios run in CI's existing jobs.

### 2. Faults live in the fakes, never in the page

The `chaos` fixture changes how the fake relay, its sockets and the device's link behave; a scenario asserts
what a person would see. A refused socket is pointed at its real `.test` address, so it fails as an
unreachable host does rather than as a server that accepted and hung up. Offline is the page's own link
signal plus refused requests, not `context.setOffline`, which in WebKit also cuts the dev server and fails
lazily loaded modules. A fault no request met fails the scenario.

### 3. Load scenarios fail on correctness only, and stay out of CI

They report numbers (time to visible, heap, request counts) and fail only when data is missing, doubled or
out of order. Time budgets on a shared runner would fail on noise or be set too loose to catch anything.

### 4. Visual baselines are Linux renders, and a difference is a signal, not a merge gate

Baselines are rendered in Playwright's Linux image, from a Mac through a run-server in docker. A difference
fails `e2e-visual`, writes `visual-result.json` and, once a CI job runs it, is posted as the commit status
`web-e2e/visual-regression`. It is not a required check: a visual change is often the point of a pull
request, and a person reviews the new baselines. The status was first meant for automatic merging, which
was withdrawn (ADR-0365) while this was built; the signal stays for reviewers and for any later automation.

### 5. Every run writes one evidence page

A reporter turns each run into one self-contained HTML page — outcomes, screenshots, chaos timelines, load
numbers, visual diffs and the feature map — plus `summary.json`. Screenshots are the ones a scenario takes
on purpose (`evidence.shot`, JPEG) and a failure's last screen; capturing every scenario's last screen made
one full run's page over 20 MB, too large to attach. desktop-web-e2e uses the same reporter.

### 6. A feature map links `apps/web` features to scenarios

`feature-map.json` is checked against both trees. Features with no scenario are reported, not failed;
drift (an unknown feature or spec, an unmapped spec) fails.

## Consequences

- CI's two e2e jobs grow by the chaos scenarios (about a minute each on a laptop).
- The visual job that posts the status is not in `verify.yml` yet; until it is, visual regression runs only
  where someone runs it. Baselines rendered on arm64 have to be confirmed on an x86_64 runner once.
- Load numbers are only comparable on one machine, before and after a change.
- A passing scenario without a captioned shot leaves no screenshot in the report.
- The fake relay now answers the socket SDK's credential renewal (`auth.refresh`) by default; before, a
  refused sign-in could never recover in this suite.
