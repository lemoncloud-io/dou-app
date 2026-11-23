# ADR-0369: Agent gates start in observe, escalate to a person, and review questions come from incidents

> Status: Accepted · Decided: 2026-11-23
> · Scope: `.claude/hooks/**` · `.claude/settings.json` · `REVIEW.md` · `docs/config/skills/dou-ship/**` (incl. `pr-assets.mjs`) ·
> `docs/config/skills/dou-verify/SKILL.md` · `docs/config/skills/dou-metrics/**` · `.claude/agents/dou-reviewer.md`
> · Builds on: [ADR-0367](./0367-agent-instructions-are-a-budgeted-index-and-hooks-enforce.md)

## Context

ADR-0367 moved what must happen out of prose and into hooks. A hook that blocks wrongly costs more than the
paragraph it replaced: the agent loses a turn, or learns to work around it. Nothing measured how often a new
hook would have blocked, nothing stopped an agent from retrying the same failing check indefinitely, and the
review step asked the same general questions of every diff while the questions that mattered were the ones a
past revert had taught (an updated app signed out, an invite entering with the wrong role, an old shell
answering `NOT_FOUND`).

## Decision

1. **Every hook has a mode** in `.claude/hooks/modes.json`: `off`, `observe` or `enforce` (default `observe`).
   In `observe` a hook logs what it would have blocked to `dou-hooks/` in the repository's git directory (shared
   by its worktrees, never committed) and lets the action through, still telling the agent what it found. New hooks start in `observe` and move to `enforce` once their log shows no false
   positives.
2. **An escape hatch, logged.** When the same blocking gate has blocked twice in a row in a session, the third
   attempt passes if the agent gives a reason (`DOU_HOOK_REASON="…"` as an environment prefix of `git commit`).
   The reason is logged and read when the gate is reviewed. The Stop hook needs no hatch: it asks once per
   stop, and the next stop passes.
3. **Three failures go to a person.** A check command (`yarn gate`, `nx test|lint|typecheck`, `jest`,
   `playwright test`, `check-*`) that fails three times in a row in a session makes the agent stop and hand the
   failure to the user with the evidence; the check stays blocked until the user replies.
4. **A verification stamp.** Every commit ends with `Verified-by: <methods>` (or `none`); the commit hook checks
   it is there (commits that reuse a message — amend, fixup, `--no-edit` — are exempt), so later gates and metrics can count verification instead of trusting prose.
5. **`REVIEW.md` holds diff-triggered questions** mined from reverts, repeated fixes and ADRs, each with its
   paths or line pattern and its evidence. The reviewer reads only the items the diff fires, from the base
   branch, so a PR cannot weaken its own checklist. Items with no commit in their paths for twelve weeks are
   listed for removal.
6. **One reviewer, rounds with memory.** `dou-reviewer` is the only reviewer; each round receives the previous
   round's findings and failures instead of a second reviewer starting cold.
7. **Flaky tests are fixed or deleted**, never skipped, slept or retried; a deleted test's reason goes in the
   commit and the module doc.
8. **PRs carry their evidence inline**: a mermaid diagram of the change, and screenshots pushed to an orphan
   `pr-assets` branch (`pr-<number>/<name>`, removed after merge) and linked by raw URL. Only screenshots of fake
   data are pushed, because the repository is public and git keeps them in history. The branch is created by the
   repository owner, not by an agent.

## Alternatives

- **Start hooks in `enforce`.** Faster to take effect, but the first false positive teaches agents to route
  around the hook, and there would be no record of how often it was wrong.
- **No escape hatch.** Simpler, but a wrong gate then blocks a session until a person edits configuration; a
  logged reason keeps work moving and turns each override into a review item for the gate.
- **A second, independent reviewer per round.** More opinions, but each starts without the previous round's
  findings and repeats them; a single reviewer given the history checks the fixes.
- **Screenshots only in the private HTML report.** Reviewers without access see nothing; GitHub has no API for
  PR-body image uploads, so a branch is the one scriptable host that keeps images next to the code.
- **A static checklist read on every PR.** Rejected: long lists are skimmed. Triggers keep the read to the few
  items that apply.

## Consequences

- Until hooks are promoted, they only record; the logs are per machine, so promotion is judged from the logs of
  the people who run agents here.
- Commit messages carry one more trailer line.
- `REVIEW.md` needs upkeep: a revert or repeated fix adds an item; the stale listing removes one.
- PostToolUseFailure must report a non-zero Bash exit for the three-failure count; if a Claude Code version does
  not send it, the count stays at zero and nothing is blocked.
