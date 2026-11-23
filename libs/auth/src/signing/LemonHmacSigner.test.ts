import { LemonHmacSigner } from './LemonHmacSigner';

import type { SignaturePayload } from './contracts';

const signer = new LemonHmacSigner();

const RELAY_PAYLOAD: SignaturePayload = {
    authId: 'auth-relay-id',
    accountId: 'account-relay-1',
    identityId: 'identity-relay-1',
};

const CLOUD_PAYLOAD: SignaturePayload = {
    authId: 'token-authid-cloud-1',
    accountId: 'account-cloud-1',
    identityId: 'identity-cloud-1',
};

const FIXTURE_CURRENT = '2026-08-27T00:00:00.000Z';
const FIXTURE_UA = 'fixture-ua/1.0';
const RELAY_SIGNATURE = 'lfOFYzXFM4hYKhCfPuDb/0INNosD42VRotuv4VvcTBs=';

describe('LemonHmacSigner — fixed signatures', () => {
    it('produces the fixed signature for relay material', () => {
        const result = signer.sign(RELAY_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });

        expect(result.current).toBe(FIXTURE_CURRENT);
        expect(result.signature).toBe(RELAY_SIGNATURE);
    });

    it('produces a different signature for cloud material, because the authId differs', () => {
        const result = signer.sign(CLOUD_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });

        expect(result.current).toBe(FIXTURE_CURRENT);
        expect(result.signature).toBe('t5omyhdwmHFMsBfEhZLGcJkFUl2bABmTe8IYCjHhNL0=');
    });

    it('changes the signature when a single character of current changes', () => {
        const a = signer.sign(RELAY_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });
        const b = signer.sign(RELAY_PAYLOAD, { current: '2026-08-27T00:00:00.001Z', userAgent: FIXTURE_UA });

        expect(b.signature).not.toBe(a.signature);
    });

    it('changes the signature when userAgent changes', () => {
        const a = signer.sign(RELAY_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });
        const b = signer.sign(RELAY_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: 'fixture-ua/2.0' });

        expect(b.signature).not.toBe(a.signature);
    });

    it('changes the signature when only authId changes', () => {
        const relay = signer.sign(RELAY_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });
        const cloud = signer.sign(CLOUD_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });

        expect(relay.signature).not.toBe(cloud.signature);
    });
});
