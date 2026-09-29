import { renderHook } from '@testing-library/react';

import { resetImageAddressRefresh, useImageAddressRefresh } from './useImageAddressRefresh';

const getChat = jest.fn();
const getCloudRepositories = jest.fn((_cid: string) => ({ chat: { getChat } }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: { data: { getCloudRepositories: (cid: string) => getCloudRepositories(cid) } },
}));

beforeEach(() => {
    jest.clearAllMocks();
    getChat.mockResolvedValue({});
    resetImageAddressRefresh();
});

describe('useImageAddressRefresh', () => {
    it('re-reads the message from its own cloud', async () => {
        const { result } = renderHook(() => useImageAddressRefresh());

        await expect(result.current({ cid: 'cloud-b', chatId: 'ch1:5', src: 'https://s3/old' })).resolves.toBe(true);

        expect(getCloudRepositories).toHaveBeenCalledWith('cloud-b');
        expect(getChat).toHaveBeenCalledWith({ id: 'ch1:5' });
    });

    // A fresh address that fails too must leave a placeholder, not start a loop of re-reads.
    it('asks once per dead address', async () => {
        const { result } = renderHook(() => useImageAddressRefresh());

        await result.current({ cid: 'c', chatId: 'ch1:5', src: 'https://s3/old' });
        await expect(result.current({ cid: 'c', chatId: 'ch1:5', src: 'https://s3/old' })).resolves.toBe(false);

        expect(getChat).toHaveBeenCalledTimes(1);
    });

    // Hours later the fresh address expires in turn; that is a different address and gets its own re-read.
    it('asks again for a different address of the same message', async () => {
        const { result } = renderHook(() => useImageAddressRefresh());

        await result.current({ cid: 'c', chatId: 'ch1:5', src: 'https://s3/old' });
        await result.current({ cid: 'c', chatId: 'ch1:5', src: 'https://s3/new' });

        expect(getChat).toHaveBeenCalledTimes(2);
    });

    it('does not throw when the re-read fails', async () => {
        getChat.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useImageAddressRefresh());

        await expect(result.current({ cid: 'c', chatId: 'ch1:5', src: 'x' })).resolves.toBe(true);
    });

    it('skips a row without an id', async () => {
        const { result } = renderHook(() => useImageAddressRefresh());

        await expect(result.current({ cid: 'c', chatId: '', src: 'x' })).resolves.toBe(false);
        expect(getChat).not.toHaveBeenCalled();
    });
});
