import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/logger';

import { authRepositorySource } from '../session/authRepository';
import { applySessionToken } from './applySessionToken';

export interface PhoneLoginResult {
    isNew: boolean;
}

export const PHONE_LOGIN_NO_TOKEN = 'PHONE_LOGIN_NO_TOKEN';

export const PHONE_LOGIN_SWITCH_FAILED = 'PHONE_LOGIN_SWITCH_FAILED';

export const PHONE_LOGIN_NOTHING_PENDING = 'PHONE_LOGIN_NOTHING_PENDING';

let pending: { token: UserTokenView; isNew: boolean } | null = null;

const failure = (code: string, message: string, cause?: unknown): Error =>
    Object.assign(new Error(message), { code, cause });

const switchTo = async (token: UserTokenView, isNew: boolean): Promise<PhoneLoginResult> => {
    pending = { token, isNew };
    try {
        await applySessionToken(token);
    } catch (error) {
        logger.error('AUTH', '[phoneLogin] session switch failed after the code was confirmed', { error });
        throw failure(PHONE_LOGIN_SWITCH_FAILED, 'Signed in, but the session did not switch', error);
    }
    pending = null;
    return { isNew };
};

export const confirmPhoneLogin = async (
    phone: string,
    code: string,
    options: { countryCode?: string } = {}
): Promise<PhoneLoginResult> => {
    pending = null;
    const result = await authRepositorySource.get().confirmPhoneCode(phone, code, {
        mode: 'login',
        countryCode: options.countryCode,
    });
    const token = '$token' in result ? result.$token : null;
    if (!token?.Token?.identityToken) {
        throw failure(PHONE_LOGIN_NO_TOKEN, 'The login confirm came back without a session token');
    }
    return switchTo(token, 'isNew' in result ? Boolean(result.isNew) : false);
};

export const retryPhoneLogin = async (): Promise<PhoneLoginResult> => {
    if (!pending) throw failure(PHONE_LOGIN_NOTHING_PENDING, 'No confirmed phone login is waiting for its switch');
    return switchTo(pending.token, pending.isNew);
};

export const cancelPhoneLogin = (): void => {
    pending = null;
};
