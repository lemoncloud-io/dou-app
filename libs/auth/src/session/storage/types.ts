import type { KeyValueStore, NativeStore } from '@chatic/storage';

export interface SecretStorageBoot {
    /** The device vault, not hydrated yet. */
    vault: NativeStore;
    /** The session's plain store — where the logout marker lives. */
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
    | 'replaced'
    | 'migration-refused'
    | 'empty';

export interface ILogoutStorageSweeper {
    /**
     * No-op unless the platform's address (`authPlatform.ports().currentSearch()`) carries `?logout=1`.
     * Safe to call on every boot; throws if the auth platform was never configured.
     */
    sweep(): void;
}

export interface ISecretStorageMigration {
    /**
     * Loads the vault and moves secrets still in web storage into it. Runs once per page, after the
     * entry point built the stores and before anything reads the session. Never rejects.
     */
    prepare(boot: SecretStorageBoot): Promise<SecretStorageOutcome>;
    /** Whether `web` still holds any of the session's tokens: a copy no boot has moved into a vault. */
    hasWebCopy(web: KeyValueStore): boolean;
    /**
     * Deletes the session's tokens from `web`. A boot that finds them next to tokens in the vault lets
     * them replace the vault's (`prepare`), so a copy the person's session has since moved on from has to
     * go before that boot: one left from before a sign-out on a launch the shell owned, or one a page
     * wrote before it learned the shell keeps a vault.
     */
    discardWebCopy(web: KeyValueStore): void;
}
