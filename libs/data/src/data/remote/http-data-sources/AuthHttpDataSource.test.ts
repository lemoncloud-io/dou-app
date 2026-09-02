import { AuthHttpDataSource } from './AuthHttpDataSource';
import type { AuthHttpDomainGateway } from '../gateways';
import type { DataContext } from '../../repositories-v2/types';

describe('AuthHttpDataSource', () => {
    const context: DataContext = { cid: 'cloud-a', uid: 'me' };
    let gateway: jest.Mocked<AuthHttpDomainGateway>;
    let dataSource: AuthHttpDataSource;

    beforeEach(() => {
        gateway = {
            registerUser: jest.fn(),
            registerUserV2: jest.fn(),
            findAlias: jest.fn(),
            verifyAlias: jest.fn(),
            loginInvite: jest.fn(),
            inviteInfo: jest.fn(),
        };
        dataSource = new AuthHttpDataSource(gateway);
    });

    it('registerUser — maps the UserView response to DomainUser', async () => {
        gateway.registerUser.mockResolvedValue({ id: 'u1', name: 'Alice' } as any);

        const result = await dataSource.registerUser({ name: 'Alice' } as never, context);

        expect(gateway.registerUser).toHaveBeenCalledWith({ name: 'Alice' });
        expect(result).toMatchObject({ id: 'u1', name: 'Alice', cid: 'cloud-a' });
    });

    it('registerUserV2 — forwards the email flag and maps to domain', async () => {
        gateway.registerUserV2.mockResolvedValue({ id: 'u2' } as any);

        await dataSource.registerUserV2({} as never, true, context);

        expect(gateway.registerUserV2).toHaveBeenCalledWith({}, true);
    });

    it('findAlias / verifyAlias — no domain mapping, passthrough', async () => {
        gateway.findAlias.mockResolvedValue({ hasUser: true });
        gateway.verifyAlias.mockResolvedValue({});

        await expect(dataSource.findAlias({ type: 'email', alias: 'a@b.com' })).resolves.toEqual({ hasUser: true });
        await expect(
            dataSource.verifyAlias({ type: 'email', mode: 'find', step: 'send', alias: 'a@b.com' })
        ).resolves.toEqual({});
    });

    // 로그인이라 매핑하지 않는다 — `Token`과 `cloudId`가 그대로 나가야 초대 수락 흐름이 쓴다.
    it('loginWithInviteCode — passthrough, no domain mapping (세션 재료)', async () => {
        const view = { id: 'u3', name: 'Invited', cloudId: 'acct-9', Token: { identityToken: 'jwt' } };
        gateway.loginInvite.mockResolvedValue(view as any);

        const result = await dataSource.loginWithInviteCode({ code: 'invt:1:abc', delegatorId: 'u1' });

        expect(gateway.loginInvite).toHaveBeenCalledWith({ code: 'invt:1:abc', delegatorId: 'u1' });
        expect(result).toBe(view);
    });

    it('fetchInviteInfo — passthrough, no domain mapping (not user-shaped)', async () => {
        gateway.inviteInfo.mockResolvedValue({ id: 'invite-1' } as any);

        const result = await dataSource.fetchInviteInfo({ code: 'invt:1:abc', backend: 'https://target.test' });

        expect(gateway.inviteInfo).toHaveBeenCalledWith({ code: 'invt:1:abc', backend: 'https://target.test' });
        expect(result).toEqual({ id: 'invite-1' });
    });
});
