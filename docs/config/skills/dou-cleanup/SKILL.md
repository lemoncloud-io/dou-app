---
name: dou-cleanup
description: >-
    Remove comments from one project and prove the code did not change, by comparing the TypeScript AST with
    comments stripped before and after; move any reasoning worth keeping into the module doc, then lower the
    comment ratchet baseline. Use when asked to clean up, strip or reduce comments in a project, or to lower the comment
    ratchet baseline. Not for general refactoring.
---

# dou-cleanup

One project per PR, so the proof and the review stay small. Large projects go to the `dou-cleanup-worker`
agent folder by folder.

1. **Read the project's `README.md` and `docs/`** first: a comment that explains a constraint the doc does
   not have moves into the doc in your own words. Everything else is deleted.
2. **Keep only the allowed comments**: public-API JSDoc of the published SDK packages
   (`libs/chatic-apps-sdk`, `libs/chatic-apps-devtools`), an `eslint-disable` with its reason, license
   headers.
3. **Delete** comments only. No renames, no reformatting beyond what Prettier does, no logic.
4. **Prove it**: run [`references/ast-equality.mjs`](./references/ast-equality.mjs) against `origin/develop`
   for the changed files. It must print `identical` for every file. Paste its output in the PR.
5. **Lower the baseline** for the files you cleaned (the comment ratchet's update command), run the gate,
   and ship with [`dou-ship`](../dou-ship/SKILL.md). A comment-only PR with an identical AST is auto-merge
   eligible.
