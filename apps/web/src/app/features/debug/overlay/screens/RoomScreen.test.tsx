import '@testing-library/jest-dom';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { DomainChannel, DomainChat } from '@chatic/data';

import { setDebugLanguageForTests } from '../../i18n';
import { clearDebugObservation, publishDebugObservation } from '../sharedObservationStore';
import { RoomScreen } from './RoomScreen';

const mockChatCacheRead = jest.fn();
const mockGetChat = jest.fn();
const mockChannelCacheRead = jest.fn();
const mockRefreshOneInCloud = jest.fn();
const mockGetCloudRepositories = jest.fn();

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            getCloudRepositories: (cid: string) => {
                mockGetCloudRepositories(cid);
                return {
                    chat: { cacheRead: mockChatCacheRead, getChat: mockGetChat },
                    channel: { cacheRead: mockChannelCacheRead, refreshOneInCloud: mockRefreshOneInCloud },
                };
            },
        },
    },
}));

const channel = { id: 'ch-1', cid: 'cloud-a', sid: 'site-1', name: 'General' } as DomainChannel;
const hello = { id: 'ch-1:1', cid: 'cloud-a', channelId: 'ch-1', chatNo: 1, content: 'hello there' } as DomainChat;
const reaction = { id: 'ch-1:2', cid: 'cloud-a', channelId: 'ch-1', chatNo: 2, content: 'reaction-row' } as DomainChat;
const unsent = { id: 'pending-1', cid: 'cloud-a', channelId: 'ch-1', chatNo: 0, content: 'sending' } as DomainChat;

const publishRoom = () =>
    publishDebugObservation({
        room: {
            surface: 'room',
            channelId: 'ch-1',
            channel,
            rendered: [hello, unsent],
            rows: [hello, reaction, unsent],
        },
    });

describe('RoomScreen', () => {
    let restoreLanguage: () => void;

    beforeEach(() => {
        restoreLanguage = setDebugLanguageForTests('en');
        clearDebugObservation();
        jest.clearAllMocks();
    });

    afterEach(() => restoreLanguage());

    it('says no room is open when nothing is mirrored', () => {
        render(<RoomScreen />);
        expect(screen.getByText(/No room is open/)).toBeInTheDocument();
    });

    it('shows the channel as the room holds it and the shown messages by default', () => {
        publishRoom();
        render(<RoomScreen />);

        expect(screen.getByText(/"name": "General"/)).toBeInTheDocument();
        expect(screen.getByText('#1 hello there')).toBeInTheDocument();
        expect(screen.queryByText('#2 reaction-row')).not.toBeInTheDocument();
    });

    it('switches to the feed rows the room filtered out', () => {
        publishRoom();
        render(<RoomScreen />);

        fireEvent.click(screen.getByRole('button', { name: 'Feed rows (3)' }));
        expect(screen.getByText('#2 reaction-row')).toBeInTheDocument();
    });

    it('filters the list by text', () => {
        publishRoom();
        render(<RoomScreen />);

        fireEvent.change(screen.getByLabelText('Filter by id, chat number or text'), { target: { value: 'HELLO' } });
        expect(screen.getByText('#1 hello there')).toBeInTheDocument();
        expect(screen.queryByText('#0 sending')).not.toBeInTheDocument();
    });

    it("reads a message's cache row from the message's own cloud", async () => {
        mockChatCacheRead.mockResolvedValue({ ...hello, content: 'cached copy' });
        publishRoom();
        render(<RoomScreen />);

        fireEvent.click(screen.getByText('#1 hello there'));
        fireEvent.click(screen.getAllByRole('button', { name: 'Cache row' })[1]);

        expect(await screen.findByText(/"content": "cached copy"/)).toBeInTheDocument();
        expect(mockGetCloudRepositories).toHaveBeenCalledWith('cloud-a');
        expect(mockChatCacheRead).toHaveBeenCalledWith('ch-1:1');
    });

    it('says when the cache has no row', async () => {
        mockChannelCacheRead.mockResolvedValue(null);
        publishRoom();
        render(<RoomScreen />);

        fireEvent.click(screen.getAllByRole('button', { name: 'Cache row' })[0]);
        expect(await screen.findByText('Not in the cache')).toBeInTheDocument();
    });

    it('shows a failed server read instead of throwing', async () => {
        mockRefreshOneInCloud.mockRejectedValue(new Error('socket closed'));
        publishRoom();
        render(<RoomScreen />);

        fireEvent.click(screen.getByRole('button', { name: 'Server' }));
        expect(await screen.findByText('Failed: socket closed')).toBeInTheDocument();
        expect(mockRefreshOneInCloud).toHaveBeenCalledWith('ch-1', 'site-1');
    });

    it('offers no server read for a message the server has not numbered', () => {
        publishRoom();
        render(<RoomScreen />);

        fireEvent.click(screen.getByText('#0 sending'));
        // Only the channel's server button: the unsent row has nothing on the server to read.
        expect(screen.getAllByRole('button', { name: 'Server' })).toHaveLength(1);
    });

    it('opens the long-pressed message, even one the room does not show', async () => {
        mockGetChat.mockResolvedValue({ ...reaction, content: 'from server' });
        publishRoom();
        publishDebugObservation({ roomFocus: { surface: 'room', channelId: 'ch-1', messageId: 'ch-1:2' } });
        render(<RoomScreen />);

        expect(screen.getByText('Long-pressed message')).toBeInTheDocument();
        expect(screen.getByText(/"content": "reaction-row"/)).toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', { name: 'Server' })[1]);
        await waitFor(() => expect(mockGetChat).toHaveBeenCalledWith({ id: 'ch-1:2' }));
        expect(await screen.findByText(/"content": "from server"/)).toBeInTheDocument();
    });

    it('words the row flags through the string table and keeps the stereo as data', () => {
        publishRoom();
        render(<RoomScreen />);

        expect(screen.getByText('unsent')).toBeInTheDocument();
        restoreLanguage();
        restoreLanguage = setDebugLanguageForTests('ko');
        cleanup();
        render(<RoomScreen />);
        expect(screen.getByText('미전송')).toBeInTheDocument();
    });

    it('drops lookups fetched for the previous channel when the room moves to another', async () => {
        mockChannelCacheRead.mockResolvedValue({ ...channel, name: 'cached A' });
        publishRoom();
        render(<RoomScreen />);

        fireEvent.click(screen.getAllByRole('button', { name: 'Cache row' })[0]);
        expect(await screen.findByText(/"name": "cached A"/)).toBeInTheDocument();

        act(() => {
            publishDebugObservation({
                room: {
                    surface: 'room',
                    channelId: 'ch-2',
                    channel: { ...channel, id: 'ch-2', name: 'Other' },
                    rendered: [],
                    rows: [],
                },
            });
        });
        expect(screen.getByText(/"name": "Other"/)).toBeInTheDocument();
        expect(screen.queryByText(/"name": "cached A"/)).not.toBeInTheDocument();
    });

    it('disables a lookup button while its read is in flight', () => {
        mockChannelCacheRead.mockReturnValue(new Promise(() => undefined));
        publishRoom();
        render(<RoomScreen />);

        const button = screen.getAllByRole('button', { name: 'Cache row' })[0];
        fireEvent.click(button);
        expect(button).toBeDisabled();
    });

    it('ignores a focus left by another channel', () => {
        publishRoom();
        publishDebugObservation({ roomFocus: { surface: 'room', channelId: 'ch-9', messageId: 'ch-9:1' } });
        render(<RoomScreen />);

        expect(screen.queryByText('Long-pressed message')).not.toBeInTheDocument();
    });
});
