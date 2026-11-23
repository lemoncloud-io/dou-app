import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let isSubmitting = false;
let error: { kind: string; message?: string } | null = null;
const clearError = vi.fn();

vi.mock('../hooks/useInviteLogin', () => ({
    useInviteLogin: () => ({ login: vi.fn(), isSubmitting, error, clearError }),
}));

import { useJoinDialogStore } from '../stores';
import { JoinWithInviteDialog } from './JoinWithInviteDialog';

import '../../../../i18n';

const mount = () => {
    useJoinDialogStore.getState().open();
    return render(<JoinWithInviteDialog />);
};

describe('JoinWithInviteDialog', () => {
    beforeEach(() => {
        isSubmitting = false;
        error = null;
        clearError.mockClear();
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

    it('clears the last failure when the code is edited', () => {
        error = { kind: 'relay' };
        mount();

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'invt:2' } });

        expect(clearError).toHaveBeenCalled();
    });

    it('clears the last failure when the dialog is closed', () => {
        error = { kind: 'relay' };
        mount();

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        expect(useJoinDialogStore.getState().isOpen).toBe(false);
        expect(clearError).toHaveBeenCalled();
    });

    it("shows the server's own words under the sentence", () => {
        error = { kind: 'server', message: '400 INVALID - grace-timeout by invite[910024]' };
        mount();

        const alert = screen.getByRole('alert');
        expect(alert.textContent).toContain('400 INVALID - grace-timeout by invite[910024]');
        expect(alert.textContent).not.toContain("Couldn't reach the server");
    });
});
