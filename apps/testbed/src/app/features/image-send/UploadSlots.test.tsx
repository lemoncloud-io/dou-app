import { render, screen } from '@testing-library/react';

import { UploadSlots } from './UploadSlots';

describe('UploadSlots', () => {
    it('shows a pending slot’s local preview with its local status', () => {
        const { container } = render(
            <UploadSlots slots={[{ localStatus: 'sending', localThumbUrl: 'blob:local-1' }]} />
        );

        expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:local-1');
        expect(screen.getByText('sending')).toBeTruthy();
    });

    it('shows a stored upload by its thumbnail and links the original', () => {
        const { container } = render(
            <UploadSlots
                slots={[{ id: 'up-1', status: 'stored', orgUrl: 'https://cdn/o', thumbUrl: 'https://cdn/t' } as never]}
            />
        );

        expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn/t');
        expect(container.querySelector('a')?.getAttribute('href')).toBe('https://cdn/o');
    });

    it('says so when the server answer carried no URL yet', () => {
        const { container } = render(<UploadSlots slots={[{ id: 'up-1', status: 'stored' } as never]} />);

        expect(container.querySelector('img')).toBeNull();
        expect(screen.getByText('no url yet')).toBeTruthy();
    });
});
