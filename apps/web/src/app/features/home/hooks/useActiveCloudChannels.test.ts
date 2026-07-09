import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession, useSessionSelection } from '@chatic/web-core';
import type { DomainChannel } from '@chatic/data';

import { useActiveCloudChannels } from './useActiveCloudChannels';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('@chatic/web-core', () => ({ useGlobalSession: jest.fn(), useSessionSelection: jest.fn() }));

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

describe('useActiveCloudChannels — 클라우드 전체 채널 구독', () => {
    it('빈 sid로 클라우드 전체 채널을 구독한다', () => {
        emit([channel('c1', 's1'), channel('c2', 's2')]);

        const { result } = renderHook(() => useActiveCloudChannels());

        expect(observeListMock).toHaveBeenCalledWith({ sid: '' }, expect.any(Function));
        expect(result.current.map(c => c.id)).toEqual(['c1', 'c2']);
    });

    it('사이트 전환(sid 변경) 시 목록을 비우지 않고 재구독한다', () => {
        const dispose = emit([channel('c1', 's1')]);
        setSelection('cloud-A', 's1');

        const { result, rerender } = renderHook(() => useActiveCloudChannels());
        expect(result.current.map(c => c.id)).toEqual(['c1']);

        // Same cloud/uid → the cloud-wide set is unchanged, so no empty flash on a site switch.
        emit([channel('c1', 's1'), channel('c2', 's2')]);
        setSelection('cloud-A', 's2');
        rerender();

        expect(dispose).toHaveBeenCalledTimes(1);
        expect(result.current.map(c => c.id)).toEqual(['c1', 'c2']);
    });

    it('클라우드 변경 시 이전 목록을 비우고 재구독한다', () => {
        const disposeA = emit([channel('a1', 's1')]);
        setSelection('cloud-A');

        const { result, rerender } = renderHook(() => useActiveCloudChannels());
        expect(result.current.map(c => c.id)).toEqual(['a1']);

        const disposeB = emit([channel('b1', 's9')]);
        setSelection('cloud-B');
        rerender();

        expect(disposeA).toHaveBeenCalledTimes(1);
        expect(result.current.map(c => c.id)).toEqual(['b1']);
        expect(disposeB).not.toHaveBeenCalled();
    });

    it('cid가 그대로여도 uid 변경 시 재구독한다 (클라우드 전환 커밋의 uid 반영)', () => {
        // The cloud-switch commit flips uid while selectedCloudId is already the target cloud, so
        // uid must drive re-subscription — otherwise the post-commit fetch reemit is missed.
        const disposeOldUid = emit([channel('stale', 's1')]);
        setSelection('cloud-A');
        setUid('old-uid');

        const { result, rerender } = renderHook(() => useActiveCloudChannels());
        expect(result.current.map(c => c.id)).toEqual(['stale']);

        const disposeNewUid = emit([channel('fresh', 's1')]);
        setUid('new-uid');
        rerender();

        expect(disposeOldUid).toHaveBeenCalledTimes(1);
        expect(result.current.map(c => c.id)).toEqual(['fresh']);
        expect(disposeNewUid).not.toHaveBeenCalled();
    });
});
