import { fireEvent, render, screen } from '@testing-library/react';

import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
    it('reflects checked state and toggles', () => {
        const onCheckedChange = jest.fn();
        const { rerender } = render(<Checkbox checked={false} onCheckedChange={onCheckedChange} label="동의" />);
        const box = screen.getByRole('checkbox', { name: '동의' });
        expect(box).toHaveAttribute('aria-checked', 'false');

        fireEvent.click(box);
        expect(onCheckedChange).toHaveBeenCalledWith(true);

        rerender(<Checkbox checked onCheckedChange={onCheckedChange} label="동의" />);
        expect(screen.getByRole('checkbox', { name: '동의' })).toHaveAttribute('aria-checked', 'true');
    });

    it('renders a non-interactive indicator when interactive=false', () => {
        render(<Checkbox checked interactive={false} />);
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('does not toggle when disabled', () => {
        const onCheckedChange = jest.fn();
        render(<Checkbox checked={false} disabled onCheckedChange={onCheckedChange} label="x" />);
        fireEvent.click(screen.getByRole('checkbox', { name: 'x' }));
        expect(onCheckedChange).not.toHaveBeenCalled();
    });
});
