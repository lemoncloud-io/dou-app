import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';

const pool = vi.hoisted(() => ({ candidates: [] as { id: string; name: string; viaChannels: string[] }[] }));
vi.mock('../hooks', () => ({
    useAddMembers: () => ({ addMembers: vi.fn(), isAdding: false }),
    useInviteCandidates: () => ({ candidates: pool.candidates, isLoading: false, error: null }),
}));

import '../../../../i18n';
import { AddMembersDialog } from './AddMembersDialog';

const renderDialog = () => render(<AddMembersDialog open onOpenChange={vi.fn()} channelId="C1" />);

beforeEach(() => {
    pool.candidates = [];
});

describe('AddMembersDialog empty pool', () => {
    // An owner with nobody yet was told everyone was already here.
    it('says who can be added and that someone new is invited from the mobile app', () => {
        renderDialog();
        expect(screen.getByText(i18next.t('channels.addMembers.empty'))).toBeTruthy();
        expect(screen.getByText(i18next.t('mobileApp.invite'), { exact: false })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'App Store' })).toBeTruthy();
    });

    it('keeps a search with no match apart from an empty pool', () => {
        pool.candidates = [{ id: 'u2', name: 'Bob', viaChannels: ['general'] }];
        renderDialog();
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz' } });
        expect(screen.getByText(i18next.t('channels.addMembers.noMatches'))).toBeTruthy();
        expect(screen.queryByText(i18next.t('mobileApp.invite'), { exact: false })).toBeNull();
    });
});
