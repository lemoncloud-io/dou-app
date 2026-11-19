// The facade groups, assembled under one name.
//
// `index.ts` publishes this file as `runtime`, so an app writes `runtime.session.useGlobalSession()`
// and imports exactly one identifier. That indirection is not decoration: importing the group names
// directly collided with everyday locals — `data` is a local in 23 consumer files, `session` in 17,
// `sync` in 9 (a `const { data } = useQuery()` shadows the group and the file stops compiling). One
// root keeps the group names natural instead of trading them for collision-proof but uglier ones.
//
// This file is a barrel of barrels and holds nothing else. Each group's own barrel names every
// symbol it sells — that is the catalog, and `public-surface.test.ts` locks it.
export * as boot from './boot';
export * as session from './session';
export * as connection from './connection';
export * as data from './data';
export * as sync from './socket/sync';
export * as push from './push';
export * as report from './report';
export * as settings from './settings';

// The host's capability ports, as the entry point published them: `runtime.checkout` is the very object
// `host.ports.checkout` holds. These are runtime-client's live bindings, so a read sees the published
// port — and a read before the publish throws, naming the step that was missed. Read one where it is
// used, never at module scope. The push port's `kind` joins the `push` group above.
export {
    appShellPort as appShell,
    checkoutPort as checkout,
    diagnosticsPort as diagnostics,
    filesPort as files,
    linksPort as links,
    mediaPort as media,
    signInPort as signIn,
} from '@chatic/runtime-client';
