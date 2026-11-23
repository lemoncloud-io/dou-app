---
name: dou-ship
description: >-
    Take a finished change in this repo through review, commit and pull request. Use when a change is done and
    verified, before the first commit, and whenever asked to review a change ("review my changes before I
    commit"), commit, push, open a PR or "ship it". In this repo it replaces the generic code-review for that. Replaces the old dou-review, dou-commit and dou-pr procedures.
---

# dou-ship

Review before the commit, so a fix for a finding lands in the same commit as what it corrects.

1. **Gate.** `yarn gate` for the affected projects; check them against `verify.yml`'s exclusions
   ([`references/review.md`](./references/review.md)). Have the verification report from
   [`dou-verify`](../dou-verify/SKILL.md) ready; no report means you are not at this step yet.
2. **Review** with the one `dou-reviewer` agent: the diff range, the plan and, from round two, the previous
   round's findings and failures; never your reasoning, never a second reviewer. It also answers the
   [`REVIEW.md`](../../../../REVIEW.md) items the diff fires. The person decides what to apply.
3. **Docs and decisions.** A module whose behaviour changed has its `README.md`/`docs/` updated in this change.
   A decision has its ADR; take the next free number from `origin/develop` and every remote branch right
   before committing.
4. **Commit** in this repo's shape with a `Verified-by:` trailer ([`references/commit.md`](./references/commit.md)).
   The commit hook runs the gate; never skip hooks.
5. **PR** against `develop`, assigned to the person, with a mermaid diagram and fake-data screenshots inline
   ([`references/pr.md`](./references/pr.md)); report and plan links go in `To Reviewers`.

Asked only to commit: steps 1–4.
