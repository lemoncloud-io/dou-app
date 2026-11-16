import { act, renderHook } from '@testing-library/react';

import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { useNotificationStore } from '../../../stores/useNotificationStore';
import type { NotificationItem } from '../../../utils/notifications';
import type { ClientChatView } from '../types';
import { mentionTargetsOf, newMessagesSince, useRoomJumpPills } from './useRoomJumpPills';

jest.mock('../../../hooks/useCloudScope', () => ({ useSelectedCloudId: () => 'c' }));
const mockHaptic = jest.fn();
jest.mock('../../../bridge/haptics', () => ({ haptics: { play: (kind: string) => mockHaptic(kind) } }));

const item = (over: Partial<NotificationItem>): NotificationItem => ({
    id: over.id ?? 'x',
    cloudId: 'c',
    channelId: 'room',
    kind: 'mention',
    ownerName: 'Sis',
    content: 'hi',
    createdAt: 1,
    read: false,
    ...over,
});
const message = (chatNo: number, over: Partial<ClientChatView> = {}) =>
    ({ id: `m${chatNo}`, chatNo, isOwner: false, isSystem: false, ...over }) as ClientChatView;

describe('mentionTargetsOf', () => {
    it("lists this room's unread mentions oldest first, a thread mention by its root", () => {
        const targets = mentionTargetsOf(
            [
                item({ id: 'b', chatNo: 20 }),
                item({ id: 'a', chatNo: 10 }),
                item({ id: 't', kind: 'threadMention', chatNo: 31, parentId: 'room:15' }),
                item({ id: 'read', chatNo: 5, read: true }),
                item({ id: 'reply', kind: 'replyToMine', chatNo: 6 }),
                item({ id: 'other-room', channelId: 'else', chatNo: 7 }),
                item({ id: 'other-cloud', cloudId: 'd', chatNo: 8 }),
            ],
            'c',
            'room'
        );

        expect(targets).toEqual([
            { chatNo: 10, itemIds: ['a'] },
            { chatNo: 15, itemIds: ['t'] },
            { chatNo: 20, itemIds: ['b'] },
        ]);
    });
});

describe('newMessagesSince', () => {
    it("counts only others' messages after the mark", () => {
        const messages = [
            message(1),
            message(2),
            message(3, { isOwner: true }),
            message(4, { isSystem: true }),
            message(5),
        ];
        expect(newMessagesSince(messages, 1)).toBe(2);
    });
});

describe('useRoomJumpPills', () => {
    const container = { current: document.createElement('div') };
    const scrollToBottom = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        useMessageJumpStore.setState({ target: null } as never);
        useNotificationStore.setState({
            items: { a: item({ id: 'a', chatNo: 10 }), b: item({ id: 'b', chatNo: 20 }) },
        });
    });

    it('shows the mentions pill and jumps to the oldest mention, reading it', () => {
        const { result } = renderHook(() =>
            useRoomJumpPills({
                channelId: 'room',
                messages: [],
                containerRef: container,
                isAwayFromBottom: false,
                scrollToBottom,
            })
        );
        expect(result.current.pill).toMatchObject({ variant: 'mention', count: 2 });

        act(() => result.current.pill?.onClick());

        expect(useMessageJumpStore.getState().target).toMatchObject({ channelId: 'room', chatNo: 10 });
        expect(useNotificationStore.getState().items.a.read).toBe(true);
        expect(result.current.pill).toMatchObject({ variant: 'mention', count: 1 });
        expect(mockHaptic).toHaveBeenCalledWith('selection');
    });

    it('keeps the mentions it took at entry even after the room reads them', () => {
        const { result } = renderHook(() =>
            useRoomJumpPills({
                channelId: 'room',
                messages: [],
                containerRef: container,
                isAwayFromBottom: false,
                scrollToBottom,
            })
        );
        act(() => useNotificationStore.getState().markChannelReadUpTo('c', 'room', 100));

        expect(result.current.pill).toMatchObject({ variant: 'mention', count: 2 });
    });

    it('counts new messages while away from the bottom, and goes back down on a tap', () => {
        useNotificationStore.setState({ items: {} });
        const props = {
            channelId: 'room',
            messages: [message(1), message(2)],
            containerRef: container,
            isAwayFromBottom: false,
            scrollToBottom,
        };
        const { result, rerender } = renderHook(p => useRoomJumpPills(p), { initialProps: props });
        expect(result.current.pill).toBeNull();

        rerender({ ...props, isAwayFromBottom: true });
        expect(result.current.pill).toBeNull();

        rerender({ ...props, isAwayFromBottom: true, messages: [message(1), message(2), message(3), message(4)] });
        expect(result.current.pill).toMatchObject({ variant: 'latest', count: 2 });

        act(() => result.current.pill?.onClick());
        expect(scrollToBottom).toHaveBeenCalledWith(true);

        rerender({ ...props, isAwayFromBottom: false, messages: [message(1), message(2), message(3), message(4)] });
        expect(result.current.pill).toBeNull();
    });
});
