import type { KeyValueStore } from '@chatic/storage';

/**
 * Keys outside the session that a sign-out takes, by the prefix of their names.
 *
 * The prefixes belong to the domains that write those keys — in apps/web, the log pipeline
 * (`@chatic/web.log.` — unsent batches, their heartbeats, the tab id, the crash sentinel) and the
 * telemetry policy (`@chatic/web.telemetry.policy`); the logs carry the account that just left. Each
 * app hands its domains' prefixes to `createWebRuntime({ signedOutKeyPrefixes })`, whose `createRuntime` registers them
 * here before the boot's own `?logout=1` sweep. This module only runs the sweep: it knows no app's
 * key names, so a new domain's keys are that domain's to declare.
 *
 * They are cleared from the session's plain store — `localStorage` inside a shell, `sessionStorage` in
 * a browser — which is the storage a sign-out has always taken them from. A browser's `localStorage`
 * upload queue is not in it, and stays.
 */
class SignedOutAppKeys {
    private prefixes: readonly string[] = [];

    /** Replaces the registered prefixes. Assignment, like the rest of the boot wiring, so a second boot does not accumulate. */
    register(prefixes: readonly string[]): void {
        this.prefixes = [...prefixes];
    }

    /** Removes every key under a registered prefix from `store`. Collected first: removing while walking shifts it. */
    drop(store: KeyValueStore): void {
        if (!this.prefixes.length) return;
        store
            .keys()
            .filter(key => this.prefixes.some(prefix => key.startsWith(prefix)))
            .forEach(key => store.remove(key));
    }
}

export const signedOutAppKeys = new SignedOutAppKeys();

/** Removes every registered signed-out app key from `store`. */
export const dropSignedOutAppKeys = (store: KeyValueStore): void => signedOutAppKeys.drop(store);
