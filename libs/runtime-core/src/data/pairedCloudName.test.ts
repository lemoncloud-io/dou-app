import { syncPairedCloudName } from './pairedCloudName';

jest.mock('@chatic/auth', () => ({ pairedClouds: {} }));

const makeStore = (paired: string[]) => ({
    has: jest.fn((id: string) => paired.includes(id)),
    setName: jest.fn(),
});

describe('syncPairedCloudName', () => {
    it('reads the name without caching it and keeps it in the paired-cloud store', async () => {
        const store = makeStore(['1000002']);
        const cloud = { getCloud: jest.fn().mockResolvedValue({ id: '1000002', name: 'Team Cloud' }) };

        await syncPairedCloudName(cloud as any, '1000002', store);

        expect(cloud.getCloud).toHaveBeenCalledWith({ id: '1000002' }, { cache: false });
        expect(store.setName).toHaveBeenCalledWith('1000002', 'Team Cloud');
    });

    it('does not read a cloud that is not paired', async () => {
        const store = makeStore([]);
        const cloud = { getCloud: jest.fn() };

        await syncPairedCloudName(cloud as any, '1000002', store);
        await syncPairedCloudName(cloud as any, undefined, store);

        expect(cloud.getCloud).not.toHaveBeenCalled();
    });

    it('stays silent and keeps the fallback when the read fails or carries no name', async () => {
        const store = makeStore(['1000002']);
        const failing = { getCloud: jest.fn().mockRejectedValue(new Error('403')) };
        const nameless = { getCloud: jest.fn().mockResolvedValue({ id: '1000002' }) };

        await expect(syncPairedCloudName(failing as any, '1000002', store)).resolves.toBeUndefined();
        await syncPairedCloudName(nameless as any, '1000002', store);

        expect(store.setName).not.toHaveBeenCalled();
    });
});
