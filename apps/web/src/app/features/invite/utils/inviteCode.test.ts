import { composeInviteCode } from './inviteCode';

describe('composeInviteCode', () => {
    it('id와 code가 모두 있으면 invt:<id>:<code>로 조립한다', () => {
        expect(composeInviteCode({ id: '910001-3', code: '3f9a8b' })).toBe('invt:910001-3:3f9a8b');
    });

    it.each([
        ['id 없음', { code: '3f9a8b' }],
        ['code 없음', { id: '910001-3' }],
        ['둘 다 없음', {}],
        ['빈 문자열', { id: '', code: '' }],
    ])('%s이면 undefined — 반쪽 코드로 호출하지 않는다', (_label, invite) => {
        expect(composeInviteCode(invite as never)).toBeUndefined();
    });
});
