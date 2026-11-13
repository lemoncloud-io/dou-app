import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type * as AppRuntime from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { fetchFileBytes } from '../../utils';
import { ForwardFileHost, useForwardFileStore } from './ForwardFileDialog';

import '../../../../../i18n';

vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast: vi.fn(),
}));

vi.mock('../../utils', async importOriginal => ({
    ...(await importOriginal<object>()),
    fetchFileBytes: vi.fn(),
}));

// A channel's label reads the session for a 1:1's counterpart; these are named channels.
vi.mock('../../../../shared', async importOriginal => ({
    ...(await importOriginal<object>()),
    useChannelLabels: () => (channel: DomainChannel) => channel.name ?? '',
}));

const sendImages = vi.hoisted(() => vi.fn());
const sendTargets = vi.hoisted(() => [] as { cid: string; channelId: string; attach?: boolean }[]);
vi.mock('@chatic/app-runtime', async importOriginal => {
    const original = await importOriginal<typeof AppRuntime>();
    return {
        ...original,
        runtime: {
            ...original.runtime,
            data: {
                ...original.runtime.data,
                useSendImages: (target: { cid: string; channelId: string; attach?: boolean }) => {
                    sendTargets.push({ cid: target.cid, channelId: target.channelId, attach: target.attach });
                    return { sendImages };
                },
            },
        },
    };
});

const channels = [
    { id: 'ch-design', cid: 'cl-1', name: 'design', stereo: 'public' },
    { id: 'ch-ops', cid: 'cl-1', name: 'ops', stereo: 'public' },
] as unknown as DomainChannel[];
const memo = { url: 'https://s/memo', name: 'memo.m4a', contentType: 'audio/mp4' };

const openFor = () => act(() => useForwardFileStore.getState().open(memo));

beforeEach(() => {
    sendImages.mockReset().mockResolvedValue(undefined);
    sendTargets.length = 0;
    vi.mocked(toast).mockClear();
    vi.mocked(fetchFileBytes).mockReset();
});

afterEach(() => {
    cleanup();
    act(() => useForwardFileStore.setState({ request: null, jobs: [] }));
});

describe('ForwardFileHost', () => {
    it('lists the place’s channels and narrows them as the reader types', () => {
        render(<ForwardFileHost channels={channels} />);
        openFor();
        expect(screen.getByRole('dialog', { name: 'Forward memo.m4a' })).toBeTruthy();
        expect(screen.getByRole('option', { name: /design/ })).toBeTruthy();
        fireEvent.change(screen.getByRole('combobox', { name: 'Find a channel' }), { target: { value: 'op' } });
        expect(screen.queryByRole('option', { name: /design/ })).toBeNull();
        expect(screen.getByRole('option', { name: /ops/ })).toBeTruthy();
    });

    it('sends the file again as a new message in the channel picked, and says where', async () => {
        vi.mocked(fetchFileBytes).mockResolvedValue(new Blob(['abc'], { type: 'audio/mp4' }));
        render(<ForwardFileHost channels={channels} />);
        openFor();
        fireEvent.click(screen.getByRole('option', { name: /ops/ }));

        expect(screen.queryByRole('dialog')).toBeNull();
        await vi.waitFor(() => expect(sendImages).toHaveBeenCalledTimes(1));
        expect(toast).toHaveBeenCalledWith({ description: 'Forwarding to ops' });
        // Not as the room's screen: the room may be open, and its rows are that screen's.
        expect(sendTargets).toContainEqual({ cid: 'cl-1', channelId: 'ch-ops', attach: false });
        const [[files]] = sendImages.mock.calls as [[File[]]];
        expect(files[0].name).toBe('memo.m4a');
        expect(files[0].type).toBe('audio/mp4');
        await vi.waitFor(() => expect(useForwardFileStore.getState().jobs).toEqual([]));
    });

    it('sends once when the channel list remounts it mid-send', async () => {
        let loaded: (bytes: Blob) => void = () => undefined;
        vi.mocked(fetchFileBytes).mockImplementation(() => new Promise(resolve => (loaded = resolve)));
        const first = render(<ForwardFileHost channels={channels} />);
        openFor();
        fireEvent.click(screen.getByRole('option', { name: /ops/ }));
        first.unmount();
        render(<ForwardFileHost channels={channels} />);

        loaded(new Blob(['abc'], { type: 'audio/mp4' }));
        await vi.waitFor(() => expect(useForwardFileStore.getState().jobs).toEqual([]));
        expect(fetchFileBytes).toHaveBeenCalledTimes(1);
        expect(sendImages).toHaveBeenCalledTimes(1);
    });

    it('closes the picker when the channel list goes, so another place never offers it', () => {
        const host = render(<ForwardFileHost channels={channels} />);
        openFor();
        host.unmount();
        expect(useForwardFileStore.getState().request).toBeNull();
    });

    it('says it could not forward when the file will not load, and sends nothing', async () => {
        vi.mocked(fetchFileBytes).mockRejectedValue(new Error('file fetch failed: 403'));
        render(<ForwardFileHost channels={channels} />);
        openFor();
        fireEvent.click(screen.getByRole('option', { name: /design/ }));

        await vi.waitFor(() =>
            expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't forward the file" }))
        );
        expect(sendImages).not.toHaveBeenCalled();
        expect(useForwardFileStore.getState().jobs).toEqual([]);
    });
});
