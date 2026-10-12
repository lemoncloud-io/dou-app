# ADR-0188: A shell's pushed events are checked against the vocabulary by the compiler, inside its tests

> Status: Accepted · Decided: 2026-10-12 · Implemented: `test/bridge-event-contracts`
> · Scope: `apps/mobile/src/app/webview/hooks/appEventContract.ts`,
> `apps/desktop/src/main/appEventContract.ts`, and each shell's `appEvents.contract.test.ts`
> · The module doc is [apps/mobile webview/README.md](../../apps/mobile/docs/webview/README.md#events-the-shell-pushes)

## Context

The native shells send the web two kinds of message: replies to the web's requests, and events they
push on their own — a back press, an app-state change, a deep link, a foreground push, a purchase
outcome, an update status. Replies have a run-time check: the web client rejects a reply of the wrong
type. Events have none. The web subscribes by type, so an event under a renamed type is simply never
heard, and one missing a field is read as `undefined` wherever the web uses it.

The web's end-to-end tests drive the app inside a fake native shell, and most of the next scenarios
script events. If the fake and the real shell drift apart, those tests stay green while the product
breaks, so the real shells need their own check that what they push is what the vocabulary
(`@chatic/app-messages`) declares.

Writing that check as `satisfies` or a typed fixture in a test does nothing here. Jest transpiles
each test file on its own (`isolatedModules` is set in the base tsconfig, so ts-jest skips type
checking), the mobile project is excluded from CI's typecheck, and the desktop's typecheck leaves its
tests out. Several emitters also cast their message (`as any`), which no type check would see through.
The vocabulary declares no run-time list of message types either, and keeping it free of run-time
values is one of its rules.

## Decision

**Each shell's tests hand what the shell actually pushed to the TypeScript compiler**, as a literal
assigned to `AppMessageData<its type>` after the JSON round trip the bridge applies, and fail on any
diagnostic. The same compiler reads the list of push-only messages (`AppMessageDataMap` keys that no
request is answered with) for an inventory that requires each to be pushed by a named file and
covered by a named test, or declared as never pushed with a reason. A scan of the shell's
`pushEvent` call sites keeps the inventory honest.

- **The vocabulary stays the only source of truth.** No hand-written schema mirrors the payload
  types, so nothing has to be kept in step with them.
- **A known non-conforming push is pinned, not fixed in passing.** `OnUpdateDeviceInfo` on the phone
  omits `success` and `webVersion`; its test asserts exactly that and that the rest conforms, so
  fixing the hook fails the pin and forces the plain check in.

## Alternatives considered

- **Hand-written run-time schemas** (zod or a small validator) for each event. Rejected: a second
  description of every payload, free to drift from the types it copies, which is the failure this
  is meant to catch.
- **Turning off transpile-only in ts-jest**, so test files are type checked. Rejected: it slows every
  suite in both projects, and it still would not see through the `as any` casts at the call sites.
- **Type tests with `tsd` or `expect-type`.** Rejected: they check declared types, not the values a
  hook builds at run time.
- **A shared run-time validator in `@chatic/bridges`**, which the fake shell could also use.
  Deferred, not rejected: it would put a payload description into a browser bundle, and the fake
  shell can adopt the compiler check on its own terms.

## Consequences

- The first compile in a test file costs about 300 ms; later ones reuse the parsed vocabulary.
- The helper exists twice, once per shell, because no project both shells' tests can import from
  without crossing a module boundary. The two copies differ only in their path depth and say so.
- An event's trigger is tested in the shell's JavaScript only. What a native module hands to that
  JavaScript (the file-transfer state, for one) is outside this check.
- A payload declared as an empty object has nothing for the compiler to reject beyond its envelope.
