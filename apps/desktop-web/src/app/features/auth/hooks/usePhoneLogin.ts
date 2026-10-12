import { useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import {
    isValidMobileNumber,
    readInternationalInput,
    rememberCountry,
    resolveDefaultCountry,
    toE164,
    useOtpExpiryCountdown,
    type PhoneCountry,
} from '@chatic/shared/phone';

import { socketErrorStatus } from '../../../shared';
import { ensureDeviceSession } from '../utils';

/** Digits in the code the server sends. */
export const PHONE_CODE_LENGTH = 6;

/** The raw field keeps what was typed so a bad format stays visible; the parser reads digits. */
const PHONE_INPUT_MAX = 20;

/** Why a step did not go through. The page turns each into a sentence (`auth.phone.error.<key>`). */
export type PhoneLoginError =
    | 'invalidNumber'
    | 'deviceFailed'
    | 'tooManySends'
    | 'sendFailed'
    | 'cooldown'
    | 'resendFailed'
    | 'wrongCode'
    | 'attemptsExceeded'
    | 'codeExpired'
    | 'verifyFailed'
    | 'sessionSwitchFailed';

type Busy = 'idle' | 'sending' | 'resending' | 'confirming';

export interface PhoneLoginOptions {
    /** The session now belongs to the number's account. `isNew`: the server made that account just now. */
    onSignedIn: (result: { isNew: boolean }) => void;
}

/**
 * Phone-number sign-in over `auth.link-account` in `login` mode: send a code, then confirm it, and the
 * confirm's `$token` becomes this device's session. Only the login side of the packet is used here —
 * linking a number to an account that is already signed in is the mobile app's.
 *
 * - The server takes a login only from a device session, so sending registers the device first when
 *   there is no session (the same registration the Welcome page's guest start does).
 * - The code is checked by `confirm` alone. `verify` would only say the code is valid, which `confirm`
 *   proves anyway, and whether the number makes a new account is answered by `confirm` alone.
 * - The proof steps send the number and country the code was sent with, pinned at send time, not
 *   whatever the field holds by then: the server needs the same pair on both.
 * - A confirmed code is spent. When the session switch after it fails, the retry re-applies the
 *   `$token` it returned and never re-checks the code.
 *
 * The number and the code stay in the request body: nothing here logs them.
 */
export const usePhoneLogin = ({ onSignedIn }: PhoneLoginOptions) => {
    const { auth } = runtime.data.useRuntimeRepositories();
    const { deviceId } = runtime.session.useDynamicDeviceId();
    const { mutateAsync: loginGuest } = runtime.session.useLoginRelayGuestByDevice();

    const [phone, setPhone] = useState('');
    const [country, setCountry] = useState<PhoneCountry | null>(resolveDefaultCountry);
    const [sentWith, setSentWith] = useState<{ phone: string; country: PhoneCountry } | null>(null);
    const [expiredAt, setExpiredAt] = useState<number | undefined>(undefined);
    const [otp, setOtp] = useState('');
    const [busy, setBusy] = useState<Busy>('idle');
    const [phoneError, setPhoneError] = useState<PhoneLoginError | null>(null);
    const [codeError, setCodeError] = useState<PhoneLoginError | null>(null);
    const [pendingToken, setPendingToken] = useState<{ token: unknown; isNew: boolean } | null>(null);
    // The value last submitted. A ref, not `busy`: a keystroke landing as the last digit goes in must
    // not race the state update into a second confirm, which would spend another of the five attempts.
    const submittedRef = useRef<string | null>(null);

    const countdown = useOtpExpiryCountdown(expiredAt);
    const isExpired = countdown?.isExpired ?? false;
    const codeSent = expiredAt !== undefined;
    const isBusy = busy !== 'idle';

    // A different number or country makes the outstanding code someone else's.
    const dropOutstandingCode = () => {
        setExpiredAt(undefined);
        setSentWith(null);
        setOtp('');
        setCodeError(null);
        submittedRef.current = null;
    };

    const changePhone = (value: string) => {
        const next = value.slice(0, PHONE_INPUT_MAX);
        // A pasted `+81…` names its own country; the picker follows and the field keeps the local part.
        const international = readInternationalInput(next);
        if (international) {
            setCountry(international.country);
            rememberCountry(international.country);
            setPhone(international.national);
        } else {
            setPhone(next);
        }
        setPhoneError(null);
        dropOutstandingCode();
    };

    const changeCountry = (next: PhoneCountry) => {
        setCountry(next);
        rememberCountry(next);
        setPhoneError(null);
        dropOutstandingCode();
    };

    const requestCode = async () => {
        if (!country || !isValidMobileNumber(phone, country)) {
            setPhoneError('invalidNumber');
            return;
        }
        // E.164, not the local form: the server's phone hasher ignores `countryCode` once the number
        // starts with `+`, so E.164 is right whether or not the country is. The country rides along anyway.
        const wirePhone = toE164(phone, country);
        setBusy('sending');
        setPhoneError(null);
        try {
            try {
                await ensureDeviceSession(() => loginGuest(deviceId));
            } catch (error) {
                logger.error('AUTH', '[usePhoneLogin] device registration failed', { error });
                setPhoneError('deviceFailed');
                return;
            }
            const sent = await auth.sendPhoneCode(wirePhone, { mode: 'login', countryCode: country });
            setExpiredAt(sent.expiredAt);
            setSentWith({ phone: wirePhone, country });
            setOtp('');
            setCodeError(null);
            submittedRef.current = null;
        } catch (error) {
            const status = socketErrorStatus(error);
            logger.error('AUTH', `[usePhoneLogin] send failed (status=${status ?? '-'})`, { error });
            // A first send refused with 429 is a daily cap (per number, per device).
            setPhoneError(status === 429 ? 'tooManySends' : 'sendFailed');
        } finally {
            setBusy('idle');
        }
    };

    /** A new code for the number the last one went to. It does not reset the wrong-answer count. */
    const resend = async () => {
        if (!sentWith || isBusy) return;
        setBusy('resending');
        try {
            const sent = await auth.sendPhoneCode(sentWith.phone, {
                mode: 'login',
                countryCode: sentWith.country,
                resend: true,
            });
            setExpiredAt(sent.expiredAt);
            setOtp('');
            setCodeError(null);
            submittedRef.current = null;
        } catch (error) {
            const status = socketErrorStatus(error);
            logger.warn('AUTH', `[usePhoneLogin] resend failed (status=${status ?? '-'})`, { error });
            // Mid-flow, 429 is the cooldown between sends.
            setCodeError(status === 429 ? 'cooldown' : 'resendFailed');
        } finally {
            setBusy('idle');
        }
    };

    const applyToken = async (token: unknown, isNew: boolean) => {
        try {
            await runtime.session.applySessionToken(token);
            setPendingToken(null);
            setBusy('idle');
            onSignedIn({ isNew });
        } catch (error) {
            // Signed in on the server, not on this device: keep the token so the retry can finish it.
            logger.error('AUTH', '[usePhoneLogin] session switch failed after the code was confirmed', { error });
            setPendingToken({ token, isNew });
            setCodeError('sessionSwitchFailed');
            setBusy('idle');
        }
    };

    const confirm = async (code: string) => {
        if (!sentWith) return;
        setBusy('confirming');
        setCodeError(null);
        try {
            const result = await auth.confirmPhoneCode(sentWith.phone, code, {
                mode: 'login',
                countryCode: sentWith.country,
            });
            // A login confirm always carries a session token. Without one, applying it would quietly change
            // nothing and the reload would land back in the guest session, so it is a contract break.
            if (!('$token' in result) || !result.$token?.Token?.identityToken) {
                logger.error('AUTH', '[usePhoneLogin] login confirm came back without a token');
                setCodeError('verifyFailed');
                setBusy('idle');
                return;
            }
            await applyToken(result.$token, result.isNew);
        } catch (error) {
            const status = socketErrorStatus(error);
            logger.error('AUTH', `[usePhoneLogin] confirm failed (status=${status ?? '-'})`, { error });
            setCodeError(
                status === 403
                    ? 'wrongCode'
                    : status === 429
                      ? 'attemptsExceeded'
                      : status === 400
                        ? 'codeExpired'
                        : 'verifyFailed'
            );
            setBusy('idle');
        }
    };

    const changeOtp = (value: string) => {
        const next = value.replace(/\D/g, '').slice(0, PHONE_CODE_LENGTH);
        setOtp(next);
        setCodeError(null);
        // Editing the code re-arms it: after a failed check, deleting a digit and typing it back has to
        // submit again, or the only way out would be spending a resend.
        if (next.length < PHONE_CODE_LENGTH) submittedRef.current = null;
    };

    // Submit once every digit is in. Keyed on the value, so pasting a corrected code over a full one
    // still submits, and the ref keeps one value from being submitted twice.
    useEffect(() => {
        if (otp.length !== PHONE_CODE_LENGTH) return;
        if (isExpired || pendingToken || submittedRef.current === otp) return;
        submittedRef.current = otp;
        void confirm(otp);
    }, [otp]);

    const retrySwitch = async () => {
        if (!pendingToken || isBusy) return;
        const { token, isNew } = pendingToken;
        setBusy('confirming');
        setCodeError(null);
        await applyToken(token, isNew);
    };

    return {
        phone,
        changePhone,
        country,
        changeCountry,
        phoneError,
        canRequestCode: isValidMobileNumber(phone, country) && !codeSent && !isBusy,
        requestCode: () => void requestCode(),
        codeSent,
        otp,
        changeOtp,
        // Expiry shows on the code field even before a failed check, so a dead code never sits beside a live-looking timer.
        codeError: codeError ?? (isExpired ? ('codeExpired' as const) : null),
        countdown,
        resend: () => void resend(),
        canResend: codeSent && !isBusy && !pendingToken,
        busy,
        isRetry: !!pendingToken,
        retrySwitch: () => void retrySwitch(),
    };
};
