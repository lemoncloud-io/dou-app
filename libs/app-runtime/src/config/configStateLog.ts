import { logger } from '@chatic/bridges';
import { config } from '@chatic/config';

import type { ConfigSnapshot } from '@chatic/config';

/**
 * Leaves this device's effective settings in the logs (ADR-0079 결정 16).
 *
 * ## Why events, not state
 *
 * The obvious shape — stamp the settings onto every entry, the way `attachLogContext` stamps the
 * run and route — does not survive contact with the volume. Five non-default keys on a fifty-entry
 * batch is 250 repeated pairs saying the same thing. So this records CHANGES and lets the collector
 * reconstruct the state at any point in time by replaying them:
 *
 * 1. **One line at boot**, listing every key some lane decided. On most devices that list is empty,
 *    which is itself the useful fact — it says "nothing here explains the bug".
 * 2. **One line per key afterwards**, whenever the resolved value moves, naming the row that won.
 *
 * Together they are a complete history, and the log pipeline already carries events — no new store
 * and no new format (ADR-0063). The screen half of 결정 16 is separate and reads `snapshotAll()`;
 * it belongs to the debug panel (ADR-0080), not here.
 *
 * ## Why `isOverridden` and not "differs from defaultValue"
 *
 * `overriddenSnapshots()` is keys a LANE supplied — shell, local storage, or the server. A value
 * that a `byStage`/`byPlatform` rule chose is excluded even though it differs from `defaultValue`,
 * because the registry choosing it is not news: `feature.auth.socialLogin` is off on every PROD
 * device by declaration, so counting it would fill the boot line on every device and drown the one
 * device where somebody actually changed something.
 *
 * ## Why it lives here
 *
 * `@chatic/config` imports nothing (ADR-0079 결정 1), so it cannot reach a logger, and every app
 * that boots the config registry also calls `initAppRuntime` — this lib is the one place that
 * depends on both. Doing it per app would be four copies of the same twelve lines.
 *
 * ## Why the values are not redacted
 *
 * The registry holds settings, not identity: device ids, tokens and personal data were deliberately
 * kept out of it (ADR-0079 §카브아웃), so there is nothing here to leak. `debug.entryCode` is the
 * single exception and the single exclusion below — it is a credential, and an endpoint pointing at
 * a QA server is exactly the kind of fact worth carrying.
 */
const EXCLUDED_KEYS: ReadonlySet<string> = new Set(['debug.entryCode']);

/** What a reader needs to explain a value: what it is, and which row decided it. */
const reported = (snapshot: ConfigSnapshot) => ({
    key: snapshot.key,
    value: snapshot.value,
    origin: snapshot.origin,
});

/**
 * Held at module scope so a second `attachConfigStateLog()` replaces the subscription instead of
 * stacking a second one — the same "wiring is assignment, not accumulation" rule `initAppRuntime`
 * states, and what keeps an HMR reload from double-logging every change.
 */
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
            // A key that resolves to nothing has no state to report — only an unknown key does
            // that, and `notify` never carries one.
            if (snapshot) logger.info('CONFIG', `Changed: ${key}`, reported(snapshot));
        }
    });

    return () => {
        detach?.();
        detach = undefined;
    };
};
