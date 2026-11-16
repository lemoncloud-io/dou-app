import { fireEvent, render, screen } from '@testing-library/react';

import { RoomFileMoreSheet, type RoomFileMoreAction } from './RoomFileMoreSheet';

const NAME = 'Team meeting 1107_final.m4a';
const META = 'Me · Nov 7 · 1:12:05 · 68.4MB';

const actions = (overrides: Partial<Record<string, jest.Mock>> = {}): RoomFileMoreAction[] => [
    { key: 'details', label: 'Details', onPress: overrides.details ?? jest.fn() },
    { key: 'chat', label: 'View in chat', onPress: overrides.chat ?? jest.fn() },
    { key: 'save', label: 'Save', onPress: overrides.save ?? jest.fn() },
    { key: 'share', label: 'Share', onPress: overrides.share ?? jest.fn() },
    { key: 'delete', label: 'Delete', onPress: overrides.delete ?? jest.fn(), destructive: true },
];

describe('RoomFileMoreSheet', () => {
    it('heads the sheet with the file name and meta, and is named by the file', () => {
        render(<RoomFileMoreSheet open onOpenChange={jest.fn()} name={NAME} meta={META} actions={actions()} />);
        expect(screen.getByRole('dialog', { name: NAME })).toBeInTheDocument();
        expect(screen.getAllByText(META).length).toBeGreaterThan(0);
    });

    it('draws the rows it is given, in order', () => {
        render(<RoomFileMoreSheet open onOpenChange={jest.fn()} name={NAME} actions={actions()} />);
        expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
            'Details',
            'View in chat',
            'Save',
            'Share',
            'Delete',
        ]);
    });

    it('runs a row and closes the sheet', () => {
        const save = jest.fn();
        const onOpenChange = jest.fn();
        render(<RoomFileMoreSheet open onOpenChange={onOpenChange} name={NAME} actions={actions({ save })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(save).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('draws a destructive row in the alert colour', () => {
        render(<RoomFileMoreSheet open onOpenChange={jest.fn()} name={NAME} actions={actions()} />);
        expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('text-alert-red');
        expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('text-foreground');
    });

    it('draws a leading glyph when a row has one', () => {
        render(
            <RoomFileMoreSheet
                open
                onOpenChange={jest.fn()}
                name={NAME}
                actions={[{ key: 'save', label: 'Save', onPress: jest.fn(), icon: <svg data-testid="glyph" /> }]}
            />
        );
        expect(screen.getByTestId('glyph')).toBeInTheDocument();
    });

    it('renders nothing when closed', () => {
        render(<RoomFileMoreSheet open={false} onOpenChange={jest.fn()} name={NAME} actions={actions()} />);
        expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });
});
