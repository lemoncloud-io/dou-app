import type { AuthUpdateInput } from '@lemoncloud/chatic-sockets-api';
import type { AuthUpdateResponse } from '@lemoncloud/chatic-sockets-api/dist/lib/auth/types';
import type { AttachSocialView, VerifyHashAliasView } from '@lemoncloud/chatic-backend-api';
import type { AuthDomainGateway } from '../gateways';

/**
 * Delivery switches for the send side. `resend` picks the step; the rest are dev delivery controls.
 * Unset switches are omitted from the packet entirely so the server's defaults survive — a literal
 * `false` would turn a channel off rather than leave it alone.
 */
export interface VerifyHashAliasSendOptions {
    /** Invite code, when the verification happens inside an accept flow — matched against the invite's hash. */
    code?: string;
    /** Ask for a new code instead of the first one. */
    resend?: boolean;
    /** Run the flow without actually delivering the code. Caps and counters still apply. */
    dryRun?: boolean;
    /** Deliver over SMS (server default: true). */
    sms?: boolean;
    /** Deliver over Slack (server default: true) — how a dev build receives codes. */
    slack?: boolean;
}

/** What `step=send`/`step=resend` answers with. `expiredAt` (epoch ms) drives the countdown. */
export type VerifyHashAliasSendResult = Pick<VerifyHashAliasView, 'sent' | 'expiredAt'>;

/** What `step=check` answers with. A non-empty `$token` means the session changed. */
export type VerifyHashAliasCheckResult = Pick<VerifyHashAliasView, 'attached' | '$token'>;

/**
 * Native token bundle for `auth.attach-social`. Which field carries the credential depends on the
 * provider (Apple uses `identityToken`), so the shape stays open and only `provider` is required.
 */
export type AttachSocialTokens = Record<string, unknown> & { provider: string };

export interface IAuthRemoteDataSource {
    /** 서버에 인증 정보(토큰 등) 업데이트를 요청합니다. */
    updateSocketAuth(payload: AuthUpdateInput): Promise<AuthUpdateResponse>;
    /**
     * `auth.verify-hash-alias` step=send/resend — deliver a phone OTP. The step is derived from
     * `resend` so callers never spell the packet's three steps out.
     */
    sendHashAliasOtp(phone: string, options?: VerifyHashAliasSendOptions): Promise<VerifyHashAliasSendResult>;
    /**
     * `auth.verify-hash-alias` step=check — prove ownership of the number. A successful check IS a
     * login when it promotes a device user; the new session arrives as `$token`.
     */
    checkHashAliasOtp(phone: string, otp: string, code?: string): Promise<VerifyHashAliasCheckResult>;
    /** `auth.attach-social` — link one more social account to a session that is already a main user. */
    attachSocial(tokens: AttachSocialTokens): Promise<AttachSocialView>;
}

/**
 * Auth source. `update` authenticates whichever slot is active, while the two identity packets
 * (`verify-hash-alias`, `attach-social`) are bound to the RELAY slot by the composition root — the
 * main user they resolve to lives in the central backend behind the relay. See ADR-0033.
 *
 * Phone numbers and OTP codes are credentials: they stay in the packet body and never reach a log,
 * a cache key, or a query key.
 */
export class AuthRemoteDataSource implements IAuthRemoteDataSource {
    constructor(private readonly gateway: AuthDomainGateway) {}

    public async updateSocketAuth(payload: AuthUpdateInput): Promise<AuthUpdateResponse> {
        return this.gateway.update(payload);
    }

    public async sendHashAliasOtp(
        phone: string,
        options: VerifyHashAliasSendOptions = {}
    ): Promise<VerifyHashAliasSendResult> {
        // `resend` selects the step rather than riding along as a switch; there is no "extend the
        // timer" step, so extending IS resending (ADR-0033 D9) — a fresh code and a fresh
        // `expiredAt`, but the wrong-answer counter is NOT reset.
        const { resend, ...switches } = options;
        return this.gateway.verifyHashAlias<VerifyHashAliasSendResult>({
            kind: 'phone',
            step: resend ? 'resend' : 'send',
            phone,
            ...switches,
        });
    }

    public async checkHashAliasOtp(phone: string, otp: string, code?: string): Promise<VerifyHashAliasCheckResult> {
        return this.gateway.verifyHashAlias<VerifyHashAliasCheckResult>({
            kind: 'phone',
            step: 'check',
            phone,
            otp,
            code,
        });
    }

    public async attachSocial(tokens: AttachSocialTokens): Promise<AttachSocialView> {
        return this.gateway.attachSocial<AttachSocialView>(tokens);
    }
}
