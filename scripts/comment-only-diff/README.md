# comment-only-diff

Proves that a branch changed source files only by removing comments. A comment-cleanup pull request
runs it and pastes the output as its evidence, so a reviewer does not have to read every hunk to
know behaviour is unchanged.

```bash
node scripts/comment-only-diff/cli.js                       # compares HEAD with origin/develop
node scripts/comment-only-diff/cli.js --base develop --head my-branch --json
node --test 'scripts/comment-only-diff/__tests__/*.test.js'
```

Exit code 0 means every changed `.ts .tsx .js .jsx .mjs .cjs .mts .cts` file is proven, and at least
one is. 1 means at least one is not, or no source file changed. 2 means a usage error. Other files,
such as the module README the removed reasoning moved into, are listed as skipped and do not affect
the result.

## What "proven" means

For each changed source file, compared at the merge base:

- both versions parse;
- their syntax trees are identical once comments and layout are set aside;
- every comment in the new version was already in the old one, so the change is a pure removal
  (adding or rewording a comment is not covered: the words are what a reviewer reads);
- no removed comment was a directive a tool reads: `@ts-*`, `eslint-*`, `prettier-ignore`,
  `#__PURE__`, `@vite-ignore`, `@jsx*`, `/// <reference>`, coverage ignores, `@license`,
  `sourceURL` / `sourceMappingURL`, test-environment docblocks;
- the shebang line is unchanged.

A source file that was added, deleted or changed type fails.

How the trees are compared: TypeScript's parser builds both, and a walk prints each node's kind,
the primitive fields the parser sets on it (names, literal text, operators, `let`/`const`, type-only
imports) and its children. It leaves out positions, comments and layout flags (whether a block,
array or object spans several lines). Parentheses are looked through, since a formatter drops them
once a comment inside goes. Parentheses that carry meaning still show, because dropping them
changes the tree (`(a + b) * c`) or its optional-chain flag (`(a?.b).c`). A parenthesized string
standing alone as a statement keeps its parentheses, because without them it would become a
directive such as `'use strict'`. Two JSX details follow React's own rules, because they decide what
renders. An empty `{/* … */}` container renders nothing and is dropped. JSX text is compared after
React's whitespace trimming. So removing a JSX comment that sat between two text runs joins them
into one rendered string, and that is correctly reported as a change.

Checked against the repository itself: in 365 real TS/TSX files with comments, removing every
non-directive comment was proven each time. Changing one `const` to `let` in 348 of them was caught
each time.

## Known limit

Tools that read comments as input are invisible to a syntax tree. Tailwind scans source text, so a
comment that lists class names (`// bg-red-500 bg-blue-500` beside a built class name) keeps those
classes in the CSS, and removing it drops them while the tree stays identical. A cleanup that
removes such a list needs a reviewer's eye on that file.
