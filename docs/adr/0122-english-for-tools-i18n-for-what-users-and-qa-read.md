# ADR-0122: English for tools; i18n for what users and QA read

> Status: Accepted · Decided: 2026-09-28
> · Scope: every non-comment string literal outside `**/locales/**` and `**/i18n/**` — `apps/web` (debug
> panel and product features), `apps/desktop-web`, `apps/admin-v2`, `apps/testbed`, `apps/mobile`,
> `apps/block-kit-builder`, `libs/config/src/registry`, `libs/shared`, `libs/http`, `libs/bridges`,
> `libs/block-kit`, `libs/web-ui-kit`, `scripts/`
> · Amends: [ADR-0080](./0080-debug-panel-shared-model-and-stage-visibility.md) Decision 3 and Delta ③ (the
> debug panel's language) · [ADR-0079](./0079-config-registry-and-lane-resolver.md) (the registry's
> `title`/`description` language)

## Context

AGENTS.md already settles that everything written _about_ the product is in English, and two gates
enforce it for markdown and for source comments. Neither gate looks at code outside a comment, so
about 1,470 lines of Korean survived there, in three roles that need different answers:

- **Words for developers and operators.** Thrown `Error` messages, log lines, the config registry's
  `title`/`description`, the admin-v2 console, the testbed, the Block Kit builder, CLI output from
  `scripts/`.
- **Words for end users, hardcoded.** The error and 404 screens in `libs/shared`, the "View more"
  toggle on folded code blocks in `libs/block-kit`, onboarding copy chosen by an `isKorean ? … : …`
  fork, a toast in `configPortCallbacks`. These showed Korean to an English reader regardless of the
  language they had picked.
- **The web debug panel.** It is a developer tool, but its daily readers include QA, who work in
  Korean. ADR-0080 Decision 3 fixed it to Korean for that reason. Its own Delta ③ records that the
  implementation had already moved away from that: panel chrome and screen names live in a typed
  `ko`/`en` table that follows the app language, while screen bodies stayed hardcoded Korean. So an
  English device showed an English header over Korean content.

ADR-0079 wrote the registry's `title`/`description` in Korean, following Decision 3.

## Decision

1. **Developer- and operator-facing text is English.** That covers registry `title`/`description`,
   admin-v2, testbed, block-kit-builder, desktop-web's debug pages, scripts, and every thrown or
   logged message, including those inside the debug panel.
2. **The web debug panel is bilingual end to end.** Every word a screen renders goes in a `ko`/`en`
   table under `features/debug/i18n/`, next to the chrome table that was already there. Each screen
   has its own table (`i18n/screens/<Screen>.ts`), and the words shared across screens are in
   `shared.ts`. All of them are built with one helper, `defineDebugStrings`. `ko` is typed as
   `typeof en`, so a key missing from either table fails to compile. The tables stay bundled rather
   than fetched, for the reason ADR-0080 gave: the panel has to work when boot is broken. Korean
   remains the fallback language.
3. **End-user copy goes through the i18n of the app that shows it.** In an app, that means a `t()` key
   with an entry in every locale file. A shared lib does not take on an i18n system of its own:
    - `libs/shared` already calls `useTranslation()` in `VersionUpdateBanner`, so its error screens
      now read `error.screen.*` the same way. Every lookup carries an English `defaultValue` and
      the hook does not suspend, because these screens also render when the `/locales` request
      itself has failed.
    - `libs/block-kit` has no i18n and its three callers each translate differently. So
      `BlockKitMessage` takes a `labels` prop, the callers pass their translated words in, and any
      word they leave out renders in English.
4. **Left alone on purpose:**
    - Translation tables outside the `**/locales/**` and `**/i18n/**` paths that AGENTS.md names:
      a `ko` table beside an `en` one such as desktop's `menuLabels.ts`, `policy-content/*/ko.ts`,
      and the iOS notification extension's `ko.json`. Their paths fall outside the exception, but
      their Korean is the product's copy to Korean readers, which is what the exception protects.
      The debug panel's tables now sit under `i18n/`, inside it.
    - Language endonyms (`한국어`).
    - Korean that exists to be matched: Hangul regexes, and substrings of text a server or the OS
      produces.
    - Test and story files, except where an assertion quotes a string that changed.

## Consequences

- The debug panel reads in one language again, whichever the app is set to. The cost is a table
  entry in two languages for every string a new screen shows. That is the same cost the chrome
  table already charged, now charged for the body too.
- Debug screen tests pin the language with `setDebugLanguageForTests('en')` and assert English.
  Otherwise they would inherit the Korean fallback, because i18next is not initialised under jest.
- desktop-web's debug pages are English only. They have no QA audience of their own, and nothing
  there asked for a second language.
- The inference in `ErrorFallback` still matches Korean substrings (`연결`, `인증`, …). The thrown
  `Error` it classifies is not always ours, and a Korean-speaking backend can pass its message
  straight through. Bare English words such as `token` or `server` are deliberately not matched,
  because ordinary crashes contain them.
- There is still no gate for Korean in non-comment code. A gate would need an allowlist for the
  left-alone cases above, and that allowlist would be larger than the problem it guards. So this
  decision is enforced in review, not in CI.
