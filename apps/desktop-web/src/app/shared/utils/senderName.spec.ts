import { afterEach, describe, expect, it } from 'vitest';

import { usePlaceProfilesStore } from '../stores/usePlaceProfilesStore';
import { chatSenderName, senderNameIn } from './senderName';

afterEach(() => usePlaceProfilesStore.setState({ bySid: {} }));

describe('senderNameIn', () => {
    const profiles = { u1: { nick: 'Alice' } };

    it("names the sender by their place nick over the message's snapshot", () => {
        expect(senderNameIn({ ownerId: 'u1', owner$: { id: 'u1', name: 'Bob' } }, profiles)).toBe('Alice');
    });

    it('falls back to the snapshot when the place has no nick for the sender', () => {
        expect(senderNameIn({ ownerId: 'u2', owner$: { id: 'u2', name: 'Raine' } }, profiles)).toBe('Raine');
        expect(senderNameIn({ ownerId: 'u1', owner$: { id: 'u1', name: 'Raine' } }, { u1: { nick: ' ' } })).toBe(
            'Raine'
        );
    });

    it('never names a sender by a raw-id snapshot', () => {
        const uuid = 'f7fa3ac3-50e9-425c-b8d5-a6214b9dee50';
        expect(senderNameIn({ ownerId: 'u2', owner$: { id: 'u2', name: uuid } }, profiles)).toBe('');
    });

    // A webhook's owner id can collide with a person's; it must not borrow their nick.
    it('names a webhook by its post, never by a profile', () => {
        const chat = { ownerId: 'u1', owner$: { id: 'u1', name: 'CI bot' }, stereo: 'webhook' as const };
        expect(senderNameIn(chat, profiles)).toBe('CI bot');
    });
});

describe('senderNameIn for a message of mine', () => {
    const reader = { uid: 'acct-1', name: '', cloudUid: 'cloud-1' };

    // An optimistic message carries my account id; my profile row was synced under my cloud id.
    it('finds my nick under my cloud id for a message carrying my account id', () => {
        const chat = { ownerId: 'acct-1', owner$: { id: 'acct-1', name: 'Bob' } };
        expect(senderNameIn(chat, { 'cloud-1': { nick: 'Alice' } }, reader)).toBe('Alice');
    });

    it('finds my nick under my account id for a message carrying my cloud id', () => {
        const chat = { ownerId: 'cloud-1', owner$: { id: 'cloud-1', name: 'Bob' } };
        expect(senderNameIn(chat, { 'acct-1': { nick: 'Alice' } }, reader)).toBe('Alice');
    });

    it("does not lend my nick to someone else's message", () => {
        const chat = { ownerId: 'u2', owner$: { id: 'u2', name: 'Raine' } };
        expect(senderNameIn(chat, { 'cloud-1': { nick: 'Alice' } }, reader)).toBe('Raine');
    });
});

describe('chatSenderName', () => {
    it("reads the nick of the message's own place, not another's", () => {
        usePlaceProfilesStore.setState({ bySid: { S1: { u1: { nick: 'Alice' } }, S2: { u1: { nick: 'J' } } } });
        const chat = { ownerId: 'u1', owner$: { id: 'u1', name: 'Bob' } };
        expect(chatSenderName(chat, 'S2')).toBe('J');
        expect(chatSenderName(chat, undefined)).toBe('Bob');
    });
});
