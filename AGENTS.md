# Chatic

An Nx monorepo — four apps under `apps/`, sixteen libraries under `libs/`.

## Read a module's own docs before changing it

Every module keeps its own canon, maintained with the code rather than after it. Find it before you
edit, and prefer it over inference from the source.

- The canon is the module's `README.md`, plus a `docs/` folder beside it when there is enough detail
  to split. `README.md` holds the overview and structure; `docs/<topic>/` holds the detail.
- Some modules have neither yet. There is nothing to read in those.
- **The root `docs/` folder holds decisions, and nothing else.** `docs/adr/` is the one repo-wide
  tree that survives; the guides, plans, specs and audits that used to sit beside it are gone. A
  module's own canon still has to stand on its own — see [Decisions live in `docs/adr/`](#decisions-live-in-docsadr).

## Writing a module's docs

`libs/data` is the worked example. Where it and this section disagree, the module wins and this
section is wrong.

### The four rules

1. **English.** Every document in the repo is written in English — module docs under `libs/*` and
   `apps/*`, and the ADRs under `docs/adr/`.
2. **One canon per fact.** If `README.md` and `docs/` say the same thing, one of them is wrong.
   Write it once and link to it.
3. **Every module has a `README.md` at its root.** It is the entry point, and it always holds the
   **overview and structure** — purpose, principles, scope, the layer map, the directory tree,
   usage. Someone who opens the module sees the whole map without opening a second file. A
   `README.md` is never a 20-line pointer, and a module never leads with a bare `docs/` folder.
4. **`docs/` holds detail, and only when there is enough of it.** One topic's worth of detail lives
   in the README. Split a `docs/<topic>/` out when the module has more than about three topics, or
   when the README would run past roughly 300 lines of detail on top of its overview. A module with
   a single `docs/architecture.md` is the shape this rule exists to remove: fold it into the README
   and delete it.

### What never goes in

| Category                   | Looks like                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Work log · plan · forecast | "Step 3 preview", "how this was verified", "where the implementation left the plan" |
| Duplication                | The same paragraph in `README.md` and `docs/README.md`                              |
| Code that does not exist   | A section describing a directory that was deleted                                   |
| Nx scaffold text           | `This library was generated with Nx`                                                |

Write in the present tense about what the code does now. A sentence that only makes sense if you
know what the code used to do is a work log.

One exception, and `libs/data` uses it: a **naming history** section is worth keeping when old names
still appear in review comments or in sibling modules. Keep it dated and short.

### Decisions live in `docs/adr/`

One decision per file, numbered, named after what was decided, and **written in English** like every
other document in this repo. An ADR records why a decision was made and what it cost. It is not a
work log, and it is not where a module's rules are kept.

A module doc must still stand on its own. Where behaviour only makes sense with a decision's
reasoning, **write the reasoning into the module doc in your own words** — a rule worth following is
worth stating where it is enforced. The ADR is the provenance, not the reference manual.

A bare inline reference (`ADR-0036`) is enough in module docs and costs nothing. Links into
`docs/adr/` resolve again, so use one where a reader would follow it. Links to any other path under
`docs/` are dead — that part of the tree is gone.

An ADR that a later decision overturns keeps its file and says so in its status line, with a link to
the ADR that replaced it. Deleting it would lose the reasoning the replacement argues against.

The practical test for a module doc: would it teach someone how to work in this module with no other
source available? If not, the missing part belongs in it.

### README skeleton

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
npx tsc -b libs/<name>/tsconfig.json         # the lib AND its specs
npx jest --config libs/<name>/jest.config.js
```

Then the traps that apply to every module:

- Type checking must be `tsc -b`. Inside a lib, `tsc --noEmit` checks zero files and succeeds.
- Jest does not type check — the base sets `isolatedModules`, so ts-jest transpiles. A broken
  fixture surfaces as `… is not a function` at runtime unless the spec project is checked.
- A stale `dist`/`out-tsc` produces phantom errors after a directory moves. `rm -rf` and look again.
- Downstream: name the projects a changed barrel identifier reaches, and which of them
  `.github/workflows/verify.yml` does **not** cover. Those are the ones to run by hand.
````

### Topic doc skeleton

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

### Tone

Read `libs/data/docs/repositories/README.md` before writing a topic doc. Four habits carry most of
its value:

- **Count things.** "13 repository facades", "9 LocalDataSources", "5 gateway Picks". A count tells
  the reader whether they have seen everything.
- **Say where something is not.** Absence is as useful as presence.
- **Give the command, not the claim.** "All 25 data sources have a matching test" ages badly; the
  command that proves it does not.
- **Explain the rule that a diagram cannot draw.** `local` never calls `remote` is one sentence and
  it is the whole architecture.

## Verifying a change

- A library's type check is `tsc -b`. Inside a lib, `tsc --noEmit` checks zero files and succeeds, so
  passing it proves nothing.
- `tsc -b libs/<name>/tsconfig.json` covers the lib **and** its specs, because `tsconfig.json`
  references both projects. That is what the CI `typecheck` target runs.
- `.github/workflows/verify.yml` is the CI gate, and it names the projects it leaves out. Those are
  the ones to check by hand.
