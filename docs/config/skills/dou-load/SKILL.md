---
name: dou-load
description: >-
    Inject large volumes (thousands of messages, hundreds of rooms, many images) into the web app and measure
    render time, long tasks, memory and request counts, before and after a change. Use when a list, cache,
    paging, virtualisation, image loading or any performance-motivated change is made, or when asked whether
    something is faster, slower or scales.
---

# dou-load

A performance claim needs two numbers from the same machine and the same scenario: `develop` and the branch.

1. **Pick the volume** that matches the claim: a room with 5,000 messages for paging, 300 rooms for the home
   list, 200 images for media. Build it with the web-e2e fixtures (`src/fixtures/rooms.ts` builders) so the
   page loads it from the fake relay, not from a real account.
2. **Measure in the page** with the Performance API: `performance.mark/measure` around the action,
   `PerformanceObserver` for `longtask`, `performance.memory` in Chromium, and `backend.sent(...)` for the
   number of requests. Read the app's own `perf.*` metrics where the change already reports them.
3. **Run each side five times** in the same browser project and keep the median and the spread. Run
   `develop` in its own worktree; never switch the branch of the main checkout.
4. **Report** a table (metric, develop median, branch median, delta, runs) and a small chart in the
   verification report. Say the machine and the browser project; a headless number is not a device number.

A regression above the run-to-run spread blocks the change or gets named in `To Reviewers` with the reason
it is accepted.
