import { fireEvent, render, screen } from '@testing-library/react';

import { FileSelectionActionBar } from './FileSelectionActionBar';

const icon = <svg data-testid="glyph" />;

describe('FileSelectionActionBar', () => {
    it('renders each action as a named button in a toolbar', () => {
        render(
            <FileSelectionActionBar
                actions={[
                    { key: 'save', icon, label: 'Save', onPress: jest.fn() },
                    { key: 'share', icon, label: 'Share', onPress: jest.fn() },
                    { key: 'delete', icon, label: 'Delete', onPress: jest.fn(), destructive: true },
                ]}
            />
        );

        const toolbar = screen.getByRole('toolbar', { name: 'Selection actions' });
        expect(toolbar).toBeInTheDocument();
        expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Save', 'Share', 'Delete']);
        expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('data-destructive', 'true');
        expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('data-destructive');
    });

    it('fires the pressed action only', () => {
        const save = jest.fn();
        const remove = jest.fn();
        render(
            <FileSelectionActionBar
                actions={[
                    { key: 'save', icon, label: 'Save', onPress: save },
                    { key: 'delete', icon, label: 'Delete', onPress: remove, destructive: true },
                ]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(remove).toHaveBeenCalledTimes(1);
        expect(save).not.toHaveBeenCalled();
    });

    it('keeps a disabled action inert while the others work (delete only)', () => {
        const save = jest.fn();
        const remove = jest.fn();
        render(
            <FileSelectionActionBar
                actions={[
                    { key: 'save', icon, label: 'Save', onPress: save, disabled: true },
                    { key: 'delete', icon, label: 'Delete', onPress: remove, destructive: true },
                ]}
            />
        );

        const saveButton = screen.getByRole('button', { name: 'Save' });
        expect(saveButton).toBeDisabled();
        fireEvent.click(saveButton);
        expect(save).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(remove).toHaveBeenCalledTimes(1);
    });

    it('shows the notice only when given', () => {
        const actions = [{ key: 'save', icon, label: 'Save', onPress: jest.fn() }];
        const { rerender } = render(<FileSelectionActionBar actions={actions} />);
        expect(screen.queryByText('Up to 10 files at a time.')).not.toBeInTheDocument();

        rerender(<FileSelectionActionBar actions={actions} notice="Up to 10 files at a time." />);
        expect(screen.getByText('Up to 10 files at a time.')).toBeInTheDocument();
    });

    it('takes a host label for the toolbar', () => {
        render(<FileSelectionActionBar actions={[]} label="File actions" />);

        expect(screen.getByRole('toolbar', { name: 'File actions' })).toBeInTheDocument();
    });
});
