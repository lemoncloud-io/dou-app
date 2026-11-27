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

    it('shows the subtitle under the name and keeps it in the row label', () => {
        render(<SelectableUserItem name="Name" subtitle="010-1234-5678 · Acme" />);
        expect(screen.getByText('010-1234-5678 · Acme')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /Name.*010-1234-5678/ })).toBeInTheDocument();
    });

    it('renders no second line when the subtitle is empty', () => {
        const { container } = render(<SelectableUserItem name="Name" subtitle="" />);
        expect(container.querySelectorAll('.text-description')).toHaveLength(0);
    });
});
