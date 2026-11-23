# Auto-merge eligibility

The rules and the classifier live in [`scripts/auto-merge/README.md`](../../../../../scripts/auto-merge/README.md)
(ADR-0365); `.github/workflows/auto-merge.yml` applies them and comments its verdict on the PR. This page is only
what to do around it.

- **Before opening**, say in `To Reviewers` which class you expect: A (behaviour provably unchanged: comment-only
  with an identical syntax tree, lowered ratchet baselines, tests added, module docs) or B (a small `fix`), or
  "needs a reviewer" and why. ADRs, AGENTS.md, skills, `.claude/`, workflows, lint config, dependencies and native
  code always need a reviewer.
- **After opening**, read the bot's verdict. When it disagrees with you, the workflow is right until its rules are
  changed in their own PR.
- `no-auto-merge` stops it on any PR. Never merge without a green run.
