# Chatic

An Nx monorepo — four apps under `apps/`, seventeen libraries under `libs/`.

## Read a module's own docs before changing it

Every module keeps its own canon, maintained with the code rather than after it. Find it before you
edit, and prefer it over inference from the source.

- The canon is the module's `README.md`, or a `docs/` folder beside it. Where a module has both,
  `README.md` holds the overview and structure and `docs/<topic>/` holds the detail (ADR-0081).
- Some modules have neither yet. There is nothing to read in those.
- Decisions that cross modules live in `docs/adr/`.

## Verifying a change

- A library's type check is `tsc -b`. Inside a lib, `tsc --noEmit` checks zero files and succeeds, so
  passing it proves nothing.
- `.github/workflows/verify.yml` is the CI gate, and it names the projects it leaves out. Those are
  the ones to check by hand.
