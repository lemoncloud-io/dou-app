import { fireEvent, render, screen } from '@testing-library/react';

import { ModalTopBar } from './ModalTopBar';

describe('ModalTopBar', () => {
    it('renders the title', () => {
        render(<ModalTopBar title="프로필 설정" />);

        expect(screen.getByText('프로필 설정')).toBeInTheDocument();
    });

    it('fires onClose when the close button is pressed', () => {
        const onClose = jest.fn();
        render(<ModalTopBar title="프로필 설정" onClose={onClose} closeLabel="닫기" />);

        fireEvent.click(screen.getByRole('button', { name: '닫기' }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('hides the close button when onClose is not provided', () => {
        render(<ModalTopBar title="프로필 설정" />);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders left slot content', () => {
        render(<ModalTopBar title="프로필 설정" leftSlot={<span>back</span>} />);

        expect(screen.getByText('back')).toBeInTheDocument();
    });

    it('applies the safe-area top inset by default and drops it when disabled', () => {
        const { container, rerender } = render(<ModalTopBar title="t" />);
        expect(container.querySelector('header')?.className).toContain('var(--safe-top,0px)');

        rerender(<ModalTopBar title="t" safeArea={false} />);
        expect(container.querySelector('header')?.className).not.toContain('var(--safe-top,0px)');
    });
});
