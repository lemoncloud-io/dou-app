# ADR-0073: Retire automatic error reporting (`reportError`) and leave a single log entry for each error

> Status: Accepted · Decided: 2026-09-02
> Related: [ADR-0029](./0029-error-report-categorization-and-enrichment.md) (Superseded by this decision — its categorization, tagging, and context enrichment as a whole) · [ADR-0097](./0097-unified-logging-core-and-report-traceability.md) (its report-traceability enhancements are voided by this decision) · [ADR-0063](./0063-log-upload-source-port-and-native-charge-queue.md) (unsent queue, batch upload — the path that remains) · [ADR-0066](./0066-log-pipeline-collector-listener-split.md) (the place that foreshadowed "remove automatic error reporting" as a separate track)

## Context

There were two paths for an error to reach the server.

1. `logger.error(tag, msg, { error })` → unsent queue → the uploader `POST`s `/hello/report-bulk`
   on its cycle
2. `reportError(error, ctx)` → immediate `POST /hello/report` (`stereo: 'log'`, `save: true`,
   `silent: true`)

And **both land in the same store.** Looking at admin-v2's `STEREO_BY_KIND`, `error` and
`log-entry` both scrape the same `stereo=log` bucket and are only split apart client-side. In other
words, the difference between "report" and "log entry" was never storage location — only payload
shape.

More decisively, **call sites were already calling both.** Of 36 non-test call sites, 19 called
`logger.error` and then immediately called `reportError` right below it. The same event was being
stored twice, and the reason that pattern was written that way (ADR-0097 S1's "the entry survives
even if the report gets throttled") had already vanished once throttling was retired. And since
`silent: true`, there is no longer even a Slack-notification difference to set the two apart.

## Decision

Delete `reportError` and its assembly modules entirely. Errors survive as a single `logger.error`
entry.

- Deleted: `reportError` · `classifyReport` (`reportCategory.ts`) · `describeHttp`
  (`httpContext.ts`) · `collectCauses` (`errorCause.ts`) · the types `ErrorCategory`,
  `ErrorReportContext`, `ErrorReportPayload`.
- Kept: `reportIssue`. What remains is what the log pipeline cannot carry — user-written text, a
  Slack notification, a photo attachment — split out into `reportIssue.ts`.
- Kept: `sanitizeReportUrl` · `uploadLogBatch`.
- The path split is kept as a **message prefix** (`[window.onerror]`, `[resource-error]`,
  `[csp-violation]`, `[query]`, `[mutation]`, `[error-boundary]`, `[page-crash]`). Since admin
  groups by message (`groupReportLogs`), that is the remaining classification axis.
- Delayed reports (`page-crash`, native proxy transmission) merge into `ingestLogEntry` —
  `logger.error` stamps the timestamp at dispatch time, which would otherwise move an already-dead
  run's event onto this boot's timestamp.

## What is lost (an intentional loss)

The value of this decision is deduplication; the cost is payload. Spelled out below.

- **Categorization.** `script-error`, `resource-error`, `csp-violation`, `http-4xx`, `http-5xx`,
  `auth`, `network`, `react-render`, … and the `[app] <category>` title built from it. The
  replacement (message prefix) only separates channels and **cannot distinguish the nature of an
  error** — in particular, the split by HTTP status is gone.
- **The full picture of a failed request.** The method, URL, server-stated reason, and redacted
  request/response bodies that `describeHttp` used to fill in. The `→ METHOD URL` and `: reason`
  suffixes that used to attach to `message` disappear along with it, so **500s with completely
  different causes collapse in admin into one line: "Request failed with status code 500."**
- **The `error.cause` chain.** `collectCauses`. A wrapped error's `stack` points at the wrapping
  site, so when React wraps a render failure, the original origin drops out of the report entirely.
- **Immediate transport.** Per-event immediate `POST` becomes the uploader's next cycle (60
  seconds). Since ADR-0066 removed the error early-trigger, it is no longer pulled forward either,
  and it is subject to being dropped once the queue caps (500 entries / 512KB) are hit, and if the
  batch draws a 4xx the whole batch is discarded. **The delivery rate for the error right before a
  crash goes down.**

The structure can't simply be crammed into a log entry as-is: `toWireLogEntry` truncates `data`/
`error` into `WIRE_FIELD_CHAR_LIMIT` (2000-character) strings. If this becomes needed, revisiting
that cap is a prerequisite.

## Alternatives considered

- **Keep only the category** (leave `classifyReport` to pass `data.category`). A compromise that
  preserves admin's grouping axis while avoiding the wire cap problem. **Rejected** — we decided
  not to leave an intermediate state.
- **Keep assembly as a thin wrapper** (a single `logError()` that runs classify + describeHttp and
  puts the result in `data`). Preserves payload but still needs the wire cap fixed. **Rejected** —
  same reason.

## Known side effects

- This deletion **removed the sole production consumer of the still-uncommitted credential-expiry
  track.** The only place reading the marker set by `markStaleCredential`/`staleCredentialRoute`
  (`libs/http/src/error/credentialStale.ts`) was `classifyReport` (used to bucket an API Gateway
  IAM 403 arriving as a status-less `ERR_NETWORK` under `auth` instead of `network`), and that file
  and its regression test were deleted along with it. `ErrorClassification.refreshRoute` still has
  no consumer, so that track needs the credential-reissue path (`useRelayCredentialRefresh`) wired
  up before it can stand on its own.
- ADR-0029 is Superseded by this decision. The `ERROR_CATEGORIES` Set in `parseReportLog` and
  admin's `error`-kind filter remain **only to read records stored before retirement** — they are
  not written to anymore.
