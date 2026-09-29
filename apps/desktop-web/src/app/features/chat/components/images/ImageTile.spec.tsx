import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../../i18n';

import { ImageTile } from './ImageTile';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

const renderTile = (props: Partial<Parameters<typeof ImageTile>[0]> = {}) => {
    const handlers = { onOpen: vi.fn(), onDownload: vi.fn(), onCopy: vi.fn() };
    render(<ImageTile image={{ id: 'i1', name: 'a.png', url: 'blob:a' }} {...handlers} {...props} />, { wrapper });
    return handlers;
};

describe('ImageTile', () => {
    afterEach(cleanup);

    // A disabled button is skipped by the tab order and by screen readers, so an upload
    // in progress had no presence at all.
    it('keeps an uploading tile focusable and says it is uploading', () => {
        const { onOpen } = renderTile({ image: { id: 'i1', name: 'a.png', url: 'blob:a', isUploading: true } });
        const tile = screen.getByRole('button', { name: 'Uploading a.png' });
        expect(tile.hasAttribute('disabled')).toBe(false);
        expect(tile.getAttribute('aria-disabled')).toBe('true');
        fireEvent.click(tile);
        expect(onOpen).not.toHaveBeenCalled();
    });

    // Copy sat alone in a "More" menu for every image someone else sent.
    it('copies in one click', () => {
        const { onCopy } = renderTile();
        fireEvent.click(screen.getByRole('button', { name: 'Copy image' }));
        expect(onCopy).toHaveBeenCalledTimes(1);
    });

    it('offers delete only when the reader may delete', () => {
        renderTile();
        expect(screen.queryByRole('button', { name: 'Delete file' })).toBeNull();
    });

    // A failed upload was a disabled button too: nothing said it had failed.
    it('keeps a failed tile focusable and says it failed', () => {
        const { onOpen } = renderTile({ image: { id: 'i1', name: 'a.png', url: '', isFailed: true } });
        const tile = screen.getByRole('button', { name: "This image couldn't be loaded" });
        expect(tile.hasAttribute('disabled')).toBe(false);
        fireEvent.click(tile);
        expect(onOpen).not.toHaveBeenCalled();
    });
});
