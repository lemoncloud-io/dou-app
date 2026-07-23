import { act, renderHook } from '@testing-library/react';

import { getSyncManager, useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainJoin } from '@chatic/data';

import { useJoinPositions } from './useJoinPositions';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
    useRuntimeSocketState: jest.fn(),
    getSyncManager: jest.fn(),
}));

const observeList = jest.fn();
const registerJoin = jest.fn(() => () => undefined);

const join = (userId: string, fields: Partial<DomainJoin>): DomainJoin =>
    ({ userId, joined: 1, ...fields }) as unknown as DomainJoin;

// Capture the live observe callback so tests can push later emissions via `emitJoins`.
let observeCallback: ((result: { list: DomainJoin[] }) => void) | null = null;
const seedJoins = (rows: DomainJoin[]) =>
    observeList.mockImplementation((_q, cb) => {
        observeCallback = cb;
        cb({ list: rows });
        return () => undefined;
    });
const emitJoins = (rows: DomainJoin[]) => act(() => observeCallback?.({ list: rows }));

beforeEach(() => {
    jest.clearAllMocks();
    seedJoins([]);
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ join: { observeList } });
    (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
    (getSyncManager as jest.Mock).mockReturnValue({ registerJoin });
});

describe('useJoinPositions — 읽음 커서/안읽음 계산', () => {
    it('채널 join 캐시를 관측하고, 전체 멤버(memberIds)에 대해 join sync를 등록한다', () => {
        // active(분모)는 u1/u2지만, 등록은 전체 로스터(u1/u2/u3) 기준으로 이뤄진다.
        renderHook(() => useJoinPositions('c1', ['u1', 'u2'], ['u1', 'u2', 'u3']));

        expect(observeList).toHaveBeenCalledWith({ channelId: 'c1' }, expect.any(Function));
        expect(registerJoin).toHaveBeenCalledTimes(3);
        expect(registerJoin).toHaveBeenCalledWith('c1@u1');
        expect(registerJoin).toHaveBeenCalledWith('c1@u2');
        expect(registerJoin).toHaveBeenCalledWith('c1@u3');
    });

    it('세션 미검증(isVerified=false)이면 join sync를 등록하지 않는다', () => {
        (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: false });

        renderHook(() => useJoinPositions('c1', ['u1', 'u2'], ['u1', 'u2']));

        expect(registerJoin).not.toHaveBeenCalled();
    });

    it('커서는 testbed 방식대로 max(readNo, chatNo)를 그대로 쓴다', () => {
        // u1: readNo 우세, u2: chatNo 우세
        seedJoins([join('u1', { readNo: 5, chatNo: 3 }), join('u2', { readNo: 1, chatNo: 4 })]);

        const { result } = renderHook(() => useJoinPositions('c1', ['u1', 'u2'], ['u1', 'u2']));

        // chatNo 5까지 읽은 사람: u1(5) → 1명, u2(4)는 미달
        expect(result.current.getReadCount(5)).toEqual({ readCount: 1, unreadCount: 1 });
        // chatNo 4까지: u1(5), u2(4) → 2명
        expect(result.current.getReadCount(4)).toEqual({ readCount: 2, unreadCount: 0 });
    });

    it('분모는 active 멤버 수와 일치한다', () => {
        seedJoins([join('u1', { chatNo: 10 })]);

        const { result } = renderHook(() => useJoinPositions('c1', ['u1', 'u2', 'u3'], ['u1', 'u2', 'u3']));

        // u1만 읽음, 분모 3 → 안읽음 2
        expect(result.current.getReadCount(10)).toEqual({ readCount: 1, unreadCount: 2 });
    });

    it('high-water 없이 최신 관측값을 그대로 반영한다(낮아질 수 있음)', () => {
        seedJoins([join('u1', { chatNo: 9 })]);
        const { result } = renderHook(() => useJoinPositions('c1', ['u1'], ['u1']));
        expect(result.current.getReadCount(9).readCount).toBe(1);

        // 더 낮은 커서로 재관측되면 그대로 내려간다(high-water mark 제거 확인).
        emitJoins([join('u1', { chatNo: 2 })]);
        expect(result.current.getReadCount(9).readCount).toBe(0);
    });
});
