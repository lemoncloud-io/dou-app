import { fireEvent, render, screen } from '@testing-library/react';

import { IconEmptyState } from './IconEmptyState';

describe('IconEmptyState', () => {
    it('draws the icon, title and description', () => {
        render(
            <IconEmptyState icon={<i data-testid="glyph" />} title="Nothing yet" description="Mentions gather here." />
        );

        expect(screen.getByTestId('glyph')).toBeInTheDocument();
        expect(screen.getByText('Nothing yet')).toBeInTheDocument();
        expect(screen.getByText('Mentions gather here.')).toBeInTheDocument();
    });

    it('offers its action only with both a label and a handler', () => {
        const onAction = jest.fn();
        const { rerender } = render(<IconEmptyState icon={null} title="None unread" actionLabel="Show all" />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();

        rerender(<IconEmptyState icon={null} title="None unread" actionLabel="Show all" onAction={onAction} />);
        fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
        expect(onAction).toHaveBeenCalledTimes(1);
    });
});
