import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import { toCacheInviteView } from './inviteCacheView';

const SCOPE = { cid: 'default', uid: 'u1' };

const makeServerView = (overrides: Partial<MyInviteView> = {}): MyInviteView & Record<string, unknown> => ({
    id: 'invite-1',
    name: 'Hong Gildong',
    state: 'pending',
    channelId: 'ch-1',
    cloudId: 'cloud-1',
    cloudName: 'My Cloud',
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
    it('the key set of the result must match the allowlist exactly (blocking credentials and unknown fields)', () => {
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

    it('code/deeplink/phone/hashPhone must never appear in the result', () => {
        const result = toCacheInviteView(makeServerView(), SCOPE) as Record<string, unknown>;

        expect(result).not.toHaveProperty('code');
        expect(result).not.toHaveProperty('deeplink');
        expect(result).not.toHaveProperty('phone');
        expect(result).not.toHaveProperty('hashPhone');
    });

    it('extra fields absent from the type must not pass either', () => {
        const result = toCacheInviteView(makeServerView(), SCOPE) as Record<string, unknown>;

        expect(result).not.toHaveProperty('somethingBrandNew');
    });

    it('the scope (cid, uid) must be stamped through', () => {
        const result = toCacheInviteView(makeServerView(), { cid: 'default', uid: 'u2' });

        expect(result.cid).toBe('default');
        expect(result.uid).toBe('u2');
    });

    it('a view with no id falls to an empty string', () => {
        const result = toCacheInviteView(makeServerView({ id: undefined }), SCOPE);

        expect(result.id).toBe('');
    });

    it('allowed field values must carry over unchanged', () => {
        const view = makeServerView({ state: 'rejected', last4: '5678' });

        const result = toCacheInviteView(view, SCOPE);

        expect(result.state).toBe('rejected');
        expect(result.last4).toBe('5678');
        expect(result.channelId).toBe('ch-1');
        expect(result.expiredAt).toBe(999);
    });
});
