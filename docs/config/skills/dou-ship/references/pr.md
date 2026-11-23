# Pull requests

## Title

`[Category] English description`, e.g. `[Data] unify the doc canon and flatten the src/data layering`.
Category is the area in PascalCase (`Data` `Mobile` `Build` `Config` `Push` `Chat` `Auth` `Session` `Perf` `Web`
`Desktop` `Agents`); join several with `/`. Add `[x.y.z]` only when the PR ships as that release.

## Body

Easy to read and self-contained: a person reading only the PR can tell what it is at a glance and why it is
safe, from the visuals and a short results table in the body itself. The HTML plan and verification report are
shown to the person in the session; the PR never depends on, or links, a claude.ai artifact. Anything long is
cut down to what a reviewer needs, not linked out.

Fill `.github/pull_request_template.md` in English; never the generic Summary / Test plan shape.

- **Visuals**, above `# PR Types`: the diagram and/or screenshots that say what the PR is (next section).
- **PR Types**: what honestly applies; several is normal.
- **Changes**: why first (a sentence or two on the problem), then bullets on what changed. Not the commit log.
  One subheading per decision (`### ADR-0NNN — …`) with background, decision and trade-off.
- **Verification**: the boxes, then a short report: a table of what changed and how each part was verified
  (command or scenario, result), and the commands' key output in a code block.
- **To Reviewers**: what deserves attention — a decision that could have gone the other way, a project CI does
  not check and its hand-run output, what was deliberately left alone, follow-ups.

## Opening it

`gh pr create --base develop --assignee @me --title … --body-file …`; the person who asked is the assignee.

## Visuals

Every PR body opens with the visuals that make it quick to read — a diagram, screenshots, or both:

- **A screen changed**: a screenshot of it, before and after side by side where the difference is the point.
  `node docs/config/skills/dou-ship/references/pr-assets.mjs --pr <number> <image>...` pushes the images to the
  PR's own orphan branch `pr-assets/pr-<number>` and prints the Markdown lines
  (`https://raw.githubusercontent.com/lemoncloud-io/dou-app/pr-assets/pr-<number>/<file>`); open the PR first,
  then `gh pr edit <number> --body-file …`. Take the screenshot from the single spec you ran (`evidence.shot`)
  or the fake shell / a component harness. Never name a file `web-e2e-*`: CI's e2e results replace those on
  every run. The branch also holds those CI screenshots and `pr-assets-cleanup.yml` handles it, so never run
  `--remove` on an open PR; other `pr-assets/*` branches are never touched.
- **Structure or flow changed** (any PR with more than one moving part, and every PR with no screen: CI,
  scripts, docs, a comment cleanup, a refactor): a ` ```mermaid ` block of what changed. GitHub renders it.
- **Results**: numbers that tell the story (files and lines removed, checks passed, a metric before and after)
  go in a Markdown table, never as an image of a terminal.

**Fake data only.** The repository is public and a pushed image stays in git history after removal. Push only
screenshots from fake-data runs (web-e2e and its evidence shots, the fake shell, a component harness). Never a
real account, a dev server's data, a device's home screen, or anything with a token, email, phone number or name
of a real person. When in doubt, use a diagram instead.
