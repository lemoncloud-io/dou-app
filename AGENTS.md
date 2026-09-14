# Chatic

An Nx monorepo — four apps under `apps/`, seventeen libraries under `libs/`.

## Read a module's own docs before changing it

Every module keeps its own canon, maintained with the code rather than after it. Find it before you
edit, and prefer it over inference from the source.

- The canon is the module's `README.md`, or a `docs/` folder beside it. Where a module has both,
  `README.md` holds the overview and structure and `docs/<topic>/` holds the detail (ADR-0081).
- Some modules have neither yet. There is nothing to read in those.
- Decisions that cross modules live in `docs/adr/`.

## Writing a module's docs

- **Module docs are English.** That covers `libs/*` and `apps/*`, and any new doc under `docs/`.
- The shape is fixed: [docs/guides/module-docs-template.md](./docs/guides/module-docs-template.md).
  `libs/data` is the worked example; where it and the template disagree, the module wins.
- Write the present tense. A sentence that only makes sense if you know what the code used to do is
  a work log, and it does not belong in a module's canon.
- **`docs/adr/` is being retired.** Do not add new links into it from a module doc. When a module's
  behaviour needs a decision's reasoning, write that reasoning into the module doc.

## Verifying a change

- A library's type check is `tsc -b`. Inside a lib, `tsc --noEmit` checks zero files and succeeds, so
  passing it proves nothing.
- `.github/workflows/verify.yml` is the CI gate, and it names the projects it leaves out. Those are
  the ones to check by hand.
