import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { downloadImage } from '../../utils';
import type * as Utils from '../../utils';
import { MessageFiles } from './MessageFiles';

import '../../../../../i18n';

vi.mock('../../utils', async importOriginal => ({
    ...(await importOriginal<typeof Utils>()),
    downloadImage: vi.fn(async () => undefined),
}));

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;
const author = { name: 'Ada', colorSeed: 'ada', time: '7:43 PM' };
const sent = (upload$$: unknown[]) => ({ id: 'row-1', channelId: 'ch-1', upload$$ }) as DomainChat;

describe('MessageFiles', () => {
    it('plays a video in place and names it', () => {
        render(
            <MessageFiles
                author={author}
                message={sent([{ id: 'v', stereo: 'video', name: 'clip.mp4', orgUrl: 'https://s/v' }])}
            />,
            {
                wrapper,
            }
        );
        const video = document.querySelector('video');
        expect(video?.getAttribute('src')).toBe('https://s/v');
        expect(video?.hasAttribute('controls')).toBe(true);
        expect(video?.getAttribute('preload')).toBe('metadata');
        expect(screen.getByText('clip.mp4')).toBeTruthy();
    });

    it('shows a document as its name and size, and saves it under that name', () => {
        render(
            <MessageFiles
                author={author}
                message={sent([
                    { id: 'f', stereo: 'file', name: 'report.pdf', contentSize: 1536, orgUrl: 'https://s/f' },
                ])}
            />,
            { wrapper }
        );
        expect(screen.getByText('report.pdf')).toBeTruthy();
        expect(screen.getByText('1.5 KB')).toBeTruthy();
        expect(document.querySelector('img')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Save report.pdf' }));
        expect(downloadImage).toHaveBeenCalledWith({ url: 'https://s/f', name: 'report.pdf' });
    });

    // Uploads from before the server kept names have none; the card still says what it is.
    it('names a document the server kept no name for by its kind', () => {
        render(<MessageFiles author={author} message={sent([{ id: 'f', stereo: 'file', orgUrl: 'https://s/f' }])} />, {
            wrapper,
        });
        expect(screen.getByText('File')).toBeTruthy();

        // Saved as "file", never the reader's label; the save adds the extension the bytes have.
        fireEvent.click(screen.getByRole('button', { name: 'Save File' }));
        expect(downloadImage).toHaveBeenCalledWith({ url: 'https://s/f', name: 'file' });
    });

    it('opens a PDF or text file in the viewer from its card, and not an office file', () => {
        render(
            <MessageFiles
                author={author}
                message={sent([
                    { id: 't', stereo: 'file', name: 'notes.txt', contentType: 'text/plain', orgUrl: 'https://s/t' },
                    { id: 'd', stereo: 'file', name: 'a.docx', orgUrl: 'https://s/d' },
                ])}
            />,
            { wrapper }
        );
        expect(screen.queryByRole('button', { name: 'Open a.docx' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Open notes.txt' }));
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    describe('a voice file', () => {
        const song = (id: string, name: string) => ({
            id,
            stereo: 'file',
            name,
            contentType: 'audio/mpeg',
            orgUrl: `https://s/${id}`,
        });
        // jsdom implements no playback: `play()` only logs. These stand in for the element's own methods.
        const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
        const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        const audioOf = (container: HTMLElement, index = 0) => container.querySelectorAll('audio')[index];

        beforeEach(() => {
            play.mockClear();
            pause.mockClear();
        });

        // It used to open a full-window dialog around one small native player.
        it('plays in its card, streamed from its address, without opening the viewer', () => {
            const { container } = render(<MessageFiles author={author} message={sent([song('a', 'song.mp3')])} />, {
                wrapper,
            });
            const audio = audioOf(container);
            expect(audio.getAttribute('src')).toBe('https://s/a');
            expect(audio.getAttribute('preload')).toBe('metadata');

            fireEvent.click(screen.getByRole('button', { name: 'Play song.mp3' }));
            expect(play).toHaveBeenCalledTimes(1);
            fireEvent.play(audio);
            expect(screen.getByRole('button', { name: 'Pause song.mp3' })).toBeTruthy();
            expect(screen.queryByRole('dialog')).toBeNull();
        });

        // jsdom's elements are always paused; this one is taken to be sounding.
        const sounding = (media: HTMLMediaElement) => {
            Object.defineProperty(media, 'paused', { configurable: true, value: false });
            return media;
        };
        const clip = { id: 'v', stereo: 'video', name: 'clip.mp4', orgUrl: 'https://s/v' };

        it('pauses whatever else is playing when it starts, a video included', () => {
            const { container } = render(
                <MessageFiles author={author} message={sent([song('a', 'one.mp3'), song('b', 'two.mp3'), clip])} />,
                { wrapper }
            );
            const one = sounding(audioOf(container, 0));
            const video = sounding(container.querySelector('video') as HTMLVideoElement);
            fireEvent.play(audioOf(container, 1));
            expect(pause.mock.contexts).toEqual(expect.arrayContaining([one, video]));
            expect(pause).toHaveBeenCalledTimes(2);
        });

        it('is paused by a video that starts', () => {
            const { container } = render(
                <MessageFiles author={author} message={sent([song('a', 'one.mp3'), clip])} />,
                { wrapper }
            );
            const one = sounding(audioOf(container, 0));
            fireEvent.play(container.querySelector('video') as HTMLVideoElement);
            expect(pause.mock.contexts).toEqual([one]);
        });

        // Its length unknown, the clock reads the time played alone rather than "0:12 / 0:00".
        it('shows only the time played while its length is unknown', () => {
            const { container } = render(<MessageFiles author={author} message={sent([song('a', 'song.mp3')])} />, {
                wrapper,
            });
            const audio = audioOf(container);
            Object.defineProperty(audio, 'currentTime', { configurable: true, value: 12 });
            fireEvent.timeUpdate(audio);
            expect(screen.getByText('0:12')).toBeTruthy();
        });

        it('seeks once its length is known, and shows the clock', () => {
            const { container } = render(<MessageFiles author={author} message={sent([song('a', 'song.mp3')])} />, {
                wrapper,
            });
            const audio = audioOf(container);
            const seek = screen.getByRole('slider', { name: 'Playback position of song.mp3' }) as HTMLInputElement;
            expect(seek.disabled).toBe(true);

            Object.defineProperty(audio, 'duration', { configurable: true, value: 125 });
            fireEvent.durationChange(audio);
            expect(seek.disabled).toBe(false);
            expect(screen.getByText('0:00 / 2:05')).toBeTruthy();

            fireEvent.change(seek, { target: { value: '61' } });
            expect(audio.currentTime).toBe(61);
            expect(screen.getByText('1:01 / 2:05')).toBeTruthy();
        });

        // A signed address past its time answers 403, and the button would do nothing.
        it('says it could not be played, and still offers to save it', () => {
            const { container } = render(<MessageFiles author={author} message={sent([song('a', 'song.mp3')])} />, {
                wrapper,
            });
            fireEvent.error(audioOf(container));
            expect(screen.getByText("Couldn't play this file")).toBeTruthy();
            expect((screen.getByRole('button', { name: 'Play song.mp3' }) as HTMLButtonElement).disabled).toBe(true);
            fireEvent.click(screen.getByRole('button', { name: 'Save song.mp3' }));
            expect(downloadImage).toHaveBeenCalledWith({ url: 'https://s/a', name: 'song.mp3' });
        });

        // The failure belonged to the expired address; the re-signed one gets its own chance.
        it('plays again once its address is re-signed', () => {
            const { container, rerender } = render(
                <MessageFiles author={author} message={sent([song('a', 'song.mp3')])} />,
                { wrapper }
            );
            fireEvent.error(audioOf(container));
            rerender(
                <MessageFiles author={author} message={sent([{ ...song('a', 'song.mp3'), orgUrl: 'https://s/a2' }])} />
            );
            expect(screen.queryByText("Couldn't play this file")).toBeNull();
            expect((screen.getByRole('button', { name: 'Play song.mp3' }) as HTMLButtonElement).disabled).toBe(false);
            expect(audioOf(container).getAttribute('src')).toBe('https://s/a2');
        });
    });

    it('offers nothing to save while a document is being sent', () => {
        render(
            <MessageFiles
                author={author}
                message={sent([
                    {
                        localStatus: 'sending',
                        localThumbUrl: 'blob:1',
                        localName: 'a.pdf',
                        localContentType: 'application/pdf',
                        localSize: 10,
                    },
                ])}
            />,
            { wrapper }
        );
        expect(screen.getByText('a.pdf')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
        expect(screen.getByRole('status', { name: 'Uploading a.pdf' })).toBeTruthy();
    });

    it('draws nothing for a message with only images', () => {
        const { container } = render(
            <MessageFiles author={author} message={sent([{ id: 'i', stereo: 'image', orgUrl: 'https://s/i' }])} />,
            { wrapper }
        );
        expect(container.innerHTML).toBe('');
    });
});
