import type {
    CloudDelegationTokenView,
    CloudExchangeTokenBody,
    LoginUserBody,
    MyInviteView,
    RegisterUserV2Body,
    UserBody,
    UserTokenView,
} from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import type { AdminEndpointOptions } from './subscriptions';
import type { HttpGatewayExecutor } from './types';

export interface FindAliasBody {
    type: 'email';
    alias: string;
}
export interface FindAliasView {
    hasUser: boolean;
}
export interface VerifyAliasBody {
    type: 'email';
    mode: 'find' | 'signup';
    step: 'send' | 'resend' | 'check' | 'change' | 'confirm';
    alias: string;
    userId?: string;
    code?: string;
    password?: string;
}
export type VerifyAliasView = Record<string, never>;

export interface VerifyOAuthCodeBody {
    provider: string;
    code: string;
}

export const isAwsAccountNo = (value: string): boolean => /^\d{12}$/.test(value);

export interface OAuthHttpGateway {
    registerDevice(deviceId: string): Promise<UserTokenView>;
    registerUser(body: UserBody): Promise<UserTokenView>;
    registerUserV2(body: RegisterUserV2Body, email?: boolean, options?: AdminEndpointOptions): Promise<UserTokenView>;
    login(body: LoginUserBody, email?: boolean): Promise<UserTokenView>;
    exchangeToken(input: { baseURL: string; body: CloudExchangeTokenBody }): Promise<UserTokenView>;
    findAlias(body: FindAliasBody): Promise<FindAliasView>;
    verifyAlias(body: VerifyAliasBody): Promise<VerifyAliasView>;
    loginInvite(input: { code: string; delegatorId: string; backend?: string }): Promise<UserTokenView>;
    delegateCloud(target: string): Promise<CloudDelegationTokenView>;
    verifyNativeToken(body: VerifyNativeTokenBody): Promise<UserTokenView>;
    exchangeCode(input: { provider: string; code: string }): Promise<UserTokenView>;
    verifyOAuthCode(body: VerifyOAuthCodeBody): Promise<UserTokenView>;
    inviteInfo(input: { code: string; backend: string }): Promise<MyInviteView>;
}

export const createOAuthHttpGateway = (exec: HttpGatewayExecutor): OAuthHttpGateway => {
    const relay = () => exec.resolveEndpoint('relay');
    const oauthHost = () => exec.resolveEndpoint('oauth');

    return {
        registerDevice: deviceId =>
            exec.executeRelayRequest<UserTokenView, { deviceId: string }>({
                method: 'POST',
                baseURL: `${relay()}/oauth/register-device`,
                body: { deviceId },
            }),

        registerUser: body =>
            exec.executeRelayRequest<UserTokenView, UserBody>({
                method: 'POST',
                baseURL: `${relay()}/oauth/register-user`,
                body,
            }),

        registerUserV2: (body, email, options) =>
            exec.executeRelayRequest<UserTokenView, RegisterUserV2Body>({
                method: 'POST',
                baseURL: `${options?.endpoint || relay()}/oauth/register-user-v2`,
                params: email !== undefined ? { email: email ? 'true' : 'false' } : undefined,
                body,
            }),

        login: (body, email) =>
            exec.executeRelayRequest<UserTokenView, LoginUserBody>({
                method: 'POST',
                baseURL: `${relay()}/oauth/login-user`,
                params: { token: 1, ...(email !== undefined && { email: email ? 'true' : 'false' }) },
                body,
            }),

        exchangeToken: ({ baseURL, body }) =>
            exec.executeSignedRelayRequest<UserTokenView, CloudExchangeTokenBody>({
                method: 'POST',
                baseURL: `${baseURL}/oauth/exchange-token`,
                body: { ...body },
            }),

        findAlias: body =>
            exec.executeRelayRequest<FindAliasView, FindAliasBody>({
                method: 'POST',
                baseURL: `${relay()}/oauth/find-alias`,
                body,
            }),

        verifyAlias: body =>
            exec.executeRelayRequest<VerifyAliasView, VerifyAliasBody>({
                method: 'POST',
                baseURL: `${relay()}/oauth/verify-alias`,
                body,
            }),

        loginInvite: ({ code, delegatorId, backend }) =>
            exec.executeRelayRequest<UserTokenView, { code: string; delegatorId: string }>({
                method: 'POST',
                baseURL: `${backend ?? relay()}/oauth/login-invite`,
                body: { code, delegatorId },
            }),

        delegateCloud: async target => {
            if (isAwsAccountNo(target)) {
                throw new Error(`delegateCloud: refusing AWS account-no as cloud target: ${target}`);
            }
            return exec.executeSignedRelayRequest<CloudDelegationTokenView, { target: string }, { legacy: false }>({
                method: 'POST',
                baseURL: `${relay()}/users/0/delegate-cloud`,
                body: { target },
                params: { legacy: false },
            });
        },

        exchangeCode: ({ provider, code }) =>
            exec.executeSignedRelayRequest<UserTokenView, { code: string }>({
                method: 'POST',
                baseURL: `${oauthHost()}/oauth/${provider}/token`,
                body: { code },
            }),

        verifyOAuthCode: body =>
            exec.executeSignedRelayRequest<UserTokenView, VerifyOAuthCodeBody, { token: 1 }>({
                method: 'POST',
                baseURL: `${relay()}/users/0/verify-oauth-code`,
                params: { token: 1 },
                body,
            }),

        verifyNativeToken: body =>
            exec.executeSignedRelayRequest<UserTokenView, VerifyNativeTokenBody, { token: 1 }>({
                method: 'POST',
                baseURL: `${relay()}/users/0/verify-native-token`,
                params: { token: 1 },
                body,
            }),

        inviteInfo: ({ code, backend }) =>
            exec.executeSignedRelayRequest<MyInviteView, never, { code: string }>({
                method: 'GET',
                baseURL: `${backend}/hello/invite-code`,
                params: { code },
            }),
    };
};
