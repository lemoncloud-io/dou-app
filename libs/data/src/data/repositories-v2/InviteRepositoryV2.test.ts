import { InviteRepositoryV2 } from './InviteRepositoryV2';

describe('InviteRepositoryV2', () => {
    const makeLocalDataSourceMock = () => ({
        cacheRead: jest.fn().mockResolvedValue(null),
        cacheReadList: jest.fn().mockResolvedValue({ list: [], meta: { total: 0, source: 'local' } }),
        observeItem: jest.fn(),
        observeList: jest.fn().mockReturnValue(() => undefined),
        cacheWrite: jest.fn().mockResolvedValue(undefined),
        cacheWriteMany: jest.fn().mockResolvedValue(undefined),
        cacheDelete: jest.fn().mockResolvedValue(undefined),
        cacheDeleteMany: jest.fn().mockResolvedValue(undefined),
        cacheClear: jest.fn().mockResolvedValue(undefined),
    });

    const createRepository = (context: { cid?: string; uid?: string } = { cid: 'default', uid: 'me' }) => {
        const inviteRemoteDataSource = {
            listInvites: jest.fn().mockResolvedValue([]),
            createInvite: jest.fn().mockResolvedValue({}),
            getInvite: jest.fn().mockResolvedValue({}),
            acceptInvite: jest.fn().mockResolvedValue({}),
            cancelInvite: jest.fn().mockResolvedValue({}),
            rejectInvite: jest.fn().mockResolvedValue({}),
        };
        const inviteLocalDataSource = makeLocalDataSourceMock();
        const contextProvider = {
            getContext: () => context,
            setContext: () => undefined,
        };
        const repository = new InviteRepositoryV2(
            inviteRemoteDataSource as any,
            inviteLocalDataSource as any,
            contextProvider as any
        );

        return { repository, inviteRemoteDataSource, inviteLocalDataSource };
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

    it('캐시를 거치지만 매 호출이 원격에 나간다 (캐시는 권위가 아니다)', async () => {
        const { repository, inviteRemoteDataSource } = createRepository();

        await repository.list();
        await repository.list();

        // 수락은 상대 기기에서 일어나고 알림 패킷이 없다 — 캐시가 권위면 낡은 카드만 보게 된다.
        expect(inviteRemoteDataSource.listInvites).toHaveBeenCalledTimes(2);
    });

    describe('list의 캐시 미러링 (ADR-0052)', () => {
        it('기본 클라우드에서는 응답을 자격증명 제거 후 캐시에 쓴다', async () => {
            const { repository, inviteRemoteDataSource, inviteLocalDataSource } = createRepository({
                cid: 'default',
                uid: 'me',
            });
            inviteRemoteDataSource.listInvites.mockResolvedValue([
                { id: 'invt-1', state: 'pending', code: 'secret', deeplink: 'https://x/s?code=secret' },
            ]);

            await repository.list();

            expect(inviteLocalDataSource.cacheWriteMany).toHaveBeenCalledTimes(1);
            const [written] = inviteLocalDataSource.cacheWriteMany.mock.calls[0];
            expect(written).toEqual([expect.objectContaining({ id: 'invt-1', state: 'pending' })]);
            expect(written[0]).not.toHaveProperty('code');
            expect(written[0]).not.toHaveProperty('deeplink');
        });

        it('활성 클라우드(cid !== default)에서는 조회는 하되 캐시에 쓰지 않는다', async () => {
            const { repository, inviteRemoteDataSource, inviteLocalDataSource } = createRepository({
                cid: 'cloud-a',
                uid: 'me',
            });
            inviteRemoteDataSource.listInvites.mockResolvedValue([{ id: 'invt-1', state: 'pending' }]);

            const result = await repository.list();

            expect(result).toEqual([{ id: 'invt-1', state: 'pending' }]);
            expect(inviteLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
        });

        it('반환값은 여전히 code/deeplink를 포함한 원본이다 (매핑은 저장 경로에만 적용)', async () => {
            const { repository, inviteRemoteDataSource } = createRepository({ cid: 'default', uid: 'me' });
            const view = { id: 'invt-1', state: 'pending', code: 'secret', deeplink: 'https://x/s?code=secret' };
            inviteRemoteDataSource.listInvites.mockResolvedValue([view]);

            const result = await repository.list();

            expect(result[0]).toBe(view);
            expect(result[0].code).toBe('secret');
        });
    });

    describe('로컬 전용 읽기·쓰기', () => {
        it('cacheReadList는 로컬 데이터소스에 위임한다', async () => {
            const { repository, inviteLocalDataSource } = createRepository();
            const listResult = { list: [{ id: 'i1' }], meta: { total: 1, source: 'local' as const } };
            inviteLocalDataSource.cacheReadList.mockResolvedValue(listResult);

            const result = await repository.cacheReadList();

            expect(result).toBe(listResult);
        });

        it('cacheReadList는 null이면 빈 결과로 폴백한다', async () => {
            const { repository, inviteLocalDataSource } = createRepository();
            inviteLocalDataSource.cacheReadList.mockResolvedValue(null);

            const result = await repository.cacheReadList();

            expect(result).toEqual({ list: [], meta: { total: 0, source: 'local' } });
        });

        it('observeList는 로컬 데이터소스의 unsubscribe를 그대로 반환한다', () => {
            const { repository, inviteLocalDataSource } = createRepository();
            const unsubscribe = jest.fn();
            inviteLocalDataSource.observeList.mockReturnValue(unsubscribe);

            const cb = jest.fn();
            const result = repository.observeList(cb);

            expect(inviteLocalDataSource.observeList).toHaveBeenCalledWith(undefined, cb, expect.anything());
            expect(result).toBe(unsubscribe);
        });

        it('dismiss는 dismissedAt을 현재 시각으로 스탬프한다', async () => {
            const { repository, inviteLocalDataSource } = createRepository();

            await repository.dismiss('invt-1');

            expect(inviteLocalDataSource.cacheWrite).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'invt-1', dismissedAt: expect.any(Number) }),
                expect.anything()
            );
        });

        it('undismiss는 dismissedAt을 지운다', async () => {
            const { repository, inviteLocalDataSource } = createRepository();

            await repository.undismiss('invt-1');

            expect(inviteLocalDataSource.cacheWrite).toHaveBeenCalledWith(
                { id: 'invt-1', dismissedAt: undefined },
                expect.anything()
            );
        });

        it('cacheWriteMany는 로컬 데이터소스로 위임한다 (마이그레이션 스텁 주입용)', async () => {
            const { repository, inviteLocalDataSource } = createRepository();
            const items = [{ id: 'stub-1', dismissedAt: 1 }];

            await repository.cacheWriteMany(items);

            expect(inviteLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(items, expect.anything());
        });

        it('cacheDelete는 로컬 데이터소스로 위임한다 (reconcile 드레인용)', async () => {
            const { repository, inviteLocalDataSource } = createRepository();

            await repository.cacheDelete('stub-1');

            expect(inviteLocalDataSource.cacheDelete).toHaveBeenCalledWith('stub-1', expect.anything());
        });

        it('cacheWrite(단건)는 로컬 데이터소스로 위임한다 (디버그 패널용)', async () => {
            const { repository, inviteLocalDataSource } = createRepository();
            const item = { id: 'dbg-1', name: 'Debug Invite' };

            await repository.cacheWrite(item);

            expect(inviteLocalDataSource.cacheWrite).toHaveBeenCalledWith(item, expect.anything());
        });

        it('cacheClear는 로컬 데이터소스로 위임한다 (디버그 패널용)', async () => {
            const { repository, inviteLocalDataSource } = createRepository();

            await repository.cacheClear();

            expect(inviteLocalDataSource.cacheClear).toHaveBeenCalledWith(expect.anything());
        });
    });

    describe('활성 클라우드(cid !== default)에서는 로컬 쓰기 전부를 건너뛴다', () => {
        it('dismiss는 아무것도 쓰지 않는다', async () => {
            const { repository, inviteLocalDataSource } = createRepository({ cid: 'cloud-a', uid: 'me' });

            await repository.dismiss('invt-1');

            expect(inviteLocalDataSource.cacheWrite).not.toHaveBeenCalled();
        });

        it('undismiss는 아무것도 쓰지 않는다', async () => {
            const { repository, inviteLocalDataSource } = createRepository({ cid: 'cloud-a', uid: 'me' });

            await repository.undismiss('invt-1');

            expect(inviteLocalDataSource.cacheWrite).not.toHaveBeenCalled();
        });

        it('cacheWriteMany는 아무것도 쓰지 않는다 (마이그레이션이 다른 클라우드에서 도는 것을 막는다)', async () => {
            const { repository, inviteLocalDataSource } = createRepository({ cid: 'cloud-a', uid: 'me' });

            await repository.cacheWriteMany([{ id: 'stub-1', dismissedAt: 1 }]);

            expect(inviteLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
        });

        it('cacheDelete는 아무것도 지우지 않는다', async () => {
            const { repository, inviteLocalDataSource } = createRepository({ cid: 'cloud-a', uid: 'me' });

            await repository.cacheDelete('stub-1');

            expect(inviteLocalDataSource.cacheDelete).not.toHaveBeenCalled();
        });

        it('cacheWrite(단건)는 아무것도 쓰지 않는다', async () => {
            const { repository, inviteLocalDataSource } = createRepository({ cid: 'cloud-a', uid: 'me' });

            await repository.cacheWrite({ id: 'dbg-1' });

            expect(inviteLocalDataSource.cacheWrite).not.toHaveBeenCalled();
        });

        it('cacheClear는 아무것도 지우지 않는다', async () => {
            const { repository, inviteLocalDataSource } = createRepository({ cid: 'cloud-a', uid: 'me' });

            await repository.cacheClear();

            expect(inviteLocalDataSource.cacheClear).not.toHaveBeenCalled();
        });
    });
});
