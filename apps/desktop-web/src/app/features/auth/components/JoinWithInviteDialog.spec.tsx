import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let isSubmitting = false;

vi.mock('../hooks/useInviteLogin', () => ({
    useInviteLogin: () => ({ login: vi.fn(), isSubmitting, error: null }),
}));

import { useJoinDialogStore } from '../stores';
import { JoinWithInviteDialog } from './JoinWithInviteDialog';

// Initialises i18next so the dialog copy resolves.
import '../../../../i18n';

const mount = () => {
    useJoinDialogStore.getState().open();
    return render(<JoinWithInviteDialog />);
};

describe('JoinWithInviteDialog', () => {
    beforeEach(() => {
        isSubmitting = false;
        useJoinDialogStore.getState().close();
    });

    it('ignores Escape while the invite is being redeemed', () => {
        isSubmitting = true;
        mount();

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        expect(useJoinDialogStore.getState().isOpen).toBe(true);
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('closes on Escape when nothing is in flight', () => {
        mount();

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        expect(useJoinDialogStore.getState().isOpen).toBe(false);
    });
});
