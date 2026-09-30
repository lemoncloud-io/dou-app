import { describe, expect, it } from 'vitest';

import { renderHook } from '@testing-library/react';

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
});
