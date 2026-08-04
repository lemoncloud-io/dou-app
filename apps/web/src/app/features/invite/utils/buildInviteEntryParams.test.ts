import { buildInviteEntryParams } from './buildInviteEntryParams';

describe('buildInviteEntryParams', () => {
    it('cloud 폼(api+stage)에서 _backend를 조립한다', () => {
        const params = buildInviteEntryParams('?code=invt%3A910432%3Aabc&api=uzjpiaey7a&stage=dev');

        expect(params.get('code')).toBe('invt:910432:abc');
        expect(params.get('provider')).toBe('invite');
        expect(params.get('version')).toBe('2');
        expect(params.get('_backend')).toBe('https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev');
        expect(params.has('relay')).toBe(false);
    });

    it('완성된 backend 파라미터를 그대로 쓰고 api/stage보다 우선한다', () => {
        expect(buildInviteEntryParams('?code=c&backend=https%3A%2F%2Fapi.example.com%2Fdev').get('_backend')).toBe(
            'https://api.example.com/dev'
        );
        expect(
            buildInviteEntryParams('?code=c&api=x&stage=dev&backend=https%3A%2F%2Fapi.example.com%2Fdev').get(
                '_backend'
            )
        ).toBe('https://api.example.com/dev');
    });

    it('relay 플래그가 있으면 relay=1을 붙이고 _backend는 넣지 않는다', () => {
        // A bare `&relay` reads as an empty string, so presence — not truthiness — is the discriminator.
        for (const search of ['?code=c&relay', '?code=c&relay=', '?relay&code=c']) {
            const params = buildInviteEntryParams(search);
            expect(params.get('relay')).toBe('1');
            expect(params.has('_backend')).toBe(false);
        }
    });

    it('주소 파라미터가 하나도 없는 code-only 링크도 릴레이로 판정한다', () => {
        // The relay server carries no api/stage/backend, so absence of an address IS the relay signal.
        const params = buildInviteEntryParams('?code=invt%3A1000072-2%3Ae3faf0d0');

        expect(params.get('code')).toBe('invt:1000072-2:e3faf0d0');
        expect(params.get('relay')).toBe('1');
        expect(params.has('_backend')).toBe(false);
    });

    it('선행 ? 가 없어도 동일하게 파싱한다', () => {
        expect(buildInviteEntryParams('code=c').get('relay')).toBe('1');
    });

    it('소비하지 않은 파라미터(utm 등)는 그대로 전달한다', () => {
        const params = buildInviteEntryParams('?code=c&utm_source=kakao&ref=friend');

        expect(params.get('utm_source')).toBe('kakao');
        expect(params.get('ref')).toBe('friend');
        // utm 파라미터가 있어도 주소 파라미터는 아니므로 여전히 릴레이다.
        expect(params.get('relay')).toBe('1');
    });

    it('code가 없거나 클라우드 주소가 반쪽이면 에러를 던진다', () => {
        expect(() => buildInviteEntryParams('?api=x&stage=dev')).toThrow('code');
        expect(() => buildInviteEntryParams('?relay')).toThrow('code');
        // 반쪽 주소는 깨진 클라우드 링크지, 릴레이 링크가 아니다 — 조용히 릴레이로 넘기지 않는다.
        expect(() => buildInviteEntryParams('?code=c&stage=dev')).toThrow('api 또는 backend');
        expect(() => buildInviteEntryParams('?code=c&api=x')).toThrow('stage');
    });
});
