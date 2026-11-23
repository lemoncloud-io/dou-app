# Where a task runs, on which model and effort

## Placement

| Task                                                                            | Where               | Model · effort              | Agent                |
| ------------------------------------------------------------------------------- | ------------------- | --------------------------- | -------------------- |
| Broad search, surveys, log and metric extraction                                | subagent            | Haiku · low                 | `dou-explorer`       |
| Mechanical edits: comment removal with AST proof, `.ko.md` pairs, PR body       | subagent            | Sonnet · default            | `dou-cleanup-worker` |
| Running e2e, chaos or load and summarising the report                           | subagent            | Sonnet · default            | `dou-verifier`       |
| Normal implementation                                                           | main                | Opus · default              | —                    |
| Review before commit, with no implementation context                            | subagent            | Opus · high                 | `dou-reviewer`       |
| ADRs, architecture, session or concurrency logic, flaky root causes, invariants | main or new session | Opus · high                 | —                    |
| Doc wording, version bumps, commit messages                                     | main                | low only in a fresh session | —                    |
| Large work with its own deliverable (branch, PR)                                | new session         | chosen at start             | —                    |

Agent definitions, with model and effort fixed: `.claude/agents/`.

## Prompt cache

Measured on 505 sessions in this repo (November 2026): the median session reads 98% of its input from the cache,
so a lost cache costs roughly the whole context again.

- **Do not switch the model mid-session.** The cache is per model: 52 of 62 switches re-created the
  conversation cache, at any gap length. Delegate to a subagent instead; it starts a small context of its own
  and leaves the parent's cache alone.
- **Set effort when a session or subagent starts.** A mid-session effort change kept the cache in 13 of 17
  cases, and most that re-created it involved `max`. Avoid it, but it is not the model-switch cost.
- **A switch is free when the cache is already gone**: a new session, right after compaction, or after an idle
  gap past the TTL (gaps over an hour re-created the cache in 85% of cases; with a 1-hour TTL, gaps of 5–60
  minutes never did).
- **Do not change the system prompt** (AGENTS.md, CLAUDE.md) or the MCP tool list mid-session. Loading a skill
  and hook output are appended and keep the cache.

Re-measure with [`../../dou-metrics/references/cache-usage.mjs`](../../dou-metrics/references/cache-usage.mjs).
