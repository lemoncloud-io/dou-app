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
import type { FindAliasBody, FindAliasView, VerifyAliasBody, VerifyAliasView } from '@chatic/http';
import type { DomainUser } from '../domain';
import type {
    IAuthSocketDataSource,
    PhoneCodeConfirmResult,
    PhoneCodeProveOptions,
    PhoneCodeSendOptions,
    PhoneCodeVerifyResult,
    SocialAccountTokens,
} from '../remote/socket-data-sources';
import type { IAuthHttpDataSource } from '../remote/http-data-sources';
import type { DataContextProvider } from './types';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

export interface IAuthRepositoryV2 extends DisposableRepositoryV2 {
    /**
     * auth.link-account (send/resend) — deliver a phone OTP. Rate limits (60s cooldown, 10/day per
     * number, 20/day per device) reject with 429; on `mode: 'login'` a number that does not match the
     * invite rejects at send time with 400 and no code is dispatched. Read the status with
     * `getSocketErrorCode`, never the message.
     */
    sendPhoneCode(phone: string, options: PhoneCodeSendOptions): Promise<LinkSentView>;

    /**
     * auth.link-account (verify) — prove the code WITHOUT committing.
     *
     * Nothing changes, so this is safe to call repeatedly. On `mode: 'link'` the answer carries
     * `linkable` and, when false, a `reason` (`'occupied'` = the account belongs to someone else,
     * `'type-linked'` = this session already has a different value for that credential). Confirm
     * answers those same two situations with 409 and 403 instead, which is why a linking screen asks
     * here first. On `mode: 'login'` a successful response only means the code is valid.
     *
     * A wrong code rejects with 403; the 5-wrong-answer cap rejects with 429.
     */
    verifyPhoneCode(phone: string, otp: string, options: PhoneCodeProveOptions): Promise<PhoneCodeVerifyResult>;

    /**
     * auth.link-account (confirm) — commit the proof.
     *
     * On `mode: 'login'` this IS a login: it promotes a device user, and the response's `$token` is a
     * NEW session that the caller must push into the sockets before issuing or accepting anything, or
     * those calls come back 403. `isNew` says whether the user was minted just now (sign-up) or
     * recovered (return). On `mode: 'link'` no token comes back and the session is unchanged.
     *
     * This repository does not interpret or install the token — session state belongs to
     * `app-runtime`'s `session/auth` (see libs/app-runtime/docs/session/architecture.md,
     * "session/auth — HTTP는 data 레이어를 지난다"). `data` performs the call; it never reads a
     * `Token`, writes a store, or flips auth state.
     */
    confirmPhoneCode(phone: string, otp: string, options: PhoneCodeProveOptions): Promise<PhoneCodeConfirmResult>;

    /**
     * auth.link-account (type=social, verify) — ask whether this social account can be linked to the
     * current session. Same `linkable`/`reason` contract as the phone verify.
     */
    verifySocialAccount(tokens: SocialAccountTokens): Promise<LinkVerifiedView>;

    /**
     * auth.link-account (type=social, confirm) — link one more social account to a session that is
     * ALREADY a main user. Not a login: the session does not change and no token comes back. 409 means
     * the account belongs to a different user; 403 means the session is not a main user, or it already
     * has a different social account linked.
     */
    confirmSocialAccount(tokens: SocialAccountTokens): Promise<LinkedView>;

    /**
     * HTTP account/alias/invite commands (ADR-0070 결정 5, 2단계 후반). `IAuthHttpDataSource`
     * injection is optional through 2단계 — every existing `createRepositoriesV2` call site stays
     * green without it, and these methods throw a clear "not wired yet" error until it's injected.
     * 4단계 promotes it to required once the REST hooks actually move behind it.
     */
    registerUser(body: UserBody): Promise<DomainUser>;
    registerUserV2(body: RegisterUserV2Body, email?: boolean): Promise<DomainUser>;
    findAlias(body: FindAliasBody): Promise<FindAliasView>;
    verifyAlias(body: VerifyAliasBody): Promise<VerifyAliasView>;
    loginWithInviteCode(input: { code: string; delegatorId: string; backend?: string }): Promise<UserTokenView>;
    fetchInviteInfo(input: { code: string; backend: string }): Promise<MyInviteView>;

    /**
     * Session-material commands (`session/auth`의 유일한 HTTP 경로).
     *
     * Responses come back RAW — mapping to `DomainUser` would drop `Token`, and `Token` is why these
     * are called. As with `confirmPhoneCode`, this repository performs the call and does NOT
     * interpret or install what comes back; session state stays `session/auth`'s.
     */
    registerDevice(deviceId: string): Promise<UserTokenView>;
    login(body: LoginUserBody, email?: boolean): Promise<UserTokenView>;
    verifyNativeToken(body: VerifyNativeTokenBody): Promise<UserTokenView>;
    exchangeCode(input: { provider: string; code: string }): Promise<UserTokenView>;
    delegateCloud(target: string): Promise<CloudDelegationTokenView>;
    exchangeToken(input: { baseURL: string; body: CloudExchangeTokenBody }): Promise<UserTokenView>;
}

/** `exchangeToken`의 body 타입 — 게이트웨이 계약에서 그대로 끌어온다. */
type CloudExchangeTokenBody = Parameters<IAuthHttpDataSource['exchangeToken']>[0]['body'];

/**
 * Session identity commands (account proof: phone, social). Remote-only by nature: nothing here is a
 * readable entity, so there is nothing to cache — the repository exists to give the app a single typed
 * access surface instead of a raw gateway (ADR-0036).
 *
 * What IS readable — which credentials a user has linked — is not here either: it rides on the user
 * entity as `link$` and is served by UserRepositoryV2's cache (ADR-0042 §5).
 *
 * Kept apart from UserRepositoryV2 deliberately: that one already composes four data sources and owns
 * user ENTITIES, while these are session-identity COMMANDS with no cached counterpart.
 *
 * Phone numbers and OTP codes are credentials — they pass straight through to the packet body and are
 * never logged or keyed on.
 */
export class AuthRepositoryV2 extends BaseRepositoryV2 implements IAuthRepositoryV2 {
    constructor(
        private readonly authSocketDataSource: IAuthSocketDataSource,
        contextProvider: DataContextProvider,
        private readonly authHttpDataSource?: IAuthHttpDataSource
    ) {
        super(contextProvider);
    }

    private requireHttp(): IAuthHttpDataSource {
        if (!this.authHttpDataSource) {
            throw new Error('[AuthRepositoryV2] IAuthHttpDataSource is not injected — httpFactory not wired yet.');
        }
        return this.authHttpDataSource;
    }

    public async registerUser(body: UserBody): Promise<DomainUser> {
        return this.requireHttp().registerUser(body, this.getRequestContext());
    }

    public async registerUserV2(body: RegisterUserV2Body, email?: boolean): Promise<DomainUser> {
        return this.requireHttp().registerUserV2(body, email, this.getRequestContext());
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

    // --- session-material commands: perform, never interpret -------------------------------------

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
