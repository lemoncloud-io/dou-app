---
name: dou-pr
description: >-
    This repo's pull request title and body convention — a `[Category] description` title
    and `.github/pull_request_template.md` filled in. Read and follow this before opening a
    PR here. How to open one at all (pushing the branch, `gh pr create`) is not this file's
    subject; it fixes only the title and body convention.
---

# dou-pr

Titles and bodies are in English — `AGENTS.md` § Language names PR titles and bodies
explicitly. The history holds two styles, `feat(scope): english description` and
`[Category] <Korean description>` (the one this repo's owner used most). What is settled
here keeps the `[Category]` structure and writes the description in English.

## Title

```
[Category] English description
```

Across several projects, or tied to a release:

```
[Category1/Category2] English description
[Category] English description [x.y.z]
```

- **Category** — the lib/app/feature area touched, in PascalCase: `Data` `Mobile`
  `Build` `Log` `Config` `Push` `Chat` `Admin` `Auth` `Session` `Perf` `Web` `Desktop`.
  Join several with `/` or `,`: `[Web/Mobile]`, `[Push,Data]`.
- **Description** — an English noun phrase or short clause, no trailing period. List
  several decisions with a semicolon or "and".
- **Version tag** — only when this PR ships as a specific release, as `[0.24.1]`. Most
  PRs carry none; that is the default.

```
[Data] unify libs/data's doc canon and flatten the src/data layering
[Config] consolidate the settings registry and rework the debug panel [0.24.1]
[Web/Mobile] add the place intro text and channel-member-add flow
[Push,Data] add device-wide push mute and socket routing
```

## Body

Fill in `.github/pull_request_template.md`, in English.

- **PR Types** — check what honestly applies. Several at once is normal; refactor, test
  and docs together is common.
- **Changes** — start with **why**. A sentence or two on what the problem was or why
  this was needed, then bullets on what changed. Do not list the commits. When a PR
  carries several decisions, give each its own subheading
  (`### ADR-0081 — split the doc canon by size …`) and put the background, the decision
  and the trade-off under it.
- **Verification** — check what was actually done, per `AGENTS.md` § Reviewing a change.
  Do not stop at the boxes: paste the commands and their results in a code block —
  tests passed, typecheck output, the evidence for a project excluded from CI that had
  to be checked by hand. Show "this is what was run and this is what came back", not
  "it was run".
- **To Reviewers** — point at what a reviewer has to look at: a decision that could
  reasonably have gone the other way, an area `verify.yml` does not see so it was
  checked by hand, the grep or command output used as evidence. When there genuinely is
  nothing, say that in a line rather than writing "nothing in particular".

PR #458 shows the structure best — `Changes` split per ADR, and `To Reviewers` carrying
the real output of running the CI-excluded projects by hand. It was written in Korean at
the time; follow its structure and write the content in English.

## Do not

- Use the generic `## Summary` / `## Test plan` shape. This repo has its own template.
- Write Korean in the title or the body — `AGENTS.md` § Language covers both.
- Fill `Changes` by copying the commit log. A commit is the smallest unit of change; a
  PR is where they are gathered and the **why** is explained.
