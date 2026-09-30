import { useState, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../../i18n';

import type { ComposerAttachment } from '../../hooks';
import { ComposerAttachments } from './ComposerAttachments';

const attachment = (name: string) => ({ id: name, name, url: `blob:${name}` }) as ComposerAttachment;

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
