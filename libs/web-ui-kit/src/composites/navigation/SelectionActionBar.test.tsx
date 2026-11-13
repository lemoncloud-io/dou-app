import { fireEvent, render, screen } from '@testing-library/react';

import { SelectionActionBar } from './SelectionActionBar';

describe('SelectionActionBar', () => {
    it('fires each action', () => {
        const markRead = jest.fn();
        const remove = jest.fn();
        render(
            <SelectionActionBar
                secondary={{ label: 'Mark as read 2', onClick: markRead }}
                destructive={{ label: 'Delete 2', onClick: remove }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Mark as read 2' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }));
        expect(markRead).toHaveBeenCalledTimes(1);
        expect(remove).toHaveBeenCalledTimes(1);
    });

    it('disables each button on its own', () => {
        const markRead = jest.fn();
        render(
            <SelectionActionBar
                secondary={{ label: 'Mark as read 1', onClick: markRead, disabled: true }}
                destructive={{ label: 'Delete 1', onClick: jest.fn() }}
            />
        );

        const button = screen.getByRole('button', { name: 'Mark as read 1' });
        expect(button).toBeDisabled();
        fireEvent.click(button);
        expect(markRead).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Delete 1' })).toBeEnabled();
    });
});
