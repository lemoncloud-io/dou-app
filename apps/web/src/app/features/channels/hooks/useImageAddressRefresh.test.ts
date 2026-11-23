import { renderHook } from '@testing-library/react';

import { resetImageAddressRefresh, setImageRefreshObserver, useImageAddressRefresh } from './useImageAddressRefresh';

const getChat = jest.fn();
const getCloudRepositories = jest.fn((_cid: string) => ({ chat: { getChat } }));
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        data: { getCloudRepositories: (cid: string) => getCloudRepositories(cid) },
    })
);

beforeEach(() => {
    jest.clearAllMocks();
    getChat.mockResolvedValue({});
    resetImageAddressRefresh();
    setImageRefreshObserver(undefined);
});

describe('useImageAddressRefresh', () => {
    it('re-reads the message from its own cloud', async () => {
        const { result } = renderHook(() => useImageAddressRefresh());

        await expect(result.current({ cid: 'cloud-b', chatId: 'ch1:5', src: 'https://s3/old' })).resolves.toBe(true);

        expect(getCloudRepositories).toHaveBeenCalledWith('cloud-b');
        expect(getChat).toHaveBeenCalledWith({ id: 'ch1:5' });
    });

    it('asks once per dead address', async () => {
        const { result } = renderHook(() => useImageAddressRefresh());

        await result.current({ cid: 'c', chatId: 'ch1:5', src: 'https://s3/old' });
        await expect(result.current({ cid: 'c', chatId: 'ch1:5', src: 'https://s3/old' })).resolves.toBe(false);

        expect(getChat).toHaveBeenCalledTimes(1);
    });

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

    describe('the image_refresh measurement', () => {
        it('reports an image re-read that answered as ok, with its duration', async () => {
            const observer = jest.fn();
            setImageRefreshObserver(() => observer);
            const { result } = renderHook(() => useImageAddressRefresh());

            await result.current({ cid: 'c', chatId: 'ch1:5', src: 'x' });

            expect(observer).toHaveBeenCalledWith({ kind: 'image', outcome: 'ok', ms: expect.any(Number) });
        });

        it('labels a re-read a file download asked for', async () => {
            const observer = jest.fn();
            setImageRefreshObserver(() => observer);
            const { result } = renderHook(() => useImageAddressRefresh());

            await result.current({ cid: 'c', chatId: 'ch1:5', src: 'x', kind: 'file' });

            expect(observer).toHaveBeenCalledWith(expect.objectContaining({ kind: 'file' }));
        });

        it('begins the report before the read is sent', async () => {
            const order: string[] = [];
            getChat.mockImplementation(async () => order.push('read'));
            setImageRefreshObserver(() => {
                order.push('begin');
                return () => order.push('end');
            });
            const { result } = renderHook(() => useImageAddressRefresh());

            await result.current({ cid: 'c', chatId: 'ch1:5', src: 'x' });

            expect(order).toEqual(['begin', 'read', 'end']);
        });

        it('reports a re-read that threw as failed', async () => {
            getChat.mockRejectedValue(new Error('offline'));
            const observer = jest.fn();
            setImageRefreshObserver(() => observer);
            const { result } = renderHook(() => useImageAddressRefresh());

            await result.current({ cid: 'c', chatId: 'ch1:5', src: 'x' });

            expect(observer).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }));
        });

        it('reports nothing for an address already re-read', async () => {
            const observer = jest.fn();
            setImageRefreshObserver(() => observer);
            const { result } = renderHook(() => useImageAddressRefresh());

            await result.current({ cid: 'c', chatId: 'ch1:5', src: 'x' });
            await result.current({ cid: 'c', chatId: 'ch1:5', src: 'x' });

            expect(observer).toHaveBeenCalledTimes(1);
        });

        it.each([
            [
                'at the begin',
                () => {
                    throw new Error('measurement broke');
                },
            ],
            [
                'at the end',
                () => () => {
                    throw new Error('measurement broke');
                },
            ],
        ])('answers as usual when the observer throws %s', async (_, observer) => {
            setImageRefreshObserver(observer);
            const { result } = renderHook(() => useImageAddressRefresh());

            await expect(result.current({ cid: 'c', chatId: 'ch1:5', src: 'x' })).resolves.toBe(true);
            expect(getChat).toHaveBeenCalledTimes(1);
        });
    });
});
