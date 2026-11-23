# Pull requests

## Title

`[Category] English description`, e.g. `[Data] unify the doc canon and flatten the src/data layering`.
Category is the area in PascalCase (`Data` `Mobile` `Build` `Config` `Push` `Chat` `Auth` `Session` `Perf` `Web`
`Desktop` `Agents`); join several with `/`. Add `[x.y.z]` only when the PR ships as that release.

## Body

Fill `.github/pull_request_template.md` in English; never the generic Summary / Test plan shape.

- **PR Types**: what honestly applies; several is normal.
- **Changes**: why first (a sentence or two on the problem), then bullets on what changed. Not the commit log.
  One subheading per decision (`### ADR-0NNN — …`) with background, decision and trade-off.
- **Verification**: the boxes, plus the commands run and what came back, in a code block. Link the HTML
  verification report.
- **To Reviewers**: what deserves attention — a decision that could have gone the other way, a project CI does
  not check and its hand-run output, what was deliberately left alone, follow-ups. Links to the plan page and
  the verification report go here.
