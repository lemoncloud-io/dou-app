# ADR-0367: Agent instructions are a budgeted index, and hooks enforce what must happen

> Status: Accepted · Decided: 2026-11-23
> · Scope: `AGENTS.md` · `docs/config/skills/**` · `.claude/skills/` · `.claude/agents/` · `.claude/hooks/` ·
> `.claude/settings.json` · `scripts/check-instructions-size.js`
> · Partly supersedes: [ADR-0114](./0114-agent-procedures-in-docs-and-a-general-language-rule.md) decision 1
> (the procedure set) and decision 4 (review as a separate procedure)

## Context

By November 2026 the agent instructions were `AGENTS.md` at 184 lines plus six procedures at 745 body lines.
Over the month before this decision (347 merged PRs), the first CI run failed on 7.5% of PRs, 15.9% of PRs got
commits after they were opened, and the review procedure was opened before the first commit in 75% of
committing sessions. Rules written as prose were followed from memory, and the ones a machine could check
(language, internal paths, doc links) were checked twice: once by a script, once by a paragraph that drifted
from it.

Two more facts shaped the choice. A skill only opens when its description matches the situation, so a long
document that opens late helps less than a short one that opens on time. And transcript data from 505
sessions showed the prompt cache serves about 98% of input, so where a task runs, and on which model, has a
real cost.

## Decision

1. **`AGENTS.md` is an index of at most 60 lines.** A rule a `check:*` script, lint or a hook enforces appears
   only as the command name. Patterns are taught by pointing at one exemplar file each, not by prose.
2. **Eleven skills replace the six procedures**: `dou-plan`, `dou-verify` (a router over gate, web e2e, runtime
   check, in-app shell, chaos, load, property and device), `dou-e2e`, `dou-chaos`, `dou-load`, `dou-property`,
   `dou-failure-hunt`, `dou-ratchet`, `dou-cleanup`, `dou-ship` (review, commit, PR, auto-merge eligibility) and
   `dou-metrics`. Bodies stay short; method detail lives in each skill's `references/`, read only when chosen.
   The canonical files stay in `docs/config/skills/`; `.claude/skills/` holds relative links to them so they
   load as project skills.
3. **A line budget is enforced.** `scripts/instructions-size-budget.json` holds a budget per file and for the
   skills' total; `check:instructions-size` fails when one is exceeded or a new skill has none, and `--update`
   only lowers budgets.
4. **What must happen is a hook, not a sentence.** Project hooks lint each edited file, run `yarn gate` before
   `git commit` (skipping with a message while the script does not exist), and send the agent back to
   `dou-verify` once when source changed in a turn without a verification report.
5. **Placement is part of the plan.** Four agents fix model and effort (`dou-explorer`, `dou-cleanup-worker`,
   `dou-verifier`, `dou-reviewer`), and the placement guide states the cache rules only as strongly as the
   measurement supports: a mid-session model switch re-created the cache in 52 of 62 cases; an effort switch in
   4 of 17.
6. **Comment-writing guidance is removed** from the instructions, because new comments are now a lint error.

## Alternatives

- **Keep the procedures and add a size limit only.** Cheaper, but leaves the duplicate prose next to the
  checks and does nothing about procedures opening late.
- **Put everything in `.claude/skills/` and drop `docs/config/skills/`.** One location, but `/.claude` is
  ignored by git here and other agents read `docs/`; links keep one canonical copy readable by both.
- **Enforce verification with a commit hook instead of a Stop hook.** A commit hook cannot tell whether the
  behaviour was looked at; the Stop hook asks at the moment the agent is about to say it is done.
- **Hard rules on model and effort per task.** Rejected: the effort data is too thin (n = 17) to forbid; the
  guide recommends and explains the measured cost instead.

## Consequences

- Adding a skill means adding a budget entry; growing one means cutting elsewhere or moving text to
  `references/`.
- The hooks run for every Claude Code session in this repo. The lint hook costs about a second per edit; the
  gate hook adds the gate's run time to each commit attempt.
- The Stop hook asks once per stop; an agent may answer that a change cannot be verified now, and the second
  stop passes.
- `.claude/settings.json`, `.claude/hooks/`, `.claude/agents/` and the skill links are tracked despite the
  `/.claude` ignore rule; local copies of old procedures under a checkout's `.claude/skills/` are not removed
  by this change and should be deleted by hand.
