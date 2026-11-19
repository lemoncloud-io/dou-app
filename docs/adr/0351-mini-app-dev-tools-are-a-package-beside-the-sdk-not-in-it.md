# ADR-0351: Mini-app dev tools are a package beside the SDK, not in it

> Status: Accepted · Decided: 2026-11-19 · Implemented: `feat/chatic-apps-sdk-devtools`
> · Scope: `libs/chatic-apps-devtools` (new) · `apps/chatic-apps-example` (new)
> · `apps/mobile/src/app/subWebView/chaticAppsSdkRuntime.contract.test.ts`
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
cloud change) without a phone, and the SDK has no test that runs a real page against the app's real host.

## Decision

**A development package, `libs/chatic-apps-devtools`, with one command and two subcommands — `check`
and `scenarios` — kept apart from the SDK. A reference mini-app, `apps/chatic-apps-example`, is what
both are proven on, and what the app's host conversation test runs.**

- **Outside the SDK.** The SDK keeps no runtime dependencies and exports only `.` and `./mock`. The tools
  need a bundler and a DOM (esbuild, jsdom), so they live in their own package that a page installs as a
  development dependency. What a page ships is still the SDK and nothing else.
- **A command, not a framework.** What ADR-0281 rejected was a framework that chooses the author's stack.
  These commands take any page that builds to static files and only read it or run it: `check` reads the
  manifest, the source and the bundle; `scenarios` runs the built bundle against the SDK's mock. They add
  nothing to the page and nothing to the SDK's surface.
- **No browser.** The scenario runner runs the page in jsdom, bundling its module scripts to one classic
  script with esbuild. It cannot see layout or the safe area; it can see every request on the wire, every
  error, and every listener and stream left behind, which is what breaks on phones. A browser engine
  would add a large download to every author's install for what this runner checks.
- **The reference mini-app is the fixture.** It uses each SDK feature once. The tools' tests break it on
  purpose — once per checker rule, and for each scenario a page commonly gets wrong — so a check that stops catching its case fails a
  test. The app's runtime contract suite builds it from its sources and runs it against the real page
  host and runtime bridge: a request the SDK renames breaks that test before a page on a phone does.
- **The bundle stops at a zip.** The reference mini-app builds to a zip of its build output. Uploading,
  review and hosting are not part of this decision.

## Alternatives

- **Put the tools in the SDK, as a `bin` or a `./devtools` export.** Rejected: a runtime library would
  carry a bundler and a DOM as dependencies, or an export a page could pull into its bundle, and every
  page's install would grow for a tool only its author runs.
- **Run the scenarios in a real browser (Playwright).** Rejected for now: a browser download per author
  for checks that do not need layout. A preview with a phone frame, which does, is a separate tool for later.
- **Rules as documentation only.** That is the state this replaces: the assistant that wrote the page
  is the one rereading the rules.
- **A host conversation test against a hand-written page.** Rejected: it would prove the SDK talks to the
  host, not that a page written to the guide does; the reference mini-app is that page.

## Consequences

- Two new projects. CI lints and typechecks both with the rest and tests the dev package; the example's `check` and
  `scenarios` targets build it and run the tools.
- `apps/mobile`'s runtime contract suite now depends on the dev package and reads the example's sources
  by path. A change to the example that breaks the host conversation shows there.
- The checker's code rules are patterns, not a parser: they can miss a violation written unusually, and
  they are the rules' second line, after the SDK's own guide.
- Publishing the dev package waits on the SDK's release path moving to CI publishing with provenance. A
  command run on authors' machines is a stronger target than a library if the publishing token leaks.
- Jest replaces `process` inside a test, so an unhandled rejection from a page fails the jest test
  itself; the command reports it as a scenario problem in plain Node.
