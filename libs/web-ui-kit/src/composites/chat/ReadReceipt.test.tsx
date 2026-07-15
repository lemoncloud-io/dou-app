import { render, screen } from '@testing-library/react';

import { ReadReceipt } from './ReadReceipt';

const labels = { readLabel: '읽음', unreadLabel: '안읽음' };

describe('ReadReceipt', () => {
    describe('binary', () => {
        it('shows 읽음 when nobody is unread', () => {
            render(<ReadReceipt variant="binary" readCount={2} unreadCount={0} {...labels} />);
            expect(screen.getByText('읽음')).toBeTruthy();
            expect(screen.queryByText('안읽음')).toBeNull();
        });

        it('shows 안읽음 while unread', () => {
            render(<ReadReceipt variant="binary" readCount={1} unreadCount={1} {...labels} />);
            expect(screen.getByText('안읽음')).toBeTruthy();
        });
    });

    describe('count', () => {
        it('shows read and unread counts while some are unread', () => {
            render(<ReadReceipt variant="count" readCount={1} unreadCount={99} {...labels} />);
            expect(screen.getByText('읽음 1')).toBeTruthy();
            expect(screen.getByText('안읽음 99')).toBeTruthy();
        });

        it('drops the unread clause once everyone has read', () => {
            render(<ReadReceipt variant="count" readCount={100} unreadCount={0} {...labels} />);
            expect(screen.getByText('읽음 100')).toBeTruthy();
            expect(screen.queryByText(/안읽음/)).toBeNull();
        });
    });
});
