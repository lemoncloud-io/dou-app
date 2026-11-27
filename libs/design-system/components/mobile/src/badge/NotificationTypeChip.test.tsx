import { render, screen } from '@testing-library/react';

import { NotificationTypeChip } from './NotificationTypeChip';

describe('NotificationTypeChip', () => {
    it('draws the label beside its glyph', () => {
        const { container } = render(<NotificationTypeChip variant="mention" label="Mention" />);

        expect(screen.getByText('Mention')).toBeInTheDocument();
        expect(container.querySelector('svg')).not.toBeNull();
    });

    it('colours a mention orange and a thread blue', () => {
        const { container, rerender } = render(<NotificationTypeChip variant="mention" label="Mention" />);
        expect(container.firstChild).toHaveClass('text-point-orange');

        rerender(<NotificationTypeChip variant="thread" label="Thread" />);
        expect(container.firstChild).toHaveClass('text-point-blue');
    });
});
