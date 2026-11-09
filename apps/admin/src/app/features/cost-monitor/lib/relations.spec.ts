import { describe, expect, it } from 'vitest';

import { buildTenants, countPool, latestSlots, matchSlotFilter, type SlotRow, type WorkspaceRow } from './relations';

const A = '111111111111';
const B = '222222222222';
const C = '333333333333';
const workspaces: WorkspaceRow[] = [
    {
        id: 'w1',
        name: 'ws-1',
        accountNo: A,
        createdBy: 'chatic-backend-api',
        ownerId: 'u1',
        owner$: { id: 'u1', name: 'User 1' },
        slotId: 's1',
    },
    { id: 'w2', name: 'ws-2', accountNo: A, ownerId: 'u2' },
    { id: 'w3', code: 'ws-3', accountNo: B, slotId: 's4' },
    { id: 'w9', name: 'not-aws', accountNo: 'abc' },
];
const slots: SlotRow[] = [
    { id: 's1', state: 'assigned', accountNo: A, workspaceId: 'w1' },
    { id: 's2', state: 'idle', accountNo: C },
    { id: 's3', state: 'provisioning' },
    { id: 's4', state: 'idle', accountNo: B },
    { id: 's5', state: 'assigned', accountNo: C },
    { id: 's6', state: 'error', accountNo: C },
];

describe('relations', () => {
    const tenants = buildTenants(workspaces, slots);
    const byKey = (key: string) => tenants.find(tenant => tenant.key === key);

    it('puts one account on one row and reads metrics from its DoU workspace', () => {
        expect(byKey(A)?.workspaces).toHaveLength(2);
        expect(byKey(A)?.workspaceId).toBe('w1');
        expect(byKey(A)?.dou).toBe(true);
        expect(byKey(A)?.workspaces[0].ownerName).toBe('User 1');
        expect(byKey(A)?.slots[0].problem).toBeUndefined();
    });

    it('drops non-AWS accounts and keys an account-less slot by itself', () => {
        expect(byKey('abc')).toBeUndefined();
        expect(byKey('slot:s3')?.accountNo).toBeUndefined();
        expect(byKey('slot:s3')?.workspaceId).toBeUndefined();
    });

    it('flags slots the workspaces disagree with', () => {
        expect(byKey(B)?.slots[0].problem).toMatch(/points here but the slot is idle/);
        expect(byKey(C)?.workspaces).toHaveLength(0);
        expect(byKey(C)?.slots.map(slot => !!slot.problem)).toEqual([false, true, true]);
    });

    it('filters by slot state', () => {
        const keys = (filter: 'problem' | 'assigned') =>
            tenants
                .filter(tenant => matchSlotFilter(tenant, filter))
                .map(tenant => tenant.key)
                .sort();
        expect(keys('problem')).toEqual([B, C]);
        expect(keys('assigned')).toEqual([A, C]);
    });

    it('counts the pool and keeps the latest copy of a repeated slot', () => {
        expect(countPool(slots)).toEqual({
            total: 6,
            idle: 2,
            assigned: 2,
            provisioning: 1,
            releasing: 0,
            cleaning: 0,
            errorCount: 1,
            archived: 0,
        });
        const latest = latestSlots([
            { id: 'x', state: 'idle', updatedAt: 1 },
            { id: 'x', state: 'assigned', updatedAt: 2 },
            { id: 'y', state: 'idle' },
        ]);
        expect(latest.duplicates).toBe(1);
        expect(latest.slots.map(slot => slot.state)).toEqual(['assigned', 'idle']);
    });
});
