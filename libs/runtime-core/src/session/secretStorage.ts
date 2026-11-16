import { secretStorageMigration } from '@chatic/auth';
import type { SecretStorageBoot, SecretStorageOutcome } from '@chatic/auth';

export type { SecretStorageBoot, SecretStorageOutcome } from '@chatic/auth';

/**
 * Loads the device vault behind the session's `secret` store, before the runtime is created — the
 * boot step every entry that keeps the session's secrets in a vault runs, a page's or the phone app's.
 * It finishes a logout whose clear was never confirmed (the vault is emptied before it is read), and
 * moves secrets an older build left in web storage into the vault. Never rejects: a vault that cannot
 * be used is an outcome (`unavailable`), not an error. See `@chatic/auth`'s `secretStorageMigration`.
 */
export const prepareSecretStorage = (boot: SecretStorageBoot): Promise<SecretStorageOutcome> =>
    secretStorageMigration.prepare(boot);
