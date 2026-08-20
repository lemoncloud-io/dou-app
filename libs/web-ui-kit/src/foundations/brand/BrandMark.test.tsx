import { render, screen } from '@testing-library/react';

import { BrandMark } from './BrandMark';

describe('BrandMark', () => {
    it('shows the character next to the wordmark under one accessible name', () => {
        const { container } = render(<BrandMark />);

        expect(screen.getByRole('img', { name: 'DoU' })).toBeInTheDocument();
        // Character + both wordmark colours; the theme hides one of the two.
        expect(container.querySelectorAll('img')).toHaveLength(3);
        expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
    });

    it('scales the wordmark and the gap with the given height', () => {
        const { container } = render(<BrandMark height={97} />);
        const root = container.firstElementChild as HTMLElement;
        const character = container.querySelector('img') as HTMLElement;
        const wordmark = container.querySelector('[aria-hidden="true"]') as HTMLElement;

        // Ratios of the designer's 300×97 combined mark.
        expect(root.style.height).toBe('97px');
        expect(root.style.gap).toBe('20px');
        expect(character.style.height).toBe('97px');
        expect(wordmark.style.height).toBe('62px');
    });

    it('defaults to the app header height', () => {
        const { container } = render(<BrandMark />);
        const root = container.firstElementChild as HTMLElement;

        expect(root.style.height).toBe('38px');
    });
});
