import { render, screen } from '@testing-library/react';

import { ReadReceipt } from './ReadReceipt';

describe('ReadReceipt', () => {
    it('shows the unread count while some members are unread', () => {
        render(<ReadReceipt unreadCount={3} unreadLabel="안읽음" />);
        expect(screen.getByText('3')).toBeTruthy();
    });

    it('exposes the count to assistive tech via aria-label', () => {
        render(<ReadReceipt unreadCount={1} unreadLabel="안읽음" />);
        expect(screen.getByLabelText('안읽음 1')).toBeTruthy();
    });

    it('renders nothing once everyone has read', () => {
        const { container } = render(<ReadReceipt unreadCount={0} unreadLabel="안읽음" />);
        expect(container.firstChild).toBeNull();
    });

    it('renders nothing for negative counts (defensive)', () => {
        const { container } = render(<ReadReceipt unreadCount={-1} unreadLabel="안읽음" />);
        expect(container.firstChild).toBeNull();
    });
});
