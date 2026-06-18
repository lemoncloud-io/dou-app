// @chatic/app-runtime — shared headless chat engine (data, sync, socket, auth bootstrap).
// Engine = how the app works; presentation lives in client apps. See docs/adr/0002.
export * from './connection';
export * from './hooks';
export * from './socket';
export { getSocketManager } from './socket/runtime';
export * from './services/cloudSessionService';
export * from './stores/useCloudTransitionStore';
export { getRuntimeManager, getSocketAuthCoordinator, useRuntimeBinding, useRuntimeRepositories } from './runtime';
