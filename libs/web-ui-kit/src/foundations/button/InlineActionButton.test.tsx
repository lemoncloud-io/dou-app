import { fireEvent, render, screen } from '@testing-library/react';

import { InlineActionButton } from './InlineActionButton';

describe('InlineActionButton', () => {
    it('renders amount + label and fires onClick', () => {
        const onClick = jest.fn();
        render(<InlineActionButton amount="₩8,600" originalAmount="₩10,000" label="구독하기" onClick={onClick} />);
        expect(screen.getByText('₩8,600')).toBeInTheDocument();
        expect(screen.getByText('₩10,000')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '구독하기' }));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not fire when disabled', () => {
        const onClick = jest.fn();
        render(<InlineActionButton amount="₩0" label="구독하기" disabled onClick={onClick} />);
        fireEvent.click(screen.getByRole('button', { name: '구독하기' }));
        expect(onClick).not.toHaveBeenCalled();
    });
});
