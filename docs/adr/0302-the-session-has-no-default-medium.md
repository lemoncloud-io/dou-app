# ADR-0302: The session has no default medium

> Status: Accepted · Decided: 2026-11-10 · Implemented: `refactor/session-media-required`
> · Scope: `libs/session` (`store/ports/sessionMedia.ts`), `libs/app-runtime` (`init.ts`),
> `apps/landing` (`features/subscription/lib/port/http/runtime.ts`), tests in session, auth and
> app-runtime that reach a real store
> · The behaviour is documented in [libs/session § Two ports](../../libs/session/README.md#two-ports-secret-and-plain)

## Context

The session keeps its state behind two ports, `secret` and `plain`, and each app's entry point says
which medium backs them by passing `storage` to `initAppRuntime`. The field was optional. Left out, both
ports fell back to this tab's `sessionStorage`, built inside `@chatic/session`.

That default is a browser's answer inside a package that is meant to run in a native process too
(ADR-0301). There it would not even fail: `WebMedium` turns a missing `sessionStorage` into a memory
medium, so a runtime that was never handed its media would keep the credentials in memory and lose the
session on every launch, with nothing in the log to say why. In the browser the same default hides a
missing wiring as "it works in this tab".

Only one app relied on it. The landing site called `initAppRuntime()` with no arguments — and since its
media were gathered into one module, that module already builds the very same medium
(`tabMedium = WebMedium.session()`).

## Decision

**The session has no default medium, and the entry point has to name one.**

1. `SessionMedia.of` throws until `configure` has run. The message names the port and
   `initAppRuntime({ storage })`, so the failure points at the missing wiring rather than at whichever
   store read first.
2. `AppRuntimeConfig.storage` is required. An entry point that forgets it does not compile; one that
   gets past the compiler fails at the first session read.
3. The landing site passes its own `tabMedium` for both ports — the medium it was getting by default,
   now chosen where its other media are.
4. Tests that reach a real store configure their media themselves: memory, or this tab's
   `sessionStorage` where the test seeds or clears that storage directly.

The runtime's own `device`/`tab` media in `@chatic/app-runtime` keep their browser defaults for now;
they are not the session, and they move when that wiring becomes a port.

## Alternatives

- **Move the default into the web adapter** (`@chatic/runtime-web`) and have landing import it. It
  would keep a default alive in a second place and duplicate a medium the landing site already builds
  for itself; with only one caller, naming the medium at that caller is the smaller change.
- **Keep the default, and log a warning when it is used.** It would still run the native runtime on a
  memory medium, and a warning on a phone is read by nobody.
- **Default to a memory medium instead of `sessionStorage`.** Neutral, but it is the silent failure
  described above, on every platform at once.

## Consequences

- Any read of the session before `initAppRuntime` now throws instead of landing in `sessionStorage`.
  web, desktop-web, admin and the landing site were booted with the change and read nothing early.
- A new app, a test harness or a story that touches a store has to configure the session's media
  first. The error says how.
- `@chatic/session` no longer builds a medium; it imports only types from `@chatic/storage`.
