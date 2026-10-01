import { describe, expect, it, vi } from 'vitest';

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
