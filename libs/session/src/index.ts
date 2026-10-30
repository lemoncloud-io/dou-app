// @chatic/session — the session's state and nothing that acts on it: the three stores, their typed
// signal, the contexts derived from them, and the scope views over them.
//
// This barrel serves the runtime modules above it, so it sells the raw stores too: the use cases in
// app-runtime write them, and only they should. Apps never import this package — they read the
// session through `runtime.session`, which publishes readers and no writers.

// The contexts, the signal, and the store's own types — what a reader of the session needs.
export * from './store';

// The raw stores and the boot seam — for the use cases that write the session, and for boot.
export { cloudStore, identityStore, relayStore } from './store/stores';
export type { CachedCloudTokens } from './store/cloudStore';
export { configureSessionStore } from './store/configure';
export type { StorageLike } from './store/jsonSlot';

// Readers over the stores that lower layers ask: credential lifetime, and the scope's three views.
export { msUntilExpiration } from './store/expiry';
export { credentialFreshness } from './store/credentialFreshness';
export type { ICredentialFreshness } from './store/credentialFreshness';
export * from './scope';
