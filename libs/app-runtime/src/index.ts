// @chatic/app-runtime — shared headless chat engine (data, sync, socket, auth bootstrap).
// Engine = how the app works; presentation lives in client apps. See docs/adr/0002.
//
// # The facade
//
// This file is the ONLY public surface, and it publishes ONE name: `runtime`, holding seven groups.
// A group answers "what am I
// doing" — booting, reading the session, mounting the connection, touching data, registering sync,
// registering for push, filing a report — so a consumer picks a group and finds everything for that
// job in one place, without knowing which folder holds the file:
//
//     import { runtime } from '@chatic/app-runtime';
//     const { selectedCloudId } = runtime.session.useSessionSelection();
//     <runtime.connection.RuntimeConnectionHost>…</runtime.connection.RuntimeConnectionHost>
//
// One imported identifier, not seven: the group names are natural words that consumers already use
// as locals (`data` in 23 files, `session` in 17, `sync` in 9), and a shadowed group does not
// compile. `facade.ts` explains that trade.
//
// **Groups are not folders.** They cut across the module tree on purpose: `session.applySessionToken`
// lives in `socket/auth/`, `session.useRuntimeProfile` reads through `data/`, and
// `push.useRegisterDeviceTokenMutation` lives in `data/hooks/`. The barrel each group is built from
// names every symbol it sells, so the group barrel is the catalog — that is why this file has no
// per-symbol list of its own and no bare `export *`.
//
// **What "internal" means.** NOT in a group barrel. Runtime code reaches those symbols by concrete
// module path (`./session/store`, `./socket/auth/switchSite`, `./connection/hooks/useRuntimeSocketSlots`),
// which is both the pre-existing convention and what keeps the group barrels cycle-free: a barrel
// publishes outward, and nothing inside the package imports one.
//
// [`public-surface.test.ts`](./public-surface.test.ts) locks the group membership symbol by symbol.
// See also docs/public-surface.md.

// There is no second, un-grouped lane. The 67 names were flat until 275 consumer files were moved
// onto the groups in one pass, and keeping a flat alias afterwards would mean shipping every symbol
// under two names forever — the exact category ADR-0076 결정 6 spent eight steps deleting.
export * as runtime from './facade';
