import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';

import type * as SharedModule from '../../../shared';

const createChannel = vi.hoisted(() => vi.fn());
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useDesktopChannelMutations: () => ({ createChannel, isMutating: false }),
}));
vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import '../../../../i18n';
import { useCreateChannelDialogStore } from '../stores';
import { CreateChannelDialog } from './CreateChannelDialog';

const submitWith = async (error: Error) => {
    createChannel.mockRejectedValueOnce(error);
    render(<CreateChannelDialog onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(i18next.t('channels.create.nameLabel')), { target: { value: 'design' } });
    fireEvent.click(screen.getByRole('button', { name: i18next.t('channels.create.submit') }));
    return screen.findByRole('alert');
};

beforeEach(() => {
    vi.clearAllMocks();
    useCreateChannelDialogStore.setState({ isOpen: true });
});

describe('CreateChannelDialog failures', () => {
    // Every failure used to read "Try again", including the ones a second try cannot fix.
    it('says a full place is full and points at the mobile app', async () => {
        const alert = await submitWith(new Error('403 NOT ALLOWED - channel limit reached'));
        expect(alert.textContent).toContain(i18next.t('channels.create.failed.limit'));
        expect(alert.textContent).toContain(i18next.t('mobileApp.planAndCloud'));
        expect(alert.textContent).not.toContain(i18next.t('channels.create.failed'));
    });

    it('says a refusal is a refusal, without asking to try again', async () => {
        const alert = await submitWith(new Error('403 NOT ALLOWED - action[create] is invalid'));
        expect(alert.textContent).toBe(i18next.t('channels.create.failed.denied'));
    });

    it('still asks to try again when the failure may pass', async () => {
        const alert = await submitWith(new Error('500 INTERNAL'));
        expect(alert.textContent).toBe(i18next.t('channels.create.failed'));
    });
});

describe('CreateChannelDialog visibility', () => {
    it('moves between the visibility options with the arrow keys', () => {
        render(<CreateChannelDialog onCreated={vi.fn()} />);
        const [publicOption, privateOption] = screen.getAllByRole('radio');
        publicOption.focus();

        fireEvent.keyDown(publicOption, { key: 'ArrowRight' });

        expect(document.activeElement).toBe(privateOption);
        expect(privateOption.getAttribute('aria-checked')).toBe('true');
        expect(publicOption.getAttribute('aria-checked')).toBe('false');
        expect(publicOption.tabIndex).toBe(-1);
    });
});
