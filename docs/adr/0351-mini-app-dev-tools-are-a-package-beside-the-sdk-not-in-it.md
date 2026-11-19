# ADR-0351: Mini-app dev tools are a package beside the SDK, not in it

> Status: Accepted · Decided: 2026-11-19 · Implemented: `feat/chatic-apps-sdk-devtools`
> · Scope: `libs/chatic-apps-devtools` (new)
> · The tools' own documentation is [libs/chatic-apps-devtools/README.md](../../libs/chatic-apps-devtools/README.md)
> · Related: [ADR-0281](./0281-sub-webview-pages-talk-through-chatic-apps-sdk-kept-beside-the-app.md),
> which rejected a CLI for the SDK; this record reopens that part and keeps the rest

## Context

ADR-0281 made `chatic-apps-sdk` the one library a mini-app page uses, and rejected "a framework (React
components, a CLI, a build step)": pages are written in whatever an author or an assistant picks, and a
framework would choose for them and grow the surface to review.

Since then the SDK has grown cloud data reads, a text send and a mock that answers with typed rows, and
pages are expected to be written mostly by authors' AI assistants. What such a page gets wrong is the
same short list every time — `localStorage`, the phone's theme, browser history for screens, a version
compared instead of a capability asked, an error's message branched on, a stream never stopped, the mock
left in the production bundle, a permission asked for and never used — and the only check today is a
person, or the assistant, rereading the rules. Neither the author nor the SDK's maintainers can run a
page through what the app will do to it (back, a close, a theme change, hiding, a refused consent, a
cloud change) without a phone.

## Decision

**A development package, `libs/chatic-apps-devtools`, kept apart from the SDK. An author sees one
command, `verify`, which runs a checker and a scenario runner — `check` and `scenarios`, kept as commands
of their own for CI — and explains the result in plain words. The reference mini-app they are proven on
lives outside this repository.**

- **Outside the SDK.** The SDK keeps no runtime dependencies and exports only `.` and `./mock`. The tools
  need a bundler and a DOM (esbuild, jsdom), so they live in their own package that a page installs as a
  development dependency. What a page ships is still the SDK and nothing else.
- **A command, not a framework.** What ADR-0281 rejected was a framework that chooses the author's stack.
  These commands take any page that builds to static files and only read it or run it: `check` reads the
  manifest, the source and the bundle; `scenarios` runs the built bundle against the SDK's mock. They add
  nothing to the page and nothing to the SDK's surface.
- **One command for the author.** Two commands and rule names are a lot for someone building their first
  page. `verify` runs both, folds what passed into one line per group, and gives one line per thing to fix
  — what is wrong, how to fix it, where — in English or Korean, following the system's language. It runs
  with no setup: without a scenario file it tries what needs no screens and says a scenario file adds the
  rest. It is called through the project's own script or the package's full name, never a bare
  `npx chatic-apps`, which outside the project would fetch whatever npm package owns that name.
- **No browser.** The scenario runner runs the page in jsdom, bundling its module scripts to one classic
  script with esbuild. It cannot see layout or the safe area; it can see every request on the wire, every
  error, and every listener and stream left behind, which is what breaks on phones. A browser engine
  would add a large download to every author's install for what this runner checks.
- **The reference mini-app is a project of its own, outside this repository.** It uses each SDK feature
  once and installs the SDK and the tools as packages, as an author's page does — so it shows the tools
  working from the outside, not through the workspace's paths. Its tests break it on purpose, once per
  checker rule and for each scenario a page commonly gets wrong, so a check that stops catching its case
  fails there. It builds to a zip of its build output; uploading, review and hosting are not part of this
  decision.
- **No page in this repository, and no automated test of pages here.** An author may build and check a
  page entirely on their own machine and never open a pull request anywhere, so the check that matters is
  the one they run: `verify`. The SDK's agreement with the app stays covered by the two existing contract
  suites in `apps/mobile`.

## Alternatives

- **Put the tools in the SDK, as a `bin` or a `./devtools` export.** Rejected: a runtime library would
  carry a bundler and a DOM as dependencies, or an export a page could pull into its bundle, and every
  page's install would grow for a tool only its author runs.
- **Run the scenarios in a real browser (Playwright).** Rejected for now: a browser download per author
  for checks that do not need layout. A preview with a phone frame, which does, is a separate tool for later.
- **Rules as documentation only.** That is the state this replaces: the assistant that wrote the page
  is the one rereading the rules.
- **Keep the reference mini-app in this repository**, as an app the tools' tests read by path. Tried
  first, then moved out by the maintainers'
  decision: a page inside the workspace imports the SDK by the workspace's name and leans on its build
  setup, which is not what an author's page looks like.

## Consequences

- One new project. CI lints, typechecks and tests it with the rest; its own tests cover what needs no page.
- A change to the tools is proven on the reference mini-app only when that project takes the new build:
  CI here does not run it. A change to the SDK's request names is still caught by the existing contract
  suites, not by a page.
- The checker's code rules are patterns, not a parser: they can miss a violation written unusually, and
  they are the rules' second line, after the SDK's own guide.
- Publishing the dev package waits on the SDK's release path moving to CI publishing with provenance. A
  command run on authors' machines is a stronger target than a library if the publishing token leaks.
- A test runner takes an unhandled rejection from a page for itself, so that case is shown through the
  command in plain Node, not through a test.
