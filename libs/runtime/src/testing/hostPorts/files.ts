import type { FilesPort } from '@chatic/runtime-client';

export const browserFiles = (): FilesPort => ({
    kind: 'browser',
    put: async () => ({ kind: 'no-response', reason: 'network' }),
    transfers: null,
});
