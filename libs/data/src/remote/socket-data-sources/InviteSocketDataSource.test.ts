import { InviteSocketDataSource } from './InviteSocketDataSource';
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';

describe('InviteSocketDataSource', () => {
    let mockGateways: MockSocketGatewayBundle;
    let dataSource: InviteSocketDataSource;

    beforeEach(() => {
        mockGateways = createMockSocketGateways();
        dataSource = new InviteSocketDataSource(mockGateways.invite);
    });

    describe('listInvites', () => {
        it('pulls just the list out of the page envelope and returns it', async () => {
            mockGateways.invite.list.mockResolvedValue({ list: [{ id: 'invt-1' }], total: 1 } as any);

            const result = await dataSource.listInvites();

            expect(result).toEqual([{ id: 'invt-1' }]);
        });

        it('passes null when there is no filter (invite.list takes an argument-free read as null)', async () => {
            mockGateways.invite.list.mockResolvedValue({ list: [] } as any);

            await dataSource.listInvites();

            expect(mockGateways.invite.list).toHaveBeenCalledWith(null);
        });

        it('passes a filter straight through', async () => {
            mockGateways.invite.list.mockResolvedValue({ list: [] } as any);

            await dataSource.listInvites({ state: 'pending' } as any);

            expect(mockGateways.invite.list).toHaveBeenCalledWith({ state: 'pending' });
        });

        it('falls back to an empty array when the response holds no list', async () => {
            mockGateways.invite.list.mockResolvedValue({} as any);

            await expect(dataSource.listInvites()).resolves.toEqual([]);
        });

        it('falls back to an empty array even when the response itself is empty', async () => {
            mockGateways.invite.list.mockResolvedValue(undefined as any);

            await expect(dataSource.listInvites()).resolves.toEqual([]);
        });
    });

    it('createInvite delegates the payload to invite.create unchanged', async () => {
        const payload = { phone: '01012345678', name: 'Hong Gildong' };
        mockGateways.invite.create.mockResolvedValue({ id: 'invt-1', deeplink: 'https://x/s?code=y' } as any);

        const result = await dataSource.createInvite(payload as any);

        expect(mockGateways.invite.create).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ id: 'invt-1', deeplink: 'https://x/s?code=y' });
    });

    it('getInvite delegates with the code in the body only and returns needVerify with it', async () => {
        mockGateways.invite.get.mockResolvedValue({ id: 'invt-1', state: 'pending', needVerify: true } as any);

        const result = await dataSource.getInvite('invt:1:secret');

        // The code is a credential, so it rides in exactly one place: the body.
        expect(mockGateways.invite.get).toHaveBeenCalledWith({ code: 'invt:1:secret' });
        expect(result.needVerify).toBe(true);
    });

    it('acceptInvite delegates with the code in the body only', async () => {
        mockGateways.invite.accept.mockResolvedValue({ id: 'invt-1', state: 'accepted' } as any);

        const result = await dataSource.acceptInvite('invt:1:secret');

        expect(mockGateways.invite.accept).toHaveBeenCalledWith({ code: 'invt:1:secret' });
        expect(result).toEqual({ id: 'invt-1', state: 'accepted' });
    });

    it('expired and already-accepted come back as state rather than failure (they do not reject)', async () => {
        mockGateways.invite.get.mockResolvedValue({ id: 'invt-1', state: 'expired' } as any);

        await expect(dataSource.getInvite('invt:1:secret')).resolves.toMatchObject({ state: 'expired' });
    });

    it('cancelInvite delegates with the code in the body only', async () => {
        mockGateways.invite.cancel.mockResolvedValue({ id: 'invt-1', state: 'canceled', canceledAt: 1 } as any);

        const result = await dataSource.cancelInvite('invt:1:secret');

        expect(mockGateways.invite.cancel).toHaveBeenCalledWith({ code: 'invt:1:secret' });
        expect(result).toMatchObject({ state: 'canceled' });
    });

    it('rejectInvite delegates with the code in the body only', async () => {
        mockGateways.invite.reject.mockResolvedValue({ id: 'invt-1', state: 'rejected', rejectedAt: 1 } as any);

        const result = await dataSource.rejectInvite('invt:1:secret');

        expect(mockGateways.invite.reject).toHaveBeenCalledWith({ code: 'invt:1:secret' });
        expect(result).toMatchObject({ state: 'rejected' });
    });

    it('cancelling or rejecting an already-accepted invite (409) propagates the gateway error as is', async () => {
        const conflict = new Error('409 CONFLICT - invite is already accepted');
        mockGateways.invite.cancel.mockRejectedValue(conflict);

        await expect(dataSource.cancelInvite('invt:1:secret')).rejects.toBe(conflict);
    });
});
