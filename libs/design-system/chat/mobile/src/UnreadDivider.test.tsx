import { render, screen } from '@testing-library/react';

import { UnreadDivider } from './UnreadDivider';

describe('UnreadDivider', () => {
    it('is a separator named by its label, drawn in the alert red', () => {
        render(<UnreadDivider label="12 unread messages below" />);

        expect(screen.getByRole('separator', { name: '12 unread messages below' })).toBeInTheDocument();
        expect(screen.getByText('12 unread messages below')).toHaveClass('text-alert-red');
    });
});
