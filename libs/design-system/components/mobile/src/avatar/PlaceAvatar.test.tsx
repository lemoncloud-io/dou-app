import { render } from '@testing-library/react';

import { PlaceAvatar } from './PlaceAvatar';

describe('PlaceAvatar', () => {
    it('renders the name initial on the single-tone light disc', () => {
        const { container, getByText } = render(<PlaceAvatar name="pluto" />);
        const root = container.firstElementChild as HTMLElement;
        expect(root.className).toContain('bg-avatar-ring');
        expect(root.className).toContain('text-brand-ink');
        expect(getByText('P')).toBeTruthy();
    });

    it('falls back to a home glyph when no name is given', () => {
        const { container } = render(<PlaceAvatar />);
        const root = container.firstElementChild as HTMLElement;
        expect(root.querySelector('svg')).toBeTruthy();
    });

    it('sizes by step', () => {
        const { container } = render(<PlaceAvatar size="sm" />);
        expect((container.firstElementChild as HTMLElement).style.width).toBe('36px');
    });
});
