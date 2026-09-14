# observations — structured entries and their discriminator

> Overview in the [lib README](../../README.md) · Canonical code:
> [core/observation.ts](../../src/core/observation.ts) ·
> [observation/foreignDropAggregator.ts](../../src/observation/foreignDropAggregator.ts)

A handful of entries do not report a failure. They report a **measurement**: two values that
disagreed, a window's worth of drops, a streak of failed syncs, how much the queue evicted, what
shape a result came back in. They are read by scripts as much as by people, and this document is the
contract that makes that possible.

## Why one key

The stored logs cannot be filtered by value. The admin list narrows on `level`, `runId`, `uid`, `sid`,
`cid` and a date range, and the payload arrives inside a length-capped `data` string. So the workflow
is "download the `warn` page, then split it by family" — and that split needs **one key with a closed
set of values**.

It used to need three. Each producer invented its own envelope (`divergence.kind`,
`foreignDrop.source`), and one of them collided outright: the sync-cursor entry carried a `kind`
meaning _which cursor_, next to a divergence `kind` meaning _which comparison_. A script had to know
all of them and could still read the wrong field.

```ts
type ObservationKind = 'badge-divergence' | 'unread-divergence' | …; // ten, closed

interface ObservationData {
    observation: ObservationKind;
    [field: string]: unknown;
}
```

**Flat, not nested under a per-family key**, so a reader does `data.observation` once instead of
probing for whichever envelope this producer happened to use. `satisfies ObservationData` at each
call site is what makes a typo a compile error.

On `error`-level entries this object is the `data` inside `{ error, data }` — `error` is the only
level whose signature differs, and passing these fields at the top level there would nest them under
`data.data` and bury the exception.

**Do not invent a tag for the family.** A `DIVERGE` tag would split "everything about badges" across
two tags. The domain tag stays; `observation` is the split.

## The ten families

| Kind                        | Level · tag                    | Produced by                                | Carries                                          |
| --------------------------- | ------------------------------ | ------------------------------------------ | ------------------------------------------------ |
| `badge-divergence`          | warn · `NOTIFICATION`          | `apps/web` divergence reporter             | `web`, `native`, `delta`, `breakdown`            |
| `unread-divergence`         | warn · `CHAT`                  | `apps/web` divergence reporter             | the two cursors, the drawn count, `cursorLanded` |
| `member-divergence`         | warn · `CHANNEL`               | `apps/web` divergence reporter             | `rosterOnly`, `joinOnly`, `joinCount`            |
| `cloud-name-divergence`     | warn · `CLOUD`                 | `apps/web` divergence reporter             | `cid` and the two **lengths**, never the names   |
| `foreign-drop`              | warn · `CACHE`                 | **this package** — the aggregator below    | `source`, `cid`, `socketCid`, `count`            |
| `sync-streak`               | warn → error → info · `SYNC`   | `apps/web` sync streak reporter            | `path`, `streak` / `afterFailures`               |
| `socket-unavailable-streak` | warn → error → info · `SOCKET` | `libs/app-runtime` socket failure reporter | `kind`, `type`, `code`, `afterFailures`          |
| `sync-cursor-retired`       | warn · `SYNC`                  | `libs/data` `SyncMetaLocalDataSource`      | `cursorKind`, `reason`                           |
| `queue-loss`                | warn · `LOG_BUFFER`            | `apps/web` queue loss observer             | `dropped` (the delta) and `droppedTotal`         |
| `contacts-shape`            | info / warn · `DEVICE`         | `apps/mobile` device service               | `total`, `named`, `nameless`                     |

```bash
grep -rn "observation: '" --include='*.ts' --include='*.tsx' apps libs | grep -v node_modules
```

Only one producer lives in this package. The rest sit next to the values they compare, which is the
point — a comparison has to run where both sides are readable.

## The rules a producer follows

### Silence is the normal case

A match writes nothing. Values that agree, a window with no drops, a counter that did not grow, a
successful sync — all of them produce zero entries. That is the condition for placing a check on a
hot path at all: if the healthy state cost an entry, every device would produce a stream of them and
the real finding would be buried.

### Aggregate rather than repeat

Anything that fires at polling frequency reports **one entry per window**, never one per event. The
sync poll runs per registered target every couple of seconds with dozens of targets live on the home
screen, so per-event logging would spend the device's whole log budget during a cloud switch — and
because eviction is oldest-first, the burst would push out the very entries explaining what preceded
it.

### A streak is three entries, not N

For anything that repeats on a timer, the useful fact is not "it failed" but "it has not recovered".

| Transition            | Entry                                            |
| --------------------- | ------------------------------------------------ |
| first failure (0 → 1) | `warn` — common, and often over by the next tick |
| threshold reached     | `error` — said **once**                          |
| past the threshold    | nothing                                          |
| recovery (N → 0)      | `info`, carrying `afterFailures`                 |
| continued success     | nothing                                          |

The thresholds are per producer and chosen against the cadence: 3 for background sync (a 60s poll, so
roughly three minutes of no progress) and 5 for socket unavailability. One minute is
indistinguishable from an ordinary blip; ten is after the user has already filed the report.

Counts are kept **per path or per slot**, never merged. One path dying while the rest live is a real
state, and a merged counter erases it. And a failure the server actually answered **breaks the
unavailability streak** — a `403` is proof the socket is alive, and counting it as "still down" leaves
the streak alive forever, so neither the recovery entry nor the next first-failure `warn` ever fires.

### Never read "unknown" as zero

An absent value compared as `0` makes every device on that platform permanently divergent, and the
real divergence drowns in it. Each comparison names its own skip conditions — a device badge that
cannot be read, a roster that has not arrived (`undefined` is not "an empty room"), a join cache read
back as zero rows, a catalogue that has not answered yet.

### Never compare inside a listener or the send path

A listener runs synchronously inside `publish`, so calling `logger` there re-enters immediately; the
send path calling `logger` closes the failure loop this design exists to avoid. Comparisons belong in
screen and hook code, on foreground return or on value change — not per render and not per poll.

### Carry the numbers, not the content

The `message` says the **direction** (`device ahead` / `web ahead`, `cursor behind mark` /
`cursor landed but count remains`, `roster ahead` / `joins ahead`); the numbers live in `data`. Never
carried: user ids, cloud or channel names, message bodies, push titles. A length or a count answers
the diagnosis — "they disagree" and "by how much" hold without the string.

## Queue loss

One family is about this package itself. The unsent queue counts what it evicted, and **the queue
cannot report that number**: the drop happens inside `push`, which runs inside a publish, and the
upload path may not log at all. So a third party reads `droppedCount()` through the read-only view
the uploader registers, and writes a `queue-loss` entry only when the total has **grown** since the
last reading.

Without it, "this user has no `warn` entries" is unreadable — it could mean nothing went wrong or it
could mean the evidence was evicted, and every other observation's absence becomes unusable as
evidence. That entry is itself subject to eviction, which is honest rather than a flaw: if this line
was lost, the situation it describes was happening.

## The foreign-drop aggregator

`foreignDropAggregator` is the one producer in this package. During a cloud switch the cache `cid`
moves to the target immediately while the outgoing socket is still connected and still delivering
frames, so writes aimed at the old cloud are dropped on purpose — correct behaviour that leaves the
following screen stale with no record of why.

```ts
foreignDropAggregator.record({ source, cid, socketCid });
```

- **It lives here because its consumers are two libs** — `libs/data`'s repositories and `libs/app-runtime`'s sync plans — and both already see this package re-exported through `@chatic/bridges`, so a shared home costs no new dependency. One home also means one window: an aggregator per consumer would split a single switch into two counts. The price is that a domain word (`cid`) appears in the core; it is carried as an opaque string and nothing here interprets it.
- **The window is 5 seconds.** A switch's optimistic window is short, so a longer window separates the entry from the switch that caused it and a shorter one splits one switch across several lines.
- **Drops are grouped by `source|cid|socketCid`** and reported one `warn`/`CACHE` per group. `source` is a plain label naming the skip site — `channel-refresh`, `channel-sync`, `channel-self`, `place-refresh`, `sync-frame` — so the aggregate says _which_ site produced the count.
- **The timer exists only while drops do.** The first drop opens the window; closing it reports and clears. An always-on interval would charge an idle device for something that is not happening.

`flushNow()` and `reset()` are on the interface for tests. Nothing in production calls them, and a
burst that stops abruptly loses its final tally — the cost of keeping the timer out of the hot path.

## Adding a kind

1. Add the literal to `ObservationKind` in [core/observation.ts](../../src/core/observation.ts), with a one-line comment saying what the measurement is. The union is closed, so this step cannot be skipped.
2. Write the producer **where both values are readable**, and give it the domain tag — never a new one.
3. Return early on every "unknown" the comparison can meet, and on agreement.
4. Build the payload as `{ observation: '<kind>', …fields } satisfies ObservationData`. At `error` level, put it under `data` inside `{ error, data }`.
5. Put the direction in `message` and the numbers in `data`, and check the payload against [what not to put in an entry](../entries/README.md#what-not-to-put-in-an-entry).
6. Test the silence as well as the entry. "Matching values produce no `warn`" is the assertion that keeps the check placeable on a hot path; without it a regression turns every healthy device into a producer.

## Notes for implementers and tests

- A producer that calls the module-level `logger` needs the real one spied on rather than a module mock. The `@chatic/bridges` mocks scattered through the app suites are partial — most carry only `{ logger: { error: jest.fn() } }` — so adding a `logger.warn` or `logger.info` to an existing file makes its suite fail with a `TypeError` in a place that has nothing to do with the change. Check the mock before adding a call.
- `foreignDropAggregator` is a module singleton with a live timer. A suite must `reset()` it in teardown, or its window closes inside the next test.
- The aggregator's own spec is the model for the shape: window grouping, one entry per group, and silence when nothing was dropped.

## Further reading

- [docs/entries/](../entries/README.md) — levels, tags, and the third argument these payloads ride in
- [docs/upload/](../upload/README.md#the-drop-order) — why the queue's losses need a third party to report them
- [docs/perf/](../perf/README.md) — the sibling class of measurement entries, which uses its own record shape rather than this discriminator
