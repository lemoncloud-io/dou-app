// store — the session's single source of truth. Passive by rule: these modules store and
// notify, and know nothing of sockets, data, HTTP, use-cases or hooks. `configure.ts` is the single
// env seam (see its header), and `initAppRuntime` is what runs it — importing this barrel no longer
// boots anything.

// `./stores` (the raw store objects) is deliberately NOT re-exported here:
// readers go through `contexts`/`contextStore`. The package barrel (`src/index.ts`) sells the raw
// stores separately, for the use cases that write them.
export * from './contextStore';
export * from './contexts';
export * from './signal';
export * from './types';
