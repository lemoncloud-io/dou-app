// @chatic/transport — the socket manager and its slots, and the HTTP manager.
//
// This barrel is what the runtime modules above it read. It sells each module the layers above
// import, whole; a module nothing above imports — `SocketManager`, `HttpManager`, `factory`, the
// failure reporter, the error-code ledger, `annotateSocketError` — stays inside. Apps never import
// it: the root eslint config closes it, and they reach sockets and HTTP through `runtime` from
// @chatic/app-runtime.

// socket — `types.ts` holds no values, so exporting it whole puts only types here.
export * from './socket/types';
export * from './socket/constants';
export * from './socket/runtime';
export * from './socket/backgroundClouds';
export * from './socket/linkState';
export * from './socket/devicePlatform';
export * from './socket/socketVerifyTrace';
export * from './socket/utils/slotKey';
export * from './socket/utils/closeReason';
export * from './socket/utils/socketErrorCode';

// http
export * from './http/transport';
export * from './http/gateways';
export * from './http/credentialRecovery';
export * from './http/authFailureReaction';
