import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Candidate = { id: string; name: string; viaChannels: string[] };

let candidates: Candidate[] = [];
let isLoading = false;
let error: Error | null = null;
let isStarting = false;
const startDm = vi.fn();

vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<object>('../../../shared/utils/displayName')),
    ...(await vi.importActual<object>('../../../shared/utils/avatarColor')),
    ...(await vi.importActual<object>('../../../shared/components/Skeleton')),
    useStartDm: () => ({ startDm, isStarting, isAvailable: true }),
}));
vi.mock('../hooks', () => ({
    useInviteCandidates: () => ({ candidates, isLoading, error }),
}));

import { NewDmDialog } from './NewDmDialog';

// Initialises i18next so the dialog copy resolves.
import '../../../../i18n';

const onOpenChange = vi.fn();
const mount = () => render(<NewDmDialog open onOpenChange={onOpenChange} />);

describe('NewDmDialog', () => {
    beforeEach(() => {
        candidates = [
            { id: 'u-1', name: 'Aiden', viaChannels: ['design'] },
            { id: 'u-2', name: 'SteveJ', viaChannels: [] },
        ];
        isLoading = false;
        error = null;
        isStarting = false;
        startDm.mockReset();
        onOpenChange.mockReset();
    });

    it('opens the 1:1 for the picked person and closes', async () => {
        startDm.mockResolvedValue({ id: 'dm-1' });
        mount();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Aiden/ }));
        });

        expect(startDm).toHaveBeenCalledWith('u-1');
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('stays open when the room could not be opened', async () => {
        startDm.mockResolvedValue(null);
        mount();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /SteveJ/ }));
        });

        expect(startDm).toHaveBeenCalledWith('u-2');
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('filters the list by name', () => {
        mount();

        fireEvent.change(screen.getByPlaceholderText('Search by name or user ID'), { target: { value: 'ste' } });

        expect(screen.queryByRole('button', { name: /Aiden/ })).toBeNull();
        expect(screen.getByRole('button', { name: /SteveJ/ })).toBeTruthy();
    });

    it('matches a user ID regardless of case', () => {
        candidates = [{ id: 'U-Aiden01', name: 'Aiden', viaChannels: [] }];
        mount();

        fireEvent.change(screen.getByRole('textbox', { name: 'Search by name or user ID' }), {
            target: { value: 'u-aiden' },
        });

        expect(screen.getByRole('button', { name: /Aiden/ })).toBeTruthy();
    });

    it('says no one matches when the search filters everyone out', () => {
        mount();

        fireEvent.change(screen.getByPlaceholderText('Search by name or user ID'), { target: { value: 'zzz' } });

        expect(screen.getByText('No one matches that search.')).toBeTruthy();
    });

    it('says there is no one to message when the pool is empty', () => {
        candidates = [];
        mount();

        expect(screen.getByText(/No one to message yet/)).toBeTruthy();
    });

    it('shows the loading state while the pool resolves', () => {
        isLoading = true;
        mount();

        expect(screen.getByLabelText('Loading people…')).toBeTruthy();
    });

    it('shows the load failure', () => {
        error = new Error('denied');
        mount();

        expect(screen.getByText("Couldn't load people from your channels.")).toBeTruthy();
    });

    it('disables the rows while a 1:1 is being opened', () => {
        isStarting = true;
        mount();

        expect((screen.getByRole('button', { name: /Aiden/ }) as HTMLButtonElement).disabled).toBe(true);
    });
});
