# pipeline — dispatch, the hub, and the listeners

> Overview in the [lib README](../../README.md) · Canonical code:
> [core/CoreLogger.ts](../../src/core/CoreLogger.ts) · [core/LogHub.ts](../../src/core/LogHub.ts) ·
> [runtime.ts](../../src/runtime.ts) · [sinks/ConsoleLogSink.ts](../../src/sinks/ConsoleLogSink.ts)

Between `logger.warn(...)` and anything happening there are exactly two objects: `CoreLogger`, which
stamps the entry, and `LogHub`, which hands it to whoever subscribed. Everything a platform does
with a log line — printing it, storing it, relaying it across the bridge, recording it in
Crashlytics — is a listener on that hub, written outside this package.

## Layout

```text
core/CoreLogger.ts    the engine: normalizes the third argument, stamps, publishes
core/LogHub.ts        subscribe / publish / size — 41 lines, no policy
sinks/ConsoleLogSink.ts   LogSink contract + the console mirror both platforms share
runtime.ts            the composition root: one hub, one logger, and the three exported functions
```

`runtime.ts` is the only file in the package that builds a singleton. Every class takes its
collaborators as constructor arguments, so a test — or a second pipeline — can own its own hub and
logger without touching process state.

## Dispatch

`CoreLogger` has one job and no store.

1. Normalize the third argument into `{ error, data }` (see [docs/entries/](../entries/README.md#the-third-argument)).
2. Read the registered context provider, defensively — a provider that throws yields an empty context rather than an exception.
3. Stamp `id` and `timestamp`.
4. `hub.publish(entry)`.

The context is spread **first** so the entry's own fields always win, and `id` is issued here rather
than at flush so it survives retries of the same entry.

`ingest` is the same publish without steps 1–3: an entry stamped in another runtime keeps its
occurrence time and its context. The one field it may fill is `id`, and only when absent.

**The engine holds no store and no sink.** It used to have a console fallback that fired whenever
the hub happened to have no subscriber, which meant output appeared or vanished depending on how
many listeners were attached at that instant, and made "detach a listener" a decision about console
output too. It also used to push every entry into a ring buffer, which is how entries dispatched
before any app wiring ran were still captured. Both are gone; what replaced the second one is a
wiring-order rule, below.

## The hub

```ts
class LogHub {
    subscribe(listener: LogListener): () => void;
    publish(entry: LogEntry): void;
    size(): number;
}
```

A `Set` of listeners and an unsubscribe closure — the same shape the mobile log service used, so
both platforms share one mental model. `publish` is a synchronous `forEach`, and each call is
wrapped in a `try/catch` whose purpose is **to protect the other listeners**, not to help the one
that threw. Swallowing is intentional: logging must never throw, and reporting the failure through
the logger would recurse.

## What a listener must satisfy

The hub imposes no policy, so these are the listener's own obligations. Each one was learned the
expensive way.

- **Do not call `logger`.** A listener runs synchronously inside `publish`; logging from there re-enters immediately. A failure goes to `console`. This bit hardest on the web→native relay, where `log → forwarder → postMessage fails → log` was reproduced as a runaway loop and is now pinned by a test that counts hub entries.
- **Do not mutate the entry.** `publish` hands the **same object reference** to every listener, so a listener that edits it corrupts what the later ones see.
- **Swallow your own failures.** The hub's `try/catch` will eat a throw silently, and the listener learns nothing.
- **Be fast.** `publish` is synchronous, so a slow listener slows down the code that logged.
- **Decide your own level policy.** The hub forwards all four levels. The console takes everything, the store refuses `debug` in a release build, Crashlytics discards `debug`, and the relay sends it only when the receiving side can print it.
- **Mask anything you read directly.** Redaction happens inside the serialization surfaces, so `entry.data` as the listener receives it is the **unmasked original**. A sink outside the upload path — Crashlytics is the one that exists — calls `redactSensitive` itself.
- **Subscribe before the entries you care about.** There is no buffer, so an entry published before a listener attached is not reachable later.

Adding a destination means adding a fifth listener, never widening one of the existing ones. Two
boundaries are fixed and are not listener business: **the uploader and the debug monitor are not
subscribers** — both read a store — and **subscribing is the only way to see an entry**.

## Wiring order

The queue is filled by a hub subscription, so anything dispatched before that subscription exists is
gone. When the core pushed entries into a ring buffer itself this was guaranteed by construction;
now it is a wiring rule, and it is the one ordering constraint this package imposes on its hosts.

```text
apps/web  main.tsx      setLogContextProvider(...)  →  startLogUploader()  →  everything else
apps/mobile provider.ts attachNativeLogContext()    →  subscribe ×3 (Crashlytics · store · console)
```

Adding a log line to a boot path is the change that can silently violate this. There is nothing that
enforces it and nothing that reports it; the entry simply does not exist.

## The listeners each host attaches

Three per platform today. That is a census, not a ceiling.

| Host                    | Listener         | What it does                                                                                        |
| ----------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| `apps/web` (hybrid)     | native forwarder | One `SendLog` bridge message per entry. No buffer, no timer. `debug` only when the app can print it |
| `apps/web`              | store listener   | `queue.push(entry)` and mark the on-disk copy stale. No level filter of its own                     |
| `apps/web` (standalone) | console listener | All four levels                                                                                     |
| `apps/mobile`           | Crashlytics      | Non-`debug` as a breadcrumb, `error` also via `recordError`. Masks what it reads                    |
| `apps/mobile`           | MMKV store       | The app's own queue. Given an MMKV instance that does **not** log                                   |
| `apps/mobile`           | console          | All four levels, outside a release build                                                            |

The web's set depends on the platform: in a hybrid run the forwarder is the one that is on, and in a
standalone tab it is the other two. The store listener is the exception — it runs in a hybrid run
too, until the app has answered a read and proved it owns the store. That window is deliberate: the
app's answer arrives a cycle or more after the first entries are dispatched, and assuming the app can
serve and being wrong would lose exactly the boot window.

**The MMKV instance handed to the app's store listener must not log.** The shared MMKV wrapper takes
a log service and reports write failures through it, which for this listener closes the loop
`store fails → entry → hub → store fails`.

## The console sink

`ConsoleLogSink` is the one console implementation both platforms subscribe; the mobile app's own
copy was retired in favour of it. It maps levels onto `console.debug/log/warn/error`, prefixes
`[TAG]`, and appends `data` (and `error` first, at `error` level).

Its single option is `timestamps`, off by default. In a browser the devtools console stamps its own
arrival time, so a second one is noise — but in the app's terminal the relayed web entries arrive
long after they happened, and reading the two orders against each other is the entire point of a
merged timeline.

`createConsoleListener(options)` is the form to subscribe: `logHub.subscribe(createConsoleListener())`.

## Notes for implementers and tests

- `logHub` is a module singleton, so a suite that subscribes must unsubscribe. Two suites sharing a process with a stale listener attached will see each other's entries; `runtime.spec.ts` and the queue specs both depend on the count being exact.
- `LogHub.size()` exists for exactly this: a test can assert that the number of subscribers is what was registered, which is how "the uploader does not subscribe" is pinned rather than merely stated.
- The listener contract's "do not mutate the entry" is pinned by a test that asserts the **current** behaviour — a listener that edits the entry does corrupt the next one. The test is the reason the rule is written down, not a guard against it.

## Further reading

- [docs/entries/](../entries/README.md) — what the entry being published contains
- [docs/upload/](../upload/README.md) — the store the store-listener fills, and who drains it
- [docs/redaction/](../redaction/README.md) — where masking happens, and why a listener is outside it
