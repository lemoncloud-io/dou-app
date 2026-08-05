import { InviteRemoteDataSource } from './InviteRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';

describe('InviteRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: InviteRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new InviteRemoteDataSource(mockGateways.invite);
    });

    describe('listInvites', () => {
        it('페이지 봉투에서 list만 꺼내 반환한다', async () => {
            mockGateways.invite.list.mockResolvedValue({ list: [{ id: 'invt-1' }], total: 1 } as any);

            const result = await dataSource.listInvites();

            expect(result).toEqual([{ id: 'invt-1' }]);
        });

        it('필터가 없으면 null을 넘긴다 (invite.list는 무인자 조회를 null로 받는다)', async () => {
            mockGateways.invite.list.mockResolvedValue({ list: [] } as any);

            await dataSource.listInvites();

            expect(mockGateways.invite.list).toHaveBeenCalledWith(null);
        });

        it('필터는 그대로 전달한다', async () => {
            mockGateways.invite.list.mockResolvedValue({ list: [] } as any);

            await dataSource.listInvites({ state: 'pending' } as any);

            expect(mockGateways.invite.list).toHaveBeenCalledWith({ state: 'pending' });
        });

        it('응답에 list가 없으면 빈 배열로 폴백한다', async () => {
            mockGateways.invite.list.mockResolvedValue({} as any);

            await expect(dataSource.listInvites()).resolves.toEqual([]);
        });

        it('응답 자체가 비어도 빈 배열로 폴백한다', async () => {
            mockGateways.invite.list.mockResolvedValue(undefined as any);

            await expect(dataSource.listInvites()).resolves.toEqual([]);
        });
    });

    it('createInvite는 페이로드를 그대로 invite.create에 위임한다', async () => {
        const payload = { phone: '01012345678', name: '홍길동' };
        mockGateways.invite.create.mockResolvedValue({ id: 'invt-1', deeplink: 'https://x/s?code=y' } as any);

        const result = await dataSource.createInvite(payload as any);

        expect(mockGateways.invite.create).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ id: 'invt-1', deeplink: 'https://x/s?code=y' });
    });

    it('getInvite는 코드를 body에만 담아 위임하고 needVerify를 함께 반환한다', async () => {
        mockGateways.invite.get.mockResolvedValue({ id: 'invt-1', state: 'pending', needVerify: true } as any);

        const result = await dataSource.getInvite('invt:1:secret');

        // 코드는 자격증명이라 body 한 자리에만 실린다.
        expect(mockGateways.invite.get).toHaveBeenCalledWith({ code: 'invt:1:secret' });
        expect(result.needVerify).toBe(true);
    });

    it('acceptInvite는 코드를 body에만 담아 위임한다', async () => {
        mockGateways.invite.accept.mockResolvedValue({ id: 'invt-1', state: 'accepted' } as any);

        const result = await dataSource.acceptInvite('invt:1:secret');

        expect(mockGateways.invite.accept).toHaveBeenCalledWith({ code: 'invt:1:secret' });
        expect(result).toEqual({ id: 'invt-1', state: 'accepted' });
    });

    it('만료·이미수락은 실패가 아니라 state로 돌아온다 (reject하지 않는다)', async () => {
        mockGateways.invite.get.mockResolvedValue({ id: 'invt-1', state: 'expired' } as any);

        await expect(dataSource.getInvite('invt:1:secret')).resolves.toMatchObject({ state: 'expired' });
    });

    it('cancelInvite는 코드를 body에만 담아 위임한다', async () => {
        mockGateways.invite.cancel.mockResolvedValue({ id: 'invt-1', state: 'canceled', canceledAt: 1 } as any);

        const result = await dataSource.cancelInvite('invt:1:secret');

        expect(mockGateways.invite.cancel).toHaveBeenCalledWith({ code: 'invt:1:secret' });
        expect(result).toMatchObject({ state: 'canceled' });
    });

    it('rejectInvite는 코드를 body에만 담아 위임한다', async () => {
        mockGateways.invite.reject.mockResolvedValue({ id: 'invt-1', state: 'rejected', rejectedAt: 1 } as any);

        const result = await dataSource.rejectInvite('invt:1:secret');

        expect(mockGateways.invite.reject).toHaveBeenCalledWith({ code: 'invt:1:secret' });
        expect(result).toMatchObject({ state: 'rejected' });
    });

    it('이미 수락된 초대의 취소·거절(409)은 게이트웨이 에러를 그대로 전파한다', async () => {
        const conflict = new Error('409 CONFLICT - invite is already accepted');
        mockGateways.invite.cancel.mockRejectedValue(conflict);

        await expect(dataSource.cancelInvite('invt:1:secret')).rejects.toBe(conflict);
    });
});
