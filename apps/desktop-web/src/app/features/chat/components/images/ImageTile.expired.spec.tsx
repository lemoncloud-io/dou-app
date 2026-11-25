import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit';

import '../../../../../i18n';

import { ImageTile } from './ImageTile';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

describe('ImageTile with an expired signed address', () => {
    afterEach(cleanup);

    it('does not keep a broken <img> in the tile after the image fails to load', () => {
        render(
            <ImageTile
                image={{ id: 'i1', name: 'IMG_0396.jpg', url: 'https://bucket.example/expired?sig=old' }}
                onOpen={vi.fn()}
                onDownload={vi.fn()}
                onCopy={vi.fn()}
            />,
            { wrapper }
        );
        const img = document.querySelector('img');
        expect(img).not.toBeNull();
        fireEvent.error(img as HTMLImageElement);
        expect(document.querySelector('img')).toBeNull();
    });

    it('asks for a fresh address once the original fails, and draws the failed placeholder meanwhile', () => {
        const onLoadError = vi.fn();
        render(
            <ImageTile
                image={{ id: 'i1', name: 'IMG_0396.jpg', url: 'https://bucket.example/expired?sig=old' }}
                onOpen={vi.fn()}
                onDownload={vi.fn()}
                onCopy={vi.fn()}
                onLoadError={onLoadError}
            />,
            { wrapper }
        );
        fireEvent.error(document.querySelector('img') as HTMLImageElement);
        expect(onLoadError).toHaveBeenCalledWith('https://bucket.example/expired?sig=old');
        expect(screen.getByRole('button', { name: "This image couldn't be loaded" })).toBeTruthy();
    });

    it('falls back to the original when only the thumbnail fails, without asking for a fresh address', () => {
        const onLoadError = vi.fn();
        render(
            <ImageTile
                image={{
                    id: 'i1',
                    name: 'IMG_0396.jpg',
                    url: 'https://bucket.example/original',
                    thumbUrl: 'https://bucket.example/thumb',
                }}
                onOpen={vi.fn()}
                onDownload={vi.fn()}
                onCopy={vi.fn()}
                onLoadError={onLoadError}
            />,
            { wrapper }
        );
        fireEvent.error(document.querySelector('img') as HTMLImageElement);
        expect(document.querySelector('img')?.getAttribute('src')).toBe('https://bucket.example/original');
        expect(onLoadError).not.toHaveBeenCalled();
    });

    it('tries a fresh address for the same image', () => {
        const props = { onOpen: vi.fn(), onDownload: vi.fn(), onCopy: vi.fn() };
        const { rerender } = render(
            <ImageTile image={{ id: 'i1', name: 'a.jpg', url: 'https://b.example/old' }} {...props} />,
            {
                wrapper,
            }
        );
        fireEvent.error(document.querySelector('img') as HTMLImageElement);
        expect(document.querySelector('img')).toBeNull();
        rerender(<ImageTile image={{ id: 'i1', name: 'a.jpg', url: 'https://b.example/new' }} {...props} />);
        expect(document.querySelector('img')?.getAttribute('src')).toBe('https://b.example/new');
    });
});
