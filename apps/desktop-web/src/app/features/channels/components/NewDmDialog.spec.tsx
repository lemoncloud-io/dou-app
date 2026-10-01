import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Candidate = { id: string; name: string; viaChannels: string[] };

let candidates: Candidate[] = [];
let isLoading = false;
let error: Error | null = null;
let isStarting = false;
let placeProfiles: Record<string, { nick?: string }> = {};
let canOpenSelf = true;
let me: { id: string; name: string } | null = { id: 'me-1', name: 'Louis' };
const startDm = vi.fn();
const openSelf = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useGlobalSession: () => ({ cloud: { cloudId: 'cloud-1' } }),
            useUidInCloud: () => 'me-1',
        },
    },
}));

vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<object>('../../../shared/utils/displayName')),
    ...(await vi.importActual<object>('../../../shared/utils/avatarColor')),
    ...(await vi.importActual<object>('../../../shared/components/Skeleton')),
    ...(await vi.importActual<object>('../../../shared/utils/displayProfile')),
    useSiteProfileMap: () => placeProfiles,
    useStartDm: () => ({ startDm, openSelf, isStarting, isAvailable: true, canOpenSelf }),
    useUser: () => me,
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
        placeProfiles = {};
        canOpenSelf = true;
        me = { id: 'me-1', name: 'Louis' };
        startDm.mockReset();
        openSelf.mockReset();
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

    it("names a person by this place's nick, like the sidebar", () => {
        placeProfiles = { 'u-1': { nick: 'Tester' } };
        mount();

        expect(screen.getByRole('button', { name: /Tester/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Aiden/ })).toBeNull();
    });

    it("finds a person by this place's nick", () => {
        placeProfiles = { 'u-2': { nick: 'Stevie' } };
        mount();

        fireEvent.change(screen.getByPlaceholderText('Search by name or user ID'), { target: { value: 'stevie' } });

        expect(screen.getByRole('button', { name: /Stevie/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Aiden/ })).toBeNull();
    });

    describe('notes to self', () => {
        const selfRow = () => screen.queryByRole('button', { name: /Notes to self/ });

        it('offers my own room above the people and opens it through openSelf', async () => {
            openSelf.mockResolvedValue({ id: 'U:me-1' });
            mount();

            const row = selfRow();
            expect(row?.textContent).toContain('Louis');
            // Pinned first, before anyone from the pool.
            expect(screen.getAllByRole('button').indexOf(row as HTMLElement)).toBeLessThan(
                screen.getAllByRole('button').indexOf(screen.getByRole('button', { name: /Aiden/ }))
            );
            await act(async () => {
                fireEvent.click(row as HTMLElement);
            });

            expect(openSelf).toHaveBeenCalled();
            expect(startDm).not.toHaveBeenCalled();
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });

        it('stays open when my room could not be opened', async () => {
            openSelf.mockResolvedValue(null);
            mount();

            await act(async () => {
                fireEvent.click(selfRow() as HTMLElement);
            });

            expect(onOpenChange).not.toHaveBeenCalled();
        });

        it("names me by this place's nick", () => {
            placeProfiles = { 'me-1': { nick: 'Lou' } };
            mount();

            expect(selfRow()?.textContent).toContain('Lou');
        });

        it('is offered while the pool is still loading and when it is empty', () => {
            isLoading = true;
            mount();
            expect(selfRow()).toBeTruthy();
        });

        it('is hidden where my room cannot be opened', () => {
            canOpenSelf = false;
            mount();

            expect(selfRow()).toBeNull();
        });

        it('follows the search like any other row', () => {
            mount();

            fireEvent.change(screen.getByPlaceholderText('Search by name or user ID'), { target: { value: 'ste' } });
            expect(selfRow()).toBeNull();

            fireEvent.change(screen.getByPlaceholderText('Search by name or user ID'), { target: { value: 'lou' } });
            expect(selfRow()).toBeTruthy();
            // Only I match, so the list does not also claim that no one does.
            expect(screen.queryByText('No one matches that search.')).toBeNull();
        });

        it('falls back to the "You" label before my record loads', () => {
            me = null;
            mount();

            expect(selfRow()?.textContent).toBe('YYouNotes to self');
        });
    });
});
