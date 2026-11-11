import { RELAY_SLOT, kindOf, slotKeyOf } from './slotKey';

describe('slot keys', () => {
    it('keys a slot by the cloud it serves, with the relay under the cid the cache uses for it', () => {
        expect(RELAY_SLOT).toBe('default');
        expect(slotKeyOf('cloud-1')).toBe('cloud-1');
    });

    it('derives the server kind from the key alone', () => {
        expect(kindOf(RELAY_SLOT)).toBe('relay');
        expect(kindOf(slotKeyOf('cloud-1'))).toBe('cloud');
    });

    it.each(['relay', 'cloud', ''])('rejects %j — a legacy slot word or no cid at all is not a cloud id', value => {
        expect(() => slotKeyOf(value)).toThrow('is not a cloud id');
    });
});
