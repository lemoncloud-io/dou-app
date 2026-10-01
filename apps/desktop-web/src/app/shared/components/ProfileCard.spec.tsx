import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let canStartDm = true;
let isStarting = false;
let user: { channelIds?: string[] } | null = null;
let canOpenSelf = true;
const startDm = vi.fn();
const openSelf = vi.fn();

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
    useUser: () => user,
    useDisplayProfile: (_id: string, name: string, thumbnail?: string) => ({ name, thumbnail }),
    useCopyToClipboard: () => [false, vi.fn()],
    useStartDm: () => ({ startDm, openSelf, isStarting, isAvailable: canStartDm, canOpenSelf }),
}));

import { ProfileCardContent } from './ProfileCard';

// Initialises i18next so the card copy resolves.
import '../../../i18n';

describe('ProfileCardContent "Message"', () => {
    beforeEach(() => {
        canStartDm = true;
        isStarting = false;
        canOpenSelf = true;
        startDm.mockReset();
        openSelf.mockReset();
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

describe('ProfileCardContent shared channels', () => {
    beforeEach(() => {
        user = null;
    });

    // It read "2 channels" with no subject: whose channels, counted how?
    it('counts the channels I share with the person', () => {
        user = { channelIds: ['c1', 'c2'] };
        render(<ProfileCardContent userId="u-1" fallbackName="Aiden" />);

        expect(screen.getByText('2 channels in common')).toBeTruthy();
    });

    it('says nothing on my own card', () => {
        user = { channelIds: ['c1', 'c2'] };
        render(<ProfileCardContent userId="me-cloud" fallbackName="Me" />);

        expect(screen.queryByText(/in common/)).toBeNull();
    });
});

describe('ProfileCardContent "Notes to self"', () => {
    beforeEach(() => {
        canStartDm = true;
        isStarting = false;
        canOpenSelf = true;
        startDm.mockReset();
        openSelf.mockReset();
    });

    it.each([
        ['a host marks it as mine', { userId: 'u-1', isMe: true }],
        ['it carries my account id', { userId: 'me-account' }],
        ['it carries my id in this cloud', { userId: 'me-cloud' }],
    ])('opens my notes-to-self room from my own card when %s, then closes it', async (_case, props) => {
        openSelf.mockResolvedValue({ id: 'U:me-cloud' });
        const onClose = vi.fn();
        render(<ProfileCardContent fallbackName="Me" onClose={onClose} {...props} />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Notes to self' }));
        });

        expect(openSelf).toHaveBeenCalledTimes(1);
        expect(startDm).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps my card open when the room could not be opened', async () => {
        openSelf.mockResolvedValue(null);
        const onClose = vi.fn();
        render(<ProfileCardContent userId="me-cloud" fallbackName="Me" onClose={onClose} />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Notes to self' }));
        });

        expect(onClose).not.toHaveBeenCalled();
    });

    it("is absent on someone else's card", () => {
        render(<ProfileCardContent userId="u-1" fallbackName="Aiden" />);

        expect(screen.queryByRole('button', { name: 'Notes to self' })).toBeNull();
    });

    it('is absent where my room cannot be opened', () => {
        canOpenSelf = false;
        render(<ProfileCardContent userId="me-cloud" fallbackName="Me" />);

        expect(screen.queryByRole('button', { name: 'Notes to self' })).toBeNull();
    });

    it('is disabled while a room is being opened', () => {
        isStarting = true;
        render(<ProfileCardContent userId="me-cloud" fallbackName="Me" />);

        expect((screen.getByRole('button', { name: 'Notes to self' }) as HTMLButtonElement).disabled).toBe(true);
    });
});
