import type { KeyValueStore, NativeStore } from '@chatic/storage';

export interface SecretStorageBoot {
    vault: NativeStore;
    plain: KeyValueStore;
    web: KeyValueStore;
    tab: KeyValueStore;
    afterLogout: boolean;
}

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
    sweep(): void;
}

export interface ISecretStorageMigration {
    prepare(boot: SecretStorageBoot): Promise<SecretStorageOutcome>;
    hasWebCopy(web: KeyValueStore): boolean;
    discardWebCopy(web: KeyValueStore): void;
}
