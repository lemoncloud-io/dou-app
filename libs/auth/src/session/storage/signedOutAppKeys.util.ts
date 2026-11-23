import type { KeyValueStore } from '@chatic/storage';

class SignedOutAppKeys {
    private prefixes: readonly string[] = [];

    register(prefixes: readonly string[]): void {
        this.prefixes = [...prefixes];
    }

    drop(store: KeyValueStore): void {
        if (!this.prefixes.length) return;
        store
            .keys()
            .filter(key => this.prefixes.some(prefix => key.startsWith(prefix)))
            .forEach(key => store.remove(key));
    }
}

export const signedOutAppKeys = new SignedOutAppKeys();

export const dropSignedOutAppKeys = (store: KeyValueStore): void => signedOutAppKeys.drop(store);
