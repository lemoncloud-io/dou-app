import { peerCloudNameOf, pickDmPeerId } from './dmPeer';

describe('pickDmPeerId', () => {
    it('picks the roster member that is not me', () => {
        expect(pickDmPeerId(['me', 'peer'], 'me')).toBe('peer');
    });

    it('picks nobody while my own id is unknown', () => {
        expect(pickDmPeerId(['me', 'peer'], null)).toBeUndefined();
    });
});

describe('peerCloudNameOf', () => {
    it('reads nick before name, the order the room names a member in', () => {
        expect(peerCloudNameOf({ nick: '토끼', name: '임마' }, '1000007')).toBe('토끼');
        expect(peerCloudNameOf({ name: '임마' }, '1000007')).toBe('임마');
    });

    it('trims, and skips a blank nick for the name', () => {
        expect(peerCloudNameOf({ nick: '   ', name: ' 임마 ' }, '1000007')).toBe('임마');
    });

    // The server makes these up for an account; none of them is a name anybody chose.
    it('rejects the names the server generates for an account', () => {
        expect(peerCloudNameOf({ name: '1000007' }, '1000007')).toBeUndefined();
        expect(peerCloudNameOf({ name: 'f7fa3ac3-50e9-425c-b8d5-a6214b9dee50' }, '1000007')).toBeUndefined();
        expect(peerCloudNameOf({ name: 'User_0101' }, '1000007')).toBeUndefined();
        expect(peerCloudNameOf({ name: '***0101' }, '1000007')).toBeUndefined();
    });

    it('falls past a generated nick to a real name', () => {
        expect(peerCloudNameOf({ nick: 'User_0101', name: '임마' }, '1000007')).toBe('임마');
    });

    it('gives nothing for a missing record', () => {
        expect(peerCloudNameOf(null, '1000007')).toBeUndefined();
        expect(peerCloudNameOf(undefined, '1000007')).toBeUndefined();
    });
});
