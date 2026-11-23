import type {
    CloudDelegationTokenView,
    LoginUserBody,
    MyInviteView,
    RegisterUserV2Body,
    UserBody,
    UserTokenView,
} from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import type { FindAliasBody, FindAliasView, VerifyAliasBody, VerifyAliasView, VerifyOAuthCodeBody } from '@chatic/http';
import type { DomainUser } from '../../domain';
import type { DataContext } from '../../repositories/types';
import type { AuthHttpDomainGateway } from '../gateways';
import { toDomainUserFromHttp } from './httpUserMapping';
import type { AdminEndpointOptions } from './SubscriptionHttpDataSource';

export interface IAuthHttpDataSource {
    registerUser(body: UserBody, context: DataContext): Promise<DomainUser>;
    registerUserV2(
        body: RegisterUserV2Body,
        email: boolean | undefined,
        context: DataContext,
        opts?: AdminEndpointOptions
    ): Promise<DomainUser>;
    findAlias(body: FindAliasBody): Promise<FindAliasView>;
    verifyAlias(body: VerifyAliasBody): Promise<VerifyAliasView>;
    loginWithInviteCode(input: { code: string; delegatorId: string; backend?: string }): Promise<UserTokenView>;
    fetchInviteInfo(input: { code: string; backend: string }): Promise<MyInviteView>;

    registerDevice(deviceId: string): Promise<UserTokenView>;
    login(body: LoginUserBody, email?: boolean): Promise<UserTokenView>;
    verifyNativeToken(body: VerifyNativeTokenBody): Promise<UserTokenView>;
    exchangeCode(input: { provider: string; code: string }): Promise<UserTokenView>;
    verifyOAuthCode(body: VerifyOAuthCodeBody): Promise<UserTokenView>;
    delegateCloud(target: string): Promise<CloudDelegationTokenView>;
    exchangeToken(input: {
        baseURL: string;
        body: Parameters<AuthHttpDomainGateway['exchangeToken']>[0]['body'];
    }): Promise<UserTokenView>;
}

export class AuthHttpDataSource implements IAuthHttpDataSource {
    constructor(private readonly gateway: AuthHttpDomainGateway) {}

    async registerUser(body: UserBody, context: DataContext): Promise<DomainUser> {
        const view = await this.gateway.registerUser(body);
        return toDomainUserFromHttp(view, context);
    }

    async registerUserV2(
        body: RegisterUserV2Body,
        email: boolean | undefined,
        context: DataContext,
        opts?: AdminEndpointOptions
    ): Promise<DomainUser> {
        const view = await this.gateway.registerUserV2(body, email, opts);
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

    verifyOAuthCode(body: VerifyOAuthCodeBody): Promise<UserTokenView> {
        return this.gateway.verifyOAuthCode(body);
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
