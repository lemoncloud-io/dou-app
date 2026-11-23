---
name: dou-e2e
description: >-
    Find or write a Playwright scenario in apps/web-e2e (the web running inside a fake native shell against a
    fake relay) and run it with screenshots. Use when a web screen, flow, bridge request or app event changed,
    when a feature has no scenario, when a manual check of a web flow should become repeatable, or when asked
    for an e2e test. Reached from dou-verify, which still owns the gate and the report.
---

# dou-e2e

The suite and its fakes: [`apps/web-e2e/README.md`](../../../../apps/web-e2e/README.md). Copy the shape of
`apps/web-e2e/src/specs/room-mute.spec.ts`: fixtures from `src/fixtures/`, steps from `src/support/app.ts`,
`test`/`expect` from `src/support/test`.

1. **Find the scenario.** `ls apps/web-e2e/src/specs/` and grep for the feature's screen text or bridge
   message. Extend an existing spec when it already sets up the state you need.
2. **Write it** (README § Adding a scenario): start at `page.goto('/')` as a fresh guest; change only what the
   scenario is about with `shell.handle(...)`, `backend.useHttp(...)`, `backend.useSocket(...)`; assert what a
   user sees by role and text, and what crossed the bridge or socket with `shell.received(...)` /
   `backend.sent(...)`. A "nothing happened" assertion needs something observable after it.
3. **Break it on purpose.** Revert the app change or the fixture and watch the scenario fail on both projects
   (`webkit-ios`, `chromium-android`). A scenario that passes either way is deleted, not kept.
4. **Run it.** `yarn web:e2e:headed <spec> --project=webkit-ios` while writing, then `yarn web:e2e` for both
   projects. In a worktree, use the main checkout's Playwright binary if the local one is missing.
5. **Evidence.** `await page.screenshot({ path })` at each state the change is about, plus the trace on failure
   (`dist/.playwright/apps/web-e2e/test-results/`). Put them in the verification report.

What a scenario cannot show (real WKWebView, native code, device traits) goes to the report's "Not checked"
with the reason, or to a device check.
