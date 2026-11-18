import { fireEvent, render, screen } from '@testing-library/react';

import { PlaceChip } from './PlaceChip';

describe('PlaceChip', () => {
    it('draws the initial disc, the name and the unread pill, and reports taps', () => {
        const onClick = jest.fn();
        render(<PlaceChip name="Family" unread={2} unreadLabel="2 unread" onClick={onClick} />);

        const chip = screen.getByRole('button', { name: 'Family, 2 unread' });
        expect(chip).toHaveTextContent('F');
        expect(chip).toHaveTextContent('2');
        fireEvent.click(chip);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('hides the pill at zero and clamps above max', () => {
        const { rerender } = render(<PlaceChip name="Sunny" unread={0} />);
        expect(screen.getByRole('button', { name: 'Sunny' })).toHaveTextContent(/^SSunny$/);

        rerender(<PlaceChip name="Sunny" unread={1500} />);
        expect(screen.getByText('+999')).toBeInTheDocument();
    });

    it('marks the current place pressed and fills it', () => {
        render(<PlaceChip name="Sunny" selected />);

        const chip = screen.getByRole('button');
        expect(chip).toHaveAttribute('aria-pressed', 'true');
        expect(chip).toHaveClass('bg-chip-ink');
    });

    it('unfolds the name only on the current place, keeping it mounted on the others', () => {
        const { rerender } = render(<PlaceChip name="Sunny" unread={3} />);
        const name = screen.getByTestId('place-chip-name');
        expect(name).toHaveTextContent('Sunny');
        expect(name).toHaveAttribute('aria-hidden', 'true');
        expect(name).toHaveClass('grid-cols-[0fr]', 'opacity-0');

        rerender(<PlaceChip name="Sunny" unread={3} selected />);
        // Same node, so the change animates instead of mounting a new label.
        expect(screen.getByTestId('place-chip-name')).toBe(name);
        expect(name).toHaveAttribute('aria-hidden', 'false');
        expect(name).toHaveClass('grid-cols-[1fr]', 'opacity-100');
    });

    it('folds a place with no unread down to its disc alone', () => {
        const { rerender } = render(<PlaceChip name="Sunny" />);
        expect(screen.getByRole('button')).toHaveClass('p-1');

        rerender(<PlaceChip name="Sunny" unread={1} />);
        expect(screen.getByRole('button')).toHaveClass('pl-1.5', 'pr-2');
    });

    it('uses a supplied avatar instead of the initial disc', () => {
        render(<PlaceChip name="Sunny" avatar={<img alt="Sunny cover" />} />);

        expect(screen.getByAltText('Sunny cover')).toBeInTheDocument();
        expect(screen.getByRole('button')).toHaveTextContent(/^Sunny$/);
    });
});
