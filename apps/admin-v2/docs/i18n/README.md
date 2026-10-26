# i18n

**The console's two languages, Korean (default) and English, and where their words live.** Code:
`apps/admin-v2/src/app/i18n/`. Today the log console and the top nav are translated; the other
screens are still English-only.

## How it works

- **A dedicated `i18next` instance** (`i18n/index.ts`), not the global one, with resources bundled in
  the build. `t()` is ready on the first render, and a test only has to import the module. Components
  call `useT(namespace)`, which returns `t` and the language as `'ko' | 'en'`.
- **Korean is the default, whatever the browser says.** The console's daily readers work in Korean.
- **The choice is the viewer's**: switched from the top nav, written in each language's own name,
  stored in this browser under `admin-v2.language`, and never put in the URL, so a shared link opens
  in the reader's language. If storage is unavailable the switch still works for the visit.
- **One file per namespace per language** under `i18n/locales/{ko,en}/`: `common` (nav, page header,
  periods, shared states), `user`, `errors`, `reports`, `stats`, `allLogs`, and `events` — display
  names of log areas and statistics tags. `events` is a plain map rather than i18next keys because
  tags contain dots, which i18next reads as nesting.
- **The two languages cannot drift.** Each English file is typed as its Korean twin, so a missing or
  extra key fails to compile, and `i18n/locales.spec.ts` checks both languages key by key, including
  the interpolation slots, the event maps, and that no string is empty.

## What is and is not translated

Translated: screen copy, buttons, empty states, errors, tooltips, area and statistic names, and the
formats of dates, durations and numbers (`features/report-logs/lib/timeFormat.ts`, built on `Intl`).
Every absolute time is shown in Korean time and says `KST`, in either language.

Not translated: log content (`message`, `data`), raw tags and other values from records, and level
words such as `error`, which are values rather than copy.

## Writing copy

- Korean in the friendly "~요" register, short, in words a non-engineer uses ("앱 사용", not
  "run"). English plain and complete — it is a second language, not a fallback.
- Avoid i18next plural suffixes: a count that has to read as a word pair gets two keys chosen in code.
- A formatted number goes in as `{{n}}` (a string); `{{count}}` is reserved for real numbers.
- Specs that assert copy pin the language first (`i18n.changeLanguage('en')`); there is no
  keys-as-text mock.
