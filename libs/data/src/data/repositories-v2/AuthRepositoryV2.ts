import type { AttachSocialView } from '@lemoncloud/chatic-backend-api';
import type {
    AttachSocialTokens,
    IAuthRemoteDataSource,
    VerifyHashAliasCheckResult,
    VerifyHashAliasSendOptions,
    VerifyHashAliasSendResult,
} from '../remote/data-sources';
import type { DataContextProvider } from './types';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

export interface IAuthRepositoryV2 extends DisposableRepositoryV2 {
    /**
     * auth.verify-hash-alias (send/resend) — deliver a phone OTP. Rate limits (60s cooldown, 10/day
     * per number, 20/day per device) reject with 429; a number that does not match the invite rejects
     * at send time with 400. Read the status with `getSocketErrorCode`, never the message.
     */
    sendPhoneVerification(phone: string, options?: VerifyHashAliasSendOptions): Promise<VerifyHashAliasSendResult>;

    /**
     * auth.verify-hash-alias (check) — prove ownership of the number.
     *
     * A successful check IS a login: when it promotes a device user to a main user, the response's
     * `$token` is a NEW session that the caller must push into the sockets before issuing or
     * accepting anything, or those calls come back 403. An empty `$token` means the number was
     * merely linked and the session is unchanged. This repository does not interpret or install the
     * token — session state stays web-core's (see data-access.md, "auth 승격의 경계").
     *
     * A wrong code rejects with 403; the 5-wrong-answer cap rejects with 429.
     */
    checkPhoneVerification(
        phone: string,
        otp: string,
        options?: { code?: string }
    ): Promise<VerifyHashAliasCheckResult>;

    /**
     * auth.attach-social — link one more social account to a session that is ALREADY a main user.
     * Not a login: the session does not change and no token comes back. 409 means the account belongs
     * to a different user; 403 means the session is not a main user.
     */
    attachSocial(tokens: AttachSocialTokens): Promise<AttachSocialView>;
}

/**
 * Session identity commands (phone verification, social linking). Remote-only by nature: nothing
 * here is a readable entity, so there is nothing to cache — the repository exists to give the app a
 * single typed access surface instead of a raw gateway (ADR-0036).
 *
 * Kept apart from UserRepositoryV2 deliberately: that one already composes four data sources and
 * owns user ENTITIES, while these are session-identity COMMANDS with no cached counterpart.
 *
 * Phone numbers and OTP codes are credentials — they pass straight through to the packet body and
 * are never logged or keyed on.
 */
export class AuthRepositoryV2 extends BaseRepositoryV2 implements IAuthRepositoryV2 {
    constructor(
        private readonly authRemoteDataSource: IAuthRemoteDataSource,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public async sendPhoneVerification(
        phone: string,
        options?: VerifyHashAliasSendOptions
    ): Promise<VerifyHashAliasSendResult> {
        return this.authRemoteDataSource.sendHashAliasOtp(phone, options);
    }

    public async checkPhoneVerification(
        phone: string,
        otp: string,
        options?: { code?: string }
    ): Promise<VerifyHashAliasCheckResult> {
        return this.authRemoteDataSource.checkHashAliasOtp(phone, otp, options?.code);
    }

    public async attachSocial(tokens: AttachSocialTokens): Promise<AttachSocialView> {
        return this.authRemoteDataSource.attachSocial(tokens);
    }
}
