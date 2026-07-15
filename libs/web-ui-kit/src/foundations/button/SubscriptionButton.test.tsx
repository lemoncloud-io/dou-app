import { fireEvent, render, screen } from '@testing-library/react';

import { SubscriptionButton } from './SubscriptionButton';

describe('SubscriptionButton', () => {
    it('renders FREE without accent', () => {
        render(<SubscriptionButton tier="free" />);
        const btn = screen.getByRole('button', { name: /FREE/ });
        expect(btn.className).toContain('border-input-border');
    });

    it('renders PRO with accent border', () => {
        render(<SubscriptionButton tier="pro" />);
        const btn = screen.getByRole('button', { name: /PRO/ });
        expect(btn.className).toContain('border-main-accent');
    });

    it('supports a custom label and onClick', () => {
        const onClick = jest.fn();
        render(<SubscriptionButton tier="pro" label="구독중" onClick={onClick} />);
        fireEvent.click(screen.getByRole('button', { name: /구독중/ }));
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
