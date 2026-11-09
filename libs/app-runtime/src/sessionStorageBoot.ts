import { secretStorageMigration } from '@chatic/auth';
import { sessionMedia } from '@chatic/session';

import type { SecretStorageBoot, SecretStorageOutcome } from '@chatic/auth';
import type { SessionStoragePorts } from '@chatic/session';

/** Loads the device vault and moves secrets left in web storage into it. See `@chatic/auth`'s `secretStorageMigration`. */
export const prepareSecretStorage = (boot: SecretStorageBoot): Promise<SecretStorageOutcome> =>
    secretStorageMigration.prepare(boot);

/** Points the session at other media after boot. Assignment: what the stores read next comes from them. */
export const setSessionStorage = (ports: SessionStoragePorts): void => sessionMedia.configure(ports);
