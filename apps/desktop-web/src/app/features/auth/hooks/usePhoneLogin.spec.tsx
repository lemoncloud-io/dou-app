import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rt = vi.hoisted(() => ({
    isAuthenticated: true,
    loginGuest: vi.fn(),
    sendPhoneCode: vi.fn(),
    confirmPhoneLogin: vi.fn(),
    retryPhoneLogin: vi.fn(),
    cancelPhoneLogin: vi.fn(),
    error: vi.fn(),
    waitUntilVerified: vi.fn(),
}));

const ui = vi.hoisted(() => ({ language: 'en' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: ui.language } }) }));
vi.mock('@chatic/bridges', () => ({ isNative: () => true, logger: { error: rt.error, warn: vi.fn() } }));
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        connection: {
            RELAY_SLOT: 'relay',
            waitUntilVerified: rt.waitUntilVerified,
        },
        data: {
            useRuntimeRepositories: () => ({
                auth: { sendPhoneCode: rt.sendPhoneCode },
            }),
        },
        session: {
            getIdentityContext: () => ({ isAuthenticated: rt.isAuthenticated }),
            useDynamicDeviceId: () => ({ deviceId: 'device-1' }),
            useLoginRelayGuestByDevice: () => ({ mutateAsync: rt.loginGuest }),
            confirmPhoneLogin: rt.confirmPhoneLogin,
            retryPhoneLogin: rt.retryPhoneLogin,
            cancelPhoneLogin: rt.cancelPhoneLogin,
            PHONE_LOGIN_NOTHING_PENDING: 'PHONE_LOGIN_NOTHING_PENDING',
            PHONE_LOGIN_NO_TOKEN: 'PHONE_LOGIN_NO_TOKEN',
            PHONE_LOGIN_SWITCH_FAILED: 'PHONE_LOGIN_SWITCH_FAILED',
        },
    },
}));

import { PHONE_CODE_LENGTH, PHONE_RESEND_COOLDOWN_MS, usePhoneLogin } from './usePhoneLogin';

/** A phone login failure the runtime throws, by its code. */
const loginFailure = (code: string) => Object.assign(new Error(code), { code });
const CODE = '123456';

const setup = () => {
    const onSignedIn = vi.fn();
    const hook = renderHook(() => usePhoneLogin({ onSignedIn }));
    return { ...hook, onSignedIn };
};

/** Types a Korean mobile number and asks for a code. */
const sendCode = async (result: ReturnType<typeof setup>['result']) => {
    act(() => result.current.changeCountry('KR'));
    act(() => result.current.changePhone('01012345678'));
    await act(async () => result.current.requestCode());
};

const typeCode = async (result: ReturnType<typeof setup>['result'], code = CODE) => {
    await act(async () => result.current.changeOtp(code));
};

describe('usePhoneLogin', () => {
    beforeEach(() => {
        localStorage.clear();
        rt.isAuthenticated = true;
        rt.loginGuest.mockReset().mockResolvedValue(undefined);
        rt.sendPhoneCode.mockReset().mockResolvedValue({ sent: true, expiredAt: Date.now() + 180_000 });
        rt.confirmPhoneLogin.mockReset().mockResolvedValue({ isNew: false });
        rt.retryPhoneLogin.mockReset().mockResolvedValue({ isNew: false });
        rt.cancelPhoneLogin.mockReset();
        rt.error.mockReset();
        rt.waitUntilVerified.mockReset().mockResolvedValue(true);
        ui.language = 'en';
    });

    afterEach(() => vi.useRealTimers());

    it('opens on the country a Korean UI implies, before the OS locale', () => {
        ui.language = 'ko';

        const { result } = setup();

        expect(result.current.country).toBe('KR');
    });

    it('lets a malformed number be submitted, to say why it is refused', async () => {
        const { result } = setup();
        act(() => result.current.changeCountry('KR'));
        act(() => result.current.changePhone('123'));

        expect(result.current.canRequestCode).toBe(true);
        await act(async () => result.current.requestCode());

        expect(result.current.phoneError).toBe('invalidNumber');
        expect(rt.sendPhoneCode).not.toHaveBeenCalled();
    });

    it('keeps Resend shut, counting down, until the wait between sends is over', async () => {
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
        const { result } = setup();
        await sendCode(result);

        expect(result.current.canResend).toBe(false);
        expect(result.current.resendIn).toBeGreaterThan(55);

        await act(async () => void vi.advanceTimersByTime(PHONE_RESEND_COOLDOWN_MS));

        expect(result.current.resendIn).toBe(0);
        expect(result.current.canResend).toBe(true);
    });

    it('sends the code in login mode as an E.164 number with its country', async () => {
        const { result } = setup();

        await sendCode(result);

        expect(rt.sendPhoneCode).toHaveBeenCalledWith('+821012345678', { mode: 'login', countryCode: 'KR' });
        expect(result.current.codeSent).toBe(true);
    });

    it('registers the device before sending when there is no session yet', async () => {
        rt.isAuthenticated = false;
        const order: string[] = [];
        rt.loginGuest.mockImplementation(async () => void order.push('register'));
        rt.waitUntilVerified.mockImplementation(async () => {
            order.push('verified');
            return true;
        });
        rt.sendPhoneCode.mockImplementation(async () => {
            order.push('send');
            return { sent: true, expiredAt: Date.now() + 180_000 };
        });
        const { result } = setup();

        await sendCode(result);

        expect(rt.loginGuest).toHaveBeenCalledWith('device-1');
        // The send waits for the relay socket to authenticate the new device, or the first one fails.
        expect(order).toEqual(['register', 'verified', 'send']);
        expect(rt.waitUntilVerified).toHaveBeenCalledWith('relay', expect.any(Number));
    });

    it('sends nothing for a number that is not a mobile number', async () => {
        const { result } = setup();
        act(() => result.current.changeCountry('KR'));
        act(() => result.current.changePhone('0212345678'));

        await act(async () => result.current.requestCode());

        expect(rt.sendPhoneCode).not.toHaveBeenCalled();
        expect(result.current.phoneError).toBe('invalidNumber');
    });

    it('reports a failed device registration without sending', async () => {
        rt.isAuthenticated = false;
        rt.loginGuest.mockRejectedValue(new Error('503 down'));
        const { result } = setup();

        await sendCode(result);

        expect(rt.sendPhoneCode).not.toHaveBeenCalled();
        expect(result.current.phoneError).toBe('deviceFailed');
    });

    it('reads a refused first send as the daily cap', async () => {
        rt.sendPhoneCode.mockRejectedValue(new Error('429 TOO MANY REQUESTS'));
        const { result } = setup();

        await sendCode(result);

        expect(result.current.phoneError).toBe('tooManySends');
        expect(result.current.codeSent).toBe(false);
    });

    it('signs in once the last digit is in, through the runtime, and reports the account', async () => {
        const { result, onSignedIn } = setup();
        await sendCode(result);

        await typeCode(result);

        expect(rt.confirmPhoneLogin).toHaveBeenCalledTimes(1);
        expect(rt.confirmPhoneLogin).toHaveBeenCalledWith('+821012345678', CODE, { countryCode: 'KR' });
        expect(onSignedIn).toHaveBeenCalledWith({ isNew: false });
    });

    it('says when the number made a new account', async () => {
        rt.confirmPhoneLogin.mockResolvedValue({ isNew: true });
        const { result, onSignedIn } = setup();
        await sendCode(result);

        await typeCode(result);

        expect(onSignedIn).toHaveBeenCalledWith({ isNew: true });
    });

    it('does not confirm a partial code', async () => {
        const { result } = setup();
        await sendCode(result);

        await typeCode(result, CODE.slice(0, PHONE_CODE_LENGTH - 1));

        expect(rt.confirmPhoneLogin).not.toHaveBeenCalled();
    });

    it.each([
        ['403 FORBIDDEN - mismatch', 'wrongCode'],
        ['429 TOO MANY REQUESTS', 'attemptsExceeded'],
        ['400 INVALID - expired', 'codeExpired'],
        ['500 ERROR', 'verifyFailed'],
    ])('maps a confirm refused with %s to %s', async (message, expected) => {
        rt.confirmPhoneLogin.mockRejectedValue(new Error(message));
        const { result, onSignedIn } = setup();
        await sendCode(result);

        await typeCode(result);

        expect(result.current.codeError).toBe(expected);
        expect(onSignedIn).not.toHaveBeenCalled();
    });

    it('submits the same code again after it is edited, once a check failed', async () => {
        rt.confirmPhoneLogin.mockRejectedValueOnce(new Error('503 SOCKET NOT CONNECTED'));
        const { result } = setup();
        await sendCode(result);
        await typeCode(result);
        expect(result.current.codeError).toBe('verifyFailed');

        await typeCode(result, CODE.slice(0, PHONE_CODE_LENGTH - 1));
        await typeCode(result);

        expect(rt.confirmPhoneLogin).toHaveBeenCalledTimes(2);
    });

    it('refuses a login confirm that came back without a session token', async () => {
        rt.confirmPhoneLogin.mockRejectedValue(loginFailure('PHONE_LOGIN_NO_TOKEN'));
        const { result, onSignedIn } = setup();
        await sendCode(result);

        await typeCode(result);

        expect(onSignedIn).not.toHaveBeenCalled();
        expect(result.current.codeError).toBe('verifyFailed');
    });

    it('retries a failed session switch through the runtime, without checking the code again', async () => {
        rt.confirmPhoneLogin.mockRejectedValueOnce(loginFailure('PHONE_LOGIN_SWITCH_FAILED'));
        const { result, onSignedIn } = setup();
        await sendCode(result);
        await typeCode(result);

        expect(result.current.codeError).toBe('sessionSwitchFailed');
        expect(result.current.isRetry).toBe(true);

        await act(async () => result.current.retrySwitch());

        expect(rt.confirmPhoneLogin).toHaveBeenCalledTimes(1);
        expect(rt.retryPhoneLogin).toHaveBeenCalledTimes(1);
        expect(onSignedIn).toHaveBeenCalledWith({ isNew: false });
    });

    it('stays on the retry when the retried switch fails again', async () => {
        rt.confirmPhoneLogin.mockRejectedValueOnce(loginFailure('PHONE_LOGIN_SWITCH_FAILED'));
        rt.retryPhoneLogin.mockRejectedValueOnce(loginFailure('PHONE_LOGIN_SWITCH_FAILED'));
        const { result, onSignedIn } = setup();
        await sendCode(result);
        await typeCode(result);

        await act(async () => result.current.retrySwitch());

        expect(result.current.isRetry).toBe(true);
        expect(result.current.codeError).toBe('sessionSwitchFailed');
        expect(onSignedIn).not.toHaveBeenCalled();
    });

    it('goes back to the code when the runtime has nothing left to finish, so a resend is the way on', async () => {
        rt.confirmPhoneLogin.mockRejectedValueOnce(loginFailure('PHONE_LOGIN_SWITCH_FAILED'));
        rt.retryPhoneLogin.mockRejectedValueOnce(loginFailure('PHONE_LOGIN_NOTHING_PENDING'));
        const { result } = setup();
        await sendCode(result);
        await typeCode(result);

        await act(async () => result.current.retrySwitch());

        expect(result.current.isRetry).toBe(false);
        expect(result.current.codeError).toBe('verifyFailed');
    });

    it('cancels the login the runtime keeps waiting when the page closes', () => {
        const { unmount } = setup();

        unmount();

        expect(rt.cancelPhoneLogin).toHaveBeenCalledTimes(1);
    });

    it('drops the outstanding code when the number changes', async () => {
        const { result } = setup();
        await sendCode(result);

        act(() => result.current.changePhone('01087654321'));

        expect(result.current.codeSent).toBe(false);
        expect(result.current.canRequestCode).toBe(true);
    });

    it('resends to the number the code went to, and reads 429 as the cooldown', async () => {
        const { result } = setup();
        await sendCode(result);
        rt.sendPhoneCode.mockRejectedValueOnce(new Error('429 TOO MANY REQUESTS'));

        await act(async () => result.current.resend());

        expect(rt.sendPhoneCode).toHaveBeenLastCalledWith('+821012345678', {
            mode: 'login',
            countryCode: 'KR',
            resend: true,
        });
        expect(result.current.codeError).toBe('cooldown');
    });

    it('never logs the number or the code', async () => {
        rt.confirmPhoneLogin.mockRejectedValue(new Error('403 FORBIDDEN'));
        const { result } = setup();
        await sendCode(result);
        await typeCode(result);

        const logged = JSON.stringify(rt.error.mock.calls.map(([, message]) => message));
        expect(logged).not.toContain('1012345678');
        expect(logged).not.toContain(CODE);
    });
});
