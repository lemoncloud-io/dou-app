import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    resetImageAddressRefresh,
    useFreshAddress,
    useImageAddressRefresh,
    useRunWithFreshAddress,
} from './useImageAddressRefresh';

const getChat = vi.hoisted(() => vi.fn());

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: { getGlobalSessionContext: () => ({ cloud: { cloudId: 'cl-1' } }) },
        data: { getCloudRepositories: () => ({ chat: { getChat } }) },
    },
}));

const slot = (id: string, orgUrl: string, extra: Record<string, unknown> = {}) => ({
    id,
    orgUrl,
    name: `${id}.bin`,
    ...extra,
});

const message = (...slots: ReturnType<typeof slot>[]) => ({ id: 'm1', upload$$: slots });

describe('address refresh', () => {
    beforeEach(() => {
        getChat.mockReset();
        resetImageAddressRefresh();
    });

    it('reads the message once per dead address', async () => {
        getChat.mockResolvedValue(message());
        const { result } = renderHook(() => useImageAddressRefresh());
        await result.current('m1', 'https://s/old');
        await result.current('m1', 'https://s/old');
        expect(getChat).toHaveBeenCalledTimes(1);
        await result.current('m1', 'https://s/older');
        expect(getChat).toHaveBeenCalledTimes(2);
    });

    it('stays quiet when the message cannot be read', async () => {
        getChat.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useImageAddressRefresh());
        await expect(result.current('m1', 'https://s/old')).resolves.toBeUndefined();
    });

    it('finds the fresh address of a file by its id, whatever its kind', async () => {
        getChat.mockResolvedValue(
            message(
                slot('img', 'https://s/new-img', { contentType: 'image/png' }),
                slot('doc', 'https://s/new-doc', { contentType: 'application/pdf' })
            )
        );
        const { result } = renderHook(() => useFreshAddress());
        expect(await result.current('m1', 'doc')).toBe('https://s/new-doc');
        expect(await result.current('m1', 'img')).toBe('https://s/new-img');
        expect(await result.current('m1', 'gone')).toBeUndefined();
    });

    it('retries a failed save once, on the fresh address', async () => {
        getChat.mockResolvedValue(message(slot('doc', 'https://s/new-doc', { contentType: 'application/pdf' })));
        const { result } = renderHook(() => useRunWithFreshAddress());
        const run = vi.fn((url: string) =>
            url.endsWith('old') ? Promise.reject(new Error('403')) : Promise.resolve(url)
        );
        await expect(result.current({ chatId: 'm1', id: 'doc', url: 'https://s/old' }, run)).resolves.toBe(
            'https://s/new-doc'
        );
        expect(run.mock.calls.map(([url]) => url)).toEqual(['https://s/old', 'https://s/new-doc']);
    });

    it('keeps the original failure when there is no other address', async () => {
        getChat.mockResolvedValue(message(slot('doc', 'https://s/same', { contentType: 'application/pdf' })));
        const { result } = renderHook(() => useRunWithFreshAddress());
        const failure = new Error('403');
        const run = vi.fn().mockRejectedValue(failure);
        await expect(result.current({ chatId: 'm1', id: 'doc', url: 'https://s/same' }, run)).rejects.toBe(failure);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('does not retry a save that worked', async () => {
        const { result } = renderHook(() => useRunWithFreshAddress());
        await result.current({ chatId: 'm1', id: 'doc', url: 'https://s/ok' }, () => Promise.resolve());
        expect(getChat).not.toHaveBeenCalled();
    });
});
