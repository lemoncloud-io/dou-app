import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/logger';

import { authRepositorySource } from '../session/authRepository';
import { applySessionToken } from './applySessionToken';

/** What a confirmed phone login tells the screen: whether the number made a new account. No token. */
export interface PhoneLoginResult {
    isNew: boolean;
}

/** The `code` a phone login throws with when the code was confirmed but no session token came back. */
export const PHONE_LOGIN_NO_TOKEN = 'PHONE_LOGIN_NO_TOKEN';

/**
 * The `code` a phone login throws with when the code was confirmed and the account signed in on the
 * server, but this device's session did not switch to it. The token is kept; `retryPhoneLogin()`
 * finishes the switch. The code itself is spent, so asking for a new one is not the way out.
 */
export const PHONE_LOGIN_SWITCH_FAILED = 'PHONE_LOGIN_SWITCH_FAILED';

/**
 * The `code` a retry throws with when no confirmed login is waiting — it was cancelled, or replaced by a
 * newer confirm. The screen's retry has nothing to finish; the way on is a new code.
 */
export const PHONE_LOGIN_NOTHING_PENDING = 'PHONE_LOGIN_NOTHING_PENDING';

// The token of a confirmed code whose session switch failed — kept here, where the session lives, so
// the screen that asked never holds it. One at a time: a new confirm replaces it.
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

/**
 * Proves `code` for `phone` in login mode and signs this device in as the account it belongs to — the
 * check and the session switch as one step, so the session token never leaves the session's owner.
 *
 * Throws what the check throws (a wrong, expired or spent code — the socket error's status says which);
 * `PHONE_LOGIN_NO_TOKEN` when the check answered without a token; `PHONE_LOGIN_SWITCH_FAILED` when the
 * switch failed, which `retryPhoneLogin()` finishes.
 */
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
    // A login confirm always carries one. Without it, applying would quietly change nothing and the
    // device would stay on its previous session — a contract break, not a wrong code.
    if (!token?.Token?.identityToken) {
        throw failure(PHONE_LOGIN_NO_TOKEN, 'The login confirm came back without a session token');
    }
    return switchTo(token, 'isNew' in result ? Boolean(result.isNew) : false);
};

/**
 * Finishes the session switch of a phone login whose code was confirmed but whose switch failed. Throws
 * `PHONE_LOGIN_NOTHING_PENDING` when none is waiting, `PHONE_LOGIN_SWITCH_FAILED` when it fails again.
 */
export const retryPhoneLogin = async (): Promise<PhoneLoginResult> => {
    if (!pending) throw failure(PHONE_LOGIN_NOTHING_PENDING, 'No confirmed phone login is waiting for its switch');
    return switchTo(pending.token, pending.isNew);
};

/**
 * Drops a waiting phone login and its token. The phone screens call it when they close, so a token
 * the person walked away from does not stay in memory until the next confirm.
 */
export const cancelPhoneLogin = (): void => {
    pending = null;
};
