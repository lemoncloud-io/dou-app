export { initAppRuntime } from './init';

export { isNativeApp } from './utils/isNativeApp';

export { discardWebSessionCopy, hasWebSessionCopy, prepareSecretStorage } from '../engine';
export type { SecretStorageBoot, SecretStorageOutcome } from '@chatic/auth';
export type { SessionStoragePorts } from '@chatic/session';

export { webTransport } from '@chatic/transport';
