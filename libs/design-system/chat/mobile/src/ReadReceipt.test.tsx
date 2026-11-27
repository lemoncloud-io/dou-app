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

    describe('readers mode', () => {
        const faces = (n: number) => Array.from({ length: n }, (_, i) => <span key={i} data-testid="face" />);
        const readerLabels = { readLabel: 'Read', unreadLabel: 'Unconfirmed', allReadLabel: 'Read by all' };

        it('says how many read and shows up to three of them, then a +N pill', () => {
            render(<ReadReceipt mode="readers" readCount={6} unreadCount={2} readers={faces(6)} {...readerLabels} />);

            expect(screen.getByText('Read 6')).toBeInTheDocument();
            expect(screen.getAllByTestId('face')).toHaveLength(3);
            expect(screen.getByText('+3')).toBeInTheDocument();
        });

        it('draws no pill when three or fewer read', () => {
            render(<ReadReceipt mode="readers" readCount={2} unreadCount={1} readers={faces(2)} {...readerLabels} />);

            expect(screen.getAllByTestId('face')).toHaveLength(2);
            expect(screen.queryByText(/^\+/)).toBeNull();
        });

        it('says how many have not seen it while nobody has read yet', () => {
            render(<ReadReceipt mode="readers" readCount={0} unreadCount={49} {...readerLabels} />);

            expect(screen.getByText('Unconfirmed 49')).toBeInTheDocument();
            expect(screen.queryByTestId('face')).toBeNull();
        });

        it('collapses to the all-read label once everyone has read', () => {
            render(<ReadReceipt mode="readers" readCount={4} unreadCount={0} readers={faces(4)} {...readerLabels} />);

            expect(screen.getByText('Read by all')).toBeInTheDocument();
            expect(screen.queryByTestId('face')).toBeNull();
        });
    });
});
