import { render, screen } from '@testing-library/react';

import { ActivityCountBadge } from './ActivityCountBadge';

describe('ActivityCountBadge', () => {
    it('renders nothing at zero', () => {
        const { container } = render(<ActivityCountBadge variant="mention" count={0} />);
        expect(container.firstChild).toBeNull();
    });

    it('draws the count in the variant colour and clamps above max', () => {
        const { rerender } = render(<ActivityCountBadge variant="thread" count={2} label="2 thread replies" />);
        const badge = screen.getByRole('status', { name: '2 thread replies' });
        expect(badge).toHaveTextContent('2');
        expect(badge).toHaveClass('text-point-blue');

        rerender(<ActivityCountBadge variant="mention" count={150} />);
        expect(screen.getByRole('status')).toHaveTextContent('+99');
        expect(screen.getByRole('status')).toHaveClass('text-point-orange');
    });
});
