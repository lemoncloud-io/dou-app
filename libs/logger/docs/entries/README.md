# entries — the contract a call site writes against

> Overview in the [lib README](../../README.md) · Canonical code:
> [core/types.ts](../../src/core/types.ts) · [core/tags.ts](../../src/core/tags.ts) ·
> [core/logContext.ts](../../src/core/logContext.ts) · [core/logId.ts](../../src/core/logId.ts)

`LogEntry` is the one shape every runtime converges on. Web JS, React Native TS and Kotlin/Swift all
produce it, the bridge carries it without rewriting it, and the server stores it. This document is
what the shape means and what a call site is allowed to put in it.

It is not the list of situations that deserve an entry. That catalogue is canonical in the knowledge
vault (`projects/@lemoncloud-io/dou-app/log-collection/triggers.md`); what lives here is the shape
the catalogue's rows are written in.

## Layout

```text
core/
  types.ts        LogEntry · LogContext · LogLevel · LogOrigin · LogErrorOptions · Logger · LogListener
  tags.ts         KNOWN_LOG_TAGS (41) · LogTag · isKnownLogTag
  logContext.ts   LOG_CONTEXT_FIELDS · pickLogContext
  logId.ts        createLogId
  observation.ts  ObservationKind · ObservationData — see docs/observations/
  LogHub.ts · CoreLogger.ts   the engine — see docs/pipeline/
```

## The entry

```ts
interface LogEntry extends LogContext {
    id?: string;
    level: LogLevel; // 'debug' | 'info' | 'warn' | 'error'
    tag: LogTag;
    message: string;
    data?: unknown;
    error?: unknown;
    timestamp: number;
    source?: LogOrigin; // 'web' | 'native'
}
```

Only `level`, `tag`, `message` and `timestamp` are required, and the pipeline fills `id` and the
context itself. Everything else is optional because the server declares every field optional too and
stores whatever arrives — it will not reject a malformed entry, it will keep it. That puts the whole
contract on the client, and specifically on the wire mapper; see
[docs/redaction/](../redaction/README.md#the-three-output-shapes).

**`id` is the server's dedup key and the key a host acknowledges by.** It is a UUID v4 issued at
dispatch, not at flush, so it stays stable across retries of the same entry: a resend upserts the
same stored document instead of piling up copies. An entry that somehow has no `id` can be uploaded
but never released from the queue, so it would ship on every cycle forever — which is why both
`CoreLogger.ingest` and `LogUploadQueue.restore` mint one when it is missing rather than drop the
entry.

`createLogId` implements UUID v4 by hand. This package imports nothing, so the workspace's `uuid` is
not reachable; it probes `crypto.randomUUID`, then `crypto.getRandomValues`, then `Math.random`,
because React Native's Hermes and older WebViews ship neither of the first two reliably, and some
WebViews expose `randomUUID` but reject it outside a secure context.

**`source` is a label, never a branch.** It is set only when an entry crossed a runtime boundary, so
its absence means "born here". Nothing in the pipeline switches on it.

## Occurrence-time context

Ten fields ride on every entry, captured when the entry is dispatched.

| Field        | What it is                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| `runId`      | App-run (process) identifier — the primary axis for exploring stored logs  |
| `uid`        | User id, guest or signed-in                                                |
| `cid`        | Cloud id                                                                   |
| `sid`        | Site id                                                                    |
| `appVersion` | Native app version                                                         |
| `webVersion` | Web bundle version — deployed independently of the app, so a separate axis |
| `route`      | The screen at the time of the log                                          |
| `os`         | Device OS                                                                  |
| `osVersion`  | Device OS version                                                          |
| `model`      | Device model name                                                          |

**They are stamped at dispatch and never at send.** A queue that survives a logout, a cloud switch
or an app update and drains days later would otherwise label every entry it holds with the values
current at upload time — pre-login entries with the logged-in `uid`, pre-switch entries with the new
`cid`, pre-update entries with the new version. The same reasoning is why `ingestLogEntry` does not
restamp: an entry that crossed a boundary already carries the context of where it happened.

The host supplies them through `setLogContextProvider`, which the core calls on every dispatch. A
provider that throws is caught and treated as absent — a broken provider must never take logging
down with it.

`route` is why there are no navigation records. Every entry carries the screen it happened on, so
the trail is reconstructible without a second kind of entry.

**The list of fields exists twice on purpose, and the compiler keeps the copies in step.**
`LOG_CONTEXT_FIELDS` is derived from `Record<keyof LogContext, true>`, so a field added to the
interface and forgotten in the map does not compile, and a field in the map that is not on the
interface does not either. `pickLogContext` then copies the tuple as an allowlist wherever a mapper
needs it. Before that, the tuple was spelled out in five places — the wire type, the wire mapper,
`AppLogInfo`, and both directions of the bridge codec — and adding a field broke nothing: it just
vanished at whichever hop was missed.

`pickLogContext` drops absent fields rather than passing `undefined` through, so a payload never
gains a `route: undefined` it never had.

## Levels

`debug` · `info` · `warn` · `error`. The hub passes all four to every listener; the level decides
what each listener does with it, not whether it is published.

- **`debug` lives exactly where someone is watching.** In a release build nothing can read it — the console is not running and Crashlytics discards it — so the store does not accept it either. In every other build it is a first-class citizen: printed, relayed, stored, and visible in the debug monitor. The decision comes from one host flag (`import.meta.env.DEV` on the web, `__DEV__` in the app), so console, relay and storage cannot disagree about what "this build is being watched" means.
- **`info` is for things worth seeing on the server even when nothing failed.** Performance metrics are `info` (see [docs/perf/](../perf/README.md)), and so are the shape observations.
- **`warn` and `error` are what the admin console filters on.** The server hoists `level`, `runId`, `uid`, `sid` and `cid` out of the entry to make them queryable, and those plus a date range are the whole set of axes. Not tag, not message, not a value inside the payload — which is why a verdict the client took has to land on the level it wants to be findable under.

A call site that fires on every request or every frame does not use `warn`. See
[docs/observations/](../observations/README.md#aggregate-rather-than-repeat) for what to do instead.

## Tags

```ts
type LogTag = KnownLogTag | (string & {});
```

**The open half is load-bearing, not laziness.** ADR-0097 replaced a closed union with a plain
`string` for two reasons that still hold: a native shell older than the web bundle can send a tag
this build has never heard of, and it must cross the bridge unrewritten; and the server does not
validate the value either. Closing the union would reverse that.

**The literal half is what makes a typo visible.** With a bare `string` every layer accepts a
misspelling in silence — which is how `PUSH` (a tag the catalogue does not have) and a cloud tag
split between `CLOUD` and `APP` both survived until somebody diffed the catalogue by hand.
`string & {}` rather than plain `string` keeps the literals from being widened away, so the editor
still suggests them.

`KNOWN_LOG_TAGS` holds 41 tags, grouped as the catalogue groups them.

| Group               | Tags                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global · runtime    | `GLOBAL` `APP` `ROUTER` `PERF` `WEB_VITALS` `I18N`                                                                                                        |
| Transport           | `NET` `SOCKET` `SYNC` `BRIDGE`                                                                                                                            |
| Web domains         | `AUTH` `ACCOUNT` `CHAT` `CHANNEL` `CLOUD` `PLACE` `PROFILE` `INVITE` `SEARCH` `IAP` `FEEDBACK`                                                            |
| Storage             | `CACHE` `STORAGE` `SQLITE` `PREFERENCE` `LOG_BUFFER`                                                                                                      |
| Native capabilities | `WEBVIEW` `NOTIFICATION` `PUSH_EVENT` `DEEPLINK` `UPLOAD` `FILE` `DEVICE` `PERMISSION` `CLIPBOARD` `SMS` `OAUTH` `APP_ICON` `VERSION` `FIREBASE` `UNFURL` |

**This constant mirrors the catalogue and is not itself the source of truth.** When the vault table
changes, this follows — never the other way round. `isKnownLogTag` answers whether a string is on the
list, for diagnostics and tests; it is never a runtime gate.

Tags deliberately **not** on the list, recorded as a gap for the next catalogue pass rather than
added here: `SESSION` and `WEB_CORE`, used by the shared libraries, and the one-offs
`GLOBAL_LOADER`, `SETUP` and `TOKEN_GENERATOR`. `ERROR_REPORT` and `ISSUE_REPORT` are historical —
the automatic error report was retired in ADR-0073 — and `TEST`-shaped tags are fixtures. All of
them still compile.

**Do not invent a tag for a cross-cutting concern.** A `DIVERGE` tag would split "everything about
badges" across two tags. The domain tag stays, and the family is named by `data.observation`.

## The third argument

Every level takes the same third argument, and it means the same thing at each.

```ts
interface LogErrorOptions {
    error?: unknown;
    data?: unknown;
}
```

```ts
logger.info('CHAT', 'room opened', { channelId }); // a payload — lands on entry.data
logger.warn('SYNC', 'delta failed', { error, data: { since } }); // both fields, unwrapped
logger.error('NET', 'request failed', err); // error's shorthand — lands on entry.error
```

`CoreLogger` normalizes it: a value carrying `error` or `data` is read as the options object and
split into the entry's own fields; anything else is the payload, except at `error`, where a bare
value is the exception.

This used to be `error`'s signature alone, and the other three took a bare `data?: unknown` — which
accepts the same shape, silently, and then stores it whole. `logger.warn(tag, msg, { error, data })`
put the fields at `data.data.…` and left `entry.error` empty: the admin console showed no error, and
`data.observation` was one level deeper than any reader looks. 42 call sites wrote it that way,
which is the answer to whether the signature or the callers were wrong.

Normalizing costs nothing a caller wanted. No site in the tree passes a payload whose own field is
named `data` or `error`, and one that did would now surface it as the entry's field of that name —
the more useful reading of the two.

## What not to put in an entry

The rules below are the catalogue's, enforced here because this is where they are checkable.

- **No credentials and no personal data.** Masking is a safety net, not a licence: it catches only what is _recognisable_, and a value in an unusual shape goes through. See [docs/redaction/](../redaction/README.md).
- **No message bodies, push titles or user-chosen names.** Carry a length or a count instead. A name's diagnostic value is "they disagreed", which survives without the string.
- **No numbers inside `message`.** The prose is for a human scanning the monitor; the numbers go in `data`, where a script reads them with `JSON.parse` instead of a regular expression. One string cannot serve both readers without one of them losing.
- **No per-request or per-frame entry at `warn` or above.** The busiest producers are on a poll that runs per registered target every couple of seconds.

## Notes for implementers and tests

- `LogEntry.tag` is typed `LogTag`, but `CoreLogger`'s methods declare `tag: string`. That is deliberate width at the implementation, not a gap in the contract — the `Logger` interface every consumer holds is the one that carries `LogTag`.
- The context provider is read on **every** dispatch, not captured at construction. A test that swaps the provider mid-suite sees the new value on the next entry and the old value on entries already published.
- `runtime.spec.ts` pins the parts that are easy to regress: each entry gets a distinct `id`, a changed context leaves earlier entries alone, a throwing provider does not break logging, and `ingestLogEntry` preserves `id`, `timestamp` and context while filling only a missing `id`.

## Further reading

- [docs/pipeline/](../pipeline/README.md) — what happens to an entry after `logger.*` returns
- [docs/observations/](../observations/README.md) — the structured `data` shape and its discriminator
- [docs/redaction/](../redaction/README.md) — what is stripped from an entry on the way out
