import { fireEvent, render, screen } from '@testing-library/react';

import { ComposerAttachButton } from './ComposerAttachButton';

describe('ComposerAttachButton', () => {
    it('reports its open state and fires onClick', () => {
        const onClick = jest.fn();
        render(<ComposerAttachButton open={false} onClick={onClick} label="첨부" />);

        const button = screen.getByRole('button', { name: '첨부' });
        expect(button).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    // The same spot closes what it opened, so the glyph has to say which one a tap will do.
    it('swaps the plus for a close mark while the menu is open', () => {
        const { container, rerender } = render(<ComposerAttachButton open={false} onClick={jest.fn()} />);
        const closedGlyph = container.querySelector('svg')?.getAttribute('class');

        rerender(<ComposerAttachButton open onClick={jest.fn()} />);
        expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
        expect(container.querySelector('svg')?.getAttribute('class')).not.toBe(closedGlyph);
    });

    it('does not fire when disabled', () => {
        const onClick = jest.fn();
        render(<ComposerAttachButton open={false} onClick={onClick} disabled />);

        fireEvent.click(screen.getByRole('button'));
        expect(onClick).not.toHaveBeenCalled();
    });
});
