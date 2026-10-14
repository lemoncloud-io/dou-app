import { describe, expect, it } from 'vitest';

import { renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

import '../../../../i18n';

import type { ChannelMember } from '../../channels';
import { useMentionables } from './useMentionables';

const member = (id: string, name: string) => ({ id, name, isOwner: false }) as ChannelMember;
const VIEWER = { uid: 'me', name: 'Aaron', cloudUid: 'me-cloud' };

describe('useMentionables', () => {
    // Enter picks the first row. Sorted by name alone, "Aaron" put me there, and a quick
    // "@" + Enter mentioned myself.
    it('lists me last, so the first suggestion is someone else', () => {
        const members = [member('u-2', 'Zoe'), member('me-cloud', 'Aaron'), member('u-1', 'Ben')];
        const { result } = renderHook(() => useMentionables(members, VIEWER));

        expect(result.current.map(m => m.name)).toEqual(['Ben', 'Zoe', 'Aaron']);
    });

    it('keeps plain name order when I am not in the roster', () => {
        const { result } = renderHook(() => useMentionables([member('u-2', 'Zoe'), member('u-1', 'Ben')], VIEWER));

        expect(result.current.map(m => m.name)).toEqual(['Ben', 'Zoe']);
    });

    // The same first row the phone's list has. Its name is the word written into the message.
    describe('the everyone row', () => {
        const members = [member('u-2', 'Zoe'), member('u-1', 'Ben')];
        const channel = (fields: Partial<DomainChannel>) => ({ id: 'C1', ...fields }) as DomainChannel; // only the fields that decide what kind of channel this is
        const rows = (fields: Partial<DomainChannel>) =>
            renderHook(() => useMentionables(members, VIEWER, channel(fields))).result.current;

        it('comes first in a channel of many', () => {
            expect(rows({ name: 'general', stereo: 'public' })[0]).toEqual({
                id: '@everyone',
                name: 'all',
                everyone: true,
                keywords: ['Everyone'],
            });
            expect(rows({ name: 'general', stereo: 'public' }).map(m => m.name)).toEqual(['all', 'Ben', 'Zoe']);
        });

        it.each([
            ['a 1:1', { stereo: 'dm' }],
            ['my Self Channel', { stereo: 'self' }],
        ] as const)('is not offered in %s', (_name, fields) => {
            expect(rows(fields).map(m => m.name)).toEqual(['Ben', 'Zoe']);
        });

        it('is not offered when the channel is not known', () => {
            const { result } = renderHook(() => useMentionables(members, VIEWER));
            expect(result.current.map(m => m.name)).toEqual(['Ben', 'Zoe']);
        });
    });
});
