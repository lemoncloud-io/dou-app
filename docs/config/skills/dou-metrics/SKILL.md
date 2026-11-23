---
name: dou-metrics
description: >-
    Re-run the harness and delivery metrics for this repo — first-CI-run failure rate, commits after a PR is
    opened, interrupts per session, review-before-commit rate, instruction size, prompt-cache hit ratio and
    tokens per session — over a window, and publish an HTML before/after comparison. Use when asked for
    metrics, a before/after, whether the harness change helped, or after a harness lane merges.
---

# dou-metrics

Compare like with like: the same definitions, the same window length, and the model mix stated as a confounder.

1. **Window.** Default: the last 30 days, compared with the 30 days before the change being judged. Write
   both date ranges at the top of the page.
2. **Collect** with the definitions in [`references/definitions.md`](./references/definitions.md). Pulling
   PRs, runs and transcripts is the `dou-explorer` agent's job; you check the numbers it returns.
3. **Cache and tokens**: `node docs/config/skills/dou-metrics/references/cache-usage.mjs [root] [match] [since]`
   (hit ratio, tokens per session, cache re-created by mid-session model or effort switches).
4. **Publish** one HTML page: a table per metric (before, after, delta, n), a chart for the ones with a daily
   series, and a short "what else changed" list (model mix, team size, release weeks).
5. **Prune**: stale checklist items and hook rules, and hooks ready to enforce ([`references/pruning.md`](./references/pruning.md)).

A rate with n under 30 is shown with its n and no verdict.
