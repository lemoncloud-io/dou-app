import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { MessageFiles } from './MessageFiles';
import { VoiceDetailDialog } from './VoiceDetailDialog';
import { useVoiceDetailStore, VoiceDetailHost } from './VoiceDetailHost';
import { voiceElementFor } from './voicePlayback';

import '../../../../../i18n';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;
const author = { name: 'Sunny', colorSeed: 'sunny', time: '6:33 PM' };
const SRC = 'https://s/a';
const MB = 1024 * 1024;

let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
        Object.defineProperty(this, 'paused', { configurable: true, value: false });
        fireEvent.play(this);
        return Promise.resolve();
    });
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
        Object.defineProperty(this, 'paused', { configurable: true, value: true });
        fireEvent.pause(this);
    });
});
afterEach(() => {
    cleanup();
    play.mockRestore();
    pause.mockRestore();
});

const lengthOf = (seconds: number) => {
    const audio = voiceElementFor(SRC) as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', { configurable: true, value: seconds });
    act(() => {
        fireEvent.durationChange(audio);
    });
};

const renderDialog = (props: Partial<Parameters<typeof VoiceDetailDialog>[0]> = {}) => {
    const handlers = { onClose: vi.fn(), onSave: vi.fn(), onShowInChat: vi.fn(), onReply: vi.fn(), onDelete: vi.fn() };
    render(<VoiceDetailDialog src={SRC} name="song.mp3" size={17 * MB} author={author} {...handlers} {...props} />, {
        wrapper,
    });
    return handlers;
};

const openMore = async () => {
    const more = screen.getByRole('button', { name: 'More' });
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false });
    fireEvent.keyDown(more, { key: 'Enter' });
    await screen.findByRole('menu');
};

describe('VoiceDetailDialog', () => {
    it('names the sender, the time and the file, with its length, size and kind', () => {
        renderDialog();
        lengthOf(125);
        const dialog = screen.getByRole('dialog');
        expect(dialog.textContent).toContain('Sunny');
        expect(dialog.textContent).toContain('6:33 PM');
        expect(screen.getByRole('heading', { name: 'song.mp3' })).toBeTruthy();
        expect(screen.getByText('2:05 · 17 MB · mp3')).toBeTruthy();
        expect(screen.getByText('-2:05')).toBeTruthy();
    });

    it('plays and pauses from its big button, and moves fifteen seconds either way', () => {
        renderDialog();
        lengthOf(125);
        fireEvent.click(screen.getByRole('button', { name: 'Play song.mp3' }));
        expect(play).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Forward 15 seconds' }));
        expect((voiceElementFor(SRC) as HTMLAudioElement).currentTime).toBe(15);
        expect(screen.getByText('-1:50')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Back 15 seconds' }));
        expect((voiceElementFor(SRC) as HTMLAudioElement).currentTime).toBe(0);

        fireEvent.click(screen.getByRole('button', { name: 'Playback speed 1x' }));
        expect(screen.getByRole('button', { name: 'Playback speed 1.5x' })).toBeTruthy();
    });

    it('answers Space, the arrow keys and Esc', () => {
        const { onClose } = renderDialog();
        lengthOf(125);
        const dialog = screen.getByRole('dialog');

        fireEvent.keyDown(dialog, { key: ' ' });
        expect(play).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(dialog, { key: 'ArrowRight' });
        expect((voiceElementFor(SRC) as HTMLAudioElement).currentTime).toBe(15);
        fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
        expect((voiceElementFor(SRC) as HTMLAudioElement).currentTime).toBe(0);

        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('toggles once when Space is pressed on a focused button', () => {
        renderDialog();
        const rate = screen.getByRole('button', { name: 'Playback speed 1x' });
        rate.focus();
        const keyDown = fireEvent.keyDown(rate, { key: ' ' });
        expect(keyDown).toBe(false);
        expect(play).toHaveBeenCalledTimes(1);
        // The key's default — clicking the focused button — was cancelled, so the speed did not change.
        expect(screen.getByRole('button', { name: 'Playback speed 1x' })).toBeTruthy();
    });

    it('offers show in chat, reply in thread and delete from its menu', async () => {
        const { onShowInChat, onClose } = renderDialog();
        await openMore();
        expect(screen.getByRole('menuitem', { name: 'Reply in thread' })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: 'Delete file' })).toBeTruthy();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Show in chat' }));
        expect(onShowInChat).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('leaves delete out where the reader cannot delete', async () => {
        renderDialog({ onDelete: undefined });
        await openMore();
        expect(screen.queryByRole('menuitem', { name: 'Delete file' })).toBeNull();
    });

    it('saves from its download button', () => {
        const { onSave } = renderDialog();
        fireEvent.click(screen.getByRole('button', { name: 'Download' }));
        expect(onSave).toHaveBeenCalledTimes(1);
    });
});

describe('opening it from the card', () => {
    const sent = {
        id: 'row-1',
        upload$$: [
            { id: 'a', stereo: 'file', name: 'song.mp3', contentType: 'audio/mpeg', contentSize: 10, orgUrl: SRC },
        ],
    } as unknown as DomainChat;

    beforeEach(() => {
        useVoiceDetailStore.setState({ request: null });
    });

    const renderFeed = (props: Partial<Parameters<typeof MessageFiles>[0]> = {}) =>
        render(
            <>
                <MessageFiles author={author} message={sent} {...props} />
                <VoiceDetailHost />
            </>,
            { wrapper }
        );
    const cardOf = () => screen.getByRole('button', { name: /^(Play|Pause) song\.mp3$/ }).parentElement as HTMLElement;

    it('opens from the name and picks up where the card is', () => {
        renderFeed();
        lengthOf(125);
        fireEvent.click(screen.getByRole('button', { name: 'Play song.mp3' }));
        act(() => {
            const audio = voiceElementFor(SRC) as HTMLAudioElement;
            audio.currentTime = 30;
            fireEvent.timeUpdate(audio);
        });

        fireEvent.click(screen.getByRole('button', { name: 'Open details of song.mp3' }));
        const dialog = screen.getByRole('dialog');
        const seek = dialog.querySelector('input[type="range"]') as HTMLInputElement;
        expect(Number(seek.value)).toBe(30);
        expect(dialog.textContent).toContain('-1:35');
        // Still playing: opening the dialog does not restart or stop it.
        expect(screen.getAllByRole('button', { name: 'Pause song.mp3' }).length).toBeGreaterThan(0);
    });

    it('opens from a click on the card body', () => {
        renderFeed();
        fireEvent.click(cardOf());
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('keeps a click on a control of the card to that control', () => {
        renderFeed();
        fireEvent.click(screen.getByRole('button', { name: 'Play song.mp3' }));
        fireEvent.click(screen.getByRole('button', { name: 'Playback speed 1x' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save song.mp3' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('lands focus on the dialog, so the first Esc closes it', () => {
        renderFeed();
        const name = screen.getByRole('button', { name: 'Open details of song.mp3' });
        name.focus();
        fireEvent.click(name);
        const dialog = screen.getByRole('dialog');
        expect(document.activeElement).toBe(dialog);
        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('offers show in chat only where the feed passes it', async () => {
        const onShowInChat = vi.fn();
        renderFeed({ onShowInChat });
        fireEvent.click(cardOf());
        await openMore();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Show in chat' }));
        expect(onShowInChat).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    // The feed unmounts a row that leaves its window; the delete must not go with it.
    it('asks and deletes from the dialog after the row it came from is gone', async () => {
        const onDeleteMessage = vi.fn();
        const { rerender } = renderFeed({ canDelete: true, onDeleteMessage });
        fireEvent.click(cardOf());
        rerender(
            <>
                {null}
                <VoiceDetailHost />
            </>
        );
        await openMore();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete file' }));
        expect(screen.getByRole('alertdialog', { name: 'Delete this message?' })).toBeTruthy();
        expect(onDeleteMessage).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Delete file' }));
        expect(onDeleteMessage).toHaveBeenCalledTimes(1);
    });

    it('closes when the screen holding it goes, so it does not come back on return', () => {
        const { unmount } = renderFeed();
        fireEvent.click(cardOf());
        expect(useVoiceDetailStore.getState().request).not.toBeNull();
        unmount();
        expect(useVoiceDetailStore.getState().request).toBeNull();
    });

    it('leaves show in chat out elsewhere', async () => {
        renderFeed();
        fireEvent.click(cardOf());
        await openMore();
        expect(screen.queryByRole('menuitem', { name: 'Show in chat' })).toBeNull();
    });
});
