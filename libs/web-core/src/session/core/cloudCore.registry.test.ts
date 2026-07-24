// In-memory storage so the test does not pull the @chatic/shared UI barrel (jsdom can't transform it).
const mockMem = new Map<string, string>();
jest.mock('@chatic/shared', () => ({
    storage: {
        get: (k: string) => (mockMem.has(k) ? mockMem.get(k)! : null),
        set: (k: string, v: string) => {
            mockMem.set(k, v);
        },
        remove: (k: string) => {
            mockMem.delete(k);
        },
    },
}));

import { getInvitedCloudRegistry, removeInvitedCloud, upsertInvitedCloud } from './cloudCore';

describe('invited-cloud registry (cloudCore)', () => {
    beforeEach(() => {
        mockMem.clear();
    });

    it('returns an empty array when nothing is stored', () => {
        expect(getInvitedCloudRegistry()).toEqual([]);
    });

    it('inserts a new entry', () => {
        upsertInvitedCloud({ cloudId: 'c1', name: 'Cloud One' });
        expect(getInvitedCloudRegistry()).toEqual([{ cloudId: 'c1', name: 'Cloud One' }]);
    });

    it('merges (updates name) instead of duplicating an existing cloudId', () => {
        upsertInvitedCloud({ cloudId: 'c1', name: 'Old' });
        upsertInvitedCloud({ cloudId: 'c1', name: 'New' });
        const list = getInvitedCloudRegistry();
        expect(list).toHaveLength(1);
        expect(list[0]).toEqual({ cloudId: 'c1', name: 'New' });
    });

    it('ignores an entry without a cloudId', () => {
        upsertInvitedCloud({ cloudId: '' });
        expect(getInvitedCloudRegistry()).toEqual([]);
    });

    it('removes an entry by cloudId', () => {
        upsertInvitedCloud({ cloudId: 'c1' });
        upsertInvitedCloud({ cloudId: 'c2' });
        removeInvitedCloud('c1');
        expect(getInvitedCloudRegistry().map(e => e.cloudId)).toEqual(['c2']);
    });

    it('tolerates malformed stored JSON by returning an empty array', () => {
        mockMem.set('chatic-invited-clouds', '{not json');
        expect(getInvitedCloudRegistry()).toEqual([]);
    });
});
