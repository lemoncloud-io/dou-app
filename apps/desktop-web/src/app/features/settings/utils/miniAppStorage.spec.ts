import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
    const map = new Map<string, string>();
    return {
        map,
        refuseWrites: false,
        device: {
            get: (key: string) => map.get(key) ?? null,
            set: (key: string, value: string) => {
                if (!fake.refuseWrites) map.set(key, value);
            },
            remove: (key: string) => map.delete(key),
            clear: () => map.clear(),
            keys: () => [...map.keys()],
        },
    };
});

vi.mock('../../../storage', () => ({ deviceStore: fake.device }));

import { hasMiniAppConsent, writeMiniAppConsent } from './miniAppStorage';

describe('miniAppStorage', () => {
    beforeEach(() => {
        fake.map.clear();
        fake.refuseWrites = false;
    });

    it('keeps consent per account and host, and none without an account', () => {
        writeMiniAppConsent('a1', 'x.apps.chatic.io');
        expect(hasMiniAppConsent('a1', 'x.apps.chatic.io')).toBe(true);
        expect(hasMiniAppConsent('a2', 'x.apps.chatic.io')).toBe(false);
        expect(hasMiniAppConsent(null, 'x.apps.chatic.io')).toBe(false);
    });
});
