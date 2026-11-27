import { fireEvent, render, screen } from '@testing-library/react';

import { ManageChannelItem } from './ManageChannelItem';

describe('ManageChannelItem', () => {
    it('toggles selection via the row body', () => {
        const onToggle = jest.fn();
        render(<ManageChannelItem leading={null} title="Study Room" selectLabel="Study Room" onToggle={onToggle} />);
        const row = screen.getByRole('checkbox', { name: 'Study Room' });
        expect(row).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(row);
        expect(onToggle).toHaveBeenCalledWith(true);
    });

    it('reflects the checked state', () => {
        render(<ManageChannelItem leading={null} title="Study Room" selectLabel="Study Room" checked />);
        expect(screen.getByRole('checkbox', { name: 'Study Room' })).toHaveAttribute('aria-checked', 'true');
    });

    it('renders no checkbox when the row is not selectable', () => {
        render(<ManageChannelItem leading={null} title="Study Room" selectable={false} />);
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.getByText('Study Room')).toBeInTheDocument();
    });

    it('toggles the pin without touching the selection', () => {
        const onToggle = jest.fn();
        const onTogglePin = jest.fn();
        render(
            <ManageChannelItem
                leading={null}
                title="Study Room"
                selectLabel="Study Room"
                onToggle={onToggle}
                pinLabel="Pin room"
                onTogglePin={onTogglePin}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'Pin room' }));
        expect(onTogglePin).toHaveBeenCalledWith(true);
        expect(onToggle).not.toHaveBeenCalled();
    });

    it('reports the pinned state on the pin control', () => {
        render(
            <ManageChannelItem leading={null} title="Study Room" pinned pinLabel="Unpin room" onTogglePin={jest.fn()} />
        );
        expect(screen.getByRole('button', { name: 'Unpin room' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('shows the time, preview and unread count', () => {
        render(
            <ManageChannelItem
                leading={null}
                title="Study Room"
                subtitle="last message"
                time="09:41"
                unread={3}
                unreadLabel="3 unread"
            />
        );
        expect(screen.getByText('09:41')).toBeInTheDocument();
        expect(screen.getByText('last message')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
    });
});
