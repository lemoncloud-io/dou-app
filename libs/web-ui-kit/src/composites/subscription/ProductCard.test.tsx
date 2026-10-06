import { fireEvent, render, screen } from '@testing-library/react';

import { PlanBadge } from '../../foundations/badge/PlanBadge';
import { ProductCard } from './ProductCard';

describe('ProductCard', () => {
    it('renders the badge, name and status with no button or chevron when onClick is absent', () => {
        const { container } = render(
            <ProductCard name="DoU Pro" badge={<PlanBadge label="PRO" accent />} statusLabel="In use" />
        );

        expect(screen.getByText('PRO')).toBeInTheDocument();
        expect(screen.getByText('DoU Pro')).toBeInTheDocument();
        expect(screen.getByText('In use')).toHaveClass('text-point-blue');
        expect(screen.queryByRole('button')).toBeNull();
        expect(container.querySelector('.lucide-chevron-right')).toBeNull();
    });

    it('makes the header row a button with a trailing chevron when onClick is given', () => {
        const onClick = jest.fn();
        render(<ProductCard name="DoU Pro" statusLabel="In use" onClick={onClick} />);

        const button = screen.getByRole('button', { name: /DoU Pro/ });
        expect(button.querySelector('.lucide-chevron-right')).not.toBeNull();
        fireEvent.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('maps every status tone to its colour', () => {
        const { rerender } = render(<ProductCard name="p" statusLabel="s" statusTone="scheduled" />);
        expect(screen.getByText('s').className).toContain('--warning');

        rerender(<ProductCard name="p" statusLabel="s" statusTone="ended" />);
        expect(screen.getByText('s')).toHaveClass('text-description');

        rerender(<ProductCard name="p" statusLabel="s" statusTone="danger" />);
        expect(screen.getByText('s')).toHaveClass('text-destructive');
    });

    it('renders the caption row only when a caption is passed', () => {
        const { rerender } = render(<ProductCard name="p" />);
        expect(screen.queryByText('Renews on Oct 30')).toBeNull();

        rerender(<ProductCard name="p" caption="Renews on Oct 30" />);
        expect(screen.getByText('Renews on Oct 30')).toBeInTheDocument();
    });

    it('renders children under a divider, and no divider without children', () => {
        const { container, rerender } = render(<ProductCard name="p" />);
        expect(container.querySelector('[aria-hidden].h-px')).toBeNull();

        rerender(
            <ProductCard name="p">
                <button type="button">Change plan</button>
            </ProductCard>
        );
        expect(container.querySelector('[aria-hidden].h-px')).not.toBeNull();
        expect(screen.getByRole('button', { name: 'Change plan' })).toBeInTheDocument();
    });
});
