---
name: dou-review
description: >-
    Review the work you just implemented, before committing it. Read and follow this
    when you have finished a change in this repo and are about to commit, when someone
    asks you to review a change, or when you are told to run the review step. This
    reviews the working tree, not a pull request.
---

# dou-review

The standards live in `AGENTS.md`. This file holds the procedure only: what to look
at, how to split the work, and what to hand back. When the two disagree, `AGENTS.md`
wins — open the section rather than trusting a summary of it here.

## What is reviewed

**Everything you changed and have not committed yet**, against `develop`: committed
work on this branch, staged, unstaged, and new files.

```bash
git fetch origin develop
git --no-pager diff --stat origin/develop            # tracked, committed + uncommitted
git --no-pager status --porcelain                    # new files included
```

Looking only at committed history hides what you wrote a minute ago, and that is
exactly what this step exists to read.

**This is not a pull request review.** If someone hands you a file list or a PR
number, review that instead — but that is a retrospective pass, not this step.

**Run it before committing.** A fix you make in response to a finding then lands in
the same commit as the change it corrects, instead of trailing behind it.

## Six things to check

Each one has a source of truth. Open it. Do not restate its rules from memory.

|     | Check                                                                                             | Source                                                                                  |
| --- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| R1  | Gates — lint, typecheck and test for the projects you touched                                     | `AGENTS.md` § Verifying a change, § Reviewing a change · `.github/workflows/verify.yml` |
| R2  | Architecture — layer boundaries, and whether the shells still agree on the contract               | The `README.md` / `docs/<topic>/` of each module you touched                            |
| R3  | Docs and decisions — module docs updated, ADR needed and shaped right, no working notes committed | `AGENTS.md` § Module docs, § ADRs, § Result documents                                   |
| R4  | Public surface — language, internal paths and private issue numbers, secrets                      | `AGENTS.md` § Language, § Public surface                                                |
| R5  | Quality — bugs, a simpler way, hidden side effects                                                | General engineering judgement                                                           |
| R6  | Branch name carries the domain noun of the work                                                   | `AGENTS.md` § Branch names                                                              |

### R1 in detail

Resolve which projects the diff actually touches, rather than guessing from paths:

```bash
npx nx show projects --affected --base=origin/develop
```

Run `lint`, `typecheck` and `test` for those projects only. A full `run-many` across
every project is not worth its wall-clock on each review.

Type checking a lib needs `tsc -b libs/<name>/tsconfig.json`. `tsc --noEmit` checks
zero files inside a lib and always "passes".

**Then compare that project list against the exclusions in `verify.yml`.** Projects
on that list are not checked by CI at all, so a green pipeline says nothing about
them. When one of the projects you touched is excluded:

1. Run its gate by hand.
2. **Say so in the review output.** "CI does not check this project" is information
   the reader needs, whether or not the gate passed.

The exclusion list changes as projects are fixed and removed from it — read the
workflow each time instead of carrying a remembered list.

## How to run it

Four subagents, no more. Launch A, B and C together in a single message; they only
read, so they cannot collide. D runs afterwards, and only if there is something for
it to argue with.

|     | Scope                             | Notes                                                               |
| --- | --------------------------------- | ------------------------------------------------------------------- |
| A   | R1 — run the gates                | Executes commands, so it is the slowest. Start it first.            |
| B   | R2 + R5                           | Reads the code                                                      |
| C   | R3 + R4 + R6                      | Reads docs and the public surface                                   |
| D   | Argue against the severe findings | Only after A–C. Its job is to remove false positives, nothing else. |

Give D findings that were produced by a different agent than the one judging them —
a finding checked by whoever wrote it tends to survive for the wrong reason.

**Merge the results yourself, in the main thread.** Do not paste four reports one
after another. Deduplicate by `file:line` and order what is left by severity.

## What to hand back

Report to the person first. The pull request comes later and gets less.

1. **One list, ordered by severity**, in the session.
2. **Every finding carries a `file:line`.** A finding you cannot anchor is marked
   unverified and does not count as a finding.
3. **Every finding comes with a proposed fix** — what to change and how.
4. **They decide what to apply.** Do not quietly fix everything and report it as
   done; that turns review into a second implementation pass and loses the findings.
5. **Findings left unapplied keep their reason**, so the same one does not get raised
   again next time.
6. **Re-run R1 if a fix changed code.** Fixes break gates often enough to check.

Then, and only then, the pull request body: what was applied goes in `Changes`, and
what a reviewer should watch out for — including findings deliberately left alone —
goes in `To Reviewers`. It is not a place to paste the full list.

**Do not commit a review note as a file.** `AGENTS.md` § Result documents already
rules that out, and this directory holds procedures, not the output of running them.
