# Pruning

Rules that never fire still cost reading time and false confidence. Once a month, or when a lane merges:

1. **Checklist items.** `node docs/config/skills/dou-ship/references/review-items.mjs --stale 12` lists the
   `REVIEW.md` items whose paths saw no commit on `origin/develop` in twelve weeks. Propose removing each unless its
   risk is still live (the code exists and a release could break it); say which.
2. **Hook rules.** `$(git rev-parse --git-common-dir)/dou-hooks/<hook>.jsonl` (per machine, shared by worktrees, never
   committed) records every `would-block`, `blocked`,
   `override` and `escalated` outcome. A rule with no entry across the sessions of the window is a removal
   candidate.
3. **Promotion.** A hook in `observe` whose `would-block` entries were all real problems moves to `enforce` in
   `.claude/hooks/modes.json`. Entries that were false positives are fixed in the hook first. Every `override`
   reason is read; a recurring reason means the gate is wrong, not the agent.
4. **Report** the candidates in the metrics page; removing or promoting is a normal PR.
