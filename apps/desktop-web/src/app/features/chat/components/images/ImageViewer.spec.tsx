import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

// Initialises i18next, so the position line reads as the viewer says it.
import '../../../../../i18n';

import { ImageViewer } from './ImageViewer';

const images = ['a.png', 'b.png', 'c.png'].map((name, index) => ({ id: `i${index}`, name, url: `blob:${name}` }));

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

const renderViewer = () =>
    render(
        <ImageViewer
            images={images}
            openIndex={0}
            onClose={vi.fn()}
            author={{ name: 'Ada', colorSeed: 'ada', time: '10:00' }}
            onDownload={vi.fn()}
            onDownloadAll={vi.fn()}
            onCopy={vi.fn()}
        />,
        { wrapper }
    );

const position = () =>
    screen
        .getAllByRole('status')
        .map(node => node.textContent)
        .join(' ');

describe('ImageViewer keys', () => {
    afterEach(cleanup);

    it('says the new position as the arrows step through the set', () => {
        renderViewer();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
        expect(position()).toContain('Image 2 of 3');
    });

    // The More menu is portalled but lives in the viewer's React tree, so its arrow keys
    // bubbled to the viewer and stepped the picture behind the open menu.
    it('leaves arrow keys pressed inside the More menu to the menu', async () => {
        renderViewer();
        fireEvent.keyDown(screen.getByRole('button', { name: 'More' }), { key: 'Enter' });
        const menu = await screen.findByRole('menu');
        await act(async () => {
            fireEvent.keyDown(menu, { key: 'ArrowRight' });
        });
        expect(position()).not.toContain('Image 2 of 3');
    });

    // The dialog description already reads the position on open; saying it again doubled it.
    it('stays quiet about the position until it changes', () => {
        renderViewer();
        expect(position()).toBe('');
    });
});
