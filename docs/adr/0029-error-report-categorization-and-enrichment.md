# ADR-0029: Categorising, tagging and enriching error reports

> Status: **Superseded by [ADR-0073](./0073-retire-automatic-error-reporting-in-favor-of-log-entries.md)** (2026-09-02) · Decided: 2026-07-24
>
> What this ADR built — the categories, the `[app] <category>` title, the HTTP context and the cause
> chain — was deleted along with `reportError`. Errors now survive only as `logger.error` entries. What
> follows is a record of how things were before that.

## Context

Production mobile (WKWebView) error reports are piling up in a state nobody can triage. Three real
collected examples all show the same problems.

- **Every title is `[mobile] error`** ([`common.ts:103`](../../libs/web-core/src/api/common.ts)). In a
  Slack alert or the admin report list, a script error and a network error look identical, so nothing is
  known until the report is opened.
- **`"Script error."` appears in a form nothing can be inferred from.** The global handler
  ([`app.tsx:22`](../../apps/web/src/app/app.tsx)) passes only `event.error ?? new Error(event.message)`,
  and a script exception judged cross-origin has `event.error === null`, so the message is literally
  `"Script error."` and the stack is a single `bundleURL:line:col` line. The original cause is
  unknowable. (In the examples the `url` and `stack` are all the same origin, `dou.chatic.io`, and were
  still erased as opaque → an exception thrown from a native injection script or a third-party context is
  possible, but the root cause is unconfirmed.)
- **The throttle key is `error.message` alone**
  ([`common.ts:16`](../../libs/web-core/src/api/common.ts)). Different causes collapsed into
  `"Script error."` share one bucket, so one per 60 seconds gets through and the rest are dropped
  silently — lost signal.
- **There is no breadcrumb of what came just before.** The ring buffer in
  [`libs/logger`](../../libs/logger/src/core/RingBuffer.ts) already exists and `reportIssue` attaches
  recent logs as `extras`, but `reportError` does not.
- **`ErrorEvent`'s `filename` / `lineno` / `colno` are thrown away.** The browser fills those three in
  separately even when the message is opaque, and the current handler discards them.

Constraints:

- Report assembly is concentrated in one place, `libs/web-core`
  ([`reportError()` / `reportIssue()`](../../libs/web-core/src/api/common.ts)). On the consuming side
  (admin-v2), `parseReportLog.ts`
  (`apps/admin-v2/src/app/features/report-logs/lib/parseReportLog.ts`) parses the bracketed title
  `[app] error`, and the payload is `[key: string]: unknown`, so new fields are consumed as they are.
- An HTTP-centric classifier, `classifyError()` (`libs/web-core/src/transport/error.ts`), already
  exists, but reports do not use it.

## Decision

Give error reports **a category based on origin and kind**, expose it in both the title and the payload,
improve capture for opaque errors, and enrich the context.

### In scope

1. **Six categories, by origin and kind** — separate from the HTTP-centric `classifyError`:

    | category                         | How it is decided                                                     |
    | -------------------------------- | --------------------------------------------------------------------- |
    | `script-error`                   | `event.error == null` in `window.onerror` (opaque, no stack)           |
    | `unhandled-rejection`            | The `unhandledrejection` path                                         |
    | `react-render`                   | An ErrorBoundary (a `componentStack` is present)                      |
    | `network`                        | ERR_NETWORK / offline / timeout (reusing `isNetworkError`)             |
    | `http-4xx` / `http-5xx` / `auth` | An HTTP status is present (reusing `classifyError`)                    |
    | `unknown`                        | Everything else                                                       |

2. **Expose the category in both the title and a payload field**
    - Title: `[mobile] error` becomes `[mobile] script-error`, so Slack and the list separate them at a
      glance.
    - Payload: add a structured `category` field (and `tags` where useful), so admin can filter and
      aggregate.
    - Extend admin-v2's `parseTitle` slightly to pull the category out of the new title format (the
      existing `/^error\b/` match stays, so old records keep working).

3. **Better capture for `Script error.`, plus a record of the investigation**
    - The global handler puts `ErrorEvent`'s `filename` / `lineno` / `colno` into the payload, so even an
      opaque error leaves a `bundle file:line:column` position (traceable to the original with source
      maps).
    - Investigate at the code level why `event.error === null` (the native injection script and
      third-party context hypotheses) and record the candidate causes in this ADR and the follow-up
      implementation document.

4. **Enrich the context (breadcrumbs)** — attach the tail of the ring buffer (the last N entries) plus
   the previous and current route to the `reportError` payload, consistent with `reportIssue`'s `extras`.

5. **A better throttle key** — change the dedupe key from `error.message` alone to `category` plus the
   message (or a stable fingerprint), so different opaque errors do not collapse into one bucket.

### Out of scope

- **Confirming the real root cause of `"Script error."`** (checking the native WKWebView injection
  script, applying `<script crossorigin>` plus CORS headers, and the source map upload and deploy
  pipeline) reaches into native and deployment, so it is **a separate spike**. This round goes as far as
  better capture and a list of candidate causes.
- **Reducing noise** (silencing, dropping or sampling transient `Network Error`s) is out of scope. (The
  better throttle key eases the signal loss somewhat.)
- **Improving console and local logger wording** is a separate axis from server reports and out of
  scope.

## Alternatives

- **Put the category in the payload only** — admin can filter, but the Slack title stays a blanket
  `[mobile] error` and triage does not improve. Rejected, since triage is the primary goal.
- **Put the category in the title string only** — admin has to parse it again, which makes filtering and
  aggregation weak. Rejected.
- **Use the existing `classifyError` values (authentication / network / server / client / unknown) as
  the category** — being HTTP-centric, it cannot tell apart front-end runtime origins like
  `script-error`, `unhandled-rejection` and `react-render`. Replaced by the six origin-based categories,
  while HTTP detection still reuses `classifyError` / `isNetworkError`.
- **Get to the root cause in this round** — the scope grows to native, CORS, source maps and the deploy
  pipeline, which delays the logging improvement. Better capture delivers value now, and verification is
  split into a spike.

## Consequences

**What is gained**

- In Slack and admin, the title alone separates the kinds of error → triage becomes possible.
- Even an opaque `Script error.` gives `filename:line:col` plus breadcrumbs plus the route, so "what
  happened just before, and where it blew up" is knowable.
- Category-based dedupe stops different causes from being smeared together, reducing lost signal.
- The admin payload has a flexible schema, so the consuming side barely changes (a small extension to the
  title parser).

**Trade-offs accepted**

- The title format changes, so admin's `parseTitle` has to be extended, and the old `[mobile] error`
  records coexist with the new format (eased by the backwards-compatible match).
- Sending breadcrumbs (a log tail) to the server increases the payload size and can expose sensitive
  data → the ring buffer's redaction has to apply, with a cap on the tail length.
- The root cause stays unresolved, so `script-error` is tagged but recovering the original stack is
  limited until the follow-up spike (crossorigin/CORS/source maps) is done.

## Next steps

This ADR feeds the spec phase (Phase A) of `dev-2_implement`. Separately, track
`the "Script error." root cause spike` (checking the native injection script, `<script crossorigin>`
plus CORS, source map deployment) as follow-up work.
