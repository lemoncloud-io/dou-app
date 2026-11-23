import type {
    LinkSentView,
    LinkVerifiedView,
    LinkedView,
    LoggedInView,
    LoginVerifiedView,
} from '@lemoncloud/chatic-backend-api';
import type { AuthSocketDomainGateway } from '../gateways';

export type AccountLinkMode = 'link' | 'login';

export interface PhoneCodeSendOptions {
    mode: AccountLinkMode;
    code?: string;
    resend?: boolean;
    countryCode?: string;
    dryRun?: boolean;
    sms?: boolean;
    slack?: boolean;
}

export interface PhoneCodeProveOptions {
    mode: AccountLinkMode;
    countryCode?: string;
}

export type PhoneCodeVerifyResult = LinkVerifiedView | LoginVerifiedView;

export type PhoneCodeConfirmResult = LinkedView | LoggedInView;

export type SocialAccountTokens = Record<string, unknown> & { provider: string };

export interface IAuthSocketDataSource {
    sendPhoneCode(phone: string, options: PhoneCodeSendOptions): Promise<LinkSentView>;
    verifyPhoneCode(phone: string, otp: string, options: PhoneCodeProveOptions): Promise<PhoneCodeVerifyResult>;
    confirmPhoneCode(phone: string, otp: string, options: PhoneCodeProveOptions): Promise<PhoneCodeConfirmResult>;
    verifySocialAccount(tokens: SocialAccountTokens): Promise<LinkVerifiedView>;
    confirmSocialAccount(tokens: SocialAccountTokens): Promise<LinkedView>;
}

export class AuthSocketDataSource implements IAuthSocketDataSource {
    constructor(private readonly gateway: AuthSocketDomainGateway) {}

    public async sendPhoneCode(phone: string, options: PhoneCodeSendOptions): Promise<LinkSentView> {
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
