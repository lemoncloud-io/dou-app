# Pull requests

## Title

`[Category] English description`, e.g. `[Data] unify the doc canon and flatten the src/data layering`.
Category is the area in PascalCase (`Data` `Mobile` `Build` `Config` `Push` `Chat` `Auth` `Session` `Perf` `Web`
`Desktop` `Agents`); join several with `/`. Add `[x.y.z]` only when the PR ships as that release.

## Body

Short and self-contained: teammates cannot open a private artifact, so the body states the why, the change and
the evidence on its own, and links the HTML plan and verification report for the detail (anything over ~100
lines lives there).

Fill `.github/pull_request_template.md` in English; never the generic Summary / Test plan shape.

- **PR Types**: what honestly applies; several is normal.
- **Changes**: why first (a sentence or two on the problem), then bullets on what changed. Not the commit log.
  One subheading per decision (`### ADR-0NNN — …`) with background, decision and trade-off.
- **Verification**: the boxes, plus the commands run and what came back, in a code block. Link the HTML
  verification report.
- **To Reviewers**: what deserves attention — a decision that could have gone the other way, a project CI does
  not check and its hand-run output, what was deliberately left alone, follow-ups. Links to the plan page and
  the verification report go here.

## Opening it

`gh pr create --base develop --assignee @me --title … --body-file …`; the person who asked is the assignee.

## Evidence inline

The PR body shows the change, not only links to a private artifact.

- **One diagram**: a ` ```mermaid ` block in `Changes` with the structure or flow of the change. GitHub
  renders it.
- **Screenshots**: `node docs/config/skills/dou-ship/references/pr-assets.mjs --pr <number> <image>...` pushes
  them to the PR's own orphan branch `pr-assets/pr-<number>` (files at its root) and prints the Markdown image
  lines (`https://raw.githubusercontent.com/lemoncloud-io/dou-app/pr-assets/pr-<number>/<file>`). When the PR
  closes without merging, `.github/workflows/pr-assets-cleanup.yml` deletes the branch (`--pr <number> --remove`
  does the same by hand); a merged PR keeps it, so its body's images keep loading. Other `pr-assets/*`
  branches are never touched.
- **Fake data only.** The repository is public and a pushed image stays in git history after removal. Push only
  screenshots from fake-data runs — web-e2e, the fake shell, a component harness. Never a real account, a dev
  server's data, a device's home screen, or anything with a token, email, phone number or name of a real person.
  When in doubt, leave the screenshot in the private verification report.
