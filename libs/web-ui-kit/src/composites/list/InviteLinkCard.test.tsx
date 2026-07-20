import { fireEvent, render, screen } from '@testing-library/react';

import { InviteLinkCard } from './InviteLinkCard';

describe('InviteLinkCard', () => {
    it('shows the room name and full url', () => {
        render(<InviteLinkCard name="Study Room" url="https://dou.chatic.io/s?code=abc" onCopy={jest.fn()} />);
        expect(screen.getByText('Study Room')).toBeInTheDocument();
        expect(screen.getByText('https://dou.chatic.io/s?code=abc')).toBeInTheDocument();
    });

    it('calls onCopy when the copy button is tapped', () => {
        const onCopy = jest.fn();
        render(<InviteLinkCard name="Study Room" url="https://x" onCopy={onCopy} copyLabel="Copy link" />);
        fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
        expect(onCopy).toHaveBeenCalledTimes(1);
    });
});
