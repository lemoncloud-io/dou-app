import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rt = vi.hoisted(() => ({
    isAuthenticated: true,
    loginGuest: vi.fn(),
    startWebTransportInit: vi.fn(),
    sendPhoneCode: vi.fn(),
    confirmPhoneCode: vi.fn(),
    applySessionToken: vi.fn(),
    error: vi.fn(),
}));

vi.mock('@chatic/bridges', () => ({ isNative: () => true, logger: { error: rt.error, warn: vi.fn() } }));
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        boot: { startWebTransportInit: rt.startWebTransportInit },
        data: {
            useRuntimeRepositories: () => ({
                auth: { sendPhoneCode: rt.sendPhoneCode, confirmPhoneCode: rt.confirmPhoneCode },
            }),
        },
        session: {
            getIdentityContext: () => ({ isAuthenticated: rt.isAuthenticated }),
            useDynamicDeviceId: () => ({ deviceId: 'device-1' }),
            useLoginRelayGuestByDevice: () => ({ mutateAsync: rt.loginGuest }),
            applySessionToken: rt.applySessionToken,
        },
    },
}));

import { PHONE_CODE_LENGTH, usePhoneLogin } from './usePhoneLogin';

const TOKEN = { Token: { identityToken: 'id' }, $auth: { id: 'auth-1' } };
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
        rt.startWebTransportInit.mockReset().mockResolvedValue(undefined);
        rt.sendPhoneCode.mockReset().mockResolvedValue({ sent: true, expiredAt: Date.now() + 180_000 });
        rt.confirmPhoneCode
            .mockReset()
            .mockResolvedValue({ step: 'confirm', mode: 'login', loggedIn: true, isNew: false, $token: TOKEN });
        rt.applySessionToken.mockReset().mockResolvedValue(undefined);
        rt.error.mockReset();
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
        rt.sendPhoneCode.mockImplementation(async () => {
            order.push('send');
            return { sent: true, expiredAt: Date.now() + 180_000 };
        });
        const { result } = setup();

        await sendCode(result);

        expect(rt.loginGuest).toHaveBeenCalledWith('device-1');
        expect(order).toEqual(['register', 'send']);
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

    it('confirms once the last digit is in, applies the token and reports the account', async () => {
        const { result, onSignedIn } = setup();
        await sendCode(result);

        await typeCode(result);

        expect(rt.confirmPhoneCode).toHaveBeenCalledTimes(1);
        expect(rt.confirmPhoneCode).toHaveBeenCalledWith('+821012345678', CODE, { mode: 'login', countryCode: 'KR' });
        expect(rt.applySessionToken).toHaveBeenCalledWith(TOKEN);
        expect(onSignedIn).toHaveBeenCalledWith({ isNew: false });
    });

    it('says when the number made a new account', async () => {
        rt.confirmPhoneCode.mockResolvedValue({
            step: 'confirm',
            mode: 'login',
            loggedIn: true,
            isNew: true,
            $token: TOKEN,
        });
        const { result, onSignedIn } = setup();
        await sendCode(result);

        await typeCode(result);

        expect(onSignedIn).toHaveBeenCalledWith({ isNew: true });
    });

    it('does not confirm a partial code', async () => {
        const { result } = setup();
        await sendCode(result);

        await typeCode(result, CODE.slice(0, PHONE_CODE_LENGTH - 1));

        expect(rt.confirmPhoneCode).not.toHaveBeenCalled();
    });

    it.each([
        ['403 FORBIDDEN - mismatch', 'wrongCode'],
        ['429 TOO MANY REQUESTS', 'attemptsExceeded'],
        ['400 INVALID - expired', 'codeExpired'],
        ['500 ERROR', 'verifyFailed'],
    ])('maps a confirm refused with %s to %s', async (message, expected) => {
        rt.confirmPhoneCode.mockRejectedValue(new Error(message));
        const { result, onSignedIn } = setup();
        await sendCode(result);

        await typeCode(result);

        expect(result.current.codeError).toBe(expected);
        expect(onSignedIn).not.toHaveBeenCalled();
    });

    it('retries a failed session switch with the token it got, without checking the code again', async () => {
        rt.applySessionToken.mockRejectedValueOnce(new Error('socket did not re-verify'));
        const { result, onSignedIn } = setup();
        await sendCode(result);
        await typeCode(result);

        expect(result.current.codeError).toBe('sessionSwitchFailed');
        expect(result.current.isRetry).toBe(true);

        await act(async () => result.current.retrySwitch());

        expect(rt.confirmPhoneCode).toHaveBeenCalledTimes(1);
        expect(rt.applySessionToken).toHaveBeenCalledTimes(2);
        expect(onSignedIn).toHaveBeenCalledWith({ isNew: false });
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
        rt.confirmPhoneCode.mockRejectedValue(new Error('403 FORBIDDEN'));
        const { result } = setup();
        await sendCode(result);
        await typeCode(result);

        const logged = JSON.stringify(rt.error.mock.calls.map(([, message]) => message));
        expect(logged).not.toContain('1012345678');
        expect(logged).not.toContain(CODE);
    });
});
