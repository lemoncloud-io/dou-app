import type { LinkSentView, LinkVerifiedView, LinkedView } from '@lemoncloud/chatic-backend-api';
import type {
    IAuthRemoteDataSource,
    PhoneCodeConfirmResult,
    PhoneCodeProveOptions,
    PhoneCodeSendOptions,
    PhoneCodeVerifyResult,
    SocialAccountTokens,
} from '../remote/data-sources';
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
     * This repository does not interpret or install the token — session state stays web-core's
     * (see data-access.md, "auth 승격의 경계").
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
}

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
        private readonly authRemoteDataSource: IAuthRemoteDataSource,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public async sendPhoneCode(phone: string, options: PhoneCodeSendOptions): Promise<LinkSentView> {
        return this.authRemoteDataSource.sendPhoneCode(phone, options);
    }

    public async verifyPhoneCode(
        phone: string,
        otp: string,
        options: PhoneCodeProveOptions
    ): Promise<PhoneCodeVerifyResult> {
        return this.authRemoteDataSource.verifyPhoneCode(phone, otp, options);
    }

    public async confirmPhoneCode(
        phone: string,
        otp: string,
        options: PhoneCodeProveOptions
    ): Promise<PhoneCodeConfirmResult> {
        return this.authRemoteDataSource.confirmPhoneCode(phone, otp, options);
    }

    public async verifySocialAccount(tokens: SocialAccountTokens): Promise<LinkVerifiedView> {
        return this.authRemoteDataSource.verifySocialAccount(tokens);
    }

    public async confirmSocialAccount(tokens: SocialAccountTokens): Promise<LinkedView> {
        return this.authRemoteDataSource.confirmSocialAccount(tokens);
    }
}
