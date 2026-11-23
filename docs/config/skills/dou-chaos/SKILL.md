---
name: dou-chaos
description: >-
    Inject faults — socket drops, held or slow replies, server errors, offline, expired tokens, app background
    and resume — into a web-e2e scenario and check the app recovers. Use when session, transport, sync, outbox,
    reconnect or retry code changed, when a bug only shows on a flaky network, or when asked whether a change
    holds up when the socket drops, reconnects or goes offline ("what happens if the connection drops", "is
    this fine across a reconnect"). Open it before reading the code. Also reproduces dou-failure-hunt findings.
---

# dou-chaos

Chaos runs on the same fakes as [`dou-e2e`](../dou-e2e/SKILL.md). `apps/web-e2e/src/specs/room-mute.spec.ts`
is the pattern: drop the socket, hold the next sign-in, act, release, assert the write landed once.

1. **Name the invariant first**, as a sentence the scenario will assert: "a mute made while signing in again
   reaches the relay exactly once", "the list never shows a room twice after a reconnect".
2. **Pick faults** from [`references/faults.md`](./references/faults.md). Start with the one the code is
   about; add one neighbour (a second drop, a reply arriving late after a newer one).
3. **Assert both sides**: what the user sees (no stuck spinner, no duplicate, the right error copy) and what
   the relay received (`backend.sent(...)` count and order, connection number).
4. **Repeat** timing-sensitive scenarios: `--repeat-each=20` on one project. One failure in twenty is a real
   race; report it with the seed and trace, not as flakiness.
5. **Report** the fault matrix in the verification report: fault × outcome, with a screenshot for each
   recovery state.

Use the chaos helpers in `apps/web-e2e/src/support/` when they exist; the primitives in the reference work
without them.
