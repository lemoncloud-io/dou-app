import { createElement, type ReactNode } from 'react';

import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession, useSessionSelection } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

import { ActiveCloudDataContext } from './activeCloudDataContext';
import { useActiveCloudChannels, useActiveCloudChannelsSource } from './useActiveCloudChannels';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
    useGlobalSession: jest.fn(),
    useSessionSelection: jest.fn(),
}));

const observeListMock = jest.fn();

const channel = (id: string, sid: string): DomainChannel => ({ id, sid }) as unknown as DomainChannel;

// Wire observeList to immediately emit the given rows and return a disposer spy.
const emit = (rows: DomainChannel[]) => {
    const dispose = jest.fn();
    observeListMock.mockImplementation((_query, cb) => {
        cb({ list: rows });
        return dispose;
    });
    return dispose;
};

const setSelection = (selectedCloudId: string, selectedSiteId: string | null = null) =>
    (useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId, selectedSiteId });

const setUid = (userId: string | null = 'u1') =>
    (useGlobalSession as jest.Mock).mockReturnValue({ identity: { userId } });

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ channel: { observeList: observeListMock } });
    setSelection('cloud-A');
    setUid('u1');
});

describe('useActiveCloudChannelsSource — 클라우드 전체 채널 구독', () => {
    it('빈 sid로 클라우드 전체 채널을 구독하고 {cid, uid} 스코프로 고정한다', () => {
        emit([channel('c1', 's1'), channel('c2', 's2')]);

        const { result } = renderHook(() => useActiveCloudChannelsSource());

        // The {cid, uid} override pins the observer scope independent of the provider commit lag.
        expect(observeListMock).toHaveBeenCalledWith({ sid: '' }, expect.any(Function), { cid: 'cloud-A', uid: 'u1' });
        expect(result.current.channels.map(c => c.id)).toEqual(['c1', 'c2']);
    });

    it('사이트 전환(sid 변경)에는 재구독하지 않는다 (cloud-wide 집합은 사이트 무관)', () => {
        const dispose = emit([channel('c1', 's1')]);
        setSelection('cloud-A', 's1');

        const { result, rerender } = renderHook(() => useActiveCloudChannelsSource());
        expect(result.current.channels.map(c => c.id)).toEqual(['c1']);

        // Same {cid, uid} scope across a site switch → no re-subscribe, no clear. The observer keeps
        // matching cloud-wide writes without re-keying on the active sid.
        setSelection('cloud-A', 's2');
        rerender();

        expect(dispose).not.toHaveBeenCalled();
        expect(result.current.channels.map(c => c.id)).toEqual(['c1']);
    });

    it('클라우드 변경 시 이전 목록을 비우고 재구독한다', () => {
        const disposeA = emit([channel('a1', 's1')]);
        setSelection('cloud-A');

        const { result, rerender } = renderHook(() => useActiveCloudChannelsSource());
        expect(result.current.channels.map(c => c.id)).toEqual(['a1']);

        const disposeB = emit([channel('b1', 's9')]);
        setSelection('cloud-B');
        rerender();

        expect(disposeA).toHaveBeenCalledTimes(1);
        expect(result.current.channels.map(c => c.id)).toEqual(['b1']);
        expect(disposeB).not.toHaveBeenCalled();
    });

    it('cid가 그대로여도 uid 변경 시 재구독한다 (클라우드 전환 커밋의 uid 반영)', () => {
        // The cloud-switch commit flips uid while selectedCloudId is already the target cloud, so
        // uid must drive re-subscription — otherwise the post-commit fetch reemit is missed.
        const disposeOldUid = emit([channel('stale', 's1')]);
        setSelection('cloud-A');
        setUid('old-uid');

        const { result, rerender } = renderHook(() => useActiveCloudChannelsSource());
        expect(result.current.channels.map(c => c.id)).toEqual(['stale']);

        const disposeNewUid = emit([channel('fresh', 's1')]);
        setUid('new-uid');
        rerender();

        expect(disposeOldUid).toHaveBeenCalledTimes(1);
        expect(result.current.channels.map(c => c.id)).toEqual(['fresh']);
        expect(disposeNewUid).not.toHaveBeenCalled();
    });
});

// 접근 못 하게 된 사이트(레일에서 사라진 place)의 채널은 캐시에 남는다. 그 채널은 홈 목록에도
// place 점에도 안 나타나는데 total에만 잡혀서, 읽을 수 없는 미읽음이 앱 뱃지에 영구히 남았다.
describe('useActiveCloudChannelsSource — 닿을 수 없는 place 제외', () => {
    const placeObserveList = jest.fn();

    const emitPlaces = (ids: (string | undefined)[]) =>
        placeObserveList.mockImplementation((_query, cb) => {
            cb({ list: ids.map(id => ({ id })) });
            return jest.fn();
        });

    beforeEach(() => {
        (useRuntimeRepositories as jest.Mock).mockReturnValue({
            channel: { observeList: observeListMock },
            place: { observeList: placeObserveList },
        });
    });

    it('레일에 없는 place의 채널을 뺀다', () => {
        emitPlaces(['site-1']);
        emit([channel('c1', 'site-1'), channel('c2', 'site-gone')]);

        const { result } = renderHook(() => useActiveCloudChannelsSource());

        expect(result.current.channels.map(c => c.id)).toEqual(['c1']);
    });

    it('레일에 있는 place의 채널은 모두 남긴다 — 활성 사이트가 아니어도', () => {
        emitPlaces(['site-1', 'site-2']);
        emit([channel('c1', 'site-1'), channel('c2', 'site-2')]);

        const { result } = renderHook(() => useActiveCloudChannelsSource());

        expect(result.current.channels.map(c => c.id)).toEqual(['c1', 'c2']);
    });

    // place 목록이 아직 안 온 상태를 "place 없음"으로 읽으면 클라우드 전환마다 뱃지가 0으로
    // 깜빡인다. 모르는 동안에는 거르지 않는다.
    it('place 목록이 아직 없으면 거르지 않는다', () => {
        placeObserveList.mockImplementation(() => jest.fn());
        emit([channel('c1', 'site-1'), channel('c2', 'site-gone')]);

        const { result } = renderHook(() => useActiveCloudChannelsSource());

        expect(result.current.channels.map(c => c.id)).toEqual(['c1', 'c2']);
    });

    // sid가 아직 안 붙은 행은 고아가 아니라 동기화 중인 행이다.
    it('sid가 없는 채널은 남긴다', () => {
        emitPlaces(['site-1']);
        emit([channel('c1', 'site-1'), { id: 'c2' } as DomainChannel]);

        const { result } = renderHook(() => useActiveCloudChannelsSource());

        expect(result.current.channels.map(c => c.id)).toEqual(['c1', 'c2']);
    });
});

// 얇은 훅은 공유 관측(ActiveCloudDataProvider)의 결과만 읽는다 — 자기 구독을 만들지 않는다.
describe('useActiveCloudChannels — 공유 관측 읽기', () => {
    const wrapper =
        (value: { channels: DomainChannel[] }) =>
        ({ children }: { children: ReactNode }) =>
            createElement(ActiveCloudDataContext.Provider, { value: value as never }, children);

    it('컨텍스트의 채널을 그대로 돌려주고 observeList를 부르지 않는다', () => {
        const rows = [channel('c1', 's1')];

        const { result } = renderHook(() => useActiveCloudChannels(), { wrapper: wrapper({ channels: rows }) });

        expect(result.current).toBe(rows);
        expect(observeListMock).not.toHaveBeenCalled();
    });

    it('프로바이더가 없으면 조용히 비어 있지 않고 던진다', () => {
        // 조용한 폴백은 이 컨텍스트가 없애려던 중복 구독을, 조용한 빈 값은 영원히 0인 뱃지를 부른다.
        expect(() => renderHook(() => useActiveCloudChannels())).toThrow(/ActiveCloudDataProvider is missing/);
    });
});
