---
name: dou-failure-hunt
description: >-
    Search the code for things that turn into outages — awaits with no timeout, retries with no cap, timers and
    subscriptions never cleaned up, swallowed errors, unbounded queues — rank them and reproduce the worst with
    chaos scenarios. Use before a release, after an incident, or when asked to find what could break, what
    could hang, or the risky parts of a module.
---

# dou-failure-hunt

Output: an HTML risk list, each row reproduced or explicitly not.

1. **Scope** one module or flow (e.g. `libs/transport`, the room entry path). A whole-repo hunt goes to the
   `dou-explorer` agent per module, in parallel.
2. **Search** with the patterns in [`references/patterns.md`](./references/patterns.md). Read each hit; a
   grep match is a lead, not a finding.
3. **Rank** by blast radius × likelihood: what the user loses (session, messages, the whole app) and what
   triggers it (every reconnect, a rare server error).
4. **Reproduce** the top items with [`dou-chaos`](../dou-chaos/SKILL.md). A reproduced item gets its scenario
   kept as a regression test; an unreproduced item says what was tried.
5. **Publish** the list: file:line, pattern, impact, trigger, reproduced (yes / no / not tried), proposed fix.
   Fixes are separate changes, each through `dou-plan` when it is more than one file.
