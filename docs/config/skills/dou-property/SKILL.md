---
name: dou-property
description: >-
    Write fast-check property-based tests that state an invariant and let generated inputs search for a
    counterexample. Use when state-transition, merge, ordering, dedupe, paging-cursor, outbox or parsing logic
    changes, when a bug came from an input nobody thought of, or when asked for invariants or property tests.
---

# dou-property

Example tests check the cases you imagined; a property checks a rule over cases you did not.

1. **Write the invariant as a sentence** before code: "merging pages in any order gives the same list",
   "a write queued while offline is sent exactly once after any sequence of reconnects", "no cursor ever
   skips a chat number".
2. **Model the inputs** with arbitraries: `fc.array`, `fc.record`, `fc.commands` for state machines.
   [`references/fast-check.md`](./references/fast-check.md) has the shapes this repo needs.
3. **Put it beside the code** as `<name>.property.test.ts`, run by the project's normal Jest target.
4. **Prove it bites.** Break the implementation on purpose (drop a dedupe, flip a comparison) and watch
   fast-check report a shrunk counterexample. Restore it. Say so in the report.
5. **Keep the counterexample** that found a real bug as a plain example test next to the property.

`fast-check` must be a dev dependency; adding it is a dependency change and goes through normal review.
