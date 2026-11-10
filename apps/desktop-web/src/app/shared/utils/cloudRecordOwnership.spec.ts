import { beforeEach, describe, expect, it } from 'vitest';

import { useJoinedCloudsStore } from '../stores/useJoinedCloudsStore';
import { CLOUD_RECORD_OWNER_KEY, reconcileCloudRecordOwners } from './cloudRecordOwnership';

type Row = { id: string; cid: string; cloudType?: string; acceptedBy?: string[] };

// A stand-in cloud cache, so the tests read what is stored rather than which calls were made.
const makeCloud = (initial: Row[]) => {
    const rows = new Map(initial.map(row => [row.id, row]));
    return {
        rows,
        cacheReadList: async () => ({ list: [...rows.values()] }),
        cacheWrite: async (item: Row) => {
            rows.set(item.id, { ...rows.get(item.id), ...item });
        },
    };
};

beforeEach(() => {
    localStorage.clear();
    useJoinedCloudsStore.setState({ joinedClouds: {} });
});

describe('reconcileCloudRecordOwners', () => {
    describe('records written before attribution existed', () => {
        it('are adopted by the first account that signs in', async () => {
            const cloud = makeCloud([{ id: '1', cid: '1', cloudType: 'invited' }]);
            useJoinedCloudsStore.setState({ joinedClouds: { '1': { id: '1', name: 'One' } } });

            await reconcileCloudRecordOwners(cloud as never, 'account-a');

            expect(cloud.rows.get('1')?.acceptedBy).toEqual(['account-a']);
            expect(useJoinedCloudsStore.getState().joinedClouds['1']?.ownerUid).toBe('account-a');
        });

        it('stay hidden from a second account that signs in afterwards', async () => {
            const cloud = makeCloud([{ id: '1', cid: '1', cloudType: 'invited' }]);
            await reconcileCloudRecordOwners(cloud as never, 'account-a');
            localStorage.removeItem(CLOUD_RECORD_OWNER_KEY); // a sign-out in between

            await reconcileCloudRecordOwners(cloud as never, 'account-b');

            expect(cloud.rows.get('1')?.acceptedBy).toEqual(['account-a']);
        });

        it('leave a record that already has an owner alone, and a second run changes nothing', async () => {
            const cloud = makeCloud([
                { id: '1', cid: '1', cloudType: 'invited', acceptedBy: ['account-a'] },
                { id: '2', cid: '2', cloudType: 'invited' },
            ]);
            useJoinedCloudsStore.setState({
                joinedClouds: { '3': { id: '3', ownerUid: 'account-a' }, '4': { id: '4' } },
            });

            await reconcileCloudRecordOwners(cloud as never, 'account-b');
            const after = JSON.stringify([[...cloud.rows.values()], useJoinedCloudsStore.getState().joinedClouds]);
            await reconcileCloudRecordOwners(cloud as never, 'account-b');

            expect(cloud.rows.get('1')?.acceptedBy).toEqual(['account-a']);
            expect(cloud.rows.get('2')?.acceptedBy).toEqual(['account-b']);
            expect(useJoinedCloudsStore.getState().joinedClouds['3']?.ownerUid).toBe('account-a');
            expect(useJoinedCloudsStore.getState().joinedClouds['4']?.ownerUid).toBe('account-b');
            expect(JSON.stringify([[...cloud.rows.values()], useJoinedCloudsStore.getState().joinedClouds])).toBe(
                after
            );
        });

        it('are not taken from an owned row, which is not an invited cloud', async () => {
            const cloud = makeCloud([{ id: '1', cid: '1', cloudType: 'owner' }]);

            await reconcileCloudRecordOwners(cloud as never, 'account-a');

            expect(cloud.rows.get('1')?.acceptedBy).toBeUndefined();
        });
    });

    describe('a guest that links to another uid without signing out', () => {
        it("moves the guest's records to the account", async () => {
            const cloud = makeCloud([{ id: '1', cid: '1', cloudType: 'invited', acceptedBy: ['guest-1'] }]);
            useJoinedCloudsStore.setState({ joinedClouds: { '1': { id: '1', ownerUid: 'guest-1' } } });
            await reconcileCloudRecordOwners(cloud as never, 'guest-1');

            await reconcileCloudRecordOwners(cloud as never, 'account-x');

            expect(cloud.rows.get('1')?.acceptedBy).toEqual(['account-x']);
            expect(useJoinedCloudsStore.getState().joinedClouds['1']?.ownerUid).toBe('account-x');
        });

        it('does not move them after a sign-out, which forgets who held the records', async () => {
            const cloud = makeCloud([{ id: '1', cid: '1', cloudType: 'invited', acceptedBy: ['guest-1'] }]);
            await reconcileCloudRecordOwners(cloud as never, 'guest-1');
            localStorage.removeItem(CLOUD_RECORD_OWNER_KEY);

            await reconcileCloudRecordOwners(cloud as never, 'account-x');

            expect(cloud.rows.get('1')?.acceptedBy).toEqual(['guest-1']);
        });
    });
});
