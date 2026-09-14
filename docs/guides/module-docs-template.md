# Module documentation template

> Status: Live · Written: 2026-09-14 · Worked example: [`libs/data`](../../libs/data/README.md)
>
> This is the shape every module's canon follows. `libs/data` is the one module already in this
> shape — when this page and that module disagree, the module wins and this page is wrong.
>
> These rules were decided in ADR-0081. That ADR is not the authority here, because `docs/adr/` is
> being retired — this page is. It is written to stand on its own once the ADR is gone.

## The four rules

1. **English.** Every module document under `libs/*` and `apps/*` is written in English, and so is
   any new operational doc under `docs/`. `docs/adr/` is exempt because it is being retired — see
   [Do not lean on ADRs](#do-not-lean-on-adrs).
2. **One canon per fact.** If `README.md` and `docs/` say the same thing, one of them is wrong.
   Write it once and link to it.
3. **Where the canon lives is already decided.** A module with a `docs/` folder keeps it there. A
   module without one keeps everything in `README.md`. Create `docs/` only when the module needs
   more than three documents.
4. **Where a module has both**, `README.md` holds **overview and structure** and `docs/<topic>/`
   holds the detail. The README is not a 20-line pointer — someone who opens the module sees the
   whole map without opening a second file.

## What never goes in

ADR-0081 names four deletion categories. They apply to new writing as much as to cleanup.

| Category                   | Looks like                                                                          | Where it belongs |
| -------------------------- | ----------------------------------------------------------------------------------- | ---------------- |
| Work log · plan · forecast | "Step 3 preview", "how this was verified", "where the implementation left the plan" | `docs/adr/`      |
| Duplication                | The same paragraph in `README.md` and `docs/README.md`                              | One of them      |
| Code that does not exist   | A section describing a directory that was deleted                                   | Nowhere          |
| Nx scaffold text           | `This library was generated with Nx`                                                | Nowhere          |

Write in the present tense about what the code does now. A sentence that only makes sense if you
know what the code used to do is a work log.

One exception, and `libs/data` uses it: a **naming history** section is worth keeping when old names
still appear in review comments or in sibling modules. Keep it dated and short.

## Do not lean on ADRs

`docs/adr/` is being retired in a follow-up track. Module docs must survive that.

- **Do not add new `docs/adr/` links** from a module document.
- When a module's behaviour only makes sense with a decision's reasoning, **absorb the reasoning**
  into the module doc in your own words. A rule worth following is worth stating where it is
  enforced.
- Existing ADR links are not an error to chase down on sight. Replace them as you rewrite the
  section they sit in.
- Inline references with no link (`ADR-0036`) are fine as provenance and cost nothing when the file
  disappears. A markdown link to `../adr/...` is the thing that breaks.

The practical test: if `docs/adr/` were deleted tomorrow, would this document still teach someone
how to work in this module? If not, the missing part belongs here.

## README skeleton

````markdown
# @chatic/<name>

**<One bold sentence: what this module is.>** <A paragraph on what it assembles and what it
exports.>

<If the canon is split, say so:>
This document covers the **overview and structure** only. The per-layer detail is canonical under
[`docs/`](#documents).

## Purpose

What consumers see, and the invariant that keeps it that way. State the invariant with the command
that checks it rather than with a number that will rot.

```bash
grep -rn "@chatic/<name>/" --include='*.ts' --include='*.tsx' apps libs | grep -v node_modules
```

Say what this module does **not** own, and name the module that does.

## Design principles

A numbered list of contract rules. Each one is a sentence a reviewer can hold a diff against.
Not aspirations — rules that are true of the code today.

1. **<Rule.>** <Why, and what violating it looks like.>

## Scope

**In** — <the surfaces this module owns.>

**Out** — <what lives elsewhere, each with the module that owns it.>

## Structure

A mermaid `flowchart` of the layers and who calls whom. Put external modules in a dashed class so
the boundary is visible. Follow it with the one sentence that the diagram cannot show — usually a
rule about which arrow is _not_ allowed.

### <The main flow>

A mermaid `sequenceDiagram` for the path that matters most. One diagram, not one per method.

### Directories

```text
libs/<name>/src/
├── index.ts          public barrel
└── <dir>/            <what it holds, and how many>
```

Then name the files whose contents you cannot guess from the filename — the types that live in a
`types.ts`, the class that has no file of its own. "There is no `X.ts` to open" saves a search.

## Usage

The entry point, in code. Show the call a consumer actually writes, not the internals.

### Wiring

Who assembles this module, and in what order. A `text` block of the call tree is enough.

## Scenarios

Numbered, concrete flows — the questions people arrive with. Each one names real
symbols and says what is written where. Six is a good ceiling.

### 1. <Scenario>

## Documents

Only when `docs/` exists. A table, one row per folder or standalone file.

| Folder                                    | What it covers                                        |
| ----------------------------------------- | ----------------------------------------------------- |
| [docs/<topic>/](./docs/<topic>/README.md) | <The topics, comma-separated, so the reader can pick> |

## How to verify

```bash
npx tsc -b libs/<name>/tsconfig.lib.json     # the lib
npx tsc -b libs/<name>/tsconfig.spec.json    # tests and __mocks__
npx jest --config libs/<name>/jest.config.js
```

Then the traps. The ones that apply to every module:

- Type checking must be `tsc -b`. Inside a lib, `tsc --noEmit` checks zero files and succeeds.
- Jest does not type check — the base sets `isolatedModules`, so ts-jest transpiles. A broken
  fixture surfaces as `… is not a function` at runtime unless the spec project is checked.
- A stale `dist`/`out-tsc` produces phantom errors after a directory moves. `rm -rf` and look again.
- Downstream: name the projects a changed barrel identifier reaches, and which of them
  `.github/workflows/verify.yml` does **not** cover. Those are the ones to run by hand.
````

## Topic doc skeleton

For `docs/<topic>/README.md`.

```markdown
# <topic> — <the one-line role>

<What this layer is, in a paragraph. Its position relative to its siblings.>

## Layout

The directory, and the counts.

## Responsibilities

What this layer decides, and what it refuses to decide.

## The shared contract

The types and rules every member of this layer implements. This is usually the longest section
and the reason the document exists.

## Usage

### <How to add a new one>

A numbered procedure. Someone adding the Nth member should not have to read an existing one to
infer the steps.

### What not to do

The mistakes this layer invites, each with the reason it is wrong.

## Notes for implementers and tests

The traps that only show up when you write against this layer.

## Further reading

Links to sibling docs. Never restate what they say.
```

## Tone

Read `libs/data/docs/repositories/README.md` before writing a topic doc. Four habits carry most of
its value:

- **Count things.** "13 repository facades", "9 LocalDataSources", "5 gateway Picks". A count tells
  the reader whether they have seen everything.
- **Say where something is not.** Absence is as useful as presence.
- **Give the command, not the claim.** "All 25 data sources have a matching test" ages badly; the
  command that proves it does not.
- **Explain the rule that a diagram cannot draw.** `local` never calls `remote` is one sentence and
  it is the whole architecture.

## Applying this to a module

The rollout order and the per-module state are in
[docs/plans/libs-module-harness-rollout.md](../plans/libs-module-harness-rollout.md).
