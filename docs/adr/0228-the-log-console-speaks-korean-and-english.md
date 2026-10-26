# ADR-0228: The log console speaks Korean and English

> Status: Accepted · Decided: 2026-10-26
> · Scope: `apps/admin-v2/src/app/i18n/**` · `apps/admin-v2/src/app/features/report-logs/**` ·
> `apps/admin-v2/src/app/layout/**`
> · Amends: [ADR-0122](./0122-english-for-tools-i18n-for-what-users-and-qa-read.md) decision 1, for
> admin-v2's log console and its top nav. The rest of admin-v2 stays English under that decision.
> · The module doc is [apps/admin-v2/docs/i18n](../../apps/admin-v2/docs/i18n/README.md)

## Context

ADR-0122 put admin-v2 in English on the reasoning that it is a tool for developers and operators.
The log console has since gained readers that reasoning did not picture: planning, operations and
support use it to follow up a user's complaint, watch errors, read issue reports and check the
numbers. They work in Korean, and the console was showing them English copy wrapped around
developer identifiers (runId, cid, stage codes, raw tags).

The same change reorganised the console into five tabs by purpose. Rewriting the copy for these
readers and keeping it English-only would have meant writing it twice later.

## Decision

1. **The log console and the app's top nav are bilingual, Korean and English.** Korean is the
   default, even on a browser set to English. The people who read this console daily work in
   Korean, and a browser's language is not a request for an English console.
2. **The viewer's choice is stored in this browser's storage, never in the URL.** A link someone
   shares carries the screen, not the sender's language.
3. **One i18next instance of the app's own, with bundled resources.** It uses the same libraries as
   `apps/web` (`i18next`, `react-i18next`). It does not use their HTTP backend or language detector.
   Resources are TypeScript files under `apps/admin-v2/src/app/i18n/locales/{ko,en}/`, one per
   namespace. Each English file is typed as its Korean twin, and a test checks both languages key by
   key, including interpolation slots and the event-name maps.
4. **What is translated:** screen copy, buttons, empty states, errors, tooltips, the display names
   of log areas and statistics, and date and number formats. Times are always shown in Korean time
   with the zone named. **Not translated:** log content (message, data) and raw tags. These are the
   app's diagnostic text and what an engineer searches for.

## Consequences

- Every new string in the console costs an entry in two languages, the same cost the web debug
  panel pays under ADR-0122.
- Specs that assert English copy pin the language to `en` first. The default is Korean, and there is
  no "keys as text" mock as in `apps/web`'s tests.
- The other admin-v2 screens (socket lab, memberships, cloud deployments, users) are still English
  inside a nav that may be Korean. Moving them is per-screen work, to be done when their readers ask
  for it.
- English remains a complete second language, not a fallback.
