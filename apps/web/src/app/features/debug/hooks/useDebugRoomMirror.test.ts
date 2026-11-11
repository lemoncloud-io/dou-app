const mockDebugEnabled = { current: true };
jest.mock('./useDebugMode', () => ({
    useDebugMode: () => ({ isEnabled: mockDebugEnabled.current, disable: jest.fn() }),
}));

import { renderHook } from '@testing-library/react';

import type { DomainChannel, DomainChat } from '@chatic/data';

import { clearDebugObservation, getDebugObservation } from '../overlay/sharedObservationStore';
import { useDebugRoomMirror, type DebugRoomMirrorInput } from './useDebugRoomMirror';

const channel = { id: 'ch-1', name: 'Room' } as DomainChannel;
const message = { id: 'ch-1:5', chatNo: 5 } as DomainChat;
const rendered = [message];
const rows = [message, { id: 'ch-1:6', chatNo: 6 } as DomainChat];

const input = (partial: Partial<DebugRoomMirrorInput> = {}): DebugRoomMirrorInput => ({
    channelId: 'ch-1',
    channel,
    rendered,
    rows,
    focused: null,
    ...partial,
});

describe('useDebugRoomMirror', () => {
    beforeEach(() => {
        mockDebugEnabled.current = true;
        clearDebugObservation();
    });

    it('publishes what the page holds, naming the surface', () => {
        renderHook(() => useDebugRoomMirror('room', input()));

        expect(getDebugObservation().room).toEqual({ surface: 'room', channelId: 'ch-1', channel, rendered, rows });
    });

    it('publishes nothing while debug mode is locked', () => {
        mockDebugEnabled.current = false;
        renderHook(() => useDebugRoomMirror('room', input({ focused: message })));

        expect(getDebugObservation().room).toBeNull();
        expect(getDebugObservation().roomFocus).toBeNull();
    });

    it('publishes nothing before the route names a channel', () => {
        renderHook(() => useDebugRoomMirror('room', input({ channelId: undefined })));

        expect(getDebugObservation().room).toBeNull();
    });

    it('keeps the focus after the action sheet closes', () => {
        const { rerender } = renderHook((props: DebugRoomMirrorInput) => useDebugRoomMirror('room', props), {
            initialProps: input({ focused: message }),
        });
        const focus = { surface: 'room', channelId: 'ch-1', messageId: 'ch-1:5' };
        expect(getDebugObservation().roomFocus).toEqual(focus);

        rerender(input({ focused: null }));
        expect(getDebugObservation().roomFocus).toEqual(focus);
    });

    it('takes the slot and the focus down on unmount', () => {
        const { unmount } = renderHook(() => useDebugRoomMirror('thread', input({ focused: message })));
        unmount();

        expect(getDebugObservation().room).toBeNull();
        expect(getDebugObservation().roomFocus).toBeNull();
    });

    it('leaves the slot alone when the next page published before this one cleaned up', () => {
        const room = renderHook(() => useDebugRoomMirror('room', input()));
        renderHook(() => useDebugRoomMirror('thread', input()));
        room.unmount();

        expect(getDebugObservation().room?.surface).toBe('thread');
    });
});
