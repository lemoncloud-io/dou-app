# ADR-0291: The emoji pickers name each emoji from generated CLDR tables

> Status: Accepted · Decided: 2026-11-09 · Implemented: `feat/emoji-name-hint`
> · Scope: `apps/desktop-web` `EmojiPicker` and `src/locales/emoji/`, `apps/web` `EmojiPickerSheet` and
> `public/locales/*/emoji.json`, `scripts/generate-emoji-names.js`, `THIRD_PARTY_NOTICES.md`
> · Refines: [ADR-0093](./0093-web-emoji-reaction-and-thread.md) §7, whose picker had "no external emoji DB"

## Context

Both pickers show about 900 curated emoji as bare glyphs. Many are hard to tell apart at picker size
(the dozen smiling faces, the people with professions), and the buttons had no accessible name, so a
screen reader announced whatever it guessed from the glyph. People asked to see what an emoji is
before choosing it: on hover on desktop, on press-and-hold on mobile.

That needs a name for every curated emoji, in Korean and English, and the app had none. The
curation itself is hand-kept in two identical copies (`utils/emoji.ts` in each app), and ADR-0093
chose it partly to avoid depending on an emoji database.

## Decision

**Each emoji's name is its Unicode CLDR short name, in the app's language, from a generated
`emoji` i18n namespace.**

- **CLDR, not our own wording.** These are the names iOS, Android and macOS use for emoji search and
  VoiceOver, so the hint matches what people already see elsewhere, and both languages come from one
  reviewed source.
- **Fetched once by a script, not added as a dependency.** `scripts/generate-emoji-names.js`
  (`yarn generate:emoji-names`) reads `emojibase-data` — CLDR published as JSON per locale — from the
  npm CDN at a pinned version (18.0.0), keeps only the emoji the two curations offer, and writes the
  result into the repo. Nothing is fetched at run time and no package enters the lockfile.
- **A namespace of its own, keyed by the emoji.** `apps/web` serves it as
  `public/locales/{ko,en}/emoji.json` through its existing backend and loads it on first use without
  suspending. `apps/desktop-web` bundles `src/locales/emoji/{ko,en}.ts` beside its other inline
  resources. Keeping it out of `translation` keeps 900 generated entries out of the hand-kept bundle,
  its typing and its parity test.
- **Keys drop U+FE0F**, which is optional in how an emoji is typed, and both apps strip it the same way
  at lookup (`emojiNameKey`).
- **Tests are the gate.** Each app fails a test when a curated emoji has no name in either language,
  which is what tells someone editing a curation to rerun the script.
- **The licences travel with the data.** CLDR is under the Unicode License v3 and emojibase-data under
  MIT; both notices are in `THIRD_PARTY_NOTICES.md`, and the generated TS files name them in a header.
  The JSON files cannot carry a comment, so the notices file lists them.

The same names appear wherever a reaction is asked about: the mobile reactor sheet
(`ReactionDetailSheet`) names its open tab, and the desktop reaction chip's hint leads with the
emoji's name before the reactors.

ADR-0093 §7 still holds for the curation: which emoji the pickers offer is our choice, not a
database's. Only the names come from outside.

## Alternatives

- **Write the names by hand.** About 1,800 strings to write and keep consistent, worse than CLDR's
  reviewed wording, and different from what the OS calls the same emoji. Rejected.
- **Add `emojibase-data` as a dependency and import it at run time.** Brings ~1,900 emoji per locale
  into the bundle (or a fetch to a third-party CDN from the running app) to use 894, and a dependency
  bump could change names under a release without anyone regenerating anything. Rejected.
- **Put the names in the existing `translation` bundles.** The web's parity test and the desktop's
  typed bundle would carry 900 generated keys mixed with hand-written ones, and the web would download
  them at boot for a picker most sessions never open. Rejected.
- **A browser API for emoji names.** None exists. `Intl` has no emoji annotations.

## Consequences

- Changing either curation needs `yarn generate:emoji-names`, and the coverage tests fail until it is
  run. The script reads both curations, so an emoji added to only one still gets a name.
- Moving to a newer CLDR release is a version bump in the script and a rerun; the diff of the generated
  files is the review.
- Desktop carries about 50 KB of names in its main bundle, loaded at startup. Acceptable today; it can
  move to a lazy import if bundle size becomes a concern.
- The web downloads 28 KB per language the first time the picker opens, then keeps it in the same
  local cache as its other locale files.
- A third language means adding it to the script's `LOCALES` and to each app's resources; CLDR already
  has the names.
