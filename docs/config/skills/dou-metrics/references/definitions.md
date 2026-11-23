# Metric definitions

| Metric                 | Definition                                                                                                                  | Source                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| First CI run failed    | merged PRs into `develop` whose first `verify.yml` run concluded `failure`, / merged PRs                                    | `gh pr list --state merged --base develop`, `gh run list --workflow verify.yml --branch <head>` |
| Commits after opening  | merged PRs with at least one commit dated after the PR's `createdAt`, / merged PRs                                          | `gh pr view <n> --json createdAt,commits`                                                       |
| Interrupts per session | user entries marking an interrupted request, / main sessions                                                                | `~/.claude/projects/*<repo>*/*.jsonl`                                                           |
| Review before commit   | committing sessions that opened `dou-ship` (or the old `dou-review`) before their first `git commit`, / committing sessions | transcripts: Skill tool calls and Bash `git commit`                                             |
| Gate before commit     | committing sessions that ran `yarn gate`, lint, typecheck, test or a `check:` before their first commit                     | transcripts                                                                                     |
| Instruction size       | AGENTS.md lines + SKILL.md body lines                                                                                       | `node scripts/check-instructions-size.js --report`                                              |
| Cache hit ratio        | cache read / (cache read + cache creation + uncached input), per session, median                                            | `references/cache-usage.mjs`                                                                    |
| Tokens per session     | median cache read, cache creation and output tokens per session                                                             | `references/cache-usage.mjs`                                                                    |

Count usage once per `message.id`; a streamed message appears on several lines. Exclude `subagents/`
transcripts from per-session numbers and report them separately when asked.
