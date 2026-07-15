import { fireEvent, render, screen } from '@testing-library/react';

import { SelectableUserItem } from './SelectableUserItem';

describe('SelectableUserItem', () => {
    it('renders the name and toggles selection via the whole row', () => {
        const onToggle = jest.fn();
        render(<SelectableUserItem name="Name" checked={false} onToggle={onToggle} />);
        const row = screen.getByRole('checkbox', { name: /Name/ });
        expect(row).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(row);
        expect(onToggle).toHaveBeenCalledWith(true);
    });

    it('reflects the checked state', () => {
        render(<SelectableUserItem name="Name" checked />);
        expect(screen.getByRole('checkbox', { name: /Name/ })).toHaveAttribute('aria-checked', 'true');
    });
});
