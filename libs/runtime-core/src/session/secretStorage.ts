import { secretStorageMigration } from '@chatic/auth';
import type { SecretStorageBoot, SecretStorageOutcome } from '@chatic/auth';
import type { KeyValueStore } from '@chatic/storage';

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

/**
 * Whether web storage still holds a copy of the session's tokens that no boot has moved into a vault.
 * The boot lets such a copy replace what the vault holds, so a page that is about to hand the session
 * to the vault asks this first.
 */
export const hasWebSessionCopy = (web: KeyValueStore): boolean => secretStorageMigration.hasWebCopy(web);

/**
 * Deletes the copy of the session's tokens from web storage, for a page whose session has moved on
 * from it — a sign-out on a launch the shell owns, or tokens written before the page learned the shell
 * keeps a vault. Left in place, the next boot would let it replace the vault's session.
 */
export const discardWebSessionCopy = (web: KeyValueStore): void => secretStorageMigration.discardWebCopy(web);
