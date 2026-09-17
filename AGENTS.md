# Chatic

Nx monorepo: `apps/` (8), `libs/` (16).

## Language

Everything written into the repo or its GitHub surface is in English. Not a list to check
against — code comments, module `README.md`/`docs/<topic>/`, `docs/adr/`, commit messages, PR
titles and bodies, test names, and whatever comes next. This is a deliberate, repo-wide policy:
earlier PRs used a mixed Korean/English title convention; new ones don't. Chat responses to the
user are unaffected by this rule.

**The one exception is translation resources** — `**/locales/**` and `**/i18n/**`. The Korean in
those files is not writing about the product, it is the product's own words to its users, and
translating it breaks the feature rather than following the rule. The exception is a path, so it
needs no judgement call.

Test names are not an exception. A name goes into CI logs and failure reports, which is exactly
the surface this rule keeps in one language, and unlike a translation resource nothing breaks when
it is in English. Names written before this was settled are left alone; new ones are English.

## Before you start

- Build, run, test, lint, deploy commands: [`README.md`](./README.md).
- The work here runs in an order: agree what is being built, implement it, review it, then commit
  and open the PR. § Working order says what that means in this repo.
- Four procedures live in `docs/config/skills/`. **Open the one that applies and follow it** — they
  are not background reading, and they are not summarised here:

    | Procedure                                                      | Open it when                                           |
    | -------------------------------------------------------------- | ------------------------------------------------------ |
    | [`dou-implement`](./docs/config/skills/dou-implement/SKILL.md) | writing code with its comments, tests and verification |
    | [`dou-review`](./docs/config/skills/dou-review/SKILL.md)       | a change is finished and not yet committed             |
    | [`dou-commit`](./docs/config/skills/dou-commit/SKILL.md)       | writing a commit message                               |
    | [`dou-pr`](./docs/config/skills/dou-pr/SKILL.md)               | opening a pull request                                 |

## Module docs

- Before editing a module, read its own `README.md` (and `docs/<topic>/` if it has one). Prefer it
  over inferring behavior from source.
- Root `docs/` holds decisions (`docs/adr/`), cross-repo infrastructure notes (`docs/infra/`)
  and the procedures agents follow (`docs/config/skills/`). A module's own documentation never
  lives there — it belongs beside the module, in its `README.md` or its `docs/<category>/`.
- If a module's behavior only makes sense with a decision's reasoning, write that reasoning into the
  module doc itself, in your own words. Don't rely on a reader following an ADR link.
- A module's `docs/` has one shape, and four rules hold it:
    1. Every category folder has a `README.md` — either the category's lead document, or a short
       index (keep an index short; an index that becomes the content is a document in the wrong
       place).
    2. A category name has to answer "does this document belong here?" on its own. Names that
       cannot — `misc`, `etc`, `common`, and `architecture`, which only ever means "crosses more
       than one feature" — are not used.
    3. Depth stops at `docs/<category>/<topic>.md`. Needing another level means the category is
       wrong, not that the tree needs deepening.
    4. No topic files directly under `docs/` — `docs/README.md` is the only top-level document
       there, and it states what belongs in which category.
- **`apps/web` only:** `docs/feature/<name>/` exists when, and only when,
  `src/app/features/<name>/` exists, and the names match exactly — `appUpdate` stays camelCase.
  That folder is the one place the depth rule above is relaxed, because a feature owns several
  screens that are read independently. The rule is machine-checkable, so check it rather than
  reading the two trees:

    ```bash
    diff <(ls apps/web/src/app/features) <(ls apps/web/docs/feature)   # must print nothing
    ```

    Code with no feature folder is documented by category instead — push-tap routing lives in
    `docs/bridge/`, not in a `feature/notifications/` that no `features/notifications/` backs.

## ADRs (`docs/adr/`)

- One decision per file, numbered, in English. Records why a decision was made and what it cost —
  not a work log, not where a module's rules live.
- Bare `ADR-0036` mentions are fine in module docs; link into `docs/adr/` only where the reader should
  actually follow it.
- A superseded ADR keeps its file; mark its status line and link to the ADR that replaced it. Don't
  delete it.
- **A number, once taken, is never reused** — not even for a file that was deleted or renumbered. The
  number is the name every other document and comment refers to, so handing it to a second decision
  turns every existing `ADR-00NN` mention into a silent pointer at the wrong record. Take the next
  free number, and leave the gaps.
- Renumbering an ADR is not a rename — it is a rename **plus** repointing everything that refers to
  the old number, in the same change: links, module docs, and source comments. `yarn check:doc-links`
  catches the links and the ADR links whose label and target disagree; bare `ADR-00NN` prose carries
  no target, so nothing can catch those and they have to be read.

## Verifying a change

- Typecheck a lib with `tsc -b libs/<name>/tsconfig.json`, not `tsc --noEmit` (checks 0 files inside a
  lib, always "passes").
- `.github/workflows/verify.yml` lists the projects it excludes from typecheck/test — check those by
  hand.
- A stale `dist`/`out-tsc` after a directory move produces phantom type errors. `rm -rf` it and
  recheck before trusting the error.
- Adding a new workspace `lib` as a dependency needs `nx sync` (project references). Nothing in CI
  catches a missed reference for you.

## Reviewing a change

- Before calling a change done, run the same gate `verify.yml` runs for the projects you touched —
  lint, typecheck (`tsc -b`, per above), test. Resolve that set rather than guessing it:
  `npx nx show projects --affected --base=origin/develop`. Running it for those projects is the
  point; a full `run-many` across all of them is not worth its wall-clock here. Don't rely on CI
  to catch it first.
- **Check that set against `verify.yml`'s exclusions, and say what you find.** A project on that
  list is not checked by CI at all, so a green pipeline says nothing about it — run its gate by
  hand and put "CI does not check this project" in the PR, pass or fail. The list shrinks as
  projects are fixed off it, so read the workflow instead of carrying a remembered copy.
- If the change encodes a decision rather than an obvious fix, check whether it needs a new or
  updated ADR under the existing ADR rules.
- If the change leaves a module's own `README.md` or `docs/<topic>/` out of date — new behavior,
  a changed constraint, a retired pattern — update that doc as part of the same change, not as a
  follow-up.
- Never reference an ADR in a source code comment (no `ADR-0036` mentions, no `docs/adr/` links).
  If the code needs its reasoning to make sense, write that reasoning into the module doc in your
  own words — the same rule "Module docs" already states, applied to code comments too.
- Fill `.github/pull_request_template.md` as the repo expects: PR type checkboxes, `Changes`, and
  `To Reviewers` — the last is where a reviewer's attention should be pointed, not a separate doc.

## Public surface

This repository is public. Nothing written into it may point at an internal document store or a
private repository — no file paths into one, no issue or PR numbers from one. Two reasons: the
path itself discloses internal structure, and a reader who cannot open the destination is handed
a wall rather than a pointer.

So the repo has to stand on its own. Where a change only makes sense with reasoning that lives
elsewhere, write that reasoning here, in your own words — `docs/adr/` for a decision, the module
doc for behaviour. Whatever genuinely cannot be published (a customer, a commercial term, an
internal path, a negotiation with another team) does not belong in the repo at all, and leaving it
out is what keeps the two from duplicating each other.

## Branch names

A branch name carries the domain noun of the work: `docs/app-docs-tree`,
`feat/desktop-panel-resize`, `fix/revoked-session-recovery`. Base is `develop`, not `main`.

A generated suffix on its own does not qualify — `claude/libs-modules-prep-c5e594` cannot be read
back later as what it did, and the branch name is what ties a merged PR to the work it came from
once the branch itself is gone.

## Working order

Agree, implement, review, then ship. The steps are small but the order is not decoration.

- **Before implementing**, the scope, the non-goals and how the change will be verified are
  settled. Not written down here necessarily — but if you cannot state them, that is the work to
  do first, not a step to skip.
- **Review before committing**, not after ([`dou-review`](./docs/config/skills/dou-review/SKILL.md)).
  A fix for a finding then lands in the same commit as the change it corrects instead of trailing
  behind it as "address review".
- **What was agreed shows up in the PR body** — `Changes` carries the why and the scope, and
  `To Reviewers` carries what was deliberately left alone. Where the change encodes a decision,
  `docs/adr/` carries it, in the same PR as the implementation.

## Result documents (plans, specs, review notes)

- An implementation plan, a review pass, or survey notes produced while working are working
  artifacts, not repo artifacts. They belong in the PR description (`Changes` / `To Reviewers`) or
  the agent's own session/plan file — never committed as a new file under `docs/`.
- The two durable homes for anything worth keeping past the PR are a module's own `README.md`
  (how it behaves now) and `docs/adr/` (why a decision was made and what it cost). If neither
  fits, it likely shouldn't be committed.
- If a module's `docs/<topic>/` grows too large to sit inside one module doc — a sub-topic has
  outgrown the README or become its own concern — split it into its own `docs/<topic>/` doc. This
  is just the existing "Module docs" split (README vs. `docs/<topic>/`) applied at the point it's
  actually needed.
