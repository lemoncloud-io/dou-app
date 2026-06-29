import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import type { DomainChannel, DomainJoin } from '@chatic/data';

import { useChannelUnreads } from './useChannelUnreads';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('@chatic/web-core', () => ({ useSessionIdentity: jest.fn() }));

const observeListMock = jest.fn();

const channel = (id: string, fields: Partial<DomainChannel>): DomainChannel =>
    ({ id, ...fields }) as unknown as DomainChannel;

const setJoins = (joins: Array<Partial<DomainJoin>>) =>
    observeListMock.mockImplementation((_query, cb) => {
        cb({ list: joins });
        return () => undefined;
    });

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ join: { observeList: observeListMock } });
    (useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
});

describe('useChannelUnreads — 채널 안읽음 계산', () => {
    it('unread = lastChat chatNo - 내 join readNo, 음수는 0으로 보정한다', () => {
        setJoins([
            { channelId: 'c1', userId: 'me', readNo: 3 },
            { channelId: 'c2', userId: 'me', readNo: 10 },
            // another user's join for the same channel must be ignored
            { channelId: 'c1', userId: 'other', readNo: 0 },
        ]);

        const channels = [
            channel('c1', { lastChat$: { chatNo: 7 } as DomainChannel['lastChat$'] }),
            channel('c2', { lastChat$: { chatNo: 8 } as DomainChannel['lastChat$'] }),
            // no join for c3 → treated as 0 unread (a channel the user hasn't joined yet
            // has no read boundary to count against, so it shows no badge by design)
            channel('c3', { lastChat$: { chatNo: 5 } as DomainChannel['lastChat$'] }),
        ];

        const { result } = renderHook(() => useChannelUnreads(channels));

        expect(result.current.byChannel).toEqual({ c1: 4, c2: 0, c3: 0 });
        expect(result.current.total).toBe(4);
    });

    it('lastChat이 없으면 channel.chatNo를 최신 번호로 사용한다', () => {
        setJoins([{ channelId: 'c1', userId: 'me', readNo: 2 }]);

        const channels = [channel('c1', { chatNo: 6 } as Partial<DomainChannel>)];

        const { result } = renderHook(() => useChannelUnreads(channels));

        expect(result.current.byChannel.c1).toBe(4);
        expect(result.current.total).toBe(4);
    });
});
