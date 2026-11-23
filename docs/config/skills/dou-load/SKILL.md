---
name: dou-load
description: >-
    Inject large volumes (thousands of messages, hundreds of rooms, many images) into the web app and measure
    render time, long tasks, memory and request counts, before and after a change. Use when a list, cache,
    paging, virtualisation, image loading or any performance-motivated change is made, or when asked whether
    something is faster, slower, "still fast with N rooms/messages" or scales. Measure; do not answer from the
    diff alone.
---

# dou-load

A performance claim needs two numbers from the same machine and the same scenario: `develop` and the branch.
The `@load` scenarios are in `apps/web-e2e/src/specs/load/` (README § Load).

1. **Pick the scenario** that matches the claim: `room-list` (200 rooms), `long-room` (5,000 messages),
   `image-room` (200 photos), `message-burst` (300 pushed messages). Extend one, or add one tagged
   `{ tag: '@load' }` with the builders in `src/fixtures/load.ts` (`manyRooms`, `addImageMessages`).
2. **Measure** with `src/support/load.ts` (`msUntilVisible`, `msOf`, `heapMB`, `requestsDuring`) and record
   each number with `evidence.metric(name, value, unit)`. Assert correctness only, never a time.
3. **Run** `npx nx run web-e2e:e2e-load` on both sides; it repeats each scenario three times on one worker.
   Run `develop` in its own worktree; never switch the branch of the main checkout.
4. **Report** a table (metric, develop median, branch median, delta) from each side's
   `dist/.playwright/apps/web-e2e/evidence/summary.json`. Name the machine; heap is Chromium only.

A regression above the run-to-run spread blocks the change or gets named in `To Reviewers` with the reason.
