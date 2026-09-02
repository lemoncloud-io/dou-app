// session/store — the session SSoT (ADR-0070 결정 1). Passive by rule: these modules store and
// notify, and know nothing of sockets, data, HTTP, use-cases or hooks. `configure.ts` is the single
// env seam (see its header), and `initAppRuntime` is what runs it — importing this barrel no longer
// boots anything.

// `./cores` (the raw store objects + storage-key constants) is deliberately NOT re-exported: it is
// internal to the hub, exactly as `session/core` was internal to web-core. Consumers read through
// `contexts`/`contextStore`; the use-cases import `./cores` directly.
export * from './contextStore';
export * from './contexts';
export * from './signal';
export * from './types';
