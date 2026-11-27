# ADR-0352: A host port carries its work, and features never ask which side does it

> Status: Accepted; decision 3 superseded by
> [ADR-0375](./0375-platform-implementations-live-in-libs-as-families-of-one-port.md)
> · Decided: 2026-11-19 · Implemented: `refactor/host-ports-carry-behavior`
> · Scope: `libs/runtime-client` (the `links`, `appShell` and `diagnostics` contracts),
> `libs/runtime-web` (their adapter factories), `libs/runtime` (`@chatic/runtime/testing`),
> `apps/web` and `apps/desktop-web` (their implementations and every caller), `tools/eslint-rules`
> and the root lint config
> · The behaviour is documented in [apps/web docs/bridge/host-ports.md](../../apps/web/docs/bridge/host-ports.md),
> [apps/desktop-web docs/host](../../apps/desktop-web/docs/host/README.md),
> [libs/runtime-client](../../libs/runtime/docs/api/README.md) and
> [libs/runtime-web](../../libs/runtime-web/README.md)
> · Extended by: [ADR-0359](./0359-every-host-port-carries-its-work.md), which moves the four ports this
> record left carrying only their choice
> · Builds on: [ADR-0346](./0346-every-app-starts-from-a-declaration-and-its-call-part-sees-only-the-runtime.md)
> (every app declares its host ports, and its call part reaches them as `runtime.<port>`)

## Context

ADR-0346 made every app choose its host ports in its declaration and gave features one way to reach
them, `runtime.<port>`. But apart from `checkout`, a host port carried only the choice: `kind`,
`'shell'` or `'browser'` (and `os` for two of them). Each feature that needed the host then branched
on it — 66 reads across `apps/web` and `apps/desktop-web`, 36 of them on the three ports this record
moves, asked `runtime.<port>.kind === 'shell'` and held both sides' code: the bridge request on one arm, `window.open` or the Clipboard API on the
other, or nothing at all.

That kept the old problem one level down. The declaration chose a side, and every feature re-derived
what the side meant. A host that does the work a third way, or a toggle that moves one port to the
page while the rest stay on the shell, had to find every branch. And `kind` stood in for questions it
does not answer: whether this window may reload itself, what to call the telemetry entry point,
whether a focused field means a keyboard is up.

## Decision

### 1. A port's members do its work; `kind` stays only as the name of the choice

The port's contract lists what a feature can ask of the host, and the app's implementation for each
side does it. `kind` remains on the value because the app's declaration part builds the port from it,
and the web's log pipeline names the side it runs on from `diagnostics.kind` before the ports are
published (`src/config/diagnosticsKind.ts`); no feature reads it.

### 2. A capability only some hosts have is a member that is `null` elsewhere

What every host can do, each in its own way, is a plain method (`links.openUrl`, `links.copyText`).
What only some hosts can do is a sub-object that is `null` where the host lacks it
(`links.shareIntake`, `appShell.storeUpdate`, `diagnostics.pendingReports`). "Can it" and "do it" are
one value, so a caller cannot do it without having asked, and there is no flag that can disagree with
the method beside it.

A question that is a fact about the host rather than an action becomes a field that says what it
means: `appShell.ownsWindow` (the app opened this window for the page alone, so the page may reload
itself or force its socket closed to recover), `appShell.reportsKeyboardHeight`,
`diagnostics.entry`. Each replaces a `kind` read that stood in for it.

### 3. The app implements each side; the library only chooses

_Superseded by ADR-0375: each side's implementation moves into its host family in `libs/` and takes the
bridge client and the app's data as parameters; the app keeps only the declaration that picks it. Its last
sentence, on two shells filling different members, stands (restated in ADR-0375 decision 4)._

As for `checkout`, the implementations live in the app: the shell side talks to the app's own bridge
wrapper (the web's `appBridge`, desktop-web's `webClient` requests) and the page side can need the
app's own data. `libs/runtime-web` builds the `.host`, `.shell` and `.browser` adapters from them
(`linksAdapters(implementations)` and its siblings) and keeps the rules it already had: `.shell` only
where the host declared it, `.browser` everywhere. Two shells that do different things fill different
members — the desktop paints a dock badge and updates itself, the phone reads its icon badge and sends
the person to its store — rather than sharing one union member.

### 4. A lint rule holds it

`@nx/workspace-host-port-kind` reports any read of a listed port's `kind` outside an app's
declaration part and tests, through `runtime.<port>` or a local name bound to it. It lists `links`,
`appShell` and `diagnostics` now; the remaining ports join it as their work moves behind members.

## What stayed, and why

- **`media`, `files`, `signIn` and `push` still carry only the choice.** Their implementations lean on
  app modules (the native transfer module, the OAuth hand-off, notification handlers) and move in a
  change of their own, under the same rules.
- **One handshake check stays in the app.** Whether this shell version opens a sub web view arrives
  with the boot handshake, after the ports are published, so `links.subWebView` says the host has one
  and the app still asks the handshake before opening it.
- **The log pipeline still reads `diagnostics.kind`.** It is wired before the host ports are published,
  so it reads the host's declaration through the declaration part (`src/config/diagnosticsKind.ts`)
  rather than a port member, and only to name the side in each log line.
- **Behaviour is unchanged.** Each side's code moved as it was. The visible differences: the licenses
  page's link now opens with `noopener,noreferrer`, like every other link the page opens; a failed
  copy from the debug screen inside the app now writes the same `CLIPBOARD` error line a failed message
  copy always did; and buttons that could already not be reached in a browser now do nothing there
  instead of posting to a bridge that is not there.

## Alternatives

- **Booleans beside methods** (`canShare` plus `share()`): two values that can disagree, and a caller
  that forgets the flag calls a method that cannot work. Rejected for the nullable member.
- **Shell implementations in `libs/runtime-web`**, built on `webClient` for both apps: one copy instead
  of two, but the web's bridge wrapper (`appBridge`, with its retries and response handling) would be
  duplicated in a library, and the page sides still need app data. Rejected; the `checkout` pattern was
  already the accepted one.
- **One change for all seven ports:** 66 reads in one review. The three ports here set the pattern; the
  four whose implementations lean hardest on app modules follow it.

## Consequences

- A feature reads as what it asks for (`runtime.links.shareIntake?.fetch(id)`), and the reasons a side
  does what it does live in one implementation file per app and port.
- A test sets the members it needs on `browserLinks()`, `browserAppShell()` or `browserDiagnostics()`
  instead of flipping `kind`, and the implementations have tests of their own.
- A new capability is a contract change in `libs/runtime-client` and an implementation in each app that
  declares the port; an app whose host lacks it returns `null`.
- The lint rule's port list is the migration's progress; it is complete when it names every port.
