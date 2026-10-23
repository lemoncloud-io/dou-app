import { createRedactionSalt, MIN_REDACTION_SALT_LENGTH, setRedactionSalt } from '@chatic/bridges';

/**
 * The masking salt this runtime fingerprints masked values with (`@chatic/logger`'s
 * docs/redaction).
 *
 * Inside the app the native shell injects its own, so a token masked by the web and by native code
 * prints the same fingerprint. A standalone tab — or an app build from before the injection — keeps
 * one in `localStorage`, per browser profile. Nothing here logs or uploads it. The injected global is
 * removed once read, but the shell's after-load injection writes it again: like the run id and the
 * device ids beside it, it is readable by scripts on the page.
 */

const STORAGE_KEY = '@chatic/web.log.redaction-salt';

interface NativeGlobals {
    CHATIC_APP_LOG_SALT?: string;
}

const isSalt = (value: unknown): value is string =>
    typeof value === 'string' && value.length >= MIN_REDACTION_SALT_LENGTH;

export const resolveRedactionSalt = (): string | undefined => {
    const globals = window as unknown as NativeGlobals;
    const injected = globals.CHATIC_APP_LOG_SALT;
    delete globals.CHATIC_APP_LOG_SALT;
    if (isSalt(injected)) return injected;

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (isSalt(stored)) return stored;
        const created = createRedactionSalt();
        if (created) localStorage.setItem(STORAGE_KEY, created);
        return created;
    } catch {
        // Storage refused (a private window, a full quota): a salt for this page load only.
        return createRedactionSalt();
    }
};

/** Call at boot, before anything is serialized — masking reads the salt as it runs. */
export const attachRedactionSalt = (): void => setRedactionSalt(resolveRedactionSalt());
