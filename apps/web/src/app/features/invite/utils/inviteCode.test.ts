import { composeInviteCode, resolveInviteCode } from './inviteCode';

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

describe('resolveInviteCode', () => {
    it('현재 목록에 코드가 있으면 재조회 없이 바로 조립한다', async () => {
        const refetch = jest.fn();

        const code = await resolveInviteCode([{ id: 'i1', code: 'secret' }], refetch, 'i1');

        expect(code).toBe('invt:i1:secret');
        expect(refetch).not.toHaveBeenCalled();
    });

    it('캐시 전용 행(코드 없음)이면 재조회 후 새 응답에서 코드를 조립한다', async () => {
        const refetch = jest.fn().mockResolvedValue({ data: [{ id: 'i1', code: 'fresh-secret' }] });

        const code = await resolveInviteCode([{ id: 'i1' }], refetch, 'i1');

        expect(refetch).toHaveBeenCalledTimes(1);
        expect(code).toBe('invt:i1:fresh-secret');
    });

    it('행 자체가 없으면 재조회 후 시도한다', async () => {
        const refetch = jest.fn().mockResolvedValue({ data: [{ id: 'i1', code: 'fresh-secret' }] });

        const code = await resolveInviteCode([], refetch, 'i1');

        expect(refetch).toHaveBeenCalledTimes(1);
        expect(code).toBe('invt:i1:fresh-secret');
    });

    it('재조회해도 코드를 못 얻으면 undefined를 반환한다', async () => {
        const refetch = jest.fn().mockResolvedValue({ data: [] });

        const code = await resolveInviteCode([{ id: 'i1' }], refetch, 'i1');

        expect(code).toBeUndefined();
    });

    it('재조회 응답에 data가 없어도 던지지 않고 undefined를 반환한다', async () => {
        const refetch = jest.fn().mockResolvedValue({});

        const code = await resolveInviteCode([{ id: 'i1' }], refetch, 'i1');

        expect(code).toBeUndefined();
    });
});
