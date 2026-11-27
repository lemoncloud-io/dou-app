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

Diff-triggered questions: `node docs/config/skills/dou-ship/references/review-items.mjs` prints the `REVIEW.md`
items the diff fires, read from `origin/develop` so a PR cannot edit its own checklist. Each fired item is answered
with evidence or marked not applicable with the reason.

## Probes

The reviewer settles a behaviour suspicion by running it in a throwaway worktree. `probe-tree.mjs` snapshots the
reviewed tree (committed, staged, unstaged and untracked changes) into a commit outside every branch, checks it out
under the temp directory and links `node_modules` in. Files in the person's tree are never written; git records the
worktree until `--remove`, and a failed run removes it itself and prints nothing. Shell variables do not survive
between tool calls: run the block as one call, or paste the printed path into each later one.

```bash
tree=$(node docs/config/skills/dou-ship/references/probe-tree.mjs) && [ -d "$tree" ] || exit 1
cat > "${tree:?}/libs/data/src/repositories/startDm.probe.test.ts" <<'EOF'
...
EOF
(cd "${tree:?}" && node_modules/.bin/jest -c libs/data/jest.config.js --no-watchman startDm.probe)
node docs/config/skills/dou-ship/references/probe-tree.mjs --remove "${tree:?}"
```

- One probe per suspicion, at most three per review, each the smallest test that fails if the suspicion is right.
  Name it `*.probe.test.ts` beside the code so the project's jest config picks it up.
- Feed the input a real producer can send; a probe that mocks away the path it questions proves nothing.
- Also run the existing tests of the touched files once in the tree. They passed CI, so a failure there points
  at the environment first.
- The script refuses when more than 2,000 untracked files (or 50 MB) are not ignored; ignore or move them.
- Remove the tree when done, including after a failed test.

Rounds: one reviewer. Each new round gets the previous round's findings, what was applied, and any gate or test
failures since, so it checks the fixes instead of starting over.

Hand back one list in the session. A finding without a `file:line` is marked unverified. Do not commit a
review note as a file; what was applied goes in `Changes`, what was left alone goes in `To Reviewers`.
