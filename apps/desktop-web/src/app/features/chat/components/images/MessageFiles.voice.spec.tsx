import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import type * as AppRuntime from '@chatic/app-runtime';
import type { DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { MessageFiles } from './MessageFiles';
import { voiceElementFor } from './voicePlayback';

import '../../../../../i18n';

vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast: vi.fn(),
}));

const sendProgress = vi.hoisted(() => ({ value: undefined as readonly (number | undefined)[] | undefined }));
vi.mock('@chatic/app-runtime', async importOriginal => {
    const original = await importOriginal<typeof AppRuntime>();
    return {
        ...original,
        runtime: {
            ...original.runtime,
            data: { ...original.runtime.data, useImageSendProgress: () => sendProgress.value },
        },
    };
});

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;
const author = { name: 'Ada', colorSeed: 'ada', time: '7:43 PM' };
const sent = (upload$$: unknown[]) => ({ id: 'row-1', channelId: 'ch-1', upload$$ }) as DomainChat;
const MB = 1024 * 1024;
const song = (id: string, name = 'song.mp3', contentSize = 17 * MB) => ({
    id,
    stereo: 'file',
    name,
    contentType: name.endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg',
    contentSize,
    orgUrl: `https://s/${id}`,
});

const voiceOf = (id: string) => voiceElementFor(`https://s/${id}`) as HTMLAudioElement;
const lengthOf = (id: string, seconds: number) => {
    const audio = voiceOf(id);
    Object.defineProperty(audio, 'duration', { configurable: true, value: seconds });
    act(() => {
        fireEvent.durationChange(audio);
    });
};
const startPlaying = (id: string) => {
    const audio = voiceOf(id);
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    act(() => {
        fireEvent.play(audio);
        fireEvent.playing(audio);
    });
};
const openMore = async (name: string) => {
    const more = screen.getByRole('button', { name: `More actions for ${name}` });
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false });
    fireEvent.keyDown(more, { key: 'Enter' });
    await screen.findByRole('menu');
};

let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    sendProgress.value = undefined;
    vi.mocked(toast).mockClear();
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});
afterEach(() => {
    cleanup();
    play.mockRestore();
    pause.mockRestore();
});

describe('a voice card', () => {
    it('shows its length and size before it is played', () => {
        render(<MessageFiles author={author} message={sent([song('a')])} />, { wrapper });
        lengthOf('a', 125);
        expect(screen.getByText('2:05 · 17 MB')).toBeTruthy();
        expect(screen.queryByRole('slider')).toBeNull();
    });

    it('shows only its size while its length is unknown', () => {
        render(<MessageFiles author={author} message={sent([song('a')])} />, { wrapper });
        expect(screen.getByText('17 MB')).toBeTruthy();
    });

    it('writes a length past an hour as h:mm:ss', () => {
        render(<MessageFiles author={author} message={sent([song('a')])} />, { wrapper });
        lengthOf('a', 4325);
        expect(screen.getByText('1:12:05 · 17 MB')).toBeTruthy();
    });

    it('shows the seek bar, the clock and the speed once it plays, and steps the speed', () => {
        render(<MessageFiles author={author} message={sent([song('a')])} />, { wrapper });
        lengthOf('a', 125);
        startPlaying('a');
        expect(screen.getByRole('slider', { name: 'Playback position of song.mp3' })).toBeTruthy();
        expect(screen.getByText('0:00 / 2:05')).toBeTruthy();

        const speed = screen.getByRole('button', { name: 'Playback speed 1x' });
        fireEvent.click(speed);
        expect(screen.getByRole('button', { name: 'Playback speed 1.5x' })).toBeTruthy();
        expect(voiceOf('a').playbackRate).toBe(1.5);
    });

    it('keeps the extension in view when the name is cut', () => {
        render(<MessageFiles author={author} message={sent([song('a', '팀 회의 1107_최종본_전체녹음_수정.m4a')])} />, {
            wrapper,
        });
        expect(screen.getByText('팀 회의 1107_최종본_전체녹음_수정')).toBeTruthy();
        expect(screen.getByText('.m4a')).toBeTruthy();
    });

    it('offers download and reply in thread from its menu', async () => {
        const onReply = vi.fn();
        render(<MessageFiles author={author} message={sent([song('a')])} onReply={onReply} />, { wrapper });
        await openMore('song.mp3');
        expect(screen.getByRole('menuitem', { name: 'Download' })).toBeTruthy();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Reply in thread' }));
        expect(onReply).toHaveBeenCalledTimes(1);
    });

    it('deletes the whole message from "delete file" on your own message, after asking', async () => {
        const onDeleteMessage = vi.fn();
        render(
            <MessageFiles author={author} message={sent([song('a')])} canDelete onDeleteMessage={onDeleteMessage} />,
            { wrapper }
        );
        await openMore('song.mp3');
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete file' }));
        expect(await screen.findByText('Delete this message?')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Delete file' }));
        expect(onDeleteMessage).toHaveBeenCalledTimes(1);
    });

    it("offers no delete on someone else's message", async () => {
        render(<MessageFiles author={author} message={sent([song('a')])} onDeleteMessage={vi.fn()} />, { wrapper });
        await openMore('song.mp3');
        expect(screen.queryByRole('menuitem', { name: 'Delete file' })).toBeNull();
    });

    it('shows how far it has been sent while it uploads', () => {
        sendProgress.value = [0.42];
        render(
            <MessageFiles
                author={author}
                message={sent([
                    {
                        localStatus: 'sending',
                        localName: 'memo.m4a',
                        localContentType: 'audio/mp4',
                        localSize: 17 * MB,
                    },
                ])}
            />,
            { wrapper }
        );
        expect(screen.getByText('Uploading 42% · 17 MB')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
    });

    it('says it was not sent when its upload failed', () => {
        render(
            <MessageFiles
                author={author}
                message={sent([
                    { localStatus: 'failed', localName: 'memo.m4a', localContentType: 'audio/mp4', localSize: 10 },
                ])}
            />,
            { wrapper }
        );
        expect(screen.getByText("This file couldn't be sent")).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Play memo.m4a' })).toBeNull();
    });

    it('turns unplayable, with a toast, when playback breaks off', () => {
        render(<MessageFiles author={author} message={sent([song('a')])} />, { wrapper });
        startPlaying('a');
        act(() => {
            fireEvent.error(voiceOf('a'));
        });
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "This file can't be played" }));
        expect(screen.getByText("Couldn't play this file · 17 MB")).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Play song.mp3' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Save song.mp3' })).toBeTruthy();
    });

    it('says nothing in a toast when it cannot be played before anyone pressed play', () => {
        render(<MessageFiles author={author} message={sent([song('a')])} />, { wrapper });
        act(() => {
            fireEvent.error(voiceOf('a'));
        });
        expect(toast).not.toHaveBeenCalled();
        expect(screen.getByText("Couldn't play this file · 17 MB")).toBeTruthy();
    });
});
