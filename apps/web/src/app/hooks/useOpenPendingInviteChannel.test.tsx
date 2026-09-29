import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

import { useOpenPendingInviteChannel } from './useOpenPendingInviteChannel';
import { usePendingInviteChannel } from '../stores/usePendingInviteChannel';

const enterStack = jest.fn();

jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn() } }));
// Where the room lands on the stack is the push rule's to decide (navigation/stackPolicy.test.ts).
// This suite asserts only that the room is handed to that rule, once, and at the right moment.
jest.mock('../navigation', () => ({ useStackNavigate: () => enterStack }));

const ROOM = '/channels/ch-invited/room';

/** Mounts the hook at `path`, plus a router navigate so a test can move the reader like a rewind does. */
const mount = (path: string) => {
    const wrapper = ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    );
    return renderHook(
        () => {
            useOpenPendingInviteChannel();
            return useNavigate();
        },
        { wrapper }
    );
};

beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    usePendingInviteChannel.setState({ channelId: null });
});

describe('useOpenPendingInviteChannel', () => {
    it('does nothing while no room is pending', () => {
        mount('/mypage');

        expect(enterStack).not.toHaveBeenCalled();
    });

    it('opens the room on a screen other than home, and empties the store', () => {
        // A warm invite that arrived while the reader was on My rewinds back onto My.
        mount('/mypage');

        act(() => usePendingInviteChannel.getState().setPendingChannel('ch-invited'));

        expect(enterStack).toHaveBeenCalledTimes(1);
        expect(enterStack).toHaveBeenCalledWith('push', ROOM);
        expect(usePendingInviteChannel.getState().channelId).toBeNull();
    });

    it('never opens the room over the accept screen, only where leaving it lands', () => {
        // The layout is not mounted on the accept screen today, so this is the guard for the day it is.
        const { result } = mount('/invite/accept?code=x');

        // The lane stashes the room and starts the rewind, which has not landed yet.
        act(() => usePendingInviteChannel.getState().setPendingChannel('ch-invited'));
        expect(enterStack).not.toHaveBeenCalled();

        act(() => result.current('/'));

        expect(enterStack).toHaveBeenCalledTimes(1);
        expect(enterStack).toHaveBeenCalledWith('push', ROOM);
    });

    it('opens a room that was already waiting when the layout mounts', () => {
        // The accept screen sits outside the layout, so the layout mounts with the id already set.
        usePendingInviteChannel.setState({ channelId: 'ch-invited' });
        mount('/');

        expect(enterStack).toHaveBeenCalledTimes(1);
        expect(enterStack).toHaveBeenCalledWith('push', ROOM);
    });

    it('opens a later hand-off into the same room again', () => {
        // The layout lives for the whole session, so nothing may remember a room it already opened.
        mount('/');

        act(() => usePendingInviteChannel.getState().setPendingChannel('ch-invited'));
        act(() => usePendingInviteChannel.getState().setPendingChannel('ch-invited'));

        expect(enterStack).toHaveBeenCalledTimes(2);
    });
});
