// @chatic/runtime — what the call part of an app imports: the runtime, the host's ports and the
// domain's names. An app's declaration part (its `src/config/` and entry point) imports
// `@chatic/runtime-web` or `@chatic/runtime-mobile` and starts the runtime; everything after that reads
// it through this package. See docs/adr/0002.
//
// # The facade
//
// This package holds hooks, components and re-exports, and no other logic: the logic is in
// `@chatic/runtime-client` (React-free) or the core packages below it. `facade.test.ts` holds it there.
//
// It publishes ONE runtime name, `runtime`, holding the groups. A group answers "what am I doing" —
// booting, reading the session, mounting the connection, touching data, registering sync, registering
// for push, filing a report, reading a setting, asking the host — so a consumer picks a group and
// finds everything for that job in one place, without knowing which folder holds the file:
//
//     import { runtime } from '@chatic/runtime';
//     const { selectedCloudId } = runtime.session.useSessionSelection();
//     <runtime.connection.RuntimeConnectionHost>…</runtime.connection.RuntimeConnectionHost>
//     if (runtime.signIn.kind === 'shell') …
//
// One imported identifier, not one per group: the group names are natural words that consumers
// already use as locals (`data` in 23 files, `session` in 17, `sync` in 9), and a shadowed group does
// not compile. `facade.ts` explains that trade.
//
// **Groups are not folders.** They cut across the module tree on purpose: `session.confirmPhoneLogin`
// lives in `@chatic/auth`, `session.useRuntimeProfile` reads through `data/`, and
// `push.useRegisterDeviceTokenMutation` lives in `data/hooks/`. The barrel each group is built from
// names every symbol it sells, so the group barrel is the catalog — that is why this file has no
// per-symbol list of its own for the runtime.
//
// **What "internal" means.** NOT in a group barrel. Runtime code reaches those symbols by concrete
// module path (`./connection/hooks/useHostControllers`) or through a package below,
// which is both the pre-existing convention and what keeps the group barrels cycle-free: a barrel
// publishes outward, and nothing inside the package imports one.
//
// [`public-surface.test.ts`](./public-surface.test.ts) locks the group membership symbol by symbol.
// See also the Public surface section of libs/runtime/README.md.

// There is no second, un-grouped lane for the runtime. The 67 names were flat until 275 consumer files
// were moved onto the groups in one pass, and keeping a flat alias afterwards would mean shipping every
// symbol under two names forever — the exact category ADR-0076 Decision 6 spent eight steps deleting.
export * as runtime from './facade';

// Beside `runtime`, the domain's names — the shapes the repositories return and the pure helpers over
// them — flat, as `@chatic/data` sold them, so a screen's `import type { DomainChat }` only changes its
// specifier. `domain.ts` lists each name; nothing reaches an app that is not written there.
export * from './domain';
