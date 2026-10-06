import { fireEvent, render, screen } from '@testing-library/react';

import { SelectableCard } from './SelectableCard';

describe('SelectableCard', () => {
    it('is a radio whose aria-checked follows checked', () => {
        const { rerender } = render(<SelectableCard title="My Cloud" checked={false} />);
        expect(screen.getByRole('radio', { name: /My Cloud/ })).toHaveAttribute('aria-checked', 'false');

        rerender(<SelectableCard title="My Cloud" checked />);
        expect(screen.getByRole('radio', { name: /My Cloud/ })).toHaveAttribute('aria-checked', 'true');
    });

    it('reports the opposite of checked on tap', () => {
        const onToggle = jest.fn();
        const { rerender } = render(<SelectableCard title="My Cloud" checked={false} onToggle={onToggle} />);
        fireEvent.click(screen.getByRole('radio'));
        expect(onToggle).toHaveBeenLastCalledWith(true);

        rerender(<SelectableCard title="My Cloud" checked onToggle={onToggle} />);
        fireEvent.click(screen.getByRole('radio'));
        expect(onToggle).toHaveBeenLastCalledWith(false);
    });

    it('draws the dot only when checked', () => {
        const { container, rerender } = render(<SelectableCard title="t" checked={false} />);
        expect(container.querySelector('[data-checked] > span')).toBeNull();

        rerender(<SelectableCard title="t" checked />);
        expect(container.querySelector('[data-checked] > span')).not.toBeNull();
    });

    it('renders the trailing label and leading slot when given', () => {
        render(<SelectableCard title="t" checked leading={<span>avatar</span>} trailingLabel="Selected" />);

        expect(screen.getByText('avatar')).toBeInTheDocument();
        expect(screen.getByText('Selected')).toHaveClass('text-main-accent');
    });

    it('blocks the tap when disabled', () => {
        const onToggle = jest.fn();
        render(<SelectableCard title="t" checked={false} disabled onToggle={onToggle} />);

        const radio = screen.getByRole('radio');
        expect(radio).toBeDisabled();
        fireEvent.click(radio);
        expect(onToggle).not.toHaveBeenCalled();
    });
});
