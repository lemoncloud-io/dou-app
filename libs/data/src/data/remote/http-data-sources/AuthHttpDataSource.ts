import type {
    CloudDelegationTokenView,
    LoginUserBody,
    MyInviteView,
    RegisterUserV2Body,
    UserBody,
    UserTokenView,
} from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import type { FindAliasBody, FindAliasView, VerifyAliasBody, VerifyAliasView } from '@chatic/http';
import type { DomainUser } from '../../domain';
import type { DataContext } from '../../repositories-v2/types';
import type { AuthHttpDomainGateway } from '../gateways';
import { toDomainUserFromHttp } from './httpUserMapping';

export interface IAuthHttpDataSource {
    registerUser(body: UserBody, context: DataContext): Promise<DomainUser>;
    registerUserV2(body: RegisterUserV2Body, email: boolean | undefined, context: DataContext): Promise<DomainUser>;
    findAlias(body: FindAliasBody): Promise<FindAliasView>;
    verifyAlias(body: VerifyAliasBody): Promise<VerifyAliasView>;
    /** 초대 코드 로그인 — 세션 재료다. `DomainUser`로 매핑하지 않는다: 매핑이 `Token`과
     * `cloudId`를 떨어뜨리는데, 호출부(초대 수락 흐름)가 바로 그 둘을 쓴다. */
    loginWithInviteCode(input: { code: string; delegatorId: string; backend?: string }): Promise<UserTokenView>;
    fetchInviteInfo(input: { code: string; backend: string }): Promise<MyInviteView>;

    /**
     * Session-material commands. Their responses pass through RAW — no `DomainUser` mapping, because
     * mapping drops `Token` and `Token` is the whole point of calling them.
     *
     * `data` performs these; it does not interpret them. Same rule `confirmPhoneCode` already follows
     * on the socket lane: the caller (`session/auth`) is what installs a token.
     */
    registerDevice(deviceId: string): Promise<UserTokenView>;
    login(body: LoginUserBody, email?: boolean): Promise<UserTokenView>;
    verifyNativeToken(body: VerifyNativeTokenBody): Promise<UserTokenView>;
    exchangeCode(input: { provider: string; code: string }): Promise<UserTokenView>;
    delegateCloud(target: string): Promise<CloudDelegationTokenView>;
    exchangeToken(input: {
        baseURL: string;
        body: Parameters<AuthHttpDomainGateway['exchangeToken']>[0]['body'];
    }): Promise<UserTokenView>;
}

/**
 * Account/alias/invite command source. Single boundary where the wire's `UserView`-shaped register
 * responses become `DomainUser`; alias, invite-info and every session-material command pass their
 * view through unchanged. No local cache — these are one-shot commands, not something a repository
 * reads back.
 */
export class AuthHttpDataSource implements IAuthHttpDataSource {
    constructor(private readonly gateway: AuthHttpDomainGateway) {}

    async registerUser(body: UserBody, context: DataContext): Promise<DomainUser> {
        const view = await this.gateway.registerUser(body);
        return toDomainUserFromHttp(view, context);
    }

    async registerUserV2(
        body: RegisterUserV2Body,
        email: boolean | undefined,
        context: DataContext
    ): Promise<DomainUser> {
        const view = await this.gateway.registerUserV2(body, email);
        return toDomainUserFromHttp(view, context);
    }

    findAlias(body: FindAliasBody): Promise<FindAliasView> {
        return this.gateway.findAlias(body);
    }

    verifyAlias(body: VerifyAliasBody): Promise<VerifyAliasView> {
        return this.gateway.verifyAlias(body);
    }

    loginWithInviteCode(input: { code: string; delegatorId: string; backend?: string }): Promise<UserTokenView> {
        return this.gateway.loginInvite(input);
    }

    fetchInviteInfo(input: { code: string; backend: string }): Promise<MyInviteView> {
        return this.gateway.inviteInfo(input);
    }

    // --- session-material commands: perform, never interpret -------------------------------------

    registerDevice(deviceId: string): Promise<UserTokenView> {
        return this.gateway.registerDevice(deviceId);
    }

    login(body: LoginUserBody, email?: boolean): Promise<UserTokenView> {
        return this.gateway.login(body, email);
    }

    verifyNativeToken(body: VerifyNativeTokenBody): Promise<UserTokenView> {
        return this.gateway.verifyNativeToken(body);
    }

    exchangeCode(input: { provider: string; code: string }): Promise<UserTokenView> {
        return this.gateway.exchangeCode(input);
    }

    delegateCloud(target: string): Promise<CloudDelegationTokenView> {
        return this.gateway.delegateCloud(target);
    }

    exchangeToken(input: {
        baseURL: string;
        body: Parameters<AuthHttpDomainGateway['exchangeToken']>[0]['body'];
    }): Promise<UserTokenView> {
        return this.gateway.exchangeToken(input);
    }
}
