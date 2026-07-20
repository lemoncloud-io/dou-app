import { render } from '@testing-library/react';

import { FloatingDateChip } from './FloatingDateChip';

describe('FloatingDateChip', () => {
    it('renders the label', () => {
        const { getByText } = render(<FloatingDateChip label="7. 01 월" />);
        expect(getByText('7. 01 월')).toBeTruthy();
    });

    it('is opaque and not aria-hidden when visible', () => {
        const { container } = render(<FloatingDateChip label="7. 01 월" visible />);
        const root = container.firstElementChild as HTMLElement;

        expect(root.className).toContain('opacity-100');
        expect(root.getAttribute('aria-hidden')).toBe('false');
    });

    it('fades out and hides from a11y tree when not visible', () => {
        const { container } = render(<FloatingDateChip label="7. 01 월" visible={false} />);
        const root = container.firstElementChild as HTMLElement;

        expect(root.className).toContain('opacity-0');
        expect(root.getAttribute('aria-hidden')).toBe('true');
    });
});
