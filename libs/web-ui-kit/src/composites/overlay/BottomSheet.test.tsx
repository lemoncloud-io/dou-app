import { fireEvent, render, screen } from '@testing-library/react';

import { BottomSheet } from './BottomSheet';
import { SheetOption } from './SheetOption';

describe('BottomSheet', () => {
    it('renders the title, children and footer when open', () => {
        render(
            <BottomSheet open onOpenChange={jest.fn()} title="신고하기" footer={<button>신고</button>}>
                <div>body</div>
            </BottomSheet>
        );

        expect(screen.getByText('신고하기')).toBeInTheDocument();
        expect(screen.getByText('body')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '신고' })).toBeInTheDocument();
    });

    it('fires onClose and closes when the close button is pressed', () => {
        const onClose = jest.fn();
        const onOpenChange = jest.fn();
        render(<BottomSheet open onOpenChange={onOpenChange} title="신고하기" onClose={onClose} closeLabel="닫기" />);

        fireEvent.click(screen.getByRole('button', { name: '닫기' }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('rides above the soft keyboard and gives back the same height', () => {
        render(<BottomSheet open onOpenChange={jest.fn()} title="신고하기" footer={<button>신고</button>} />);

        // jsdom cannot evaluate the vars, so the contract is the declaration: lifted by the keyboard
        // height and capped by the same amount, which is what keeps the footer CTA reachable.
        const panel = screen.getByRole('dialog');
        expect(panel).toHaveClass('[transform:translateY(calc(-1*var(--keyboard-height,0px)))]');
        expect(panel).toHaveClass('max-h-[calc(90vh-var(--keyboard-height,0px))]');
    });

    // Figma 4712:16421 — some sheets name themselves through their content (a row of emoji,
    // a list of faces), and there a title bar spends 50px restating it while the close button
    // duplicates the swipe-down and the backdrop tap.
    it('hideHeader drops the title bar and close button but keeps the accessible name', () => {
        render(
            <BottomSheet open onOpenChange={jest.fn()} title="반응한 사람" onClose={jest.fn()} hideHeader>
                <p>body</p>
            </BottomSheet>
        );

        expect(screen.getByText('반응한 사람')).toHaveClass('sr-only');
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
        expect(screen.getByRole('dialog')).toHaveAccessibleName('반응한 사람');
    });

    it('draws the title bar and close button by default', () => {
        render(
            <BottomSheet open onOpenChange={jest.fn()} title="반응한 사람" onClose={jest.fn()}>
                <p>body</p>
            </BottomSheet>
        );

        expect(screen.getByText('반응한 사람')).not.toHaveClass('sr-only');
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    // The panel is portalled, so the grabber has to be looked up inside the dialog rather
    // than in RTL's own container — where every query would vacuously find nothing.
    it('shows the grabber only when asked', () => {
        const { rerender } = render(<BottomSheet open onOpenChange={jest.fn()} title="반응한 사람" hideHeader />);
        expect(screen.getByRole('dialog').querySelector('span[aria-hidden].w-9')).toBeNull();

        rerender(<BottomSheet open onOpenChange={jest.fn()} title="반응한 사람" hideHeader showHandle />);
        expect(screen.getByRole('dialog').querySelector('span[aria-hidden].w-9')).not.toBeNull();
    });

    it('renders nothing when closed', () => {
        render(<BottomSheet open={false} onOpenChange={jest.fn()} title="신고하기" />);

        expect(screen.queryByText('신고하기')).not.toBeInTheDocument();
    });
});

describe('SheetOption', () => {
    it('reflects selected state and fires onSelect', () => {
        const onSelect = jest.fn();
        const { rerender } = render(<SheetOption label="혐오 발언" selected={false} onSelect={onSelect} />);

        const option = screen.getByRole('radio', { name: '혐오 발언' });
        expect(option).toHaveAttribute('aria-checked', 'false');

        fireEvent.click(option);
        expect(onSelect).toHaveBeenCalledTimes(1);

        rerender(<SheetOption label="혐오 발언" selected onSelect={onSelect} />);
        expect(screen.getByRole('radio', { name: '혐오 발언' })).toHaveAttribute('aria-checked', 'true');
    });
});
