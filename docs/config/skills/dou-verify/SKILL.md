---
name: dou-verify
description: >-
    Pick and run the right verification for a change in this repo, and produce an HTML verification report with
    screenshots and command output. Use as soon as code under apps/, libs/ or tools/ has changed and before saying it
    works, is done or is ready to commit; when asked to "check", "verify", "test this" or "does it work"; and
    when the Stop hook sends you back. Routes to dou-e2e, dou-chaos, dou-load, dou-property or a device check.
---

# dou-verify

A green unit suite is not the end. Choose by what the change touches, run it, and report what you saw.

| Method            | Choose when                                                   | How                                                                                 |
| ----------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Gate (always)     | every change                                                  | `yarn gate`; [`references/unit-tests.md`](./references/unit-tests.md) for new logic |
| Web e2e (default) | a screen, flow, bridge request or app event changed           | [`dou-e2e`](../dou-e2e/SKILL.md)                                                    |
| Runtime check     | no scenario yet, or exploring; promote it to a scenario after | [`references/runtime-check.md`](./references/runtime-check.md)                      |
| In-app shell      | behaviour behind `isNative()`: push tap, link, back, resume   | [`references/shell.md`](./references/shell.md)                                      |
| Chaos             | session, transport, sync, outbox, retry                       | [`dou-chaos`](../dou-chaos/SKILL.md)                                                |
| Load              | lists, caches, paging, rendering cost                         | [`dou-load`](../dou-load/SKILL.md)                                                  |
| Property          | state transitions, merging, ordering, parsing                 | [`dou-property`](../dou-property/SKILL.md)                                          |
| Device (opt-in)   | native code, keyboard, safe area, splash, WebKit-on-device    | [`references/device.md`](./references/device.md)                                    |

- Pick the smallest set that would catch the change being wrong. Docs-only or comment-only changes need the
  gate alone; say so in the report.
- Long runs (e2e suites, chaos, load) go to the `dou-verifier` agent; you read its report, not its logs.
- A test written for a bug must fail without the fix: revert, watch it fail, restore, and say so.

## The report

Write `verify-report-<topic>.html` in your scratchpad and publish it as an artifact; the Stop hook looks for
that name. Format: [`references/report.md`](./references/report.md). Link it from the PR's `To Reviewers`.
If nothing could be verified, the report says why and what the person should check.
