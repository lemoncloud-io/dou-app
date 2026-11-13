import { fireEvent, render, screen } from '@testing-library/react';

import { JumpPill } from './JumpPill';

describe('JumpPill', () => {
    it('fires onClick', () => {
        const onClick = jest.fn();
        render(<JumpPill variant="mention" label="Mentions 2" onClick={onClick} />);

        fireEvent.click(screen.getByRole('button', { name: 'Mentions 2' }));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('points up with an @ for mentions and down without one for the latest messages', () => {
        const { container, rerender } = render(<JumpPill variant="mention" label="Mentions 2" onClick={jest.fn()} />);
        expect(container.querySelectorAll('svg')).toHaveLength(2);
        expect(screen.getByRole('button')).toHaveClass('text-point-orange');

        rerender(<JumpPill variant="latest" label="Latest 25" onClick={jest.fn()} />);
        const glyphs = container.querySelectorAll('svg');
        expect(glyphs).toHaveLength(1);
        expect(glyphs[0]).toHaveClass('rotate-180');
        expect(screen.getByRole('button')).toHaveClass('bg-chip-ink');
    });
});
