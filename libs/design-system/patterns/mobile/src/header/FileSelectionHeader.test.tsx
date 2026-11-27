import { fireEvent, render, screen } from '@testing-library/react';

import { FileSelectionHeader } from './FileSelectionHeader';

describe('FileSelectionHeader', () => {
    it('shows the title and the English defaults', () => {
        render(<FileSelectionHeader title="Select items" onCancel={jest.fn()} onToggleAll={jest.fn()} />);

        expect(screen.getByText('Select items')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Select all' })).toBeInTheDocument();
    });

    it('fires cancel and toggle-all with the host labels', () => {
        const onCancel = jest.fn();
        const onToggleAll = jest.fn();
        render(
            <FileSelectionHeader
                title="2 selected"
                cancelLabel="Back"
                toggleAllLabel="Deselect all"
                onCancel={onCancel}
                onToggleAll={onToggleAll}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onToggleAll).toHaveBeenCalledTimes(1);
    });

    it('announces the title politely as the count changes', () => {
        render(<FileSelectionHeader title="1 selected" onCancel={jest.fn()} onToggleAll={jest.fn()} />);

        expect(screen.getByText('1 selected')).toHaveAttribute('aria-live', 'polite');
    });

    it('disables toggle-all without touching cancel', () => {
        const onToggleAll = jest.fn();
        render(
            <FileSelectionHeader
                title="Select items"
                onCancel={jest.fn()}
                onToggleAll={onToggleAll}
                toggleAllDisabled
            />
        );

        const toggle = screen.getByRole('button', { name: 'Select all' });
        expect(toggle).toBeDisabled();
        fireEvent.click(toggle);
        expect(onToggleAll).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    });
});
