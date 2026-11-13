import { fireEvent, render, screen } from '@testing-library/react';

import { FilterChip } from './FilterChip';

describe('FilterChip', () => {
    it('is a toggle button that reports its state and fires onClick', () => {
        const onClick = jest.fn();
        const { rerender } = render(<FilterChip label="Unread only" onClick={onClick} />);

        const chip = screen.getByRole('button', { name: 'Unread only' });
        expect(chip).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(chip);
        expect(onClick).toHaveBeenCalledTimes(1);

        rerender(<FilterChip label="Unread only" selected onClick={onClick} />);
        expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    });

    it('draws the count after the label when given, including zero', () => {
        const { rerender } = render(<FilterChip label="Mentions" count={2} />);
        expect(screen.getByRole('button')).toHaveTextContent('Mentions2');

        rerender(<FilterChip label="Mentions" count={0} />);
        expect(screen.getByRole('button')).toHaveTextContent('Mentions0');

        rerender(<FilterChip label="Mentions" />);
        expect(screen.getByRole('button')).toHaveTextContent(/^Mentions$/);
    });

    it('leads with the check glyph only when asked', () => {
        const { container, rerender } = render(<FilterChip label="Unread only" check />);
        expect(container.querySelector('svg')).not.toBeNull();

        rerender(<FilterChip label="Select all" />);
        expect(container.querySelector('svg')).toBeNull();
    });

    it('does not fire when disabled', () => {
        const onClick = jest.fn();
        render(<FilterChip label="Unread only" disabled onClick={onClick} />);

        fireEvent.click(screen.getByRole('button'));
        expect(onClick).not.toHaveBeenCalled();
    });
});
