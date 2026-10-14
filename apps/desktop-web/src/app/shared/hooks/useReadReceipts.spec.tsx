import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import type { DomainChat } from '@chatic/data';

const readInCloud = vi.hoisted(() => vi.fn((..._args: unknown[]) => Promise.resolve()));
vi.mock('@chatic/app-runtime', () => ({
    // The channel cloud's join repository; `readInCloud(cid, input)` stands for its outbox receipt.
    runtime: {
        data: {
            getCloudRepositories: (cid: string) => ({
                join: { readChat: (input: unknown) => Promise.resolve({ delivered: readInCloud(cid, input) }) },
            }),
        },
    },
}));

import { useReadCursorStore } from '../stores';
import { useReadReceipts } from './useReadReceipts';

const chat = (chatNo: number, extra: Partial<DomainChat> = {}) =>
    ({ id: `C1:${chatNo}`, chatNo, ...extra }) as DomainChat;

/** Lets the 500 ms debounce run out. */
const settle = () =>
    act(async () => {
        await vi.advanceTimersByTimeAsync(600);
    });

beforeEach(() => {
    vi.useFakeTimers();
    readInCloud.mockReset().mockResolvedValue(undefined);
    useReadCursorStore.setState({ cursors: {} });
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('useReadReceipts', () => {
    it("queues the highest loaded message in the channel's own cloud", async () => {
        renderHook(() => useReadReceipts('C1', [chat(3), chat(5)], 'cloud-a'));
        await settle();

        expect(readInCloud).toHaveBeenCalledWith('cloud-a', { channelId: 'C1', chatNo: 5 });
        expect(useReadCursorStore.getState().cursors).toEqual({ C1: 5 });
    });

    it('waits for the cloud before sending anything', async () => {
        const { rerender } = renderHook(({ cid }) => useReadReceipts('C1', [chat(5)], cid), {
            initialProps: { cid: '' },
        });
        await settle();
        expect(readInCloud).not.toHaveBeenCalled();

        rerender({ cid: 'cloud-a' });
        await settle();

        expect(readInCloud).toHaveBeenCalledWith('cloud-a', { channelId: 'C1', chatNo: 5 });
    });

    it('never sends a pending row’s sentinel chatNo', async () => {
        renderHook(() =>
            useReadReceipts('C1', [chat(4), chat(Number.MAX_SAFE_INTEGER, { isPending: true })], 'cloud-a')
        );
        await settle();

        expect(readInCloud).toHaveBeenCalledWith('cloud-a', { channelId: 'C1', chatNo: 4 });
    });

    it('does not hand the same read over twice — retrying is the queue’s job', async () => {
        readInCloud.mockRejectedValue(new Error('403 FORBIDDEN'));
        const { rerender } = renderHook(({ messages }) => useReadReceipts('C1', messages, 'cloud-a'), {
            initialProps: { messages: [chat(5)] },
        });
        await settle();

        rerender({ messages: [chat(5)] });
        await settle();

        expect(readInCloud).toHaveBeenCalledTimes(1);
    });
});
