import { render } from '@testing-library/react';

import { PlaceAvatar } from './PlaceAvatar';

describe('PlaceAvatar', () => {
    it('renders the navy circle with a home glyph', () => {
        const { container } = render(<PlaceAvatar />);
        const root = container.firstElementChild as HTMLElement;
        expect(root.className).toContain('bg-brand-ink');
        expect(root.querySelector('svg')).toBeTruthy();
    });

    it('sizes by step', () => {
        const { container } = render(<PlaceAvatar size="sm" />);
        expect((container.firstElementChild as HTMLElement).style.width).toBe('36px');
    });
});
