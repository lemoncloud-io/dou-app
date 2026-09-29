import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let canStartDm = true;
let isStarting = false;
const startDm = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'me-account' }),
            useGlobalSession: () => ({ cloud: { cloudId: 'cloud-1' } }),
            useUidInCloud: () => 'me-cloud',
        },
    },
}));
vi.mock('../hooks', () => ({
    useUser: () => null,
    useDisplayProfile: (_id: string, name: string, thumbnail?: string) => ({ name, thumbnail }),
    useCopyToClipboard: () => [false, vi.fn()],
    useStartDm: () => ({ startDm, isStarting, isAvailable: canStartDm }),
}));

import { ProfileCardContent } from './ProfileCard';

// Initialises i18next so the card copy resolves.
import '../../../i18n';

describe('ProfileCardContent "Message"', () => {
    beforeEach(() => {
        canStartDm = true;
        isStarting = false;
        startDm.mockReset();
    });

    it('opens the 1:1 with the person on the card, then closes the card', async () => {
        startDm.mockResolvedValue({ id: 'dm-1' });
        const onClose = vi.fn();
        render(<ProfileCardContent userId="u-1" fallbackName="Aiden" onClose={onClose} />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Message' }));
        });

        expect(startDm).toHaveBeenCalledWith('u-1');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps the card open when the 1:1 could not be opened', async () => {
        startDm.mockResolvedValue(null);
        const onClose = vi.fn();
        render(<ProfileCardContent userId="u-1" fallbackName="Aiden" onClose={onClose} />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Message' }));
        });

        expect(onClose).not.toHaveBeenCalled();
    });

    it.each([
        ['a host marks it as mine', { userId: 'u-1', isMe: true }],
        ['it carries my account id', { userId: 'me-account' }],
        ['it carries my id in this cloud', { userId: 'me-cloud' }],
    ])('is absent on my own card when %s', (_case, props) => {
        render(<ProfileCardContent fallbackName="Me" {...props} />);

        expect(screen.queryByRole('button', { name: 'Message' })).toBeNull();
    });

    it('is absent where a 1:1 cannot be started', () => {
        canStartDm = false;
        render(<ProfileCardContent userId="u-1" fallbackName="Aiden" />);

        expect(screen.queryByRole('button', { name: 'Message' })).toBeNull();
    });

    it('is disabled while a 1:1 is being opened', () => {
        isStarting = true;
        render(<ProfileCardContent userId="u-1" fallbackName="Aiden" />);

        expect((screen.getByRole('button', { name: 'Message' }) as HTMLButtonElement).disabled).toBe(true);
    });
});
