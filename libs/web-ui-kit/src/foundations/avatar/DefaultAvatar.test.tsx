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

    it('adds a hairline ring for the group variant', () => {
        const { container } = render(<DefaultAvatar variant="group" />);
        const root = container.firstElementChild as HTMLElement;

        expect(root.className).toContain('border-border');
        expect(root.querySelector('svg')).toBeTruthy();
    });

    it('has no ring for the default user variant', () => {
        const { container } = render(<DefaultAvatar />);
        const root = container.firstElementChild as HTMLElement;

        expect(root.className).not.toContain('border-border');
    });
});
