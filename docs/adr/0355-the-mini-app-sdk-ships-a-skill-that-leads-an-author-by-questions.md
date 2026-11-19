# ADR-0355: The mini-app SDK ships a skill that leads an author by questions

> Status: Accepted · Decided: 2026-11-19 · Implemented: `feat/chatic-apps-sdk-skill`
> · Scope: `libs/chatic-apps-sdk/skill/` (new) · `libs/chatic-apps-sdk/docs/guide/` ·
> `libs/chatic-apps-devtools` (`bundle`)
> · The skill is [libs/chatic-apps-sdk/skill/SKILL.md](../../libs/chatic-apps-sdk/skill/SKILL.md)
> · Related: [ADR-0351](./0351-mini-app-dev-tools-are-a-package-beside-the-sdk-not-in-it.md), the
> verifier the skill ends with

## Context

Mini-app pages are expected to be written mostly by an author's AI assistant, and often for an author
who has never built a web page. The SDK already ships `AGENTS.md`, a list of rules for that assistant.
A list of rules tells an assistant what not to do; it does not tell it how to get from "make a quiz
mini-app" to a page that can be handed over. Left alone, an assistant writes code at once, guesses the
permissions, and declares the page done without checking it.

## Decision

**The SDK package ships one skill: a plain-markdown procedure, `skill/SKILL.md` with its Korean pair
`skill/SKILL.ko.md`, that leads the author through three stages by asking — the idea, the first build,
the release prep — and ends with a zip that passes `verify`.**

- **Questions before code.** One question at a time, in plain words, with two to four choices and a
  recommendation; nothing already answered is asked again. Each stage ends with a summary and the
  author's go-ahead.
- **A plan file is the state.** Stage 1 writes `MINIAPP.md` at the project's top: what the page does,
  its screens, what it asks the app for, and its progress. A conversation on another day reads it and
  carries on.
- **It carries its own starting files.** The skill writes the project's first files itself — the shape
  of the reference mini-app, with the package versions pinned — so it needs nothing beyond the SDK's
  published package to begin.
- **What it may do is narrow.** It edits files inside the project, installs the pinned starting packages
  once after saying what they are and asking, and runs the project's own scripts — `dev`, `build`,
  `verify` and `bundle`. It installs nothing else, makes no network requests of its own, and never
  uploads or submits; it stops at the zip and says submission is still being prepared.
- **The rules stay in one place.** The skill points at `AGENTS.md`, `README.md` and `GUIDE.md` and
  repeats none of them, so a rule changes in one file.
- **Packing is a command, not a script in the project.** `chatic-apps bundle` in the dev package writes
  the zip, so the skill's last step is one of two commands the dev package provides.
- **Plain markdown, shipped in `files`.** No assistant-specific syntax beyond a short front matter (`name`,
  `description`) that assistants which look for skills read and others ignore; the guide says how to copy it into
  a project. A copy does not update with the package, so the skill names the SDK version it was written
  for and tells the author when the installed one differs.

## Alternatives

- **More rules in `AGENTS.md`.** Rejected: rules do not order the work, and the gap is the order — ask,
  plan, build, verify.
- **A starter generator command.** Rejected: one more command to publish and keep, where the skill
  writing a handful of files does the same and the author sees each one.
- **Copy an existing mini-app as the starting point.** Kept as an option the skill takes when the author
  already has one; not required, because no starting project ships with the SDK.
- **Leave packing to a script in each project.** Rejected: the skill would have to write and maintain a
  zip writer in every project.

## Consequences

- The SDK package gains a `skill/` folder in its published files; its pair is held by the SDK's own
  pairing test, and `check-doc-korean` already exempts the SDK's `.ko.md` files.
- The skill names exact versions of the SDK and the dev package. A release of either updates the skill's
  version line and starting `package.json` in the same change.
- Until the SDK 0.3.0 and the dev package are on npm, the skill's first install cannot succeed for an
  author; it was walked with local packs of those exact versions.
- A person still has to walk the flow once; an assistant walking it proves the procedure is followable,
  not that it is clear to someone new.
