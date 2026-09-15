# Chatic

An Nx monorepo — four apps under `apps/`, sixteen libraries under `libs/`.

## Before you start

Build, run, test, lint and deploy commands, the tech stack, and environment setup are in
[`README.md`](./README.md) — read that first if you don't already know them. This file covers what
governs the code and its docs once you're working in it.

## Read a module's own docs before changing it

Every module keeps its own canon, maintained with the code rather than after it. Find it before you
edit, and prefer it over inference from the source.

- The canon is the module's `README.md`, plus a `docs/` folder beside it when there is enough detail
  to split. `README.md` holds the overview and structure; `docs/<topic>/` holds the detail.
- Some modules have neither yet. There is nothing to read in those.
- **The root `docs/` folder holds two things: decisions and infrastructure that has no project of its
  own.** `docs/adr/` is the decision record — see
  [Decisions live in `docs/adr/`](#decisions-live-in-docsadr). `docs/infra/` is config and code that
  deploys outside this Nx workspace (a Firebase project, a `.well-known` file) and so has no `apps/`
  or `libs/` project to live in; each subfolder there is its own small canon, README first. The
  guides, plans, specs and audits that used to sit in `docs/` alongside these are gone. A module's own
  canon still has to stand on its own regardless of what either tree says.

## Writing a module's docs

`libs/data` is the worked example — its `README.md` and `docs/repositories/README.md` show the shape
and the tone a module doc should have. Read those before writing or judging one; where they disagree
with anything below, the module wins.

### Decisions live in `docs/adr/`

One decision per file, numbered, named after what was decided, and **written in English** like every
other document in this repo. An ADR records why a decision was made and what it cost. It is not a
work log, and it is not where a module's rules are kept.

A module doc must still stand on its own. Where behaviour only makes sense with a decision's
reasoning, **write the reasoning into the module doc in your own words** — a rule worth following is
worth stating where it is enforced. The ADR is the provenance, not the reference manual.

A bare inline reference (`ADR-0036`) is enough in module docs and costs nothing. Links into
`docs/adr/` and `docs/infra/` resolve — use one where a reader would follow it. Links to any other
path under `docs/` are dead — the guides, plans, specs and audits that used to sit there are gone.

An ADR that a later decision overturns keeps its file and says so in its status line, with a link to
the ADR that replaced it. Deleting it would lose the reasoning the replacement argues against.

The practical test for a module doc: would it teach someone how to work in this module with no other
source available? If not, the missing part belongs in it.

### Tone

Four habits carry most of `libs/data`'s value:

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
