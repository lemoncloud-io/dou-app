import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const updateAccount = vi.hoisted(() => vi.fn());
const relay = vi.hoisted(() => ({ verified: true }));
vi.mock('../../../shared', () => ({
    useRelayAccount: () => ({ updateAccount, isRelayVerified: relay.verified }),
}));
vi.mock('../../account/components/AccountProfileDialog', () => ({ ACCOUNT_NAME_MAX: 30 }));

import i18n from '../../../../i18n';
import { NewAccountName } from './NewAccountName';

describe('NewAccountName', () => {
    const onDone = vi.fn();

    beforeEach(() => {
        onDone.mockReset();
        updateAccount.mockReset().mockResolvedValue({});
        relay.verified = true;
    });

    it('holds a typed name until the relay connection is up, but never the skip', () => {
        relay.verified = false;
        render(<NewAccountName onDone={onDone} />);

        expect(
            (screen.getByRole('button', { name: i18n.t('auth.newAccount.skip') }) as HTMLButtonElement).disabled
        ).toBe(false);
        type('Tak');
        expect(
            (screen.getByRole('button', { name: i18n.t('auth.phone.continue') }) as HTMLButtonElement).disabled
        ).toBe(true);
    });
    afterEach(cleanup);

    const type = (value: string) =>
        fireEvent.change(screen.getByLabelText(i18n.t('account.profile.nameLabel')), { target: { value } });

    it('lets the name wait, saving nothing', () => {
        render(<NewAccountName onDone={onDone} />);

        fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.newAccount.skip') }));

        expect(updateAccount).not.toHaveBeenCalled();
        expect(onDone).toHaveBeenCalled();
    });

    it('saves a typed name, trimmed, before moving on', async () => {
        render(<NewAccountName onDone={onDone} />);
        type('  Tak  ');

        fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.phone.continue') }));

        await waitFor(() => expect(onDone).toHaveBeenCalled());
        expect(updateAccount).toHaveBeenCalledWith({ name: 'Tak' });
    });

    it('says when the save failed and offers to carry on without the name', async () => {
        updateAccount.mockRejectedValue(new Error('relay down'));
        render(<NewAccountName onDone={onDone} />);
        type('Tak');

        fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.phone.continue') }));

        expect((await screen.findByRole('alert')).textContent).toBe(i18n.t('auth.newAccount.saveFailed'));
        expect(onDone).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.newAccount.continueWithout') }));
        expect(onDone).toHaveBeenCalled();
        expect(updateAccount).toHaveBeenCalledTimes(1);
    });
});
