// The seven facade groups, assembled under one name.
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
