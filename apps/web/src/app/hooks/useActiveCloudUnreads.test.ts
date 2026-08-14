import { renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

import { useActiveCloudChannels } from './useActiveCloudChannels';
import { useActiveCloudUnreads } from './useActiveCloudUnreads';
import { useChannelUnreads } from './useChannelUnreads';
import { useMyJoins } from './useMyJoins';

jest.mock('./useActiveCloudChannels', () => ({ useActiveCloudChannels: jest.fn() }));
jest.mock('./useMyJoins', () => ({ useMyJoins: jest.fn() }));
jest.mock('./useChannelUnreads', () => ({ useChannelUnreads: jest.fn() }));

const channelsMock = useActiveCloudChannels as jest.Mock;
const myJoinsMock = useMyJoins as jest.Mock;
const unreadsMock = useChannelUnreads as jest.Mock;

const channels = [{ id: 'c1', sid: 's1' }] as unknown as DomainChannel[];
const joins = new Map();

beforeEach(() => {
    jest.clearAllMocks();
    channelsMock.mockReturnValue(channels);
    myJoinsMock.mockReturnValue(joins);
    unreadsMock.mockReturnValue({ byChannel: {}, byPlace: { s1: 4 }, total: 4 });
});

describe('useActiveCloudUnreads — 클라우드 전체 안읽음 (관측 전용)', () => {
    it('활성 클라우드 채널을 관측 전용(sync: false) join과 함께 useChannelUnreads로 넘긴다', () => {
        const { result } = renderHook(() => useActiveCloudUnreads());

        expect(myJoinsMock).toHaveBeenCalledWith(channels, { sync: false });
        expect(unreadsMock).toHaveBeenCalledWith(channels, joins);
        expect(result.current).toEqual({ byChannel: {}, byPlace: { s1: 4 }, total: 4 });
    });
});
