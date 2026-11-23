export { initAppRuntime } from '@chatic/runtime-client';

export { isNativeApp } from './utils/isNativeApp';

export { discardWebSessionCopy, hasWebSessionCopy, prepareSecretStorage } from '@chatic/runtime-client';
export type { SecretStorageBoot, SecretStorageOutcome } from '@chatic/auth';
export type { SessionStoragePorts } from '@chatic/session';

export { webTransport } from '@chatic/transport';
