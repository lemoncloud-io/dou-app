import { describe, expect, it } from 'vitest';

import type { DomainChannel } from '@chatic/data';

import { isChannelOwner } from './isChannelOwner';

const channel = (ownerId?: string): DomainChannel => ({ ownerId }) as DomainChannel;

describe('isChannelOwner', () => {
    it('is true when my id is the channel owner', () => {
        expect(isChannelOwner(channel('u1'), 'u1')).toBe(true);
    });

    it('is false for a different member', () => {
        expect(isChannelOwner(channel('u1'), 'u2')).toBe(false);
    });

    it('is false without a channel', () => {
        expect(isChannelOwner(undefined, 'u1')).toBe(false);
    });

    it('is false without my id', () => {
        expect(isChannelOwner(channel('u1'), null)).toBe(false);
        expect(isChannelOwner(channel('u1'), '')).toBe(false);
    });

    it('is false when the channel names no owner', () => {
        expect(isChannelOwner(channel(undefined), 'u1')).toBe(false);
    });
});
