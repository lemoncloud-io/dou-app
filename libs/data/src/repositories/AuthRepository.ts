import type {
    CloudDelegationTokenView,
    LinkSentView,
    LinkVerifiedView,
    LinkedView,
    LoginUserBody,
    MyInviteView,
    RegisterUserV2Body,
    UserBody,
    UserTokenView,
} from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import type { FindAliasBody, FindAliasView, VerifyAliasBody, VerifyAliasView, VerifyOAuthCodeBody } from '@chatic/http';
import type { DomainUser } from '../domain';
import type {
    IAuthSocketDataSource,
    PhoneCodeConfirmResult,
    PhoneCodeProveOptions,
    PhoneCodeSendOptions,
    PhoneCodeVerifyResult,
    SocialAccountTokens,
} from '../remote/socket-data-sources';
import type { AdminEndpointOptions, IAuthHttpDataSource } from '../remote/http-data-sources';
import type { DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface IAuthRepository extends DisposableRepository {
    sendPhoneCode(phone: string, options: PhoneCodeSendOptions): Promise<LinkSentView>;

    verifyPhoneCode(phone: string, otp: string, options: PhoneCodeProveOptions): Promise<PhoneCodeVerifyResult>;

    confirmPhoneCode(phone: string, otp: string, options: PhoneCodeProveOptions): Promise<PhoneCodeConfirmResult>;

    verifySocialAccount(tokens: SocialAccountTokens): Promise<LinkVerifiedView>;

    confirmSocialAccount(tokens: SocialAccountTokens): Promise<LinkedView>;

    registerUser(body: UserBody): Promise<DomainUser>;
    registerUserV2(body: RegisterUserV2Body, email?: boolean, opts?: AdminEndpointOptions): Promise<DomainUser>;
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
    exchangeToken(input: { baseURL: string; body: CloudExchangeTokenBody }): Promise<UserTokenView>;
}

type CloudExchangeTokenBody = Parameters<IAuthHttpDataSource['exchangeToken']>[0]['body'];

export class AuthRepository extends BaseRepository implements IAuthRepository {
    constructor(
        private readonly authSocketDataSource: IAuthSocketDataSource,
        contextProvider: DataContextProvider,
        private readonly authHttpDataSource?: IAuthHttpDataSource
    ) {
        super(contextProvider);
    }

    private requireHttp(): IAuthHttpDataSource {
        if (!this.authHttpDataSource) {
            throw new Error('[AuthRepository] IAuthHttpDataSource is not injected — httpFactory not wired yet.');
        }
        return this.authHttpDataSource;
    }

    public async registerUser(body: UserBody): Promise<DomainUser> {
        return this.requireHttp().registerUser(body, this.getRequestContext());
    }

    public async registerUserV2(
        body: RegisterUserV2Body,
        email?: boolean,
        opts?: AdminEndpointOptions
    ): Promise<DomainUser> {
        return this.requireHttp().registerUserV2(body, email, this.getRequestContext(), opts);
    }

    public async findAlias(body: FindAliasBody): Promise<FindAliasView> {
        return this.requireHttp().findAlias(body);
    }

    public async verifyAlias(body: VerifyAliasBody): Promise<VerifyAliasView> {
        return this.requireHttp().verifyAlias(body);
    }

    public async loginWithInviteCode(input: {
        code: string;
        delegatorId: string;
        backend?: string;
    }): Promise<UserTokenView> {
        return this.requireHttp().loginWithInviteCode(input);
    }

    public async fetchInviteInfo(input: { code: string; backend: string }): Promise<MyInviteView> {
        return this.requireHttp().fetchInviteInfo(input);
    }

    public registerDevice(deviceId: string): Promise<UserTokenView> {
        return this.requireHttp().registerDevice(deviceId);
    }

    public login(body: LoginUserBody, email?: boolean): Promise<UserTokenView> {
        return this.requireHttp().login(body, email);
    }

    public verifyNativeToken(body: VerifyNativeTokenBody): Promise<UserTokenView> {
        return this.requireHttp().verifyNativeToken(body);
    }

    public exchangeCode(input: { provider: string; code: string }): Promise<UserTokenView> {
        return this.requireHttp().exchangeCode(input);
    }

    public verifyOAuthCode(body: VerifyOAuthCodeBody): Promise<UserTokenView> {
        return this.requireHttp().verifyOAuthCode(body);
    }

    public delegateCloud(target: string): Promise<CloudDelegationTokenView> {
        return this.requireHttp().delegateCloud(target);
    }

    public exchangeToken(input: { baseURL: string; body: CloudExchangeTokenBody }): Promise<UserTokenView> {
        return this.requireHttp().exchangeToken(input);
    }

    public async sendPhoneCode(phone: string, options: PhoneCodeSendOptions): Promise<LinkSentView> {
        return this.authSocketDataSource.sendPhoneCode(phone, options);
    }

    public async verifyPhoneCode(
        phone: string,
        otp: string,
        options: PhoneCodeProveOptions
    ): Promise<PhoneCodeVerifyResult> {
        return this.authSocketDataSource.verifyPhoneCode(phone, otp, options);
    }

    public async confirmPhoneCode(
        phone: string,
        otp: string,
        options: PhoneCodeProveOptions
    ): Promise<PhoneCodeConfirmResult> {
        return this.authSocketDataSource.confirmPhoneCode(phone, otp, options);
    }

    public async verifySocialAccount(tokens: SocialAccountTokens): Promise<LinkVerifiedView> {
        return this.authSocketDataSource.verifySocialAccount(tokens);
    }

    public async confirmSocialAccount(tokens: SocialAccountTokens): Promise<LinkedView> {
        return this.authSocketDataSource.confirmSocialAccount(tokens);
    }
}
