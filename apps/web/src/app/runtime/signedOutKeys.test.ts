import type { KeyValueStore } from '@chatic/storage';

import { LOG_KEY_PREFIX } from './logging/logUploadStore';
import { dropSignedOutKeys } from './signedOutKeys';
import { TELEMETRY_POLICY_KEY_PREFIX } from './telemetry/policy';

jest.mock('./logging/logUploadStore', () => ({ LOG_KEY_PREFIX: '@chatic/web.log.' }));
jest.mock('./telemetry/policy', () => ({ TELEMETRY_POLICY_KEY_PREFIX: '@chatic/web.telemetry.policy' }));

const memoryStore = (entries: Record<string, string>): KeyValueStore & { entries: Record<string, string> } => ({
    entries,
    get: key => entries[key] ?? null,
    set: (key, value) => {
        entries[key] = value;
    },
    remove: key => {
        delete entries[key];
    },
    clear: () => Object.keys(entries).forEach(key => delete entries[key]),
    keys: () => Object.keys(entries),
});

describe('dropSignedOutKeys', () => {
    it("removes the log pipeline's and the telemetry policy's keys, and nothing else", () => {
        const store = memoryStore({
            [`${LOG_KEY_PREFIX}batch.1`]: 'a',
            [`${LOG_KEY_PREFIX}tab`]: 'b',
            [TELEMETRY_POLICY_KEY_PREFIX]: 'c',
            'vite-ui-theme': 'dark',
        });

        dropSignedOutKeys(store);

        expect(store.entries).toEqual({ 'vite-ui-theme': 'dark' });
    });
});
