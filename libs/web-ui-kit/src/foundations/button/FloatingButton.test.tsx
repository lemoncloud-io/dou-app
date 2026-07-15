import { fireEvent, render, screen } from '@testing-library/react';

import { FloatingButton } from './FloatingButton';

describe('FloatingButton', () => {
    it('renders the label and fires onClick when enabled', () => {
        const onClick = jest.fn();
        render(<FloatingButton label="완료" onClick={onClick} />);

        const button = screen.getByRole('button', { name: '완료' });
        fireEvent.click(button);

        expect(button).toBeEnabled();
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not fire onClick when disabled', () => {
        const onClick = jest.fn();
        render(<FloatingButton label="완료" disabled onClick={onClick} />);

        const button = screen.getByRole('button', { name: '완료' });
        fireEvent.click(button);

        expect(button).toBeDisabled();
        expect(onClick).not.toHaveBeenCalled();
    });

    it('disables the button and hides the label while loading', () => {
        render(<FloatingButton label="완료" loading />);

        expect(screen.getByRole('button')).toBeDisabled();
        expect(screen.queryByText('완료')).not.toBeInTheDocument();
    });
});
