import { render, screen } from '@testing-library/react';

import { ImageAvatar } from './ImageAvatar';

describe('ImageAvatar', () => {
    it('renders the image with the given src and alt', () => {
        render(<ImageAvatar src="http://example.com/turtle.png" alt="플레이스 사진" />);

        expect(screen.getByRole('img', { name: '플레이스 사진' })).toHaveAttribute(
            'src',
            'http://example.com/turtle.png'
        );
    });

    it('sizes by the given diameter with an explicit pixel box', () => {
        const { container } = render(<ImageAvatar src="http://example.com/turtle.png" size={46} />);
        const root = container.firstElementChild as HTMLElement;

        expect(root.style.width).toBe('46px');
        expect(root.style.height).toBe('46px');
    });

    it('crops into a circle (overflow-hidden + rounded-full + object-cover)', () => {
        const { container } = render(<ImageAvatar src="http://example.com/turtle.png" />);
        const root = container.firstElementChild as HTMLElement;

        expect(root.className).toContain('overflow-hidden');
        expect(root.className).toContain('rounded-full');
        expect(root.querySelector('img')?.className).toContain('object-cover');
    });
});
