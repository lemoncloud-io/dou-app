import { act, renderHook, waitFor } from '@testing-library/react';

import { useOtherCloudUnread } from './useOtherCloudUnread';

let mockOwned: { id?: string }[] = [];
let mockInvited: { id?: string }[] = [];
const resolveContext = jest.fn();

jest.mock('@chatic/app-runtime', () => ({
    useGlobalCacheSearch: () => ({ resolveContext }),
    globalCacheRefKey: (cid: string, id: string) => `${cid}:${id}`,
}));
jest.mock('@chatic/web-core', () => ({ useCloudSessionCatalog: () => ({ clouds: mockOwned }) }));
jest.mock('./useInvitedClouds', () => ({ useInvitedClouds: () => ({ invitedClouds: mockInvited }) }));

/** A cross-cloud context: channels keyed `${cid}:${channelId}`, my join rows under the same keys. */
const context = (
    channels: Record<string, { id: string; chatNo?: number; metaNo?: number }>,
    joins: Record<string, { chatNo?: number }> = {}
) => ({ channelsByRef: channels, joinsByRef: joins, sitesByRef: {}, lastChatsByRef: {} });

beforeEach(() => {
    jest.clearAllMocks();
    mockOwned = [{ id: 'cloud_1' }, { id: 'cloud_2' }];
    mockInvited = [];
    resolveContext.mockResolvedValue(context({}));
});

describe('useOtherCloudUnread — 비활성 클라우드 미읽음 (로컬 캐시)', () => {
    it('활성 클라우드는 제외하고 나머지 + relay를 조회한다', async () => {
        renderHook(() => useOtherCloudUnread('cloud_1'));

        await waitFor(() => expect(resolveContext).toHaveBeenCalled());
        expect(resolveContext).toHaveBeenCalledWith({ cids: ['cloud_2', 'default'], channelRefs: [] });
    });

    it('초대받은 클라우드도 포함한다', async () => {
        mockInvited = [{ id: 'invited_9' }];

        renderHook(() => useOtherCloudUnread('cloud_1'));

        await waitFor(() => expect(resolveContext).toHaveBeenCalled());
        expect(resolveContext.mock.calls[0][0].cids).toEqual(['cloud_2', 'default', 'invited_9']);
    });

    // 뉴스: 이 값은 박제된 숫자가 아니라 채널 헤드와 내 커서로 매번 다시 계산된다.
    it('채널 헤드와 내 읽음 커서로 클라우드별 합계를 낸다', async () => {
        resolveContext.mockResolvedValue(
            context(
                {
                    'cloud_2:ch1': { id: 'ch1', chatNo: 10, metaNo: 2 }, // user head 8
                    'cloud_2:ch2': { id: 'ch2', chatNo: 5, metaNo: 0 }, // user head 5
                },
                { 'cloud_2:ch1': { chatNo: 6 }, 'cloud_2:ch2': { chatNo: 5 } }
            )
        );

        const { result } = renderHook(() => useOtherCloudUnread('cloud_1'));

        await waitFor(() => expect(result.current.total).toBe(2));
        expect(result.current.byCloud).toEqual({ cloud_2: 2 }); // ch1: 8-6=2, ch2: 5-5=0
    });

    // 유령 뱃지가 구조적으로 불가능해지는 지점: 커서가 헤드를 따라잡으면 항목 자체가 사라진다.
    it('다 읽은 클라우드는 항목이 남지 않는다', async () => {
        resolveContext.mockResolvedValue(
            context({ 'cloud_2:ch1': { id: 'ch1', chatNo: 9, metaNo: 1 } }, { 'cloud_2:ch1': { chatNo: 8 } })
        );

        const { result } = renderHook(() => useOtherCloudUnread('cloud_1'));

        await waitFor(() => expect(resolveContext).toHaveBeenCalled());
        expect(result.current.byCloud).toEqual({});
        expect(result.current.total).toBe(0);
    });

    // join 행이 없으면 읽음 경계를 모른다 — 전체를 미읽음으로 터뜨리는 대신 0으로 센다
    // (countUnread의 규칙을 그대로 따른다).
    it('내 join 행이 없는 채널은 0으로 센다', async () => {
        resolveContext.mockResolvedValue(context({ 'cloud_2:ch1': { id: 'ch1', chatNo: 50, metaNo: 0 } }));

        const { result } = renderHook(() => useOtherCloudUnread('cloud_1'));

        await waitFor(() => expect(resolveContext).toHaveBeenCalled());
        expect(result.current.total).toBe(0);
    });

    it('refresh를 부르면 캐시를 다시 읽는다', async () => {
        const { result } = renderHook(() => useOtherCloudUnread('cloud_1'));
        await waitFor(() => expect(resolveContext).toHaveBeenCalledTimes(1));

        act(() => result.current.refresh());

        await waitFor(() => expect(resolveContext).toHaveBeenCalledTimes(2));
    });

    // 캐시 읽기가 실패했다고 뱃지가 활성 클라우드 값으로 떨어졌다 돌아오면 깜빡인다.
    it('캐시 읽기가 실패하면 직전 값을 유지한다', async () => {
        resolveContext.mockResolvedValue(
            context({ 'cloud_2:ch1': { id: 'ch1', chatNo: 4, metaNo: 0 } }, { 'cloud_2:ch1': { chatNo: 1 } })
        );
        const { result } = renderHook(() => useOtherCloudUnread('cloud_1'));
        await waitFor(() => expect(result.current.total).toBe(3));

        resolveContext.mockRejectedValueOnce(new Error('cache down'));
        act(() => result.current.refresh());

        await waitFor(() => expect(resolveContext).toHaveBeenCalledTimes(2));
        expect(result.current.total).toBe(3);
    });

    it('조회할 다른 클라우드가 없으면 캐시를 건드리지 않는다', async () => {
        mockOwned = [];
        mockInvited = [];

        const { result } = renderHook(() => useOtherCloudUnread('default'));

        await waitFor(() => expect(result.current.total).toBe(0));
        expect(resolveContext).not.toHaveBeenCalled();
    });
});
