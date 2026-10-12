import { describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';

import type { ChannelMember } from '../hooks';

vi.mock('./MemberRow', () => ({
    MemberRow: ({ member }: { member: { id: string } }) => <span>{member.id}</span>,
}));

import '../../../../i18n';
import i18next from 'i18next';

import { MemberList } from './MemberList';

const member = (id: string): ChannelMember => ({ id, name: id, isOwner: false }) as ChannelMember;

const list = (props: Partial<Parameters<typeof MemberList>[0]> = {}) => (
    <MemberList
        members={[member('u1')]}
        isLoading={false}
        error={null}
        syncError={null}
        myUid="me"
        canKick={false}
        onKick={vi.fn()}
        {...props}
    />
);

describe('MemberList sync states', () => {
    it('shows the stale notice above the roster on a delta failure, without hiding it', () => {
        render(list({ syncError: new Error('offline') }));

        expect(screen.getByText('u1')).toBeTruthy();
        expect(screen.getByText(i18next.t('channels.members.stale'))).toBeTruthy();
    });

    it('retries the loads from the stale notice', () => {
        const onRetry = vi.fn();
        render(list({ syncError: new Error('offline'), onRetry }));

        fireEvent.click(screen.getByRole('button', { name: i18next.t('chat.retry') }));

        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('offers retry on a snapshot failure too', () => {
        const onRetry = vi.fn();
        render(list({ members: [], error: new Error('denied'), onRetry }));

        expect(screen.getByText(i18next.t('channels.members.failed'))).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: i18next.t('chat.retry') }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });
});
