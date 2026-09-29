import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

// Initialises i18next, so the position line reads as the viewer says it.
import '../../../../../i18n';

import { ImageViewer } from './ImageViewer';

const images = ['a.png', 'b.png', 'c.png'].map((name, index) => ({ id: `i${index}`, name, url: `blob:${name}` }));

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

const renderViewer = (openIndex = 0) =>
    render(
        <ImageViewer
            images={images}
            openIndex={openIndex}
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

    it('describes the picture by position and sender, not by its file name', () => {
        renderViewer(1);
        expect(screen.getByRole('img', { name: 'Image 2 of 3 from Ada' })).toBeTruthy();
    });

    // The dialog description already reads the position on open; saying it again doubled it.
    it('stays quiet about the position until it changes', () => {
        renderViewer();
        expect(position()).toBe('');
    });
});
