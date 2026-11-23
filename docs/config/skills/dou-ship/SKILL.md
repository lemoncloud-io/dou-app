---
name: dou-ship
description: >-
    Take a finished change in this repo through review, commit, pull request and the auto-merge eligibility
    check. Use when a change is done and verified, before the first commit, and whenever asked to review a
    change, commit, push, open a PR or "ship it". Replaces the old dou-review, dou-commit and dou-pr procedures.
---

# dou-ship

Review before the commit, so a fix for a finding lands in the same commit as what it corrects.

1. **Gate.** `yarn gate` for the affected projects; check them against `verify.yml`'s exclusions
   ([`references/review.md`](./references/review.md)). Have the verification report from
   [`dou-verify`](../dou-verify/SKILL.md) ready; no report means you are not at this step yet.
2. **Review** with the `dou-reviewer` agent: give it the diff range and the plan, not your reasoning, so it
   reads the code fresh. Merge its findings into one list ordered by severity, each with `file:line` and a fix.
   The person decides what to apply; findings left alone keep their reason. Re-run the gate after fixes.
3. **Docs and decisions.** A module whose behaviour changed has its `README.md`/`docs/` updated in this change.
   A decision has its ADR; take the next free number from `origin/develop` and every remote branch right
   before committing.
4. **Commit** in this repo's shape: [`references/commit.md`](./references/commit.md). The commit hook runs the
   gate; never skip hooks.
5. **PR** against `develop` from a branch named for the work: [`references/pr.md`](./references/pr.md). The
   verification report and any plan page are linked from `To Reviewers`.
6. **Auto-merge.** Say whether the PR is eligible ([`references/auto-merge.md`](./references/auto-merge.md))
   and why. Never enable auto-merge on a PR that is not; never merge without a green run.

Asked only to commit: steps 1–4.
