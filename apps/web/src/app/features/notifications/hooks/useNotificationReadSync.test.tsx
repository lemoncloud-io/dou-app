import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChannel, DomainJoin } from '@chatic/data';

import { ActiveCloudDataContext, type ActiveCloudData } from '../../../hooks/activeCloudDataContext';
import { useNotificationStore } from '../../../stores/useNotificationStore';
import type { NotificationItem } from '../../../utils/notifications';
import { useNotificationReadSync } from './useNotificationReadSync';

jest.mock('@chatic/app-runtime', () => ({
    runtime: { session: { useSessionSelection: jest.fn() } },
}));

let data: ActiveCloudData;
const Wrapper = ({ children }: { children: ReactNode }) => (
    <ActiveCloudDataContext.Provider value={data}>{children}</ActiveCloudDataContext.Provider>
);

const channel = (cursor: number, overrides: Partial<DomainChannel> = {}): DomainChannel =>
    ({
        id: 'ch1',
        cid: 'c1',
        sid: 'p1',
        chatNo: 20,
        $join: { chatNo: cursor },
        ...overrides,
    }) as unknown as DomainChannel;

const item = (id: string, chatNo: number, overrides: Partial<NotificationItem> = {}): NotificationItem => ({
    id,
    cloudId: 'c1',
    channelId: 'ch1',
    chatNo,
    kind: 'mention',
    ownerName: 'Ann',
    content: 'hi',
    createdAt: 1,
    read: false,
    ...overrides,
});

const render = (channels: DomainChannel[], myJoins = new Map<string, DomainJoin>()) => {
    data = { channels, isLoaded: true, myJoins, unreads: {} as never };
    const hook = renderHook(() => useNotificationReadSync(), { wrapper: Wrapper });
    return (next: DomainChannel[]) => {
        data = { ...data, channels: next };
        hook.rerender();
    };
};

const readOf = (id: string) => useNotificationStore.getState().items[id]?.read;

beforeEach(() => {
    useNotificationStore.setState({ items: {} });
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId: 'c1' });
    const { add } = useNotificationStore.getState();
    add(item('five', 5));
    add(item('eight', 8));
    add(item('otherCloud', 5, { cloudId: 'c2' }));
});

describe('useNotificationReadSync', () => {
    it('marks a room’s items read up to its cursor', () => {
        render([channel(5)]);
        expect(readOf('five')).toBe(true);
        expect(readOf('eight')).toBe(false);
        expect(readOf('otherCloud')).toBe(false);
    });

    it('follows the cursor as it moves ahead', () => {
        const update = render([channel(5)]);
        update([channel(8)]);
        expect(readOf('eight')).toBe(true);
    });

    it('takes my join row’s cursor when it is further along', () => {
        render([channel(0)], new Map([['ch1', { chatNo: 8 } as unknown as DomainJoin]]));
        expect(readOf('eight')).toBe(true);
    });

    it('leaves an item an undo turned back to unread until the cursor moves again', () => {
        const update = render([channel(5)]);
        act(() => useNotificationStore.getState().markUnread(['five']));
        update([channel(5)]);
        expect(readOf('five')).toBe(false);
    });

    it('ignores a room of another cloud in the list', () => {
        render([channel(9, { cid: 'c2' })]);
        expect(readOf('five')).toBe(false);
    });
});
