# Auto-merge eligibility

A PR merges without a second reviewer only when it provably does not change behaviour, or is a small fix.
CI (verify and e2e) must be green in every case; the `no-auto-merge` label turns it off.

**Provably unchanged**

- comment-only: the AST with comments stripped is identical and no directive comment was removed
  (`dou-cleanup/references/ast-equality.mjs`);
- a ratchet baseline lowered and nothing else;
- tests added with no source change;
- module docs changed (not ADRs, not AGENTS.md or skills).

**Small fix** — all of: every commit is `fix`; at most 50 non-test lines; one project; test changes in the same
PR; none of the paths below touched.

**Always a human**: source behaviour changes beyond the small-fix limit, ADRs, AGENTS.md and skills, workflows
and lint configuration, dependencies, native code, version bumps and deploys.

The deciding workflow is `.github/workflows/auto-merge.yml`; when it disagrees with this page, it wins and this
page is corrected. Until that workflow exists, auto-merge is off in this repository: state eligibility in the PR and
leave the merge to a person.
