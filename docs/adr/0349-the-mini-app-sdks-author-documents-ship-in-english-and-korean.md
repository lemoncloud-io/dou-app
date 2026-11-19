# ADR-0349: The mini app SDK's author documents ship in English and Korean

> Status: Accepted · Decided: 2026-11-19 · Implemented: `feat/chatic-apps-sdk-korean-docs`
> · Scope: `libs/chatic-apps-sdk/README.ko.md`, `docs/guide/README.ko.md`,
> `docs/guide/agent-rules.ko.md`, `src/docs.pairing.test.ts`, `vite.config.mts`, `package.publish.json`;
> `scripts/check-doc-korean.js`, `AGENTS.md` § Language
> · The module doc is [libs/chatic-apps-sdk docs](../../libs/chatic-apps-sdk/docs/README.md)

## Context

Everything written into this repository is in English, and `yarn check:doc-korean` fails on Korean
prose in any tracked markdown file. The rule has had two exceptions, both because the Korean in them
is not writing about the product: translation resources (`**/locales/**`, `**/i18n/**`), which are the
product's own words to its users, and `CHANGELOG.md`, which records what a release said at the time.

The mini app SDK ships three documents to people outside this team, on npm: the package `README.md`
(every call, limit and error), `GUIDE.md` (how to build a page) and `AGENTS.md` (the rules an AI tool
follows while writing one). DoU is a Korean product, and many of the people building mini apps for it
read Korean first and prompt their AI tools in Korean. An English-only reference leaves them
translating the limits and error codes themselves, or not reading them.

## Decision

1. **Each author document has a Korean translation beside it**, the English name plus `.ko.md`:
   `README.ko.md`, `docs/guide/README.ko.md` and `docs/guide/agent-rules.ko.md`, shipped as
   `README.ko.md`, `GUIDE.ko.md` and `AGENTS.ko.md`. A skill shipped later gets a `SKILL.ko.md` the same
   way.
2. **English is the canonical version.** The first line of each file points at the other, and the
   Korean one says to follow the English where they differ. Code blocks, identifiers, error codes and
   permission names are left in English in both.
3. **They change together.** A pull request that changes an English author document changes its
   Korean pair too. The SDK's own test (`src/docs.pairing.test.ts`) fails when a pair differs in its
   headings (count and levels) or its number of code blocks, or when either file loses its pointer line.
   Whether the translation is faithful is a reviewer's to judge; no check can.
4. **The language rule gets a third exception, as narrow as a path**: a `.ko.md` file inside
   `libs/chatic-apps-sdk/`. Korean prose anywhere else — a `.ko.md` in any other module included —
   still fails `check:doc-korean`. These are documents for the product's users, shipped with it, like
   the translation resources; they are not this team writing about its own work in Korean.
5. **The package ships them**: `package.publish.json` lists the three files in `files`, and the build
   copies them under their shipped names. `exports` is unchanged — a document is not an entry point.

## Consequences

- Every change to an SDK author document costs a translation in the same pull request. The pairing
  test catches a missing or added section, not a sentence translated wrongly or left stale.
- A Korean author reads the reference, the guide and the AI rules in Korean, and can hand
  `AGENTS.ko.md` to a tool that is prompted in Korean.
- The repository's language rule is no longer English-only without exception for documents, but the
  exception is a path, so whether a file is covered needs no judgement. `AGENTS.md` § Language names
  it beside the translation resources.
- The tests of `scripts/check-doc-korean.js` cover the exception and that Korean outside it still
  fails. They run with `scripts/jest.config.js`, which no CI job runs today.

## Alternatives considered

- **English only, as before.** It keeps one rule and one file, and keeps Korean authors out of the
  reference.
- **Korean only for author documents.** The English file is what the type comments, the ADRs and the
  contract tests are written against; making Korean the canonical version would put the reference in
  a different language from everything it describes.
- **Translations outside the repository** (a site, a wiki). They would drift from the package version
  a developer installed, and would not ship in `node_modules` beside the English files.
- **A per-file allow list in `check-doc-korean`.** The same effect today, but every new document would
  need an edit to the script; the `.ko.md` suffix inside one package says it once.
