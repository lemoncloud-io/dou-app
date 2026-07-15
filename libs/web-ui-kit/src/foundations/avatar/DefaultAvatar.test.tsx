import { render } from '@testing-library/react';

import { DefaultAvatar } from './DefaultAvatar';

describe('DefaultAvatar', () => {
    it('renders a brand-ink circle with a user glyph', () => {
        const { container } = render(<DefaultAvatar />);
        const root = container.firstElementChild as HTMLElement;

        expect(root.className).toContain('bg-brand-ink');
        expect(root.querySelector('svg')).toBeTruthy();
    });

    it('sizes by the given diameter', () => {
        const { container } = render(<DefaultAvatar size={42} />);
        const root = container.firstElementChild as HTMLElement;

        expect(root.style.width).toBe('42px');
        expect(root.style.height).toBe('42px');
    });
});
