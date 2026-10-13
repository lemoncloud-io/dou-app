import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { NotifyModeSheet } from './NotifyModeSheet';
import type { NotifyLevel } from '../utils/notifyLevel';

const onOpenChange = jest.fn();
const onSelect = jest.fn();

const renderSheet = (props: { value?: NotifyLevel; levels?: readonly NotifyLevel[]; open?: boolean } = {}) =>
    render(
        <NotifyModeSheet
            open={props.open ?? true}
            onOpenChange={onOpenChange}
            value={props.value ?? 'all'}
            levels={props.levels ?? ['all', 'mention', 'none']}
            onSelect={onSelect}
        />
    );

const optionLabels = () => screen.getAllByRole('radio').map(option => option.textContent);

beforeEach(() => {
    jest.clearAllMocks();
});

describe('NotifyModeSheet', () => {
    it('lists the given levels in order inside a labelled radio group', () => {
        renderSheet();

        expect(screen.getByRole('radiogroup', { name: 'chat.settings.roomNotification' })).toBeInTheDocument();
        expect(optionLabels()).toEqual([
            'chat.settings.notifyMode.all',
            'chat.settings.notifyMode.mention',
            'chat.settings.notifyMode.none',
        ]);
    });

    // A 1:1 hands over two levels; the sheet must not add the third back.
    it('offers only the levels it is given', () => {
        renderSheet({ levels: ['all', 'none'] });

        expect(optionLabels()).toEqual(['chat.settings.notifyMode.all', 'chat.settings.notifyMode.none']);
    });

    it('checks the current level and no other', () => {
        renderSheet({ value: 'mention' });

        expect(screen.getByRole('radio', { name: 'chat.settings.notifyMode.mention' })).toHaveAttribute(
            'aria-checked',
            'true'
        );
        expect(screen.getByRole('radio', { name: 'chat.settings.notifyMode.all' })).toHaveAttribute(
            'aria-checked',
            'false'
        );
        expect(screen.getByRole('radio', { name: 'chat.settings.notifyMode.none' })).toHaveAttribute(
            'aria-checked',
            'false'
        );
    });

    it('reports the picked level and closes at once', () => {
        renderSheet();

        fireEvent.click(screen.getByRole('radio', { name: 'chat.settings.notifyMode.none' }));

        expect(onSelect).toHaveBeenCalledWith('none');
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    // Deciding whether a re-pick is a change is the caller's job, so the sheet still reports it.
    it('reports a pick of the current level too', () => {
        renderSheet({ value: 'all' });

        fireEvent.click(screen.getByRole('radio', { name: 'chat.settings.notifyMode.all' }));

        expect(onSelect).toHaveBeenCalledWith('all');
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    // The kit's close button defaults to the English "Close"; the sheet passes the localized label.
    it('names its close button with the localized label and closes without a pick', () => {
        renderSheet();

        fireEvent.click(screen.getByRole('button', { name: 'chat.settings.close' }));

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('renders nothing while closed', () => {
        renderSheet({ open: false });

        expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    });
});
