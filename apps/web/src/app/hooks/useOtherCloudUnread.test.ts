import { createElement, type ReactNode } from 'react';

import { act, renderHook, waitFor } from '@testing-library/react';

import { OtherCloudUnreadContext } from './otherCloudUnreadContext';
import { useOtherCloudUnread, useOtherCloudUnreadSource } from './useOtherCloudUnread';

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
    channels: Record<string, { id: string; chatNo?: number; metaNo?: number; sid?: string }>,
    joins: Record<string, { chatNo?: number }> = {},
    sites: Record<string, { id: string }> = {}
) => ({ channelsByRef: channels, joinsByRef: joins, sitesByRef: sites, lastChatsByRef: {} });

beforeEach(() => {
    jest.clearAllMocks();
    mockOwned = [{ id: 'cloud_1' }, { id: 'cloud_2' }];
    mockInvited = [];
    resolveContext.mockResolvedValue(context({}));
});

describe('useOtherCloudUnreadSource — 비활성 클라우드 미읽음 (로컬 캐시)', () => {
    it('활성 클라우드는 제외하고 나머지 + relay를 조회한다', async () => {
        renderHook(() => useOtherCloudUnreadSource('cloud_1'));

        await waitFor(() => expect(resolveContext).toHaveBeenCalled());
        expect(resolveContext).toHaveBeenCalledWith({ cids: ['cloud_2', 'default'], channelRefs: [] });
    });

    it('초대받은 클라우드도 포함한다', async () => {
        mockInvited = [{ id: 'invited_9' }];

        renderHook(() => useOtherCloudUnreadSource('cloud_1'));

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

        const { result } = renderHook(() => useOtherCloudUnreadSource('cloud_1'));

        // join.metaNo 없음 → 커서를 환산하지 않고 그대로 뺀다. ch1: 8-6=2. ch2: 5-5=0.
        await waitFor(() => expect(result.current.total).toBe(2));
        expect(result.current.byCloud).toEqual({ cloud_2: 2 });
    });

    // 유령 뱃지가 구조적으로 불가능해지는 지점: 커서가 헤드를 따라잡으면 항목 자체가 사라진다.
    it('다 읽은 클라우드는 항목이 남지 않는다', async () => {
        resolveContext.mockResolvedValue(
            context({ 'cloud_2:ch1': { id: 'ch1', chatNo: 9, metaNo: 1 } }, { 'cloud_2:ch1': { chatNo: 8 } })
        );

        const { result } = renderHook(() => useOtherCloudUnreadSource('cloud_1'));

        await waitFor(() => expect(resolveContext).toHaveBeenCalled());
        expect(result.current.byCloud).toEqual({});
        expect(result.current.total).toBe(0);
    });

    // join 행이 없으면 읽음 경계를 모른다 — 전체를 미읽음으로 터뜨리는 대신 0으로 센다
    // (countUnread의 규칙을 그대로 따른다).
    it('내 join 행이 없는 채널은 0으로 센다', async () => {
        resolveContext.mockResolvedValue(context({ 'cloud_2:ch1': { id: 'ch1', chatNo: 50, metaNo: 0 } }));

        const { result } = renderHook(() => useOtherCloudUnreadSource('cloud_1'));

        await waitFor(() => expect(resolveContext).toHaveBeenCalled());
        expect(result.current.total).toBe(0);
    });

    // 활성 클라우드와 같은 규칙: 닿을 수 없는 place의 채널은 읽을 방법이 없으니 세지 않는다.
    it('그 클라우드에 없는 place의 채널은 세지 않는다', async () => {
        resolveContext.mockResolvedValue(
            context(
                {
                    'cloud_2:ch1': { id: 'ch1', sid: 'site-1', chatNo: 5, metaNo: 0 },
                    'cloud_2:ch2': { id: 'ch2', sid: 'site-gone', chatNo: 9, metaNo: 0 },
                },
                { 'cloud_2:ch1': { chatNo: 3 }, 'cloud_2:ch2': { chatNo: 0 } },
                { 'cloud_2:site-1': { id: 'site-1' } }
            )
        );

        const { result } = renderHook(() => useOtherCloudUnreadSource('cloud_1'));

        await waitFor(() => expect(result.current.total).toBe(2)); // ch1만: 5-3
    });

    // place가 하나도 캐시에 없는 클라우드는 "place 없는 클라우드"가 아니라 아직 안 받아온
    // 클라우드다 — 거기서 거르면 통째로 0이 된다.
    it('place가 하나도 없는 클라우드는 거르지 않는다', async () => {
        resolveContext.mockResolvedValue(
            context(
                { 'cloud_2:ch1': { id: 'ch1', sid: 'site-1', chatNo: 5, metaNo: 0 } },
                { 'cloud_2:ch1': { chatNo: 3 } }
            )
        );

        const { result } = renderHook(() => useOtherCloudUnreadSource('cloud_1'));

        await waitFor(() => expect(result.current.total).toBe(2));
    });

    it('refresh를 부르면 (합치기 창이 닫힌 뒤) 캐시를 다시 읽는다', async () => {
        const { result } = renderHook(() => useOtherCloudUnreadSource('cloud_1'));
        await waitFor(() => expect(resolveContext).toHaveBeenCalledTimes(1));

        act(() => result.current.refresh());

        await waitFor(() => expect(resolveContext).toHaveBeenCalledTimes(2), { timeout: 3000 });
    });

    // 버스트마다 클라우드별 파티션을 전부 다시 읽으면(네이티브에선 왕복 N회) 뱃지 하나 값에 비해
    // 비싸다. 트레일링 1초 창이 연속 호출을 재읽기 1회로 합친다.
    it('연달아 부른 refresh는 캐시 재읽기 한 번으로 합친다', async () => {
        const { result } = renderHook(() => useOtherCloudUnreadSource('cloud_1'));
        await waitFor(() => expect(resolveContext).toHaveBeenCalledTimes(1));

        act(() => {
            result.current.refresh();
            result.current.refresh();
            result.current.refresh();
        });

        await waitFor(() => expect(resolveContext).toHaveBeenCalledTimes(2), { timeout: 3000 });
        // 창이 닫힌 뒤로도 추가 읽기가 없다 — 3번이 1번으로 합쳐졌다.
        expect(resolveContext).toHaveBeenCalledTimes(2);
    });

    // 캐시 읽기가 실패했다고 뱃지가 활성 클라우드 값으로 떨어졌다 돌아오면 깜빡인다.
    it('캐시 읽기가 실패하면 직전 값을 유지한다', async () => {
        resolveContext.mockResolvedValue(
            context({ 'cloud_2:ch1': { id: 'ch1', chatNo: 4, metaNo: 0 } }, { 'cloud_2:ch1': { chatNo: 1 } })
        );
        const { result } = renderHook(() => useOtherCloudUnreadSource('cloud_1'));
        await waitFor(() => expect(result.current.total).toBe(3));

        resolveContext.mockRejectedValueOnce(new Error('cache down'));
        act(() => result.current.refresh());

        await waitFor(() => expect(resolveContext).toHaveBeenCalledTimes(2), { timeout: 3000 });
        expect(result.current.total).toBe(3);
    });

    it('조회할 다른 클라우드가 없으면 캐시를 건드리지 않는다', async () => {
        mockOwned = [];
        mockInvited = [];

        const { result } = renderHook(() => useOtherCloudUnreadSource('default'));

        await waitFor(() => expect(result.current.total).toBe(0));
        expect(resolveContext).not.toHaveBeenCalled();
    });
});

// 얇은 훅은 공유 읽기(OtherCloudUnreadProvider)의 값을 읽을 뿐이다 — 자기 스캔을 돌리지 않는다.
describe('useOtherCloudUnread — 공유 읽기', () => {
    it('컨텍스트 값을 그대로 돌려주고 캐시를 건드리지 않는다', () => {
        const shared = { byCloud: { cloud_2: 3 }, total: 3, refresh: jest.fn() };
        const wrapper = ({ children }: { children: ReactNode }) =>
            createElement(OtherCloudUnreadContext.Provider, { value: shared }, children);

        const { result } = renderHook(() => useOtherCloudUnread(), { wrapper });

        expect(result.current).toBe(shared);
        expect(resolveContext).not.toHaveBeenCalled();
    });

    it('프로바이더가 없으면 던진다', () => {
        expect(() => renderHook(() => useOtherCloudUnread())).toThrow(/OtherCloudUnreadProvider is missing/);
    });
});
