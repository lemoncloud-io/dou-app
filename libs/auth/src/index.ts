// @chatic/auth — logging in, switching cloud, renewing a credential, ending a session, and pairing.
//
// This barrel is what the runtime modules above it read. It sells each module the layers above
// import, whole; a module nothing above imports — the session auth adapter, the signature helpers,
// the auth-id registry, the cloud-identity reader, the revoked-session reader, the site alignment,
// the cloud renewal step the renewers call — stays inside. Apps never import it: the root eslint
// config closes it, and they reach these through `runtime.session` and `runtime.connection` from
// @chatic/app-runtime.

// session — the relay and cloud sessions, and the use cases over them.
export * from './session/authActions';
export * from './session/authRepository';
export * from './session/clearSiteSelection';
export * from './session/cloudSession';
export * from './session/cloudTokens';
export * from './session/logoutStorageSweep';
export * from './session/relaySession';

// pairing — signing a device in from another device.
export * from './pairing/pairedCloudSessions';
export * from './pairing/pairedClouds';
export * from './pairing/pairedSession';
export * from './pairing/pairingClient';
export * from './pairing/pairingErrors';
export * from './pairing/pairingRequestFlow';

// socket — authentication on the socket slots. `types.ts` holds no values.
export * from './socket/types';
export * from './socket/applySessionToken';
export * from './socket/authStatus';
export * from './socket/backgroundCloudTokens';
export * from './socket/bootstrapSocketConnection';
export * from './socket/logoutCloudSession';
export * from './socket/logoutSession';
export * from './socket/reauthDelegate';
export * from './socket/reauthenticateActiveSocket';
export * from './socket/reclaimOwnedClouds';
export * from './socket/recoverUnverifiedSockets';
export * from './socket/renewers';
export * from './socket/requestRelaySessionRefresh';
export * from './socket/sessionDelegate';
export * from './socket/switchSite';

// utils — the concurrency guards the renewals use, which the app-layer hooks share.
export * from './utils/coalescer';
export * from './utils/throttle';
