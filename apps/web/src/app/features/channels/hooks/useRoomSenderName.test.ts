import { renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

import { useRoomSenderName } from './useRoomSenderName';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@chatic/runtime', () => ({
    runtime: { session: { useSessionSelection: () => ({ selectedSiteId: 's1' }) } },
}));
jest.mock('./useChannelJoins', () => ({ useChannelJoins: () => ({ joins: [], activeMemberIds: ['u1', 'u2'] }) }));
jest.mock('./useChannelMembers', () => ({
    useChannelMembers: () => ({ members: [{ id: 'u2', name: 'Member Name' }] }),
}));
jest.mock('./useChannelProfiles', () => ({
    useChannelProfiles: () => ({ profileMap: new Map([['u1', { nick: 'Place Nick' }]]) }),
}));

const channel = {
    id: 'ch-1',
    cid: 'c1',
    sid: 's1',
    stereo: 'group',
    memberIds: ['u1', 'u2'],
} as unknown as DomainChannel;

describe('useRoomSenderName', () => {
    it('names a sender the way the room does: place profile first, then the member, then the row', () => {
        const { result } = renderHook(() => useRoomSenderName(channel, 'me'));
        const nameOf = result.current;
        expect(nameOf({ ownerId: 'u1', owner$: { name: 'Old Snapshot' } })).toBe('Place Nick');
        expect(nameOf({ ownerId: 'u2' })).toBe('Member Name');
        expect(nameOf({ ownerId: 'u9', owner$: { name: 'Snapshot' } })).toBe('Snapshot');
    });

    it('never shows a bare id for an unresolved sender', () => {
        const { result } = renderHook(() => useRoomSenderName(channel, 'me'));
        expect(result.current({ ownerId: '3bcd6b4c-e985-4404-a0be-56aa' })).not.toBe('3bcd6b4c-e985-4404-a0be-56aa');
    });
});
