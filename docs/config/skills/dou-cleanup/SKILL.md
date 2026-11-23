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
4. **Prove it**: commit, then `node scripts/comment-only-diff/cli.js` ([its README](../../../../scripts/comment-only-diff/README.md))
   must exit 0 with every source file proven. Paste its output in the PR.
5. **Lower the baseline** for the files you cleaned (`yarn ratchet:update`), run the gate,
   and ship with [`dou-ship`](../dou-ship/SKILL.md). The proof makes the review of a comment-only PR
   quick; it still gets a reviewer.
