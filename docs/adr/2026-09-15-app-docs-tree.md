# ADR: one shape for app documentation trees, and a machine-checked `feature/`

> Status: Accepted · Decided: 2026-09-15
> Scope: `apps/web/docs/**` · `apps/web/README.md` · `apps/mobile/docs/**` · `apps/mobile/README.md` ·
> `AGENTS.md`
> Related: [ADR-0100](./0100-libs-data-doc-canon-and-layer-flattening.md) (the `libs/*` doc canon
> this borrows its shape from)

## Context

PR #459 added documentation for both client apps in a day. The content was good; the placement was
not, and three things were wrong at once.

**The tree had three shapes.** `libs/*` used `docs/<topic>/README.md`, `apps/web` used
`docs/<category>/<name>/`, and `apps/mobile` was flat — fifteen topic files directly under `docs/`.
Nothing said which was right, so the next app would have invented a fourth.

**`apps/web/docs/architecture/` was defined by what it was not.** Nine topics that no single feature
owned: routing, theme, stores, data flow, the native bridge, logging, layout, the debug panel,
directory placement. A reader asking "does my document belong here?" could not answer it from the
name, and neither could a writer. Meanwhile `directory-structure.md` and the folder's own
`README.md` were two halves of one question — where a new file goes, and what it may import — split
across two files that each referred to the other.

**`docs/feature/` had drifted from the code.** `appUpdate` and `search` were feature folders with no
documentation. `feature/notifications/` was documentation with no feature folder — the code it
describes lives in `app/bridge/navigation/`. Nothing caught either, because nothing checked.

Separately, 31 of the web feature documents ran to 6,856 lines, a large share of it directory trees,
component inventories and diagrams that restated the prose beside them.

## Decision

### 1. One tree shape, stated in `AGENTS.md`

Every category folder has a `README.md`; a category name must answer "does this document belong
here?" on its own; depth stops at `docs/<category>/<topic>.md`; no topic files sit directly under
`docs/`. This is the shape `libs/*` already had, written down so it is inherited rather than
re-derived — including by the three shells that have no documents yet (`desktop`, `desktop-web`,
`block-kit-builder`).

### 2. `architecture/` is dissolved, not renamed

Its nine topics move into four categories named after questions a document can be tested against:
`shell/` (the frame every screen renders into), `state/` (how data reaches a screen), `bridge/` (the
seam to the native shell) and `observability/` (looking into a running app). `apps/mobile`'s flat
files become seven of the same kind.

`architecture/README.md` and `architecture/directory-structure.md` merge into `apps/web/docs/README.md`,
which is now both the layering contract and the category index.

A name that means "crosses more than one feature" is explicitly listed alongside `misc` and `common`
as one that is not used. The cost is that the rejected name is the obvious one, and someone will
propose it again; the rule exists to be pointed at when they do.

### 3. `feature/` is checked by `diff`, not by review

`apps/web/docs/feature/<name>/` exists when and only when `apps/web/src/app/features/<name>/` does,
with names matching exactly. Two documents were written (`appUpdate`, `search`) and
`feature/notifications/` moved into `docs/bridge/` as `push-navigation.md` and `device-token.md`.

The value is that the rule is now a command rather than a habit:

```bash
diff <(ls apps/web/src/app/features) <(ls apps/web/docs/feature)   # must print nothing
```

This is what fixes the failure that produced the drift. Nobody decided not to document `search`;
there was simply nothing to notice.

### 4. Feature documents are compressed against one question

Per paragraph: **can the reader learn this by opening the code?** If yes it goes — component lists,
directory trees, code quotations, signature tables, step-by-step retellings of a flow. If no it
stays — contracts, boundaries, reasons, and the traps that were bought with production bugs.

Two qualifications carry the weight. A paragraph carrying a fact that is *not* in the code — a
reason, a trap, a history — is moved into a paragraph that stays before it is removed; if there is
nowhere to move it, it was never removable. And a `grep` or `diff` that checks a rule is not a
retelling of code: it is the rule, machine-checkable, and those were kept and extended.

No line budget is set. A document that passes the test at 300 lines is 300 lines.

## Alternatives

**Keep `architecture/` and write down what belongs in it.** Rejected: the definition would have had
to be "topics no feature owns", which is the negative definition that made the folder unanswerable
in the first place. A rule that has to be memorised instead of read off the name is the failure, not
the absence of the rule.

**Rename `architecture/` to `core/` or `platform/`.** Rejected for the same reason one level up. The
nine topics are genuinely four subjects; one name for all of them would have been a better-sounding
version of the same problem.

**Name `docs/feature/` after products rather than code directories.** Rejected because it gives up
the `diff`. A human-facing name reads better and drifts silently; `appUpdate` is ugly and cannot.

**Let `feature/notifications/` stay as an exception.** Rejected: one documented exception makes the
gate advisory, and an advisory gate is how this drift started.

## Consequences

The two apps read the same way, the three empty shells inherit the shape, and `feature/` drift is
now caught by a command in CI's reach rather than by whoever happens to look.

Feature documentation dropped from 6,856 to 5,385 lines with no fact removed — each compression
commit records which paragraphs were moved and where, because that record is the only way a reviewer
can check the "move before you delete" rule was followed.

What this costs:

- **Links from outside the two apps are now stale.** `libs/logger/docs/perf/README.md` and
  `docs/infra/deep-linking/README.md` point at `apps/mobile/docs/` paths that moved, and several
  ADRs reference `apps/web/docs/architecture/`. The ADRs are records of their own moment and are
  left alone; the two live documents are outside this lane's scope and need a follow-up.
- **`git log` on a moved document needs `--follow`.** Every move used `git mv`, so the history is
  intact, but the default log on a new path is not.
- **The compression is a judgement, not a rule that can be re-run.** Its record is the commit
  bodies. A later reader who disagrees with one call has the deleted text in history and the reason
  in the commit that removed it.
