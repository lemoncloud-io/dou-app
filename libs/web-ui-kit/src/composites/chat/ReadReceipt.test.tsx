import { render, screen } from '@testing-library/react';

import { ReadReceipt } from './ReadReceipt';

const labels = { readLabel: '읽음', unreadLabel: '미확인', allReadLabel: '모두 읽음' };

describe('ReadReceipt', () => {
    it('shows both read and unread counts while some members are unread', () => {
        render(<ReadReceipt readCount={1} unreadCount={99} {...labels} />);
        expect(screen.getByText('읽음 1')).toBeTruthy();
        expect(screen.getByText('미확인 99')).toBeTruthy();
    });

    it('separates the two counts with a bullet', () => {
        render(<ReadReceipt readCount={10} unreadCount={2} {...labels} />);
        expect(screen.getByText('•').parentElement?.textContent).toBe('읽음 10•미확인 2');
    });

    it('renders the read count in the point (accent) color', () => {
        render(<ReadReceipt readCount={5} unreadCount={2} {...labels} />);
        expect(screen.getByText('읽음 5')).toHaveClass('text-main-accent');
    });

    it('collapses to the all-read label once everyone has read', () => {
        render(<ReadReceipt readCount={7} unreadCount={0} {...labels} />);
        expect(screen.getByText('모두 읽음')).toHaveClass('text-main-accent');
        expect(screen.queryByText('읽음 7')).toBeNull();
        expect(screen.queryByText(/미확인/)).toBeNull();
    });

    it('exposes both counts to assistive tech while unread remains', () => {
        render(<ReadReceipt readCount={1} unreadCount={3} {...labels} />);
        expect(screen.getByLabelText('읽음 1 미확인 3')).toBeTruthy();
    });

    it('exposes the all-read label to assistive tech once fully read', () => {
        render(<ReadReceipt readCount={4} unreadCount={0} {...labels} />);
        expect(screen.getByLabelText('모두 읽음')).toBeTruthy();
    });

    it('treats negative unread as fully read (defensive)', () => {
        render(<ReadReceipt readCount={2} unreadCount={-1} {...labels} />);
        expect(screen.getByText('모두 읽음')).toBeTruthy();
        expect(screen.queryByText(/미확인/)).toBeNull();
    });

    describe('dm mode', () => {
        it('shows the lone unread count while the peer has not read', () => {
            render(<ReadReceipt mode="dm" readCount={1} unreadCount={1} {...labels} />);
            expect(screen.getByText('1')).toHaveClass('text-main-accent');
            expect(screen.queryByText(/읽음/)).toBeNull();
        });

        it('renders nothing once the peer has read', () => {
            const { container } = render(<ReadReceipt mode="dm" readCount={2} unreadCount={0} {...labels} />);
            expect(container).toBeEmptyDOMElement();
        });

        it('exposes the unread count to assistive tech', () => {
            render(<ReadReceipt mode="dm" readCount={1} unreadCount={1} {...labels} />);
            expect(screen.getByLabelText('미확인 1')).toBeTruthy();
        });
    });
});
