---
name: dou-implement
description: >-
    Three disciplines for writing code in this repo: comments and everything else in
    English, a unit test for every piece of logic added or changed, and a documented
    verification checklist. Read and follow this when asked to implement with these
    disciplines, when asked for a change that comes with its verification and tests, or
    when told to run the implementation step. Writing code is not on its own a reason to
    open this — it applies when the disciplines are asked for.
---

# dou-implement

The point of all three is the same: whoever reads or changes this code next — future
you included — should not have to guess what was intended or what was actually checked.

Work in three steps and show the result of each. Do not save them up and present them
together at the end; stack them in order — code, then tests, then the checklist.

1. **Implement**, with comments as § Comments describes.
2. **Test** every piece of logic added or changed, and run them.
3. **Write the verification checklist**, honestly.

## 1. Comments

A comment explains **why**. It does not repeat the **what** the code already says. Good
comments record a decision that is not self-evident; self-evident code gets none.

```ts
// Local-first repository keeps a stable empty contract so the UI never
// has to special-case "not cached yet" vs "genuinely empty".
return { list: [], meta: { total: 0, source: 'local' } };
```

Follow the comment density and style of the code around it. The goal is not a comment
on every line — it is that no reader has to guess.

**English, like everything else written into this repo.** `AGENTS.md` § Language is the
rule; the only exception it makes is translation resources. Test names are not an
exception: a test name is read out of CI logs and failure reports, which is the surface
that rule exists to keep in one language.

## 2. Unit tests

Every piece of logic added or changed is covered — **all of it**. Even a one-line change
gets a test when it changed logic: a branch, a calculation, a state transition, error
handling.

- Use the framework and conventions already here (Jest, `describe`/`it`, `jest.fn()`
  mocks). Do not bring in a new one.
- Put the test beside the file it covers (`Foo.ts` → `Foo.test.ts`), and when a test
  file already exists, add to it in its style — read the neighbouring tests first and
  reuse their mock helpers and setup.
- **Test behaviour, not implementation.** "This input produces this result / delegates
  to this collaborator this way", not "it called that private method". That is what
  survives a refactor.
- Cover at least the happy path plus one meaningful edge or error case for each piece
  of logic: empty values, null, a cache miss, a boundary — whichever branch that logic
  actually has. Do not invent an error path that does not exist.
- **Run them and confirm they pass.** Writing a test is not finishing. Report the
  command and its result.

**A test that passes without the fix proves nothing.** When the test exists because
something was broken, revert the fix, watch that test fail, restore it, and say so.

Details in [references/testing.md](./references/testing.md).

## 3. Verification checklist

For each unit of change, record how someone would confirm it works. This is a document
a person can follow, not a script — it covers what automated tests cannot: manual
checks, integration points, regression risk. Its value is that verification status is
visible rather than assumed.

```markdown
## Verification

### Change: <one line on what changed>

- [x] Unit tests pass: `<command>` — <result>
- [ ] <manual/integration check, and exactly how to do it>
- [ ] Regression risk: <what else could be affected> — <how to check it>
```

Check a box only for something actually run in this work, with the command and the
result beside it. Leave unchecked what the reader has to do themselves, and say what
they should do. The checklist is worth having only if it is honest.

Format and examples in
[references/verification-plan.md](./references/verification-plan.md).

## Split the work when it splits

**Run independent work in parallel subagents.** This is an Nx monorepo — `apps/` (4)
and `libs/` (16) — so work divides along module boundaries often enough that doing it
serially is simply slower.

|     | Rule                                                           | Why                                                                           |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Never split work that touches the same file                    | Write collisions. Review is read-only and cannot collide; implementation can. |
| 2   | Work that needs an earlier result is serial                    | Adding a lib and then consuming it is one example                             |
| 3   | Give each subagent the paths it owns; elsewhere is read-only   | Without a boundary, nobody can say who changed what at integration time       |
| 4   | Subagents do not stage, commit or push                         | Integration and committing belong to the main thread                          |
| 5   | **Re-run the gates after integrating**                         | Pieces that each pass can still fail together — a missed `nx sync` above all  |
| 6   | Do not split a single file or a small change inside one module | Splitting costs more than it returns                                          |

Rule 5 is the one that matters. Parallel work does not fail as "a piece did not work";
it fails as **"every piece worked and the whole does not"**, and integration is the only
place that shows.

## Seeing it yourself is optional

Nobody is required to click through the change. The checklist keeps a line for it either
way, and an unchecked line is not an incomplete piece of work.

**When someone does want to look, start the environment for them** — actually run it,
rather than naming the command. Which app and which command is in the root
[`README.md`](../../../../README.md), as `AGENTS.md` § Before you start already says.
Then tell them in one line what to look at: which screen, which path, what changed.

Check the box only for what they actually confirmed. Do not check it on their behalf.

**Say up front that mobile is simulators and emulators only.**
[`apps/mobile/docs/release/local-run.md`](../../../../apps/mobile/docs/release/local-run.md)
puts physical devices explicitly out of scope — no LAN IP, no iOS ATS exception, no
Android cleartext exception. A change that has to be seen on real hardware needs a dev
build, which is a different road. "It is running" must not be mistaken for "it was
checked on a device".

## A decision brings its ADR

Whether one is needed, and what shape it takes, is `AGENTS.md` § ADRs' to say. What
belongs here is the timing: **do not defer the judgement until the work is finished.**

The reason is the alternatives. Context, decision and consequences can all be
reconstructed later by reading the code; **the options weighed and dropped exist only in
the head of whoever was writing it**, and `## Alternatives` is the section the fewest
ADRs in this repo carry. Written after the fact it turns into invention, or an empty
heading.

## Before you answer

- Are the comments in English and about why? Is everything else written here English too?
- Does every piece of changed logic have a test, and did it actually pass?
- Is the checklist attached, and are its boxes honest?

If one of them is missing, say why (for example: "pure type definitions, nothing to
exercise at runtime"). Do not skip a discipline quietly.
