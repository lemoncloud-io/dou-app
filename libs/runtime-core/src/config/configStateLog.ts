import { logger } from '@chatic/logger';
import { config } from '@chatic/config';

import type { ConfigSnapshot } from '@chatic/config';

const EXCLUDED_KEYS: ReadonlySet<string> = new Set(['debug.entryCode']);

const reported = (snapshot: ConfigSnapshot) => ({
    key: snapshot.key,
    value: snapshot.value,
    origin: snapshot.origin,
});

let detach: (() => void) | undefined;

export const attachConfigStateLog = (): (() => void) => {
    detach?.();

    const overrides = config
        .overriddenSnapshots()
        .filter(snapshot => !EXCLUDED_KEYS.has(snapshot.key))
        .map(reported);
    logger.info(
        'CONFIG',
        overrides.length === 0
            ? 'Boot state: no key is overridden'
            : `Boot state: ${overrides.length} key(s) overridden`,
        { overrides }
    );

    detach = config.subscribe(undefined, changedKeys => {
        for (const key of changedKeys) {
            if (EXCLUDED_KEYS.has(key)) continue;
            const snapshot = config.snapshot(key);
            if (snapshot) logger.info('CONFIG', `Changed: ${key}`, reported(snapshot));
        }
    });

    return () => {
        detach?.();
        detach = undefined;
    };
};
