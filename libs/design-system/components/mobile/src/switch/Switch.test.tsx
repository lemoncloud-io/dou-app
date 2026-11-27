import { fireEvent, render, screen } from '@testing-library/react';

import { Switch } from './Switch';

describe('Switch', () => {
    it('reflects checked state and toggles', () => {
        const onCheckedChange = jest.fn();
        render(<Switch checked={false} onCheckedChange={onCheckedChange} label="알림" />);
        const sw = screen.getByRole('switch', { name: '알림' });
        expect(sw).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(sw);
        expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    it('does not toggle when disabled', () => {
        const onCheckedChange = jest.fn();
        render(<Switch checked disabled onCheckedChange={onCheckedChange} label="알림" />);
        fireEvent.click(screen.getByRole('switch', { name: '알림' }));
        expect(onCheckedChange).not.toHaveBeenCalled();
    });
});
