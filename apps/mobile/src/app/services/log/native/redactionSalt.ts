import { createRedactionSalt, MIN_REDACTION_SALT_LENGTH } from '@chatic/logger';
import { createMMKV } from 'react-native-mmkv';

/**
 * The device's masking salt — what makes a masked token, number or address print the same
 * fingerprint every time on this device, and a different one on any other.
 *
 * Issued here, once per install, and kept in MMKV so it outlives the process: a fingerprint that
 * changed on every launch could not say "the same token as yesterday". The WebView gets the same
 * value injected beside the run id, so a value masked by native code and by the web reads alike.
 *
 * It is never logged and never uploaded. Wiping the app's storage draws a new one, and fingerprints
 * from before no longer match those after — the same as moving to another device.
 *
 * **Only from a cryptographic random source.** Where the runtime has none (React Native's Hermes
 * offers no `crypto.getRandomValues` today) no salt is drawn, nothing is stored, and the app keeps
 * masking in the bare form; the WebView then draws its own. A salt from `Math.random` would be worse
 * than none — see `createRedactionSalt`.
 */

const REDACTION_SALT_STORAGE_KEY = '@chatic/log.redaction-salt';

/** The two calls this needs from MMKV, so the rule can be tested without the native module. */
export interface RedactionSaltStore {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
}

export const loadOrCreateRedactionSalt = (store: RedactionSaltStore): string | undefined => {
    try {
        const stored = store.getString(REDACTION_SALT_STORAGE_KEY);
        if (stored && stored.length >= MIN_REDACTION_SALT_LENGTH) return stored;
    } catch {
        // An unreadable store gets a new salt, as a first launch would.
    }
    const created = createRedactionSalt();
    if (!created) return undefined;
    try {
        store.set(REDACTION_SALT_STORAGE_KEY, created);
    } catch {
        // Still used for this run; the next launch draws another.
    }
    return created;
};

let resolved: { salt: string | undefined } | undefined;

/** This install's salt, read once per process; `undefined` where none can be drawn. */
export const nativeRedactionSalt = (): string | undefined =>
    (resolved ??= { salt: loadOrCreateRedactionSalt(createMMKV()) }).salt;
