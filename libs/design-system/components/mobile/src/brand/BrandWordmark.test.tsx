import { render, screen } from '@testing-library/react';

import { BrandWordmark } from './BrandWordmark';

const images = (container: HTMLElement) => Array.from(container.querySelectorAll('img'));

describe('BrandWordmark', () => {
    it('ships both brand colours and lets CSS pick by theme', () => {
        const { container } = render(<BrandWordmark />);
        const [navy, lime] = images(container);

        expect(navy.className).toContain('dark:hidden');
        expect(navy.className).not.toContain('hidden ');
        expect(lime.className).toContain('hidden');
        expect(lime.className).toContain('dark:block');
    });

    it('names the wrapper, not the images, so the name survives the theme swap', () => {
        const { container } = render(<BrandWordmark />);

        expect(screen.getByRole('img', { name: 'DoU' })).toBeInTheDocument();
        images(container).forEach(img => expect(img.getAttribute('alt')).toBe(''));
    });

    it('goes silent when a parent already names the brand', () => {
        const { container } = render(<BrandWordmark decorative />);
        const root = container.firstElementChild as HTMLElement;

        expect(root.getAttribute('aria-hidden')).toBe('true');
        expect(root.getAttribute('role')).toBeNull();
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('sizes by height and lets the width follow the artwork', () => {
        const { container } = render(<BrandWordmark height={32} />);
        const root = container.firstElementChild as HTMLElement;

        expect(root.style.height).toBe('32px');
        images(container).forEach(img => expect(img.className).toContain('w-auto'));
    });
});
