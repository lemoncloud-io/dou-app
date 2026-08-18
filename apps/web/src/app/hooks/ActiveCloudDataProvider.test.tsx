import { render, screen } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

import { ActiveCloudDataProvider } from './ActiveCloudDataProvider';
import { useActiveCloudData } from './activeCloudDataContext';
import { useActiveCloudChannelsSource } from './useActiveCloudChannels';
import { useChannelUnreads } from './useChannelUnreads';
import { useMyJoins } from './useMyJoins';

jest.mock('./useActiveCloudChannels', () => ({ useActiveCloudChannelsSource: jest.fn() }));
jest.mock('./useMyJoins', () => ({ useMyJoins: jest.fn() }));
jest.mock('./useChannelUnreads', () => ({ useChannelUnreads: jest.fn() }));

const channelsMock = useActiveCloudChannelsSource as jest.Mock;
const myJoinsMock = useMyJoins as jest.Mock;
const unreadsMock = useChannelUnreads as jest.Mock;

const channels = [{ id: 'c1', sid: 's1' }] as unknown as DomainChannel[];
const joins = new Map();
const unreads = { byChannel: { c1: 2 }, byPlace: { s1: 4 }, total: 4 };

// Reads the context the provider publishes and prints it, so one render asserts the whole value.
const Probe = () => {
    const { channels: rows, isLoaded, myJoins, unreads: aggregated } = useActiveCloudData();
    return (
        <div>
            <span data-testid="ids">{rows.map(row => row.id).join(',')}</span>
            <span data-testid="loaded">{String(isLoaded)}</span>
            <span data-testid="joins">{String(myJoins === joins)}</span>
            <span data-testid="total">{aggregated.total}</span>
        </div>
    );
};

beforeEach(() => {
    jest.clearAllMocks();
    channelsMock.mockReturnValue({ channels, isLoaded: true });
    myJoinsMock.mockReturnValue(joins);
    unreadsMock.mockReturnValue(unreads);
});

describe('ActiveCloudDataProvider — 앱 전체가 공유하는 단 하나의 관측', () => {
    it('채널을 관측 전용(sync: false) join과 함께 집계로 넘기고, 넷 다 컨텍스트로 공개한다', () => {
        render(
            <ActiveCloudDataProvider>
                <Probe />
            </ActiveCloudDataProvider>
        );

        // sync: false — 앱을 띄우는 것만으로는 채널별 join 동기화를 하나도 등록하지 않는다(ADR-0056).
        expect(myJoinsMock).toHaveBeenCalledWith(channels, { sync: false });
        expect(unreadsMock).toHaveBeenCalledWith(channels, joins);
        expect(screen.getByTestId('ids').textContent).toBe('c1');
        expect(screen.getByTestId('loaded').textContent).toBe('true');
        expect(screen.getByTestId('joins').textContent).toBe('true');
        expect(screen.getByTestId('total').textContent).toBe('4');
    });

    // 첫 응답 전의 빈 목록과 "채널 없음"을 구분하는 신호라, 그대로 통과해야 한다.
    it('isLoaded는 관측의 답을 그대로 전달한다', () => {
        channelsMock.mockReturnValue({ channels: [], isLoaded: false });

        render(
            <ActiveCloudDataProvider>
                <Probe />
            </ActiveCloudDataProvider>
        );

        expect(screen.getByTestId('loaded').textContent).toBe('false');
    });
});
