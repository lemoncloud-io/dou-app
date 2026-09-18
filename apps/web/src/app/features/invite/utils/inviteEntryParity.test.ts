import { buildEncodedInviteEntryParams } from './buildEncodedInviteEntryParams';
import { buildInviteEntryParams } from './buildInviteEntryParams';

/**
 * The two link formats, `/s?code=…` and `/i?t=…`, are parsed by two functions on purpose. This file
 * pins the property that makes two functions safe: the same invite, carried either way, produces
 * the same invite-entry params. Everything downstream of here sees one shape and never learns which
 * link the user actually opened.
 *
 * If the formats ever drift apart, this is where it shows — before an invitee ends up on a
 * different server than the person who sent them the link.
 */

/** Encoded the way the server does, with Node's own base64url — not with the decoder under test. */
const token = (payload: Record<string, unknown>): string => Buffer.from(JSON.stringify(payload)).toString('base64url');

/** Params are order-insensitive here; sorted pairs are what "the same params" means. */
const pairs = (params: URLSearchParams): string[] => [...params.entries()].map(([k, v]) => `${k}=${v}`).sort();

const CODE = 'invt:1000072-2:e3faf0d0';

describe('/s와 /i는 같은 초대 진입 파라미터를 낸다', () => {
    it('클라우드 초대 — api+stage와 {c,a,s}가 같은 _backend로 모인다', () => {
        const fromShare = buildInviteEntryParams(`?code=${encodeURIComponent(CODE)}&api=uzjpiaey7a&stage=dev`);
        const fromEncoded = buildEncodedInviteEntryParams(`?t=${token({ c: CODE, a: 'uzjpiaey7a', s: 'dev' })}`);

        expect(pairs(fromEncoded)).toEqual(pairs(fromShare));
        expect(fromEncoded.get('_backend')).toBe('https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev');
    });

    it('릴레이 초대 — relay 플래그와 {c,r:1}이 같은 relay=1로 모인다', () => {
        const fromShare = buildInviteEntryParams(`?code=${encodeURIComponent(CODE)}&relay`);
        const fromEncoded = buildEncodedInviteEntryParams(`?t=${token({ c: CODE, r: 1 })}`);

        expect(pairs(fromEncoded)).toEqual(pairs(fromShare));
        expect(fromEncoded.get('relay')).toBe('1');
    });

    it('이미 조립된 backend를 든 /s와 좌표를 든 /i가 같은 주소로 모인다', () => {
        const backend = 'https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev';
        const fromShare = buildInviteEntryParams(
            `?code=${encodeURIComponent(CODE)}&backend=${encodeURIComponent(backend)}`
        );
        const fromEncoded = buildEncodedInviteEntryParams(`?t=${token({ c: CODE, a: 'uzjpiaey7a', s: 'dev' })}`);

        expect(pairs(fromEncoded)).toEqual(pairs(fromShare));
    });

    it('초대와 무관한 파라미터도 양쪽이 똑같이 실어 나른다', () => {
        const fromShare = buildInviteEntryParams(`?code=${encodeURIComponent(CODE)}&relay&utm_source=kakao&ref=abc`);
        const fromEncoded = buildEncodedInviteEntryParams(`?t=${token({ c: CODE, r: 1 })}&utm_source=kakao&ref=abc`);

        expect(pairs(fromEncoded)).toEqual(pairs(fromShare));
    });

    // The one place the two formats are MEANT to disagree, and the reason they are separate paths.
    // A `/s` link with no address is relay by convention — the relay server has none to carry. The
    // same convention applied to `/i` would be a guess: the payload states relay in `r`, so its
    // absence means a cloud invite whose coordinates went missing, and routing that to the relay
    // server would send the invitee somewhere the invite does not exist.
    it('좌표 없는 payload는 /s의 code-only와 달리 relay가 아니다', () => {
        const fromShare = buildInviteEntryParams(`?code=${encodeURIComponent(CODE)}`);
        const fromEncoded = buildEncodedInviteEntryParams(`?t=${token({ c: CODE })}`);

        expect(fromShare.get('relay')).toBe('1');
        expect(fromEncoded.has('relay')).toBe(false);
        expect(fromEncoded.has('_backend')).toBe(false);
        // What they still agree on: the invite itself.
        expect(fromEncoded.get('code')).toBe(fromShare.get('code'));
        expect(fromEncoded.get('provider')).toBe('invite');
        expect(fromEncoded.get('version')).toBe('2');
    });
});
