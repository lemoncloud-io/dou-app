import { render, screen } from '@testing-library/react';

import { ReadReceipt } from './ReadReceipt';

describe('ReadReceipt', () => {
    it('shows both read and unread counts while some members are unread', () => {
        render(<ReadReceipt readCount={1} unreadCount={99} readLabel="읽음" unreadLabel="안읽음" />);
        expect(screen.getByText('읽음 1')).toBeTruthy();
        expect(screen.getByText('안읽음 99')).toBeTruthy();
    });

    it('renders the read count in the point (accent) color', () => {
        render(<ReadReceipt readCount={5} unreadCount={2} readLabel="읽음" unreadLabel="안읽음" />);
        expect(screen.getByText('읽음 5')).toHaveClass('text-main-accent');
    });

    it('hides the unread segment once everyone has read, keeping the read count', () => {
        render(<ReadReceipt readCount={7} unreadCount={0} readLabel="읽음" unreadLabel="안읽음" />);
        expect(screen.getByText('읽음 7')).toBeTruthy();
        expect(screen.queryByText(/안읽음/)).toBeNull();
    });

    it('exposes both counts to assistive tech while unread remains', () => {
        render(<ReadReceipt readCount={1} unreadCount={3} readLabel="읽음" unreadLabel="안읽음" />);
        expect(screen.getByLabelText('읽음 1 안읽음 3')).toBeTruthy();
    });

    it('exposes only the read count to assistive tech once fully read', () => {
        render(<ReadReceipt readCount={4} unreadCount={0} readLabel="읽음" unreadLabel="안읽음" />);
        expect(screen.getByLabelText('읽음 4')).toBeTruthy();
    });

    it('treats negative unread as fully read (defensive)', () => {
        render(<ReadReceipt readCount={2} unreadCount={-1} readLabel="읽음" unreadLabel="안읽음" />);
        expect(screen.queryByText(/안읽음/)).toBeNull();
    });
});
