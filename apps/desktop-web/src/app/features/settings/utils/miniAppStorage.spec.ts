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
            remove: (key: string) => {
                if (!fake.refuseWrites) map.delete(key);
            },
            clear: () => map.clear(),
            keys: () => [...map.keys()],
        },
    };
});

vi.mock('../../../storage', () => ({ deviceStore: fake.device }));

import { hasMiniAppConsent, readMiniAppLinks, writeMiniAppConsent, writeMiniAppLinks } from './miniAppStorage';

const link = { appId: 'sample', name: 'Sample' } as unknown as Parameters<typeof writeMiniAppLinks>[1][number];

describe('miniAppStorage', () => {
    beforeEach(() => {
        fake.map.clear();
        fake.refuseWrites = false;
    });

    it('reports a list write as saved once it reads back', () => {
        expect(writeMiniAppLinks('c1', [link])).toBe(true);
        expect(fake.map.has('dou.miniAppLinks.c1')).toBe(true);
    });

    it('reports a list write the storage dropped as refused', () => {
        fake.refuseWrites = true;
        expect(writeMiniAppLinks('c1', [link])).toBe(false);
        expect(readMiniAppLinks('c1')).toEqual([]);
    });

    it('removes the key for an empty list', () => {
        fake.map.set('dou.miniAppLinks.c1', '[]');
        expect(writeMiniAppLinks('c1', [])).toBe(true);
        expect(fake.map.has('dou.miniAppLinks.c1')).toBe(false);
    });

    it('keeps consent per account and host, and none without an account', () => {
        writeMiniAppConsent('a1', 'x.apps.chatic.io');
        expect(hasMiniAppConsent('a1', 'x.apps.chatic.io')).toBe(true);
        expect(hasMiniAppConsent('a2', 'x.apps.chatic.io')).toBe(false);
        expect(hasMiniAppConsent(null, 'x.apps.chatic.io')).toBe(false);
    });
});
