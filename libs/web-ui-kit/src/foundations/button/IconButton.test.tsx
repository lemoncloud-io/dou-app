import { fireEvent, render, screen } from '@testing-library/react';

import { IconButton } from './IconButton';

describe('IconButton', () => {
    it('exposes the label and fires onClick', () => {
        const onClick = jest.fn();
        render(<IconButton icon={<span>ic</span>} label="검색" onClick={onClick} />);
        const btn = screen.getByRole('button', { name: '검색' });
        fireEvent.click(btn);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('applies the outline variant border', () => {
        render(<IconButton icon={<span>ic</span>} label="검색" variant="outline" />);
        expect(screen.getByRole('button', { name: '검색' }).className).toContain('border-input-border');
    });
});
