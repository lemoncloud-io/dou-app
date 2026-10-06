import { fireEvent, render, screen } from '@testing-library/react';

import { StatusBanner } from './StatusBanner';

const base = { icon: <span>ic</span>, title: 'Subscription active', description: 'Next payment on Oct 30' };

describe('StatusBanner', () => {
    it('renders a non-interactive section with no chevron when onClick is absent', () => {
        const { container } = render(<StatusBanner {...base} />);

        expect(screen.queryByRole('button')).toBeNull();
        expect(container.querySelector('section')).not.toBeNull();
        expect(container.querySelector('svg')).toBeNull();
        expect(screen.getByText('Subscription active')).toBeInTheDocument();
        expect(screen.getByText('Next payment on Oct 30')).toBeInTheDocument();
    });

    it('becomes one button with a trailing chevron when onClick is given', () => {
        const onClick = jest.fn();
        render(<StatusBanner {...base} onClick={onClick} />);

        const button = screen.getByRole('button', { name: /Subscription active/ });
        expect(button.querySelector('svg')).not.toBeNull();
        fireEvent.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('colours the description by tone', () => {
        const { rerender } = render(<StatusBanner {...base} />);
        expect(screen.getByText('Next payment on Oct 30')).toHaveClass('text-point-blue');

        rerender(<StatusBanner {...base} tone="danger" />);
        expect(screen.getByText('Next payment on Oct 30')).toHaveClass('text-destructive');
    });

    it('renders the chip only when one is passed', () => {
        const { rerender } = render(<StatusBanner {...base} />);
        expect(screen.queryByText('D-3 until it ends')).toBeNull();

        rerender(<StatusBanner {...base} chip="D-3 until it ends" />);
        expect(screen.getByText('D-3 until it ends')).toHaveClass('rounded-full');
    });
});
