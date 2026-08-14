import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import { toCacheInviteView } from './inviteCacheView';

const SCOPE = { cid: 'default', uid: 'u1' };

const makeServerView = (overrides: Partial<MyInviteView> = {}): MyInviteView & Record<string, unknown> => ({
    id: 'invite-1',
    name: '홍길동',
    state: 'pending',
    channelId: 'ch-1',
    cloudId: 'cloud-1',
    cloudName: '내 클라우드',
    inviterId: 'inviter-1',
    mid: 'mid-1',
    last4: '1234',
    expiredAt: 999,
    canceledAt: undefined,
    rejectedAt: undefined,
    createdAt: 100,
    updatedAt: 200,
    // Credential / internal fields that must never survive the mapper.
    code: 'secret-code',
    deeplink: 'https://example.com/s?code=secret-code',
    phone: '+821012345678',
    hashPhone: 'hash-value',
    // A field the type doesn't even declare — simulates a future backend addition.
    somethingBrandNew: 'should never appear',
    ...overrides,
});

describe('toCacheInviteView', () => {
    it('결과 키 집합이 허용 목록과 정확히 일치해야 한다 (credential/미지 필드 유입 차단)', () => {
        const result = toCacheInviteView(makeServerView(), SCOPE);

        expect(Object.keys(result).sort()).toEqual(
            [
                'id',
                'cid',
                'uid',
                'name',
                'state',
                'channelId',
                'cloudId',
                'cloudName',
                'inviterId',
                'mid',
                'last4',
                'expiredAt',
                'canceledAt',
                'rejectedAt',
                'createdAt',
                'updatedAt',
            ].sort()
        );
    });

    it('code/deeplink/phone/hashPhone은 절대 결과에 나타나지 않아야 한다', () => {
        const result = toCacheInviteView(makeServerView(), SCOPE) as Record<string, unknown>;

        expect(result).not.toHaveProperty('code');
        expect(result).not.toHaveProperty('deeplink');
        expect(result).not.toHaveProperty('phone');
        expect(result).not.toHaveProperty('hashPhone');
    });

    it('타입에 없는 여분 필드도 통과하지 못해야 한다', () => {
        const result = toCacheInviteView(makeServerView(), SCOPE) as Record<string, unknown>;

        expect(result).not.toHaveProperty('somethingBrandNew');
    });

    it('스코프(cid, uid)를 그대로 찍어야 한다', () => {
        const result = toCacheInviteView(makeServerView(), { cid: 'default', uid: 'u2' });

        expect(result.cid).toBe('default');
        expect(result.uid).toBe('u2');
    });

    it('id가 없는 뷰는 빈 문자열로 떨어진다', () => {
        const result = toCacheInviteView(makeServerView({ id: undefined }), SCOPE);

        expect(result.id).toBe('');
    });

    it('허용된 필드 값은 그대로 옮겨야 한다', () => {
        const view = makeServerView({ state: 'rejected', last4: '5678' });

        const result = toCacheInviteView(view, SCOPE);

        expect(result.state).toBe('rejected');
        expect(result.last4).toBe('5678');
        expect(result.channelId).toBe('ch-1');
        expect(result.expiredAt).toBe(999);
    });
});
