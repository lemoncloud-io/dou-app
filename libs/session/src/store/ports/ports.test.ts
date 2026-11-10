/**
 * Which port each session key lands in, and that the names and value shapes did not move when the
 * stores were split over two ports. A key that drifts to the wrong port is silent — it still saves and
 * reads back — so the only place it shows is here.
 */
import { MemoryMedium } from '@chatic/storage';

import { cloudStore } from '../cloudStore';
import { identityStore } from '../identityStore';
import { isSessionKey, pairedCloudNamesSlot, pairedCloudsSlot, SESSION_KEYS, sessionMedia } from '.';
import { SessionMedia } from './sessionMedia';
import { relayStore } from '../relayStore';

const relayToken = { Token: { identityToken: 'relay-id' } } as never;
const cloudToken = {
    Token: { identityToken: 'cloud-id', credential: { Expiration: '2999-01-01T00:00:00Z' } },
} as never;
const delegation = { cloudId: 'c1', delegationToken: 'd', backend: 'https://b', wss: 'wss://w' } as never;

/** Every write a store can make, so both ports end up holding every key they own. */
const writeEverything = () => {
    relayStore.saveRelayToken(relayToken);
    relayStore.saveSelectedSiteId('relay-site');
    cloudStore.saveDelegationToken(delegation);
    cloudStore.saveCloudToken(cloudToken);
    cloudStore.setCachedCloudTokens('c1', { delegationToken: delegation, cloudToken });
    cloudStore.saveSelectedCloudId('c1');
    cloudStore.saveSelectedSiteId('place-1');
    cloudStore.setCloudIdentity('c1', { uid: 'u1' } as never);
    cloudStore.recordCloudUse('c1');
    cloudStore.setReclaimedFor('c1', 'relay-user');
    identityStore.setDelegatorId('deleg-1');
    identityStore.setDeviceId('device-1');
};

describe('session storage ports', () => {
    beforeEach(() => sessionStorage.clear());

    it('refuses to read or write either port until an entry point configures them, and names the fix', () => {
        // A fresh holder, not the shared one: other cases here configure that one.
        const unconfigured = new SessionMedia();

        expect(() => unconfigured.of('secret')).toThrow(/'secret'.*initAppRuntime/);
        expect(() => unconfigured.of('plain')).toThrow(/'plain'.*initAppRuntime/);
    });

    it('puts the credentials in the secret port and everything else in the plain port, under the same names', () => {
        const secret = new MemoryMedium();
        const plain = new MemoryMedium();
        sessionMedia.configure({ secret, plain });

        writeEverything();

        // The paired-cloud list, its names and the logout marker are written by `@chatic/auth`, so they
        // are checked there.
        const writtenByAuth: readonly string[] = [
            'chatic-paired-cloud-ids',
            'chatic-paired-cloud-names',
            'chatic-secret-logout-pending',
        ];
        const plainWrittenHere = SESSION_KEYS.plain.filter(key => !writtenByAuth.includes(key));
        expect(secret.keys().sort()).toEqual([...SESSION_KEYS.secret].sort());
        expect(plain.keys().sort()).toEqual([...plainWrittenHere].sort());

        // Value shapes: tokens stay JSON, selections and ids stay raw strings.
        expect(JSON.parse(secret.get('chatic-relay-token') ?? 'null')).toEqual(relayToken);
        expect(JSON.parse(secret.get('chatic-cloud-delegation-token') ?? 'null')).toEqual(delegation);
        expect(plain.get('chatic-selected-cloud-id')).toBe('c1');
        expect(plain.get('chatic-device-id')).toBe('device-1');
        expect(sessionStorage.length).toBe(0);
    });

    it('reads back through the configured media', () => {
        const secret = new MemoryMedium();
        const plain = new MemoryMedium();
        sessionMedia.configure({ secret, plain });
        secret.set('chatic-relay-token', JSON.stringify(relayToken));
        plain.set('chatic-device-id', 'from-plain');

        expect(relayStore.getRelayToken()).toEqual(relayToken);
        expect(identityStore.getDeviceId()).toBe('from-plain');
        expect(sessionMedia.of('secret')).toBe(secret);
    });

    it('hands out the paired-cloud key alone, in the plain port', () => {
        const secret = new MemoryMedium();
        const plain = new MemoryMedium();
        sessionMedia.configure({ secret, plain });

        pairedCloudsSlot.write('["c1"]');
        expect(plain.keys()).toEqual(['chatic-paired-cloud-ids']);
        expect(pairedCloudsSlot.read()).toBe('["c1"]');
        pairedCloudsSlot.clear();
        expect(plain.keys()).toEqual([]);
        expect(secret.keys()).toEqual([]);
    });

    it('hands out the paired-cloud names key alone, in the plain port', () => {
        const secret = new MemoryMedium();
        const plain = new MemoryMedium();
        sessionMedia.configure({ secret, plain });

        pairedCloudNamesSlot.write('{"c1":"Team"}');
        expect(plain.keys()).toEqual(['chatic-paired-cloud-names']);
        pairedCloudNamesSlot.clear();
        expect(plain.keys()).toEqual([]);
        expect(secret.keys()).toEqual([]);
    });

    it('recognises its own keys and nothing else', () => {
        expect(isSessionKey('chatic-cloud-token-cache')).toBe(true);
        expect(isSessionKey('chatic-paired-cloud-ids')).toBe(true);
        expect(isSessionKey('chatic-paired-cloud-names')).toBe(true);
        expect(isSessionKey('chatic-cloud-promo-dismissed-at')).toBe(false);
        expect(isSessionKey('@chatic.access_key_id')).toBe(false);
    });
});
