import type { CacheDomainVersions } from '@chatic/app-messages';

import { deriveCacheDomainVersions } from '../../database/sqlite/cacheContract';
import { provider } from '../provider';

/**
 * How long the handshake will wait for the measurement. Not a performance budget — a guard against
 * a wedged DB holding the reply hostage. The web's bridge request times out at 10s, and losing the
 * whole handshake costs more than losing the per-domain detail, so this stays well under it.
 */
const MEASURE_TIMEOUT_MS = 3_000;

let pending: Promise<CacheDomainVersions | undefined> | null = null;

const measure = async (): Promise<CacheDomainVersions> => {
    // Touching `provider.sqliteDatabase` is what opens the DB and runs migrations, so it must stay
    // inside this function — the module is imported during boot, this runs when the web asks.
    const userVersion = await provider.sqliteDatabase.getSchemaVersion();
    return deriveCacheDomainVersions(userVersion);
};

/** Loses the race silently, and stops its own timer when it does — this runs on every handshake. */
const timeout = (ms: number): { promise: Promise<undefined>; cancel: () => void } => {
    let timer: ReturnType<typeof setTimeout>;
    const promise = new Promise<undefined>(resolve => {
        timer = setTimeout(() => resolve(undefined), ms);
    });
    return { promise, cancel: () => clearTimeout(timer) };
};

/**
 * The per-domain cache contract report for this install, measured from the DB it actually reached
 * (ADR-0053 decision 8) rather than restated from a compile-time constant.
 *
 * Resolves `undefined` — never rejects — when the DB is unreachable or too slow; the bridge host
 * then falls back to the static declaration, which is exactly the report this app sent before
 * contract versions existed.
 *
 * Only a real answer is memoized. A measured report cannot change within a process, so re-reading
 * it on a WebView reload would be waste — but a non-answer is a transient (a wedged first boot, a
 * lock held by a migration), and caching THAT would let one slow boot pin every later handshake in
 * the process to the fallback.
 */
export const resolveCacheDomainVersions = (): Promise<CacheDomainVersions | undefined> => {
    if (!pending) {
        const guard = timeout(MEASURE_TIMEOUT_MS);
        const attempt = Promise.race([measure(), guard.promise])
            .catch(() => undefined)
            .finally(guard.cancel);
        pending = attempt;
        // `pending === attempt` guards against clearing a newer attempt that a concurrent caller
        // already started.
        void attempt.then(versions => {
            if (!versions && pending === attempt) pending = null;
        });
    }
    return pending;
};

/** Test seam — drops the memoized measurement. */
export const resetCacheDomainVersions = (): void => {
    pending = null;
};
