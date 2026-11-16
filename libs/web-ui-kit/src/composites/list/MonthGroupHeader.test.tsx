import { render, screen } from '@testing-library/react';

import { MonthGroupHeader } from './MonthGroupHeader';

describe('MonthGroupHeader', () => {
    it('renders the host-formatted month as a heading', () => {
        render(<MonthGroupHeader label="November 2026" />);

        expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    });

    it('pins itself only when asked', () => {
        const { rerender } = render(<MonthGroupHeader label="November 2026" />);
        expect(screen.getByRole('heading')).not.toHaveAttribute('data-sticky');
        expect(screen.getByRole('heading').className).not.toContain('sticky');

        rerender(<MonthGroupHeader label="November 2026" sticky />);
        expect(screen.getByRole('heading')).toHaveAttribute('data-sticky', 'true');
        expect(screen.getByRole('heading').className).toContain('sticky');
    });
});
