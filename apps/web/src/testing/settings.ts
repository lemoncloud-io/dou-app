import { config } from '@chatic/config';
import type { StorageLike } from '@chatic/runtime';

/**
 * Test-only: wires the settings `runtime.settings` reads and writes to `storage`, as a production web
 * build sees them.
 *
 * In the app this is the entry point's job, and wiring is not something the runtime facade sells, so a
 * test that wants the real registry and resolver rather than a mock wires them here. That keeps
 * `@chatic/config` out of the tests themselves: they read and write through `runtime.settings`, as the
 * code under test does. Call it once per test — `init` only re-reads storage.
 */
export const wireTestSettings = (storage: { local: StorageLike; session: StorageLike }): void => {
    config.init({
        env: { stage: () => 'PROD', buildStage: () => 'PROD', platform: () => 'web', raw: () => undefined },
        storage,
    });
};
