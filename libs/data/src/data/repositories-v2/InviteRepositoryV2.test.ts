import { InviteRepositoryV2 } from './InviteRepositoryV2';

describe('InviteRepositoryV2', () => {
    const createRepository = () => {
        // Remote-only: there is no local data source to assemble, so only the remote path exists.
        const inviteRemoteDataSource = {
            listInvites: jest.fn().mockResolvedValue([]),
            createInvite: jest.fn().mockResolvedValue({}),
            getInvite: jest.fn().mockResolvedValue({}),
            acceptInvite: jest.fn().mockResolvedValue({}),
            cancelInvite: jest.fn().mockResolvedValue({}),
            rejectInvite: jest.fn().mockResolvedValue({}),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };
        const repository = new InviteRepositoryV2(inviteRemoteDataSource as any, contextProvider as any);

        return { repository, inviteRemoteDataSource };
    };

    it('list는 원격 결과를 가공 없이 그대로 반환한다', async () => {
        const { repository, inviteRemoteDataSource } = createRepository();
        const invites = [{ id: 'invt-1' }, { id: 'invt-2' }];
        inviteRemoteDataSource.listInvites.mockResolvedValue(invites);

        const result = await repository.list();

        expect(result).toBe(invites); // pass-through: 같은 참조 — 재정렬·재매핑하지 않는다
    });

    it('list는 필터가 없으면 null로 위임한다', async () => {
        const { repository, inviteRemoteDataSource } = createRepository();

        await repository.list();

        expect(inviteRemoteDataSource.listInvites).toHaveBeenCalledWith(null);
    });

    it('list는 상태 필터를 그대로 넘긴다', async () => {
        const { repository, inviteRemoteDataSource } = createRepository();

        await repository.list({ state: 'accepted' } as any);

        expect(inviteRemoteDataSource.listInvites).toHaveBeenCalledWith({ state: 'accepted' });
    });

    it('create는 입력을 그대로 위임하고 발급 뷰를 반환한다', async () => {
        const { repository, inviteRemoteDataSource } = createRepository();
        const view = { id: 'invt-1', deeplink: 'https://x/s?code=y' };
        inviteRemoteDataSource.createInvite.mockResolvedValue(view);

        const result = await repository.create({ phone: '01012345678', name: '홍길동' } as any);

        expect(inviteRemoteDataSource.createInvite).toHaveBeenCalledWith({ phone: '01012345678', name: '홍길동' });
        expect(result).toBe(view);
    });

    it('get은 코드를 위임하고 needVerify를 보존한다', async () => {
        const { repository, inviteRemoteDataSource } = createRepository();
        inviteRemoteDataSource.getInvite.mockResolvedValue({ id: 'invt-1', state: 'pending', needVerify: true });

        const result = await repository.get('invt:1:secret');

        expect(inviteRemoteDataSource.getInvite).toHaveBeenCalledWith('invt:1:secret');
        expect(result).toEqual({ id: 'invt-1', state: 'pending', needVerify: true });
    });

    it('accept는 코드를 위임하고 수락 뷰를 반환한다', async () => {
        const { repository, inviteRemoteDataSource } = createRepository();
        inviteRemoteDataSource.acceptInvite.mockResolvedValue({ id: 'invt-1', state: 'accepted' });

        const result = await repository.accept('invt:1:secret');

        expect(inviteRemoteDataSource.acceptInvite).toHaveBeenCalledWith('invt:1:secret');
        expect(result).toEqual({ id: 'invt-1', state: 'accepted' });
    });

    it('cancel은 코드를 위임하고 종국 뷰를 반환한다', async () => {
        const { repository, inviteRemoteDataSource } = createRepository();
        inviteRemoteDataSource.cancelInvite.mockResolvedValue({ id: 'invt-1', state: 'canceled', canceledAt: 1 });

        const result = await repository.cancel('invt:1:secret');

        expect(inviteRemoteDataSource.cancelInvite).toHaveBeenCalledWith('invt:1:secret');
        expect(result).toMatchObject({ state: 'canceled' });
    });

    it('reject는 코드를 위임하고 종국 뷰를 반환한다', async () => {
        const { repository, inviteRemoteDataSource } = createRepository();
        inviteRemoteDataSource.rejectInvite.mockResolvedValue({ id: 'invt-1', state: 'rejected', rejectedAt: 1 });

        const result = await repository.reject('invt:1:secret');

        expect(inviteRemoteDataSource.rejectInvite).toHaveBeenCalledWith('invt:1:secret');
        expect(result).toMatchObject({ state: 'rejected' });
    });

    it('원격 실패는 삼키지 않고 그대로 reject한다 (호출부가 에러 코드로 분기한다)', async () => {
        const { repository, inviteRemoteDataSource } = createRepository();
        const failure = new Error('403');
        inviteRemoteDataSource.acceptInvite.mockRejectedValue(failure);

        await expect(repository.accept('invt:1:secret')).rejects.toBe(failure);
    });

    it('캐시가 없으므로 매 호출이 원격에 나간다', async () => {
        const { repository, inviteRemoteDataSource } = createRepository();

        await repository.list();
        await repository.list();

        // 수락은 상대 기기에서 일어나고 알림 패킷이 없다 — 캐시가 있으면 낡은 카드만 보게 된다.
        expect(inviteRemoteDataSource.listInvites).toHaveBeenCalledTimes(2);
    });
});
