import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOAST_DURATION_MS, Toaster } from '@chatic/ui-kit/components/ui/toaster';

import '../../../i18n';

import type { DownloadDone } from '../utils/electronApi';
import { useDownloadNotices } from './useDownloadNotices';

let emit: (done: DownloadDone) => void;
const reveal = vi.fn<(id: string) => Promise<boolean>>();

beforeEach(() => {
    reveal.mockReset().mockResolvedValue(true);
    window.electronAPI = {
        appVersion: '1.0.0',
        platform: 'darwin',
        downloads: {
            onDone: listener => {
                emit = listener;
                return () => undefined;
            },
            reveal,
        },
    };
});
afterEach(() => {
    cleanup();
    delete window.electronAPI;
});

const mount = () => {
    render(<Toaster />);
    renderHook(() => useDownloadNotices());
};

describe('useDownloadNotices', () => {
    it('says a finished save, and shows it in Finder by the id the shell gave', async () => {
        mount();
        act(() => emit({ id: 'download-1', name: 'song.mp3', state: 'completed' }));
        expect(screen.getByText('Saved song.mp3')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Show in Finder' }));
        expect(reveal).toHaveBeenCalledWith('download-1');
    });

    it('counts saves that end together in one notice', () => {
        mount();
        act(() => {
            emit({ id: 'download-1', name: 'a.png', state: 'completed' });
            emit({ id: 'download-2', name: 'b.png', state: 'completed' });
            emit({ id: 'download-3', name: 'c.png', state: 'completed' });
        });
        expect(screen.getByText('Saved 3 files')).toBeTruthy();
        expect(screen.queryByText('Saved a.png')).toBeNull();
    });

    // The notice closes a few seconds after it opened, however often it was updated since.
    it('starts a new notice once the last one is about to close', () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
        try {
            mount();
            act(() => emit({ id: 'download-1', name: 'a.png', state: 'completed' }));
            now.mockReturnValue(1_000 + TOAST_DURATION_MS);
            act(() => emit({ id: 'download-2', name: 'b.png', state: 'completed' }));
            expect(screen.getByText('Saved b.png')).toBeTruthy();
        } finally {
            now.mockRestore();
        }
    });

    it('says when the saved file is gone from where it landed', async () => {
        reveal.mockResolvedValue(false);
        mount();
        act(() => emit({ id: 'download-1', name: 'song.mp3', state: 'completed' }));
        fireEvent.click(screen.getByRole('button', { name: 'Show in Finder' }));
        expect(await screen.findByText("That file isn't where it was saved anymore")).toBeTruthy();
    });

    it('says a save that broke off', () => {
        mount();
        act(() => emit({ name: 'song.mp3', state: 'interrupted' }));
        expect(screen.getByText("Couldn't save song.mp3")).toBeTruthy();
    });

    it('does nothing in a plain browser', () => {
        delete window.electronAPI;
        expect(() => mount()).not.toThrow();
    });
});
