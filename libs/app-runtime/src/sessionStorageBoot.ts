import { secretStorageMigration } from '@chatic/auth';

import type { SecretStorageBoot, SecretStorageOutcome } from '@chatic/auth';

/** Loads the device vault and moves secrets left in web storage into it. See `@chatic/auth`'s `secretStorageMigration`. */
export const prepareSecretStorage = (boot: SecretStorageBoot): Promise<SecretStorageOutcome> =>
    secretStorageMigration.prepare(boot);
