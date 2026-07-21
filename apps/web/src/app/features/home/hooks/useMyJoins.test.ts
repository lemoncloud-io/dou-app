import { renderHook } from '@testing-library/react';

import { getSyncManager, useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import { useGlobalSession } from '@chatic/web-core';
import type { DomainChannel, DomainJoin } from '@chatic/data';

import { useMyJoins } from './useMyJoins';

jest.mock('@chatic/app-runtime', () => ({
    getSyncManager: jest.fn(),
    useRuntimeRepositories: jest.fn(),
    useRuntimeSocketState: jest.fn(),
}));
jest.mock('@chatic/web-core', () => ({ useGlobalSession: jest.fn() }));

const channel = (id: string): DomainChannel => ({ id }) as unknown as DomainChannel;
const join = (fields: Partial<DomainJoin>): DomainJoin => fields as DomainJoin;

const observeListMock = jest.fn();
const registerJoinMock = jest.fn();

// Per-channel observeList that synchronously emits the rows mapped for that channelId.
const emitJoins = (byChannel: Record<string, DomainJoin[]>) => {
    observeListMock.mockImplementation((query: { channelId: string }, cb: (r: unknown) => void) => {
        cb({ list: byChannel[query.channelId] ?? [] });
        return jest.fn();
    });
};

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ join: { observeList: observeListMock } });
    (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
    (useGlobalSession as jest.Mock).mockReturnValue({ identity: { userId: 'u1' } });
    (getSyncManager as jest.Mock).mockReturnValue({ registerJoin: registerJoinMock });
    registerJoinMock.mockReturnValue(jest.fn());
});

describe('useMyJoins — 구독 join 목록', () => {
    it('채널마다 내 read cursor만 골라 channelId별 맵으로 만든다', () => {
        emitJoins({
            c1: [
                join({ userId: 'u1', channelId: 'c1', chatNo: 3 }),
                join({ userId: 'u2', channelId: 'c1', chatNo: 9 }),
            ],
            c2: [join({ userId: 'u2', channelId: 'c2', chatNo: 5 })], // no row for me
        });

        const { result } = renderHook(() => useMyJoins([channel('c1'), channel('c2')]));

        expect(result.current.get('c1')?.chatNo).toBe(3);
        expect(result.current.has('c2')).toBe(false);
    });

    it('채널마다 내 join 동기화를 등록한다 (`${channelId}@${uid}`)', () => {
        emitJoins({});

        renderHook(() => useMyJoins([channel('c1'), channel('c2')]));

        expect(registerJoinMock).toHaveBeenCalledWith('c1@u1');
        expect(registerJoinMock).toHaveBeenCalledWith('c2@u1');
    });

    it('미인증(isVerified=false)이면 join 동기화를 등록하지 않는다', () => {
        (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: false });
        emitJoins({});

        renderHook(() => useMyJoins([channel('c1')]));

        expect(registerJoinMock).not.toHaveBeenCalled();
    });

    it('observe-only(sync:false)면 등록 없이 join 캐시만 관측한다', () => {
        emitJoins({ c1: [join({ userId: 'u1', channelId: 'c1', chatNo: 7 })] });

        const { result } = renderHook(() => useMyJoins([channel('c1')], { sync: false }));

        // 등록은 건너뛰되 관측 맵은 그대로 채워진다.
        expect(registerJoinMock).not.toHaveBeenCalled();
        expect(result.current.get('c1')?.chatNo).toBe(7);
    });
});
