# ADR-0306: The connections are kept by a controller outside React

> Status: Accepted · Decided: 2026-11-11 · Implemented: `refactor/connection-controller`
> · Scope: `libs/runtime-core/src/connection/` (the controller, the slot derivation, `SocketBinder`,
> `SocketReauthBinder`, the background reads, moved from `libs/app-runtime/src/connection/` with their
> tests); `libs/app-runtime/src/connection/` (`RuntimeConnectionHost`, `useConnectionController`);
> `resolveDeviceIds` beside `useDynamicDeviceId`
> · The behaviour is documented in [libs/runtime-core docs/connection](../../libs/runtime-core/docs/connection/README.md)
> and [libs/app-runtime docs/connection](../../libs/app-runtime/docs/connection/README.md)

## Context

What keeps the sockets in line with the session — deriving the slots from the session, binding and
tearing them down, re-authenticating a slot whose identity changes in place, preparing the background
clouds' tokens, running their receive loops — lived in React: a hook derived the slots, two
null-rendering components reconciled them in effects, and two more hooks started the background work.
Nothing in it was about rendering. React supplied three things: the subscriptions
(`useSyncExternalStore`), the timing (an effect after a commit, several store updates batched into
one render), and the lifetime (mount and unmount).

ADR-0305 moved the runtime's assembly into `@chatic/runtime-core` so the native process can build the
same runtime. The connections stayed behind in the React package, which that process does not load: a
native runtime would have had to rewrite them, and two copies of the slot rules are two places for
them to disagree.

## Decision

**A React-free connection controller in `@chatic/runtime-core` owns the connections; React only starts
and stops it.**

1. **`createConnectionController({ deviceId })`** returns two halves, each with its own stop:
   `startBackground` (background clouds' tokens and receive loops) and `startSockets` (derive, bind,
   re-authenticate). They start at different moments, as the hooks did: the background half from
   mount, the socket half once session init has completed.
2. **The subscriptions are the controller's.** It listens to the three slot signals and the background
   store itself, and the manager's slot changes for the token preparer.
3. **One pass per burst, in a microtask — or in the host's commit.** Several signals of one session
   change produce one pass after the last of them — the batching React gave before. The first pass of
   `startSockets` runs before it returns. The controller also announces each due pass synchronously,
   and the web host runs it from an effect ordered before its children's, in the same commit as the
   screens that react to the change: a screen's effect sees the active slot already moved, as it did
   when the binders were components. Whichever runs first does the pass.
4. **The binders become classes** with the same names and the same rules: `SocketBinder.apply`
   reconciles the slots it is handed, skipping a pass whose signature and delegate did not move;
   `detachAll()` is what unmount did. `SocketReauthBinder.apply` compares with the previous pass.
5. **The device id is a function** the controller reads on every pass. On the web it is
   `useDynamicDeviceId`'s resolution, which reads ids the phone shell injects into the page — a page
   read that stays in app-runtime.
6. **A throw is logged, not lost.** The binder, the re-auth and the background check run guarded and
   log what they throw; the re-auth runs even when the binder threw; the binder remembers a pass only
   after its reconcile went through. Inside React, a throw surfaced through the renderer; in a microtask
   it would have been an unreported rejection.
7. **The host keeps its shape.** `RuntimeConnectionHost` and `RuntimeAuthHost` still gate on session
   init and keep-alive, and start the socket half from a child rendered before the app's children, so
   binding still starts before any child's effect. The `slots` override prop goes: no app passed it.

## Alternatives

- **Keep the hooks and have the native runtime write its own connection loop.** Two implementations of
  the slot rules — committed versus selected cloud, the background cap, sign-off before teardown —
  would drift, and every one of those rules exists because a version without it shipped a bug.
- **Reconcile synchronously on every signal.** Simpler, and wrong: a cloud switch emits more than one
  signal, and a pass between them sees half a switch.
- **Leave every pass to the controller's microtask.** It is the simplest, and on the web it moved a
  guarantee: React commits the screens that react to a change as soon as anything above the host
  hears it, ahead of the microtask, so a screen's effect would read the active slot before the pass
  had moved it. The host's flush keeps the order the components had.
- **A store the hooks subscribe to, holding the derived slots.** It would move the derivation but not
  the binding, which is the part that has to run where React does not.

## Consequences

- runtime-core holds the connection rules; app-runtime's `connection/` is the host and hooks that read
  the manager's state. The connection tests run in `node`, with no React.
- The order of things on the web is unchanged — the background half on mount, binding before the
  children's effects at mount and on every later change, the binder before the re-auth in each pass —
  but it is now stated in the controller and the host's flush rather than following from component
  order. A host that renders has to keep the flush; the host test pins it.
- `RuntimeHostProps` no longer has `slots`; a test that wants given slots drives `SocketBinder` directly.
- The device id is still a page read on the web; the native runtime passes its own function.
