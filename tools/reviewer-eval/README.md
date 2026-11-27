# tools/reviewer-eval

**Measures how many known defects the `dou-reviewer` agent catches, and how many false alarms it raises on clean
changes.** Use it before and after a change to `REVIEW.md`, `.claude/agents/dou-reviewer.md` or the `dou-ship`
review reference, so a checklist edit is judged by recall rather than by how it reads.

## Cases

[`cases.json`](./cases.json) lists commits from `develop`:

- `defects`: a change that a later commit fixed or reverted (`fix`), with the defect written as the finding a
  reviewer should have raised (`expected`). The `REVIEW.md` items were written from the ones the reviewer missed,
  so their recall after a checklist change is in-sample.
- `holdout`: defects of the same kind that no checklist item was written from. Recall here is the honest test of a
  checklist change.
- `controls`: a change that no `fix` commit touched within 30 days.

`score` also splits the design defects by whether the checklist the run used cites their fix commit.

Add a defect when a fix or revert names a change that review should have stopped; look past the subject type too,
since a `feat` that reshapes a feature can be the fix. Write `expected` from the fix
commit, as the mechanism and the failure, not the patch. Keep new cases in `holdout` until a checklist item is
written from them.

## How a case is reviewed

`build` makes one repository per case under `$EVAL_ROOT/cases/<tag>/<id>/repo`. It fetches the change with 50
commits of history and copies in the harness files, so the fix commit and everything after the change are not in
it, even by hash:

- `origin/develop`: the change's parent plus one commit that lays the review harness of `EVAL_HARNESS_REF`
  (default `origin/develop`; `REVIEW.md`, `AGENTS.md`, agents, skills; project hooks removed) over it.
  `--review FILE` swaps in another `REVIEW.md`; `--node-modules` links the main checkout's `node_modules` in so
  the reviewer can run tests and probes, and `review` keeps its probe trees under the case directory. To try
  agent or skill edits, point `EVAL_HARNESS_REF` at a commit that holds them.
- the change's own branch name: that commit plus the change, with the original message.

`review` runs `claude -p --agent dou-reviewer` in each case repository and asks for three sections, which are the
stages scored: first pass, verification, final findings. `judge` grades each review with a second headless
`claude -p` run: for a defect, whether each expected finding appears at each stage; for a control, whether each final
finding is real, a false positive or a nit (it reads the code). `score` prints recall per stage and the control
verdicts.

```bash
export EVAL_ROOT=/path/outside/the/repo
python3 tools/reviewer-eval/eval.py build --tag before
python3 tools/reviewer-eval/eval.py review --tag before -j 4
python3 tools/reviewer-eval/eval.py judge --tag before -j 6
python3 tools/reviewer-eval/eval.py score --tag before
```

Runs use real model usage: about $1.50 of API-priced usage per reviewed case at the time of writing. Reviews and
judgements stay under `$EVAL_ROOT`, never in the repository. A run that ends on a usage-limit message is not saved, so rerunning `review` picks it up.

## Limits

- Without `build --node-modules` a case repository has no `node_modules`, so the reviewer reads code but cannot
  run tests or probes. With it, the main checkout's `node_modules` is linked in; it is today's install, not the
  one the change was written against, so a probe that fails for a missing export or version points at that first.
- The first-pass section is the reviewer's own account written at the end, not a snapshot taken mid-run.
- One run per case: a single miss or catch can flip on a rerun.
- The reviewer's tools are not sandboxed to the case repository. `score` names any run whose tool calls reached
  another case or this checkout, since a sibling case can hold another case's fix; treat its result as not clean.
