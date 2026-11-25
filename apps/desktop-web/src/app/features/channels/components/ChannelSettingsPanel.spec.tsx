import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DomainChannel } from '@chatic/runtime-react';

vi.mock('../../../shared', async importOriginal => ({
    ...(await importOriginal<object>()),
}));

vi.mock('../../../shared/hooks/useChannelMutations', () => ({
    useDesktopChannelMutations: () => ({ setChannelNotify: vi.fn(), updateChannel: vi.fn(), isMutating: false }),
}));

vi.mock('../hooks', () => ({
    useChannelActions: () => ({ openDialog: vi.fn(), openKick: vi.fn(), kickTarget: null }),
}));

vi.mock('./ChannelWebhooksSection', () => ({ ChannelWebhooksSection: () => <div>webhooks-section</div> }));

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
    const levels = () => screen.getAllByRole('radio').map(radio => radio.textContent);

    it('offers mentions only in a channel', () => {
        renderPanel({ name: 'general', stereo: 'public', memberNo: 3 } as Partial<DomainChannel>);

        expect(levels()).toEqual(['All messages', 'Mentions only', 'Off']);
    });

    it('does not offer mentions only in a 1:1', () => {
        renderPanel({ stereo: 'dm', memberNo: 2 } as Partial<DomainChannel>);

        expect(levels()).toEqual(['All messages', 'Off']);
    });
});

describe('ChannelSettingsPanel webhooks', () => {
    const owned = { name: 'general', stereo: 'public', memberNo: 3, ownerId: 'me' } as Partial<DomainChannel>;

    it('shows the webhook section to the owner of a group channel', () => {
        renderPanel(owned);

        expect(screen.getByText('webhooks-section')).toBeDefined();
    });

    it('hides it from a member who is not the owner', () => {
        renderPanel({ ...owned, ownerId: 'someone-else' });

        expect(screen.queryByText('webhooks-section')).toBeNull();
    });

    it.each([
        ['a 1:1', { stereo: 'dm', memberNo: 2, ownerId: 'me' }],
        ['my self channel', { stereo: 'self', memberNo: 1, ownerId: 'me' }],
    ])('hides it in %s even for the owner', (_kind, channel) => {
        renderPanel(channel as Partial<DomainChannel>);

        expect(screen.queryByText('webhooks-section')).toBeNull();
    });
});
