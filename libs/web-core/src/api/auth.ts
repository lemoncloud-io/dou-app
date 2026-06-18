import { cloudCore } from '../core';
import { calcSignature } from '../utils';
import {
    executeCloudRequest,
    executeRelayRequest,
    executeSignedRelayRequest,
    getCoreEndpoint,
    getOAuthEndpoint,
} from './request';

import type {
    CloudExchangeTokenBody,
    LoginUserBody,
    RegisterUserV2Body,
    UserBody,
    UserTokenView,
    UserView,
    UserLogoutResult,
} from '@lemoncloud/chatic-backend-api';
import type { OAuthRefreshBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import type { TokenGenerateRequest, TokenGenerateResponse } from '@chatic/shared';

import type { FindAliasBody, FindAliasView, VerifyAliasBody, VerifyAliasView } from './types';

export const registerDevice = async (deviceId: string): Promise<UserTokenView> => {
    return executeRelayRequest<UserTokenView, { deviceId: string }>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/register-device`,
        body: { deviceId },
    });
};

export const registerUser = async (body: UserBody): Promise<UserView> => {
    return executeRelayRequest<UserView, UserBody>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/register-user`,
        body,
    });
};

export const registerUserV2 = async (body: RegisterUserV2Body, email?: boolean): Promise<UserView> => {
    return executeRelayRequest<UserView, RegisterUserV2Body>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/register-user-v2`,
        params: email !== undefined ? { email: email ? 'true' : 'false' } : undefined,
        body,
    });
};

export const login = async (body: LoginUserBody, email?: boolean): Promise<UserTokenView> => {
    return executeRelayRequest<UserTokenView, LoginUserBody>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/login-user`,
        params: { token: 1, ...(email !== undefined && { email: email ? 'true' : 'false' }) },
        body,
    });
};

export const issueCloudToken = async (baseURL: string, body: CloudExchangeTokenBody): Promise<UserTokenView> => {
    return executeSignedRelayRequest<UserTokenView, CloudExchangeTokenBody>({
        method: 'POST',
        baseURL: `${baseURL}/oauth/exchange-token`,
        body: { ...body },
    });
};

export const refreshCloudToken = async (target?: string): Promise<UserTokenView> => {
    const token = cloudCore.getCloudToken();
    if (!token?.Token) throw new Error('No cloud token found');

    const { authId, accountId, identityId, identityToken } = token.Token;
    if (!authId || !accountId || !identityId || !identityToken) {
        throw new Error('Missing token fields for refresh');
    }

    const current = new Date().toISOString();
    const signature = calcSignature({ authId, accountId, identityId, identityToken: '' }, current);
    const body: OAuthRefreshBody = { current, signature, ...(target && { target }) };

    const backend = cloudCore.getBackend();
    const refreshed = await executeCloudRequest<UserTokenView, OAuthRefreshBody>({
        method: 'POST',
        baseURL: `${backend}/oauth/${authId}/refresh`,
        params: { token: 1 },
        body,
    });

    const existing = cloudCore.getCloudToken();
    const merged = { ...existing, ...refreshed } as UserTokenView;
    cloudCore.saveCloudToken(merged);
    return merged;
};

export const findAlias = async (body: FindAliasBody): Promise<FindAliasView> => {
    return executeRelayRequest<FindAliasView, FindAliasBody>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/find-alias`,
        body,
    });
};

export const verifyAlias = async (body: VerifyAliasBody): Promise<VerifyAliasView> => {
    return executeRelayRequest<VerifyAliasView, VerifyAliasBody>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/oauth/verify-alias`,
        body,
    });
};

export const generateToken = async (request: TokenGenerateRequest): Promise<TokenGenerateResponse> => {
    return executeSignedRelayRequest<TokenGenerateResponse, TokenGenerateRequest>({
        method: 'POST',
        baseURL: `${getOAuthEndpoint()}/auth/0/generate-token`,
        body: request,
    });
};

export const logout = async (): Promise<UserLogoutResult> => {
    return executeRelayRequest<UserLogoutResult, Record<string, never>>({
        method: 'POST',
        baseURL: `${getCoreEndpoint()}/users/logout`,
        body: {},
    });
};
