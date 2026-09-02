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
import type { HttpGatewayExecutor } from './types';

/** Mirrors web-core's `api/types/auth.ts` — declared locally since this lib cannot import from an
 * app-layer package (`@chatic/web-core`), only external npm packages. */
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

export const isAwsAccountNo = (value: string): boolean => /^\d{12}$/.test(value);

/**
 * Token/account issuance wire vocabulary — `POST /oauth/*` and the two relay resources
 * (`delegate-cloud`, `invite-code`) that hand out session material. Full surface lives here; the
 * data-layer `HttpGatewayBundle` (`libs/data/src/data/remote/gateways/http.ts`) deliberately
 * `Pick<>`s only the non-session actions out of it — `login`/`exchangeToken`/`delegateCloud`/
 * `registerDevice` stay reachable only through this gateway directly (3단계 `session/auth`).
 */
export interface OAuthHttpGateway {
    registerDevice(deviceId: string): Promise<UserTokenView>;
    registerUser(body: UserBody): Promise<UserTokenView>;
    registerUserV2(body: RegisterUserV2Body, email?: boolean): Promise<UserTokenView>;
    login(body: LoginUserBody, email?: boolean): Promise<UserTokenView>;
    /** `POST {input.baseURL}/oauth/exchange-token` — baseURL is the caller's override (the target
     * cloud's backend, not yet the active session's own host). See §route가 endpoint를 전부
     * 결정하지 않는다 (libs/http/docs/architecture.md). */
    exchangeToken(input: { baseURL: string; body: CloudExchangeTokenBody }): Promise<UserTokenView>;
    findAlias(body: FindAliasBody): Promise<FindAliasView>;
    verifyAlias(body: VerifyAliasBody): Promise<VerifyAliasView>;
    loginInvite(input: { code: string; delegatorId: string; backend?: string }): Promise<UserTokenView>;
    delegateCloud(target: string): Promise<CloudDelegationTokenView>;
    /** `POST /users/0/verify-native-token` — promotes the relay session with a verified native social
     * token. Session-material-producing (returns a `Token`), so it is deliberately absent from
     * `data`'s `AuthHttpDomainGateway` Pick and reachable only from `session/auth`. */
    verifyNativeToken(body: VerifyNativeTokenBody): Promise<UserTokenView>;
    /** `POST {oauth}/oauth/{provider}/token` — OAuth 인가 코드를 relay 자격증명으로 교환한다.
     * 세션 재료를 만드는 유일한 경로(refresh는 갱신이라 없는 토큰을 만들지 못한다)라
     * `data`의 Pick에서 제외돼 있고 `session/auth`에서만 닿는다. relay가 아니라 oauth 호스트다. */
    exchangeCode(input: { provider: string; code: string }): Promise<UserTokenView>;
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

        registerUserV2: (body, email) =>
            exec.executeRelayRequest<UserTokenView, RegisterUserV2Body>({
                method: 'POST',
                baseURL: `${relay()}/oauth/register-user-v2`,
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
