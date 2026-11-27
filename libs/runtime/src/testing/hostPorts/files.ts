import type { FilesPort } from '../../api';

export const browserFiles = (): FilesPort => ({
    kind: 'browser',
    put: async () => ({ kind: 'no-response', reason: 'network' }),
    transfers: null,
});
