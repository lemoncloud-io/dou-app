import { secretStorageMigration } from '@chatic/auth';
import type { SecretStorageBoot, SecretStorageOutcome } from '@chatic/auth';
import { SECRET_LOGOUT_PENDING_KEY } from '@chatic/session';
import type { KeyValueStore } from '@chatic/storage';

export type { SecretStorageBoot, SecretStorageOutcome } from '@chatic/auth';

export const prepareSecretStorage = (boot: SecretStorageBoot): Promise<SecretStorageOutcome> =>
    secretStorageMigration.prepare(boot);

export const hasWebSessionCopy = (web: KeyValueStore): boolean => secretStorageMigration.hasWebCopy(web);

export const discardWebSessionCopy = (web: KeyValueStore): void => secretStorageMigration.discardWebCopy(web);

export const setSecretLogoutPending = (plain: KeyValueStore, pending: boolean): void => {
    if (pending) plain.set(SECRET_LOGOUT_PENDING_KEY, '1');
    else plain.remove(SECRET_LOGOUT_PENDING_KEY);
};
