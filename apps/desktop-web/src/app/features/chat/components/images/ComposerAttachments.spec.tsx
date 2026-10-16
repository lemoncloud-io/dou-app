import { Blob as NodeBlob } from 'node:buffer';
import { useState, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../../i18n';

import type { ComposerAttachment } from '../../hooks';
import { ComposerAttachments } from './ComposerAttachments';

const attachment = (name: string) => ({ id: name, name, url: `blob:${name}` }) as ComposerAttachment;
const picked = (file: File, kind: ComposerAttachment['kind']): ComposerAttachment => ({
    id: file.name,
    key: file.name,
    name: file.name,
    url: `blob:${file.name}`,
    file,
    kind,
    size: file.size,
});

/** The tray as the composer drives it: removing drops the attachment from state. */
const Tray = ({ initial, onEmptied }: { initial: ComposerAttachment[]; onEmptied?: () => void }) => {
    const [items, setItems] = useState(initial);
    return (
        <ComposerAttachments
            attachments={items}
            onRemove={id => setItems(current => current.filter(item => item.id !== id))}
            onEmptied={onEmptied}
        />
    );
};

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;
const removeButton = (name: string) => screen.getByRole('button', { name: `Remove ${name}` });

describe('ComposerAttachments', () => {
    afterEach(cleanup);

    // A picked image could only be seen as a 92px crop until it was sent.
    it('opens a picked image in a viewer when its tile is clicked', () => {
        render(<Tray initial={[attachment('a.png')]} />, { wrapper });
        fireEvent.click(screen.getByRole('img', { name: 'a.png' }));
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('plays a picked video in the preview', () => {
        const video = picked(new File(['x'], 'clip.mp4', { type: 'video/mp4' }), 'video');
        const { baseElement } = render(<Tray initial={[video]} />, { wrapper });
        fireEvent.click(screen.getByRole('button', { name: 'Open clip.mp4' }));
        expect(baseElement.querySelector('video')?.getAttribute('src')).toBe('blob:clip.mp4');
        // Not on the player, where Space would start playback.
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    });

    // Read from the file the page holds: nothing is sent yet, so there is no address to fetch.
    it('reads a picked text file in the file viewer', async () => {
        // jsdom's File has no `arrayBuffer`; a browser's and Node's Blob do.
        const bytes = new NodeBlob(['hello'], { type: 'text/plain' }) as unknown as File;
        const text = { ...picked(new File([], 'notes.txt'), 'file'), file: bytes, size: 5 };
        render(<Tray initial={[text]} />, { wrapper });
        fireEvent.click(screen.getByRole('button', { name: 'Open notes.txt' }));
        expect(await screen.findByText('hello')).toBeTruthy();
        expect(screen.getByText('Not sent yet')).toBeTruthy();
    });

    it('leaves a document the viewer cannot draw as a plain tile', () => {
        const docx = picked(
            new File(['x'], 'plan.docx', {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            }),
            'file'
        );
        render(<Tray initial={[docx]} />, { wrapper });
        expect(screen.queryByRole('button', { name: 'Open plan.docx' })).toBeNull();
    });

    // The button that had focus is the one that goes, which used to drop focus on <body>.
    it('moves focus to the tile that takes the removed one’s place', () => {
        render(<Tray initial={[attachment('a.png'), attachment('b.png'), attachment('c.png')]} />, { wrapper });
        fireEvent.click(removeButton('a.png'));
        expect(document.activeElement).toBe(removeButton('b.png'));
    });

    it('moves focus to the new last tile after removing the last one', () => {
        render(<Tray initial={[attachment('a.png'), attachment('b.png')]} />, { wrapper });
        fireEvent.click(removeButton('b.png'));
        expect(document.activeElement).toBe(removeButton('a.png'));
    });

    it('hands focus back to the input once the tray is empty, and says what went', () => {
        const onEmptied = vi.fn();
        render(<Tray initial={[attachment('a.png')]} onEmptied={onEmptied} />, { wrapper });
        fireEvent.click(removeButton('a.png'));
        expect(onEmptied).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('status').textContent).toBe('a.png removed');
    });

    // A document has no picture to show, so its tile names it instead of drawing a broken image.
    it('shows a video or document as its name and size, not an image', () => {
        const pdf = { id: 'p', name: 'report.pdf', url: '', kind: 'file', size: 1536 } as ComposerAttachment;
        render(<ComposerAttachments attachments={[pdf]} onRemove={vi.fn()} />, { wrapper });
        expect(screen.queryByRole('img')).toBeNull();
        expect(screen.getByText('report.pdf')).toBeTruthy();
        expect(screen.getByText('1.5 KB')).toBeTruthy();
    });

    it('says how many files joined the tray', () => {
        const { rerender } = render(<ComposerAttachments attachments={[attachment('a.png')]} onRemove={vi.fn()} />, {
            wrapper,
        });
        rerender(
            <ComposerAttachments
                attachments={[attachment('a.png'), attachment('b.png'), attachment('c.png')]}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByRole('status').textContent).toBe('2 files added');
    });
});
