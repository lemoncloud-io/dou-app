import { renderHook } from '@testing-library/react';

import type { AudioTrack } from '../stores/roomAudioStore';
import { useFreshAudioAddress } from './useFreshAudioAddress';

const mockGetChat = jest.fn();
const mockReposFor = jest.fn();
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            getCloudRepositories: (cid: string) => {
                mockReposFor(cid);
                return { chat: { getChat: mockGetChat } };
            },
        },
    },
}));

const track: AudioTrack = {
    key: 'c1/up-1',
    cid: 'c1',
    channelId: 'ch',
    chatId: 'ch:7',
    chatNo: 7,
    idx: 1,
    url: 'https://old',
};

describe('useFreshAudioAddress', () => {
    beforeEach(() => {
        mockGetChat.mockReset();
        mockReposFor.mockReset();
    });

    it('reads the message again in the track’s cloud and returns its slot’s new address', async () => {
        mockGetChat.mockResolvedValue({
            upload$$: [
                { id: 'a', orgUrl: 'https://a' },
                { id: 'up-1', orgUrl: 'https://fresh' },
            ],
        });
        const { result } = renderHook(() => useFreshAudioAddress());
        await expect(result.current(track)).resolves.toBe('https://fresh');
        expect(mockReposFor).toHaveBeenCalledWith('c1');
        expect(mockGetChat).toHaveBeenCalledWith({ id: 'ch:7' });
    });

    it('gives nothing when the read fails or the slot has no address', async () => {
        const { result } = renderHook(() => useFreshAudioAddress());
        mockGetChat.mockRejectedValueOnce(new Error('offline'));
        await expect(result.current(track)).resolves.toBeUndefined();
        mockGetChat.mockResolvedValueOnce({ upload$$: [{ id: 'a' }] });
        await expect(result.current(track)).resolves.toBeUndefined();
    });
});
