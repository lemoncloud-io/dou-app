import { renderHook } from '@testing-library/react';

import { useSenderProfiles } from '../../../hooks/useSenderProfiles';
import type { NotificationItem } from '../../../utils/notifications';
import { useNotificationAvatars } from './useNotificationAvatars';

jest.mock('../../../hooks/useSenderProfiles', () => ({ useSenderProfiles: jest.fn() }));

const item = (over: Partial<NotificationItem>): NotificationItem => ({
    id: over.id ?? 'x',
    cloudId: 'c',
    channelId: 'ch',
    kind: 'mention',
    ownerName: 'Sis',
    content: 'hi',
    createdAt: 0,
    read: false,
    ...over,
});

describe('useNotificationAvatars', () => {
    beforeEach(() => {
        (useSenderProfiles as jest.Mock).mockReturnValue(
            new Map([
                ['s1@u1', { thumbnail: 'https://img.example/u1.png' }],
                ['s1@u2', { thumbnail: '' }],
            ])
        );
    });

    it('asks for the author of every item that has a place and an author, in that place', () => {
        const items = [
            item({ id: 'a', placeId: 's1', ownerId: 'u1' }),
            item({ id: 'b', ownerId: 'u1' }),
            item({ id: 'c', placeId: 's1' }),
        ];
        renderHook(() => useNotificationAvatars(items));

        expect(useSenderProfiles).toHaveBeenLastCalledWith([{ sid: 's1', userId: 'u1' }]);
    });

    it("returns the author's photo, and nothing without a profile, a photo or a place", () => {
        const items = [
            item({ id: 'a', placeId: 's1', ownerId: 'u1' }),
            item({ id: 'b', placeId: 's1', ownerId: 'u2' }),
            item({ id: 'c', placeId: 's1', ownerId: 'u3' }),
            item({ id: 'd', ownerId: 'u1' }),
        ];
        const { result } = renderHook(() => useNotificationAvatars(items));

        expect(items.map(result.current)).toEqual(['https://img.example/u1.png', undefined, undefined, undefined]);
    });
});
