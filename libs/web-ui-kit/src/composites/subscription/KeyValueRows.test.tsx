import { render, screen } from '@testing-library/react';

import { KeyValueRows } from './KeyValueRows';

describe('KeyValueRows', () => {
    it('renders each row as a term/definition pair', () => {
        render(
            <KeyValueRows
                rows={[
                    { label: 'Plan', value: 'DoU Pro' },
                    { label: 'Next payment', value: 'Oct 30, 2026' },
                ]}
            />
        );

        expect(screen.getAllByRole('term').map(t => t.textContent)).toEqual(['Plan', 'Next payment']);
        expect(screen.getAllByRole('definition')).toHaveLength(2);
        expect(screen.getByText('DoU Pro')).toBeInTheDocument();
    });

    it('renders the hint under the value only when given', () => {
        render(
            <KeyValueRows
                rows={[
                    { label: 'Price', value: '₩6,600', hint: '₩8,800' },
                    { label: 'Plan', value: 'DoU Pro' },
                ]}
            />
        );

        const [price, plan] = screen.getAllByRole('definition');
        expect(price).toHaveTextContent('₩6,600₩8,800');
        expect(plan).toHaveTextContent(/^DoU Pro$/);
    });

    it('colours the value by tone, defaulting to the foreground', () => {
        render(
            <KeyValueRows
                rows={[
                    { label: 'a', value: 'default' },
                    { label: 'b', value: 'accent', tone: 'accent' },
                    { label: 'c', value: 'info', tone: 'info' },
                    { label: 'd', value: 'danger', tone: 'danger' },
                    { label: 'e', value: 'warning', tone: 'warning' },
                ]}
            />
        );

        expect(screen.getByText('default')).toHaveClass('text-foreground');
        expect(screen.getByText('accent')).toHaveClass('text-main-accent');
        expect(screen.getByText('info')).toHaveClass('text-point-blue');
        expect(screen.getByText('danger')).toHaveClass('text-destructive');
        expect(screen.getByText('warning').className).toContain('--warning');
    });

    it('lets a long value wrap instead of forcing one line', () => {
        // The 320px guarantee: a value that cannot fit must wrap inside its column, never overflow.
        render(<KeyValueRows rows={[{ label: 'Clouds', value: 'My Cloud, Family Cloud, Work Cloud' }]} />);

        expect(screen.getByText('My Cloud, Family Cloud, Work Cloud')).not.toHaveClass('whitespace-nowrap');
        expect(screen.getByRole('definition')).toHaveClass('min-w-0');
    });

    it('drops the card shell when bare', () => {
        const { container, rerender } = render(<KeyValueRows rows={[{ label: 'a', value: 'b' }]} />);
        expect(container.querySelector('dl')?.className).toContain('shadow-');

        rerender(<KeyValueRows bare rows={[{ label: 'a', value: 'b' }]} />);
        expect(container.querySelector('dl')?.className).not.toContain('shadow-');
    });
});
