import { fireEvent, render, screen } from '@testing-library/react';

import { OutlineButton } from './OutlineButton';

describe('OutlineButton', () => {
    it('renders icon + label and fires onClick', () => {
        const onClick = jest.fn();
        render(
            <OutlineButton icon={<span>ic</span>} onClick={onClick}>
                라벨
            </OutlineButton>
        );
        const btn = screen.getByRole('button', { name: /라벨/ });
        expect(screen.getByText('ic')).toBeInTheDocument();
        fireEvent.click(btn);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('applies the accent border when accent is set', () => {
        render(<OutlineButton accent>PRO</OutlineButton>);
        expect(screen.getByRole('button').className).toContain('border-main-accent');
    });

    it('does not fire onClick when disabled', () => {
        const onClick = jest.fn();
        render(
            <OutlineButton disabled onClick={onClick}>
                x
            </OutlineButton>
        );
        fireEvent.click(screen.getByRole('button'));
        expect(onClick).not.toHaveBeenCalled();
    });
});
