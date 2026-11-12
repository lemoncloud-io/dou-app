import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../../i18n';

import type { ComposerAttachment } from '../../hooks';
import { AttachmentDropOverlay } from './AttachmentDropOverlay';
import { ComposerAttachments } from './ComposerAttachments';
import { voiceElementFor } from './voicePlayback';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;
const song = (): ComposerAttachment => {
    const file = new File(['x'], 'song.mp3', { type: 'audio/mpeg' });
    return { id: 'song', key: 'song', name: file.name, url: 'blob:song.mp3', file, kind: 'file', size: file.size };
};

afterEach(cleanup);

describe('voice file in the composer tray', () => {
    it('says it is a voice file, and how long once that is known', () => {
        render(<ComposerAttachments attachments={[song()]} onRemove={vi.fn()} />, { wrapper });
        expect(screen.getByText('Voice file')).toBeTruthy();

        const audio = voiceElementFor('blob:song.mp3') as HTMLAudioElement;
        Object.defineProperty(audio, 'duration', { configurable: true, value: 125 });
        act(() => {
            fireEvent.durationChange(audio);
        });
        expect(screen.getByText('Voice file · 2:05')).toBeTruthy();
    });

    it('turns to the clock once it plays', () => {
        const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        render(<ComposerAttachments attachments={[song()]} onRemove={vi.fn()} />, { wrapper });
        const audio = voiceElementFor('blob:song.mp3') as HTMLAudioElement;
        Object.defineProperty(audio, 'duration', { configurable: true, value: 125 });
        act(() => {
            fireEvent.durationChange(audio);
            fireEvent.play(audio);
            audio.currentTime = 30;
            fireEvent.timeUpdate(audio);
        });
        expect(screen.getByText('0:30')).toBeTruthy();
        cleanup();
        pause.mockRestore();
    });
});

describe('drop zone', () => {
    it('invites files and says voice files play in the chat, with the real limits', () => {
        render(<AttachmentDropOverlay />);
        expect(screen.getByText('Drop images and files here to upload')).toBeTruthy();
        expect(screen.getByText('Up to 10 images, videos, voice files or documents per message.')).toBeTruthy();
        expect(screen.getByText('Voice files (m4a, mp3, wav, ogg) up to 50 MB play right in the chat.')).toBeTruthy();
    });
});
