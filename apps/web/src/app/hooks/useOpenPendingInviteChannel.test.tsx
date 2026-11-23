import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

import { useOpenPendingInviteChannel } from './useOpenPendingInviteChannel';
import { usePendingInviteChannel } from '../stores/usePendingInviteChannel';

const enterStack = jest.fn();

jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn() } }));
jest.mock('../navigation', () => ({ useStackNavigate: () => enterStack }));

const ROOM = '/channels/ch-invited/room';

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
        mount('/mypage');

        act(() => usePendingInviteChannel.getState().setPendingChannel('ch-invited'));

        expect(enterStack).toHaveBeenCalledTimes(1);
        expect(enterStack).toHaveBeenCalledWith('push', ROOM);
        expect(usePendingInviteChannel.getState().channelId).toBeNull();
    });

    it('never opens the room over the accept screen, only where leaving it lands', () => {
        const { result } = mount('/invite/accept?code=x');

        act(() => usePendingInviteChannel.getState().setPendingChannel('ch-invited'));
        expect(enterStack).not.toHaveBeenCalled();

        act(() => result.current('/'));

        expect(enterStack).toHaveBeenCalledTimes(1);
        expect(enterStack).toHaveBeenCalledWith('push', ROOM);
    });

    it('opens a room that was already waiting when the layout mounts', () => {
        usePendingInviteChannel.setState({ channelId: 'ch-invited' });
        mount('/');

        expect(enterStack).toHaveBeenCalledTimes(1);
        expect(enterStack).toHaveBeenCalledWith('push', ROOM);
    });

    it('opens a later hand-off into the same room again', () => {
        mount('/');

        act(() => usePendingInviteChannel.getState().setPendingChannel('ch-invited'));
        act(() => usePendingInviteChannel.getState().setPendingChannel('ch-invited'));

        expect(enterStack).toHaveBeenCalledTimes(2);
    });
});
