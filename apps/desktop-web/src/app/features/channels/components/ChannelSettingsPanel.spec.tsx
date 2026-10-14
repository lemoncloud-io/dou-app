import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DomainChannel } from '@chatic/data';

vi.mock('../../../shared', async importOriginal => ({
    ...(await importOriginal<object>()),
}));

// The notify writer reaches the mutations through its own leaf import, not the
// barrel above — mock the leaf so the panel renders without a runtime.
vi.mock('../../../shared/hooks/useChannelMutations', () => ({
    useDesktopChannelMutations: () => ({ setChannelNotify: vi.fn(), updateChannel: vi.fn(), isMutating: false }),
}));

vi.mock('../hooks', () => ({
    useChannelActions: () => ({ openDialog: vi.fn(), openKick: vi.fn(), kickTarget: null }),
}));

// The dialogs are not what these tests are about, and they reach for hooks of their own.
vi.mock('./ChannelActionDialogs', () => ({ ChannelActionDialogs: () => null }));

import i18n from '../../../../i18n';
import { ChannelSettingsPanel } from './ChannelSettingsPanel';

const writeText = vi.fn();

const renderPanel = (channel: Partial<DomainChannel>) =>
    render(
        <ChannelSettingsPanel
            channel={{ id: 'C1', ...channel } as DomainChannel}
            myUid="me"
            members={[]}
            membersLoading={false}
            membersError={null}
        />
    );

describe('ChannelSettingsPanel channel ID', () => {
    beforeEach(() => {
        writeText.mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    });
    afterEach(() => writeText.mockReset());

    // The desktop app has no address bar, so this is the only place to read a channel's id from —
    // which is what pointing a service's webhook at the channel needs.
    it('shows the id of a channel and copies it', async () => {
        renderPanel({ name: 'general', stereo: 'public', memberNo: 3 } as Partial<DomainChannel>);

        expect(screen.getByText('Channel ID')).toBeDefined();
        expect(screen.getByText('C1')).toBeDefined();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
        });

        expect(writeText).toHaveBeenCalledWith('C1');
        expect(screen.getByRole('button', { name: 'Copied' })).toBeDefined();
    });

    it('names the row and its button in the app language', async () => {
        await i18n.changeLanguage('ko');
        try {
            renderPanel({ name: 'general', stereo: 'public', memberNo: 3 } as Partial<DomainChannel>);

            expect(screen.getByText('채널 ID')).toBeDefined();
            expect(screen.getByRole('button', { name: '복사' })).toBeDefined();
        } finally {
            await i18n.changeLanguage('en');
        }
    });

    // Neither a 1:1 nor my notes-to-self is somewhere a service posts to.
    it.each([
        ['a 1:1', { stereo: 'dm', memberNo: 2 }],
        ['my self channel', { stereo: 'self', memberNo: 1 }],
    ])('shows no id in %s', (_kind, channel) => {
        renderPanel(channel as Partial<DomainChannel>);

        expect(screen.queryByText('Channel ID')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
    });
});

describe('ChannelSettingsPanel notification level', () => {
    // Each option holds a label line and a hint line; the levels read the label.
    const levels = () => screen.getAllByRole('radio').map(radio => radio.querySelectorAll('span')[0]?.textContent);

    it('offers mentions only in a channel', () => {
        renderPanel({ name: 'general', stereo: 'public', memberNo: 3 } as Partial<DomainChannel>);

        expect(levels()).toEqual(['All messages', 'Mentions only', 'Off']);
    });

    // The server delivers everything in a 1:1 whatever the level says, short of off.
    it('does not offer mentions only in a 1:1', () => {
        renderPanel({ stereo: 'dm', memberNo: 2 } as Partial<DomainChannel>);

        expect(levels()).toEqual(['All messages', 'Off']);
    });

    // Each level says what it does — "끔" answers whether @mentions get through.
    it('describes every level it offers', () => {
        renderPanel({ name: 'general', stereo: 'public', memberNo: 3 } as Partial<DomainChannel>);

        expect(screen.getByText('Notify for every message.')).toBeDefined();
        expect(screen.getByText('Notify only for messages that mention you.')).toBeDefined();
        expect(screen.getByText('Turn everything off, including @mentions.')).toBeDefined();
    });
});
