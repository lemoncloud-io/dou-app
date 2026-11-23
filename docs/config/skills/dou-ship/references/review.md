# Review

## What is reviewed

Everything not yet on `develop`: committed on this branch, staged, unstaged, untracked.

```bash
git fetch origin develop
git --no-pager diff --stat origin/develop
git --no-pager status --porcelain
```

## Gates

- `npx nx show projects --affected --base=origin/develop` names the projects; run lint, typecheck and test for
  those (`yarn gate` does it). A full `run-many` is not worth its wall-clock.
- Typecheck a lib with `tsc -b libs/<name>/tsconfig.json`; `tsc --noEmit` checks zero files there.
- Phantom type errors after a move or a dependency bump: `rm -rf` the stale `dist`/`out-tsc` and recheck.
- A new workspace lib dependency needs `nx sync`; CI does not catch a missed project reference.
- `apps/web` test files are outside `web:typecheck`; typecheck them with `tsc -p` and a scratch build-info file.
- After integrating parallel work, run the gate again: pieces that each pass can fail together.
- Read the exclusions in `.github/workflows/verify.yml` every time. An affected project on that list is run by
  hand and the PR says "CI does not check this project", pass or fail.

## What the reviewer checks

| Check          | Against                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| Architecture   | the touched modules' `README.md`/`docs/`: layer boundaries, shell contracts |
| Quality        | bugs, simpler ways, hidden side effects, missing tests for changed logic    |
| Docs, ADRs     | module docs current, ADR shaped and numbered, no working notes committed    |
| Public surface | English, no internal paths or private issue numbers, no secrets             |
| Branch name    | carries the domain noun of the work                                         |

Hand back one list in the session. A finding without a `file:line` is marked unverified. Do not commit a
review note as a file; what was applied goes in `Changes`, what was left alone goes in `To Reviewers`.
