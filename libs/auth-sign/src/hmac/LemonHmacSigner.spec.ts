import { LemonHmacSigner } from './LemonHmacSigner';
import { calcSignature as lemonCalcSignature } from '@lemoncloud/lemon-web-core';

import type { SignaturePayload } from '../contracts';

const signer = new LemonHmacSigner();

const RELAY_PAYLOAD: SignaturePayload = {
    authId: 'auth-relay-id', // $auth.id 역할 — relay 소켓은 이 키를 쓴다(signing.md §1)
    accountId: 'account-relay-1',
    identityId: 'identity-relay-1',
    identityToken: '',
};

const CLOUD_PAYLOAD: SignaturePayload = {
    authId: 'token-authid-cloud-1', // Token.authId 역할 — cloud 소켓/HTTP refresh는 이 키를 쓴다
    accountId: 'account-cloud-1',
    identityId: 'identity-cloud-1',
    identityToken: '',
};

const FIXTURE_CURRENT = '2026-08-27T00:00:00.000Z';
const FIXTURE_UA = 'fixture-ua/1.0';

// 고정 리터럴은 node crypto(HMAC-SHA256/base64)로 독립 재계산해 검증했다 — 이 파일의
// 구현이나 lemon-web-core 어느 쪽도 신뢰 기준으로 쓰지 않았다.
describe('LemonHmacSigner — relay/cloud fixture (ADR-0070 §감수하는 것, 3단계 최우선 테스트)', () => {
    it('relay 재료로 고정된 서명 문자열을 만든다', () => {
        const result = signer.sign(RELAY_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });

        expect(result.current).toBe(FIXTURE_CURRENT);
        expect(result.signature).toBe('lfOFYzXFM4hYKhCfPuDb/0INNosD42VRotuv4VvcTBs=');
    });

    it('cloud 재료로 고정된 서명 문자열을 만든다 — relay와 다른 authId 선택이 다른 서명을 낸다', () => {
        const result = signer.sign(CLOUD_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });

        expect(result.current).toBe(FIXTURE_CURRENT);
        expect(result.signature).toBe('t5omyhdwmHFMsBfEhZLGcJkFUl2bABmTe8IYCjHhNL0=');
    });

    it('identityToken 슬롯은 식 불변이다 — 값을 바꿔도 서명이 동일하다', () => {
        const withEmpty = signer.sign(RELAY_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });
        const withValue = signer.sign(
            { ...RELAY_PAYLOAD, identityToken: 'any-token' },
            { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA }
        );

        expect(withValue.signature).toBe(withEmpty.signature);
    });

    it('current를 1글자만 바꿔도 서명이 달라진다', () => {
        const a = signer.sign(RELAY_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });
        const b = signer.sign(RELAY_PAYLOAD, { current: '2026-08-27T00:00:00.001Z', userAgent: FIXTURE_UA });

        expect(b.signature).not.toBe(a.signature);
    });

    it('userAgent를 바꿔도 서명이 달라진다', () => {
        const a = signer.sign(RELAY_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });
        const b = signer.sign(RELAY_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: 'fixture-ua/2.0' });

        expect(b.signature).not.toBe(a.signature);
    });

    it('authId만 바꿔도 서명이 달라진다 — kind별 authId 선택이 실제로 결과를 가른다', () => {
        const relay = signer.sign(RELAY_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });
        const cloud = signer.sign(CLOUD_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });

        expect(relay.signature).not.toBe(cloud.signature);
    });
});

describe('LemonHmacSigner — lemon-web-core 동등성 (이관이 "식 보존"이라는 증거)', () => {
    // lemon 판은 두 번째/세 번째 인자에 기본값(new Date/navigator.userAgent)이 있어 node 환경에서
    // 인자를 명시하지 않으면 throw한다 — 반드시 명시해서 비교한다.
    it('relay 재료에 대해 lemon-web-core의 calcSignature와 같은 결과를 낸다', () => {
        const ours = signer.sign(RELAY_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });
        const theirs = lemonCalcSignature(RELAY_PAYLOAD, FIXTURE_CURRENT, FIXTURE_UA);

        expect(ours.signature).toBe(theirs);
    });

    it('cloud 재료에 대해서도 동일하다', () => {
        const ours = signer.sign(CLOUD_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });
        const theirs = lemonCalcSignature(CLOUD_PAYLOAD, FIXTURE_CURRENT, FIXTURE_UA);

        expect(ours.signature).toBe(theirs);
    });

    it('identityToken 값이 있어도 lemon 쪽도 동일하게 무시한다', () => {
        const payloadWithToken = { ...RELAY_PAYLOAD, identityToken: 'any-token' };
        const ours = signer.sign(payloadWithToken, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA });
        const theirs = lemonCalcSignature(payloadWithToken, FIXTURE_CURRENT, FIXTURE_UA);

        expect(ours.signature).toBe(theirs);
    });
});

describe('LemonHmacSigner — 전역 무접근', () => {
    it('navigator 전역이 없어도(node 환경) 동작한다 — 기본값 제거의 증거', () => {
        expect(typeof navigator).toBe('undefined');
        expect(() => signer.sign(RELAY_PAYLOAD, { current: FIXTURE_CURRENT, userAgent: FIXTURE_UA })).not.toThrow();
    });
});
