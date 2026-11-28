import type { CacheDomainVersions } from '@chatic/bridge-messages';

import { deriveCacheDomainVersions } from '@chatic/db-sqlite';
import { provider } from '../provider';

const MEASURE_TIMEOUT_MS = 3_000;

let pending: Promise<CacheDomainVersions | undefined> | null = null;

const measure = async (): Promise<CacheDomainVersions> => {
    const userVersion = await provider.sqliteDatabase.getSchemaVersion();
    return deriveCacheDomainVersions(userVersion);
};

const timeout = (ms: number): { promise: Promise<undefined>; cancel: () => void } => {
    let timer: ReturnType<typeof setTimeout>;
    const promise = new Promise<undefined>(resolve => {
        timer = setTimeout(() => resolve(undefined), ms);
    });
    return { promise, cancel: () => clearTimeout(timer) };
};

export const resolveCacheDomainVersions = (): Promise<CacheDomainVersions | undefined> => {
    if (!pending) {
        const guard = timeout(MEASURE_TIMEOUT_MS);
        const attempt = Promise.race([measure(), guard.promise])
            .catch(() => undefined)
            .finally(guard.cancel);
        pending = attempt;
        void attempt.then(versions => {
            if (!versions && pending === attempt) pending = null;
        });
    }
    return pending;
};

export const resetCacheDomainVersions = (): void => {
    pending = null;
};
