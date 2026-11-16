// @chatic/runtime-web — the runtime for a web page: its ports, and the stores a page keeps state in.

// the runtime, built from the page's ports
export { createWebRuntime } from './createWebRuntime';
export type { WebRuntimeOptions } from './createWebRuntime';

// the engine of a page that mirrors its phone shell's runtime
export { RUNTIME_CALL_TIMEOUT_MS, createBridgedRuntime, webMirrorPort } from './createBridgedRuntime';
export type { BridgedRuntimeOptions } from './createBridgedRuntime';
export {
    SESSION_OWNER_GIVE_UP_MS,
    SESSION_OWNER_HELLO_TIMEOUT_MS,
    SESSION_OWNER_LAST_HELLO_MIN_MS,
    settleSessionOwner,
    visibleClock,
} from './settleSessionOwner';
export type { SessionOwnerChoice, SessionOwnerOptions } from './settleSessionOwner';

// the stores an app keeps state in, chosen for its environment
export { LATE_VAULT_MARK, readStorageEnvironment, resolveStorageStores } from './storage/resolveStorageStores';
export type { StorageEnvironment, StorageStores } from './storage/resolveStorageStores';

// the phone shell's cache capability, reported after the bridge handshake
export { setNativeCacheSupport } from './localCache';
export type { NativeCacheSupport } from './localCache';

// a page's own upload sender
export { createXhrPut, xhrPut } from './xhrPut';
