import type {
    LinkSentView,
    LinkVerifiedView,
    LinkedView,
    LoggedInView,
    LoginVerifiedView,
} from '@lemoncloud/chatic-backend-api';
import type { AuthSocketDomainGateway } from '../gateways';

/**
 * What the proof is FOR, and it is the request that says so — never the response (ADR-0042 §3).
 * - `login`: a device (guest) session proves a number and becomes that number's main user. The
 *   session changes and a `$token` comes back.
 * - `link`: an already-main user hangs one more credential on the current session. The session does
 *   NOT change and no token comes back.
 *
 * Picking the wrong one is an error, not a fallback: a main user calling `login` is 400, a device
 * session calling `link` is 403. Callers derive this from the session role (`isGuest`) so neither
 * error is reachable.
 */
export type AccountLinkMode = 'link' | 'login';

/**
 * Delivery switches for the send side. `resend` picks the step; the rest are dev delivery controls.
 * Unset switches are omitted from the packet entirely so the server's defaults survive — a literal
 * `false` would turn a channel off rather than leave it alone.
 */
export interface PhoneCodeSendOptions {
    /** Which side of the proof this is. */
    mode: AccountLinkMode;
    /**
     * Invite code, when the send happens inside an accept flow. Read by the server ONLY on
     * `mode: 'login'` send, and a number that does not match the invite gets no SMS at all.
     */
    code?: string;
    /** Ask for a new code instead of the first one. */
    resend?: boolean;
    /** ISO alpha-2 default country for a local (`0…`) number — server default `KR`. */
    countryCode?: string;
    /** Run the flow without actually delivering the code. Caps and counters still apply. */
    dryRun?: boolean;
    /** Deliver over SMS (server default: true). */
    sms?: boolean;
    /** Deliver over Slack (server default: true) — how a dev build receives codes. */
    slack?: boolean;
}

/** Shared by the two proof steps. The country code must match the one used to send. */
export interface PhoneCodeProveOptions {
    mode: AccountLinkMode;
    countryCode?: string;
}

/**
 * `step=verify` answers differently per mode: `link` reports whether confirming WOULD work, `login`
 * only says the code is valid. Neither changes anything, so both are safe to call repeatedly.
 */
export type PhoneCodeVerifyResult = LinkVerifiedView | LoginVerifiedView;

/** `step=confirm` answers differently per mode: `link` links, `login` opens a session (`$token`). */
export type PhoneCodeConfirmResult = LinkedView | LoggedInView;

/**
 * Native token bundle for a social proof. Which field carries the credential depends on the provider
 * (Apple uses `identityToken`, Google `idToken`), so the shape stays open and only `provider` is
 * required — the server does not validate the slot, the OAuth framework does.
 */
export type SocialAccountTokens = Record<string, unknown> & { provider: string };

export interface IAuthSocketDataSource {
    /**
     * `auth.link-account` step=send/resend — deliver a phone OTP. The step is derived from `resend`
     * so callers never spell the packet's four steps out.
     */
    sendPhoneCode(phone: string, options: PhoneCodeSendOptions): Promise<LinkSentView>;
    /**
     * `auth.link-account` step=verify — check the code WITHOUT committing anything.
     *
     * On `mode: 'link'` this is the only place the server will TELL you that confirming is blocked
     * (`linkable: false` + `reason`); confirm answers the same situation with 409/403 instead. That
     * is why a linking screen verifies first.
     */
    verifyPhoneCode(phone: string, otp: string, options: PhoneCodeProveOptions): Promise<PhoneCodeVerifyResult>;
    /** `auth.link-account` step=confirm — commit. On `mode: 'login'` the response carries `$token`. */
    confirmPhoneCode(phone: string, otp: string, options: PhoneCodeProveOptions): Promise<PhoneCodeConfirmResult>;
    /**
     * `auth.link-account` type=social step=verify — ask whether this social account CAN be linked.
     * Social has no send step: Apple/Google already did the proving.
     */
    verifySocialAccount(tokens: SocialAccountTokens): Promise<LinkVerifiedView>;
    /** `auth.link-account` type=social step=confirm — link it. Never a login; the session is unchanged. */
    confirmSocialAccount(tokens: SocialAccountTokens): Promise<LinkedView>;
}

/**
 * Auth source. It carries the account-proof packet (`link-account`) only, bound to the RELAY slot by
 * the composition root — the main user it resolves to lives in the central backend behind the relay.
 * See ADR-0033, ADR-0042.
 *
 * It deliberately does NOT carry `auth.update`. That packet is the socket handshake and belongs to
 * the SDK's AuthController alone; the method that used to sit here reached zero callers and its only
 * effect, had one appeared, would have been a second authentication the controller could not account
 * for. See the reasoning on `AuthSocketDomainGateway`.
 *
 * This layer owns the `type`/`mode`/`step` assembly so no caller above it spells a packet field out.
 * The server does not judge whether a combination exists — the backend does — so this class only
 * ever builds the combinations the union permits and lets TypeScript reject the rest.
 *
 * Phone numbers, e-mail addresses and OTP codes are credentials: they stay in the packet body and
 * never reach a log, a cache key, or a query key.
 */
export class AuthSocketDataSource implements IAuthSocketDataSource {
    constructor(private readonly gateway: AuthSocketDomainGateway) {}

    public async sendPhoneCode(phone: string, options: PhoneCodeSendOptions): Promise<LinkSentView> {
        // `resend` selects the step rather than riding along as a switch; there is no "extend the
        // timer" step, so extending IS resending (ADR-0033 D9) — a fresh code and a fresh
        // `expiredAt`, but the wrong-answer counter is NOT reset.
        const { mode, resend, ...rest } = options;
        return this.gateway.linkAccount<LinkSentView>({
            type: 'phone',
            mode,
            step: resend ? 'resend' : 'send',
            phone,
            ...rest,
        });
    }

    public async verifyPhoneCode(
        phone: string,
        otp: string,
        options: PhoneCodeProveOptions
    ): Promise<PhoneCodeVerifyResult> {
        // The invite code is NOT accepted here — the union has no slot for it on a prove step. The
        // number/invite cross-check happens once, at send time (ADR-0042; guide §B-2).
        return this.gateway.linkAccount<PhoneCodeVerifyResult>({
            type: 'phone',
            mode: options.mode,
            step: 'verify',
            phone,
            otp,
            countryCode: options.countryCode,
        });
    }

    public async confirmPhoneCode(
        phone: string,
        otp: string,
        options: PhoneCodeProveOptions
    ): Promise<PhoneCodeConfirmResult> {
        return this.gateway.linkAccount<PhoneCodeConfirmResult>({
            type: 'phone',
            mode: options.mode,
            step: 'confirm',
            phone,
            otp,
            countryCode: options.countryCode,
        });
    }

    public async verifySocialAccount(tokens: SocialAccountTokens): Promise<LinkVerifiedView> {
        // Social only ever links: there is no `mode: 'login'` for it, and a device session that wants
        // to log in socially goes through the backend's REST path instead (guide §알아 둘 제약).
        return this.gateway.linkAccount<LinkVerifiedView>({
            ...tokens,
            type: 'social',
            mode: 'link',
            step: 'verify',
        });
    }

    public async confirmSocialAccount(tokens: SocialAccountTokens): Promise<LinkedView> {
        return this.gateway.linkAccount<LinkedView>({
            ...tokens,
            type: 'social',
            mode: 'link',
            step: 'confirm',
        });
    }
}
