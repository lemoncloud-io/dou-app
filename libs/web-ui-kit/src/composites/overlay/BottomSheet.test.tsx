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
