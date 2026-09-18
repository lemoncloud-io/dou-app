import { createElement, type ReactNode } from 'react';

import { act, renderHook, waitFor } from '@testing-library/react';

import { OtherCloudUnreadContext } from './otherCloudUnreadContext';
import { useOtherCloudUnread, useOtherCloudUnreadSource } from './useOtherCloudUnread';

let mockOwned: { id?: string }[] = [];
let mockInvited: { id?: string }[] = [];
const resolveContext = jest.fn();

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useGlobalCacheSearch: () => ({ resolveContext }),
            globalCacheRefKey: (cid: string, id: string) => `${cid}:${id}`,
        },
    },
}));

jest.mock('./useCloudCatalog', () => ({ useCloudSessionCatalog: () => ({ clouds: mockOwned }) }));
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

    // News: this value isn't a frozen number — it's recomputed every time from the channel head and my cursor.
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

        // No join.metaNo -> convert using the head's metaNo instead. ch1: 8-(6-2)=4. ch2: 5-(5-0)=0.
        await waitFor(() => expect(result.current.total).toBe(4));
        expect(result.current.byCloud).toEqual({ cloud_2: 4 });
    });

    // The point where a phantom badge becomes structurally impossible: once the cursor catches up to the head, the entry itself disappears.
    it('다 읽은 클라우드는 항목이 남지 않는다', async () => {
        resolveContext.mockResolvedValue(
            context({ 'cloud_2:ch1': { id: 'ch1', chatNo: 9, metaNo: 1 } }, { 'cloud_2:ch1': { chatNo: 8 } })
        );

        const { result } = renderHook(() => useOtherCloudUnreadSource('cloud_1'));

        await waitFor(() => expect(resolveContext).toHaveBeenCalled());
        expect(result.current.byCloud).toEqual({});
        expect(result.current.total).toBe(0);
    });

    // With no join row, the read boundary is unknown — count it as 0 instead of blowing it up to fully unread
    // (this follows countUnread's rule as-is).
    it('내 join 행이 없는 채널은 0으로 센다', async () => {
        resolveContext.mockResolvedValue(context({ 'cloud_2:ch1': { id: 'ch1', chatNo: 50, metaNo: 0 } }));

        const { result } = renderHook(() => useOtherCloudUnreadSource('cloud_1'));

        await waitFor(() => expect(resolveContext).toHaveBeenCalled());
        expect(result.current.total).toBe(0);
    });

    // Same rule as the active cloud: a channel in an unreachable place has no way to be read, so it isn't counted.
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

        await waitFor(() => expect(result.current.total).toBe(2)); // ch1 only: 5-3
    });

    // A cloud with no places at all in the cache isn't a "cloud with no places" — it's a cloud that
    // hasn't been fetched yet. Filtering on that would zero it out entirely.
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

    // Re-reading every per-cloud partition on each burst (N round trips on native) is expensive for a
    // single badge value. A trailing 1-second window coalesces back-to-back calls into one re-read.
    it('연달아 부른 refresh는 캐시 재읽기 한 번으로 합친다', async () => {
        const { result } = renderHook(() => useOtherCloudUnreadSource('cloud_1'));
        await waitFor(() => expect(resolveContext).toHaveBeenCalledTimes(1));

        act(() => {
            result.current.refresh();
            result.current.refresh();
            result.current.refresh();
        });

        await waitFor(() => expect(resolveContext).toHaveBeenCalledTimes(2), { timeout: 3000 });
        // No extra reads even after the window closes — the 3 calls coalesced into 1.
        expect(resolveContext).toHaveBeenCalledTimes(2);
    });

    // If a cache read failure made the badge drop to the active cloud's value and then bounce back, it would flicker.
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

// The thin hook only reads the shared-read (OtherCloudUnreadProvider) value — it doesn't run its own scan.
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
