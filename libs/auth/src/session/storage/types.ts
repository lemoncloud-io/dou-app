import type { KeyValueStore, NativeMedium } from '@chatic/storage';

export interface SecretStorageBoot {
    /** The device vault, not hydrated yet. */
    vault: NativeMedium;
    /** The session's plain medium — where the logout marker lives. */
    plain: KeyValueStore;
    /** Where the secrets used to live: this origin's `localStorage`. */
    web: KeyValueStore;
    /**
     * The vault's fallback — the tab's `sessionStorage`. A run whose vault was unavailable left the
     * tokens there; they go once the vault answers again, or at a logout.
     */
    tab: KeyValueStore;
    /** The document was opened by a logout (`?logout=1`). */
    afterLogout: boolean;
}

/** Which row of the migration table a boot took, for the boot log. */
export type SecretStorageOutcome =
    | 'logout-finished'
    | 'unavailable-with-web-copy'
    | 'unavailable'
    | 'vault'
    | 'migrated'
    | 'migration-refused'
    | 'empty';

export interface ILogoutStorageSweeper {
    /** No-op unless the current URL carries `?logout=1`. Safe to call on every boot. */
    sweep(): void;
}

export interface ISecretStorageMigration {
    /**
     * Loads the vault and moves secrets still in web storage into it. Runs once per page, after the
     * entry point built the media and before anything reads the session. Never rejects.
     */
    prepare(boot: SecretStorageBoot): Promise<SecretStorageOutcome>;
}
