import type { FilesPort } from '@chatic/runtime-client';

/**
 * A browser tab's `files` port for tests: what the page does on its own, with no runner's mock in it —
 * this file loads under jest and vitest alike. A tab has no app transfer module; its PUT answers as one
 * that never reached the bucket, since a test that sends a file lays its own `put` over this one, as it
 * does a `transfers` member to watch.
 */
export const browserFiles = (): FilesPort => ({
    kind: 'browser',
    put: async () => ({ kind: 'no-response', reason: 'network' }),
    transfers: null,
});
