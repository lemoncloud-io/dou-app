import { fireEvent, render, screen } from '@testing-library/react';

import { FailedSendActions } from './FailedSendActions';

describe('FailedSendActions', () => {
    it('offers retry then delete and fires each', () => {
        const onRetry = jest.fn();
        const onDelete = jest.fn();
        render(<FailedSendActions onRetry={onRetry} onDelete={onDelete} />);

        expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Retry', 'Delete']);
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onDelete).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('takes its labels from the host', () => {
        render(<FailedSendActions onRetry={jest.fn()} onDelete={jest.fn()} retryLabel="재전송" deleteLabel="삭제" />);
        expect(screen.getByRole('button', { name: '재전송' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
    });

    it('hugs the edge its bubble sits on', () => {
        const { container, rerender } = render(<FailedSendActions onRetry={jest.fn()} onDelete={jest.fn()} />);
        expect(container.firstChild).toHaveClass('justify-end');
        rerender(<FailedSendActions onRetry={jest.fn()} onDelete={jest.fn()} align="start" />);
        expect(container.firstChild).toHaveClass('justify-start');
    });
});
