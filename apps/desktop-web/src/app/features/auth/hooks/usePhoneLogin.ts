import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';
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

export const PHONE_CODE_LENGTH = 6;

export const PHONE_RESEND_COOLDOWN_MS = 60 * 1000;

const UI_LANGUAGE_COUNTRY: Record<string, PhoneCountry> = { ko: 'KR' };

const RELAY_VERIFY_TIMEOUT_MS = 10_000;

const PHONE_INPUT_MAX = 20;

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
    onSignedIn: (result: { isNew: boolean }) => void;
}

export const usePhoneLogin = ({ onSignedIn }: PhoneLoginOptions) => {
    const { auth } = runtime.data.useRuntimeRepositories();
    const { deviceId } = runtime.session.useDynamicDeviceId();
    const { mutateAsync: loginGuest } = runtime.session.useLoginRelayGuestByDevice();

    const [phone, setPhone] = useState('');
    const { i18n } = useTranslation();
    const [country, setCountry] = useState<PhoneCountry | null>(() =>
        resolveDefaultCountry(UI_LANGUAGE_COUNTRY[(i18n.language ?? '').split('-')[0]] ?? null)
    );
    const [sentWith, setSentWith] = useState<{ phone: string; country: PhoneCountry } | null>(null);
    const [expiredAt, setExpiredAt] = useState<number | undefined>(undefined);
    const [resendAt, setResendAt] = useState<number | undefined>(undefined);
    const [otp, setOtp] = useState('');
    const [busy, setBusy] = useState<Busy>('idle');
    const [phoneError, setPhoneError] = useState<PhoneLoginError | null>(null);
    const [codeError, setCodeError] = useState<PhoneLoginError | null>(null);
    const [awaitingSwitch, setAwaitingSwitch] = useState(false);
    const submittedRef = useRef<string | null>(null);

    const countdown = useOtpExpiryCountdown(expiredAt);
    const resendWait = useOtpExpiryCountdown(resendAt);
    const resendIn = resendWait && !resendWait.isExpired ? resendWait.secondsLeft : 0;
    const isExpired = countdown?.isExpired ?? false;
    const codeSent = expiredAt !== undefined;
    const isBusy = busy !== 'idle';

    const dropOutstandingCode = () => {
        setExpiredAt(undefined);
        setResendAt(undefined);
        setSentWith(null);
        setOtp('');
        setCodeError(null);
        submittedRef.current = null;
    };

    const changePhone = (value: string) => {
        const next = value.slice(0, PHONE_INPUT_MAX);
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
            await runtime.connection.waitUntilVerified(runtime.connection.RELAY_SLOT, RELAY_VERIFY_TIMEOUT_MS);
            const sent = await auth.sendPhoneCode(wirePhone, { mode: 'login', countryCode: country });
            setExpiredAt(sent.expiredAt);
            setResendAt(Date.now() + PHONE_RESEND_COOLDOWN_MS);
            setSentWith({ phone: wirePhone, country });
            setOtp('');
            setCodeError(null);
            submittedRef.current = null;
        } catch (error) {
            const status = socketErrorStatus(error);
            logger.error('AUTH', `[usePhoneLogin] send failed (status=${status ?? '-'})`, { error });
            setPhoneError(status === 429 ? 'tooManySends' : 'sendFailed');
        } finally {
            setBusy('idle');
        }
    };

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
            setResendAt(Date.now() + PHONE_RESEND_COOLDOWN_MS);
            setOtp('');
            setCodeError(null);
            submittedRef.current = null;
        } catch (error) {
            const status = socketErrorStatus(error);
            logger.warn('AUTH', `[usePhoneLogin] resend failed (status=${status ?? '-'})`, { error });
            if (status === 429) setResendAt(Date.now() + PHONE_RESEND_COOLDOWN_MS);
            setCodeError(status === 429 ? 'cooldown' : 'resendFailed');
        } finally {
            setBusy('idle');
        }
    };

    const signedIn = (isNew: boolean) => {
        setAwaitingSwitch(false);
        setBusy('idle');
        onSignedIn({ isNew });
    };

    const switchFailed = () => {
        setAwaitingSwitch(true);
        setCodeError('sessionSwitchFailed');
        setBusy('idle');
    };

    const failureOf = (error: unknown): unknown => (error as { code?: unknown } | null)?.code;

    const confirm = async (code: string) => {
        if (!sentWith) return;
        setBusy('confirming');
        setCodeError(null);
        try {
            const { isNew } = await runtime.session.confirmPhoneLogin(sentWith.phone, code, {
                countryCode: sentWith.country,
            });
            signedIn(isNew);
        } catch (error) {
            if (failureOf(error) === runtime.session.PHONE_LOGIN_SWITCH_FAILED) {
                switchFailed();
                return;
            }
            if (failureOf(error) === runtime.session.PHONE_LOGIN_NO_TOKEN) {
                logger.error('AUTH', '[usePhoneLogin] login confirm came back without a token');
                setCodeError('verifyFailed');
                setBusy('idle');
                return;
            }
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
        if (next.length < PHONE_CODE_LENGTH) submittedRef.current = null;
    };

    useEffect(() => {
        if (otp.length !== PHONE_CODE_LENGTH) return;
        if (isExpired || awaitingSwitch || submittedRef.current === otp) return;
        submittedRef.current = otp;
        void confirm(otp);
    }, [otp]);

    const retrySwitch = async () => {
        if (!awaitingSwitch || isBusy) return;
        setBusy('confirming');
        setCodeError(null);
        try {
            const { isNew } = await runtime.session.retryPhoneLogin();
            signedIn(isNew);
        } catch (error) {
            if (failureOf(error) === runtime.session.PHONE_LOGIN_NOTHING_PENDING) {
                setAwaitingSwitch(false);
                setCodeError('verifyFailed');
                setBusy('idle');
                return;
            }
            switchFailed();
        }
    };

    useEffect(() => () => runtime.session.cancelPhoneLogin(), []);

    return {
        phone,
        changePhone,
        country,
        changeCountry,
        phoneError,
        canRequestCode: phone.trim().length > 0 && !codeSent && !isBusy,
        requestCode: () => void requestCode(),
        codeSent,
        otp,
        changeOtp,
        codeError: codeError ?? (isExpired ? ('codeExpired' as const) : null),
        countdown,
        resend: () => void resend(),
        canResend: codeSent && !isBusy && !awaitingSwitch && resendIn === 0,
        resendIn,
        busy,
        isRetry: awaitingSwitch,
        retrySwitch: () => void retrySwitch(),
    };
};
