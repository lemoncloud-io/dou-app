// @chatic/app-runtime — shared headless chat engine (data, sync, socket, auth bootstrap).
// Engine = how the app works; presentation lives in client apps. See docs/adr/0002.
export * from './socket';
export { getSocketManager } from './socket/runtime';
export { getSyncManager } from './socket/runtime';
export { getRuntimeManager, useRuntimeBinding, useRuntimeRepositories } from './runtime';
export * from './connection';
