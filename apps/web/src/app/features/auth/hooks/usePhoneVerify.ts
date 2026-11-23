import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime';
import { logger } from '@chatic/bridges';
import {
    isValidMobileNumber,
    readInternationalInput,
    rememberCountry,
    resolveDefaultCountry,
    toE164,
    useOtpExpiryCountdown,
    type OtpExpiryCountdown,
    type PhoneCountry,
} from '@chatic/shared/phone';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useLinkAccount, type AccountLinkMode } from '../../../hooks/useLinkAccount';
import { getSocketErrorCode, VERIFICATION_CODE_LENGTH } from '../../../utils';
import { isDevBuild } from '../../../utils/buildEnv';

const RESEND_LIMIT = 5;

const DEV_BYPASS_CODE = '#';

const PHONE_INPUT_MAX = 20;

type LoadingState = 'idle' | 'sending' | 'resending' | 'verifying';
export type PhoneVerifyLimit = 'resend' | 'extend';

export interface PhoneVerifyOptions {
    mode: AccountLinkMode;
    inviteCode?: string;
    inviteLast4?: string;
    onVerified: () => void;
}

export interface PhoneVerifyShellProps extends PhoneVerifyOptions {
    onClose: () => void;
}

export interface PhoneVerifyFieldsState {
    phoneInput: string;
    phoneError: string;
    onPhoneChange: (value: string) => void;
    country: PhoneCountry | null;
    onCountryChange: (country: PhoneCountry) => void;
    canRequestCode: boolean;
    onRequestCode: () => void;
    otp: string;
    onOtpChange: (value: string) => void;
    codeSent: boolean;
    codeError: string;
    codeDescription: string;
    countdown: OtpExpiryCountdown | null;
    isBusy: boolean;
    onResend: (origin: PhoneVerifyLimit) => void;
    limit: PhoneVerifyLimit | null;
    onDismissLimit: () => void;
    showDevSwitches: boolean;
    canDevBypass: boolean;
    onDevBypass: () => void;
    devDryRun: boolean;
    onDevDryRunChange: (next: boolean) => void;
    devSlack: boolean;
    onDevSlackChange: (next: boolean) => void;
}

export interface PhoneVerifySubmitState {
    isRetry: boolean;
    disabled: boolean;
    loading: boolean;
    onSubmit: () => void;
}

export interface PhoneVerifyController {
    fields: PhoneVerifyFieldsState;
    submit: PhoneVerifySubmitState;
}

export const usePhoneVerify = ({
    mode,
    inviteCode,
    inviteLast4,
    onVerified,
}: PhoneVerifyOptions): PhoneVerifyController => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { send, verify, confirm } = useLinkAccount();

    const [phoneInput, setPhoneInput] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [country, setCountry] = useState<PhoneCountry | null>(resolveDefaultCountry);
    const [sentWith, setSentWith] = useState<{ phone: string; country: PhoneCountry } | null>(null);
    const [otp, setOtp] = useState('');
    const [otpError, setOtpError] = useState('');
    const [expiredAt, setExpiredAt] = useState<number | undefined>(undefined);
    const [resendCount, setResendCount] = useState(0);
    const [limit, setLimit] = useState<PhoneVerifyLimit | null>(null);
    const [loadingState, setLoadingState] = useState<LoadingState>('idle');
    const [awaitingSwitch, setAwaitingSwitch] = useState(false);
    const [linkVerified, setLinkVerified] = useState(false);
    const [devDryRun, setDevDryRun] = useState(false);
    const [devSlack, setDevSlack] = useState(false);

    const wirePhone = toE164(phoneInput, country);
    const countdown = useOtpExpiryCountdown(expiredAt);
    const isExpired = countdown?.isExpired ?? false;
    const isCodeComplete = otp.length === VERIFICATION_CODE_LENGTH;
    const resendExhausted = resendCount >= RESEND_LIMIT;
    const isBusy = loadingState !== 'idle';
    const codeSent = expiredAt !== undefined;

    const devSwitches = () => ({
        ...(devDryRun ? { dryRun: true } : undefined),
        ...(devSlack ? { slack: true, sms: false } : undefined),
    });

    const sendInviteCode = mode === 'login' ? inviteCode : undefined;

    const invalidateOutstandingCode = () => {
        setExpiredAt(undefined);
        setSentWith(null);
        setOtp('');
        setOtpError('');
        setLinkVerified(false);
    };

    const handlePhoneChange = (value: string) => {
        const next = value.slice(0, PHONE_INPUT_MAX);
        const international = readInternationalInput(next);
        if (international) {
            setCountry(international.country);
            rememberCountry(international.country);
            setPhoneInput(international.national);
        } else {
            setPhoneInput(next);
        }
        if (phoneError) setPhoneError('');
        invalidateOutstandingCode();
    };

    const handleCountryChange = (next: PhoneCountry) => {
        setCountry(next);
        rememberCountry(next);
        if (phoneError) setPhoneError('');
        invalidateOutstandingCode();
    };

    const handleSend = async () => {
        if (!country || !isValidMobileNumber(phoneInput, country)) {
            setPhoneError(t('phoneVerify.phoneInvalidFormat'));
            return;
        }
        if (inviteLast4 && !wirePhone.endsWith(inviteLast4)) {
            setPhoneError(t('phoneVerify.inviteMismatch'));
            return;
        }
        setLoadingState('sending');
        setPhoneError('');
        try {
            const result = await send(wirePhone, {
                mode,
                code: sendInviteCode,
                countryCode: country,
                ...devSwitches(),
            });
            setExpiredAt(result.expiredAt);
            setSentWith({ phone: wirePhone, country });
            setOtp('');
            setOtpError('');
            toast({ title: t('phoneVerify.sent') });
        } catch (error) {
            const code = getSocketErrorCode(error);
            logger.error('AUTH', `[usePhoneVerify] send failed (mode=${mode}, status=${code ?? '-'})`, { error });
            if (code === 400 && sendInviteCode) {
                setPhoneError(t('phoneVerify.inviteMismatch'));
            } else if (code === 429) {
                setPhoneError(t('phoneVerify.tooManyRequests'));
            } else {
                toast({ title: t('phoneVerify.sendFailed'), variant: 'destructive' });
            }
        } finally {
            setLoadingState('idle');
        }
    };

    const handleResend = async (origin: PhoneVerifyLimit) => {
        if (resendExhausted) {
            setLimit(origin);
            return;
        }
        if (!sentWith) return;
        setLoadingState('resending');
        try {
            const result = await send(sentWith.phone, {
                mode,
                code: sendInviteCode,
                countryCode: sentWith.country,
                resend: true,
                ...devSwitches(),
            });
            setExpiredAt(result.expiredAt);
            setOtp('');
            setOtpError('');
            submittedOtpRef.current = null;
            setResendCount(count => count + 1);
            toast({ title: t('phoneVerify.resent'), description: t('phoneVerify.resendKeepsCounter') });
        } catch (error) {
            const status = getSocketErrorCode(error);
            logger.warn('AUTH', `[usePhoneVerify] otp resend failed (status=${status ?? '-'})`, { error });
            if (status === 429) {
                setOtpError(t('phoneVerify.cooldown'));
            } else {
                toast({ title: t('phoneVerify.resendFailed'), variant: 'destructive' });
            }
        } finally {
            setLoadingState('idle');
        }
    };

    const signedIn = () => {
        setAwaitingSwitch(false);
        toast({ title: t('phoneVerify.verified') });
        onVerified();
    };

    const switchFailed = () => {
        setAwaitingSwitch(true);
        setOtpError(t('phoneVerify.sessionSwitchFailed'));
        setLoadingState('idle');
    };

    const reportProveError = (error: unknown, { vouched = false }: { vouched?: boolean } = {}) => {
        const code = getSocketErrorCode(error);
        logger.error('AUTH', `[usePhoneVerify] prove failed (mode=${mode}, status=${code ?? '-'})`, { error });
        if (code === 403) {
            setOtpError(t(vouched ? 'phoneVerify.linkTypeAlreadyLinked' : 'phoneVerify.wrongCode'));
        } else if (code === 429) {
            setOtpError(t('phoneVerify.attemptsExceeded'));
        } else if (code === 400) {
            setOtpError(t('phoneVerify.codeExpired'));
        } else if (code === 409) {
            setOtpError(t('phoneVerify.linkOccupied'));
        } else {
            toast({ title: t('phoneVerify.verifyFailed'), variant: 'destructive' });
        }
        setLoadingState('idle');
    };

    const handleVerifyStep = async (code: string = otp) => {
        if (!sentWith) return;
        setLoadingState('verifying');
        setOtpError('');
        try {
            const result = await verify(sentWith.phone, code, { mode, countryCode: sentWith.country });
            if ('linkable' in result && !result.linkable) {
                setLinkVerified(false);
                setOtpError(
                    result.reason === 'type-linked'
                        ? t('phoneVerify.linkTypeAlreadyLinked')
                        : t('phoneVerify.linkOccupied')
                );
                setLoadingState('idle');
                return;
            }
            setLinkVerified(true);
            setLoadingState('idle');
        } catch (error) {
            setLinkVerified(false);
            reportProveError(error);
        }
    };

    const handleConfirm = async (code: string = otp) => {
        if (!sentWith) return;
        setLoadingState('verifying');
        setOtpError('');
        try {
            if (mode === 'login') {
                await runtime.session.confirmPhoneLogin(sentWith.phone, code, { countryCode: sentWith.country });
            } else {
                await confirm(sentWith.phone, code, { mode, countryCode: sentWith.country });
            }
            logger.info('AUTH', '[usePhoneVerify] phone verification confirmed', { mode });
            signedIn();
        } catch (error) {
            const failure = (error as { code?: unknown } | null)?.code;
            if (failure === runtime.session.PHONE_LOGIN_SWITCH_FAILED) {
                switchFailed();
                return;
            }
            if (failure === runtime.session.PHONE_LOGIN_NO_TOKEN) {
                logger.error('AUTH', '[usePhoneVerify] login confirm came back without a session token', { error });
                toast({ title: t('phoneVerify.verifyFailed'), variant: 'destructive' });
                setLoadingState('idle');
                return;
            }
            reportProveError(error, { vouched: mode === 'link' && linkVerified });
        }
    };

    const handleRetrySessionSwitch = async () => {
        if (!awaitingSwitch) return;
        setLoadingState('verifying');
        setOtpError('');
        try {
            await runtime.session.retryPhoneLogin();
            signedIn();
        } catch (error) {
            if ((error as { code?: unknown } | null)?.code === runtime.session.PHONE_LOGIN_NOTHING_PENDING) {
                setAwaitingSwitch(false);
                setOtpError(t('phoneVerify.verifyFailed'));
                setLoadingState('idle');
                return;
            }
            switchFailed();
        }
    };

    useEffect(() => () => runtime.session.cancelPhoneLogin(), []);

    const handleOtpChange = (value: string) => {
        setOtp(value.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH));
        setOtpError('');
        setLinkVerified(false);
    };

    const submittedOtpRef = useRef<string | null>(null);
    useEffect(() => {
        if (otp.length !== VERIFICATION_CODE_LENGTH) return;
        if (isExpired || awaitingSwitch || submittedOtpRef.current === otp) return;
        submittedOtpRef.current = otp;
        void (mode === 'link' ? handleVerifyStep() : handleConfirm());
    }, [otp]);

    const handleDevBypass = async () => {
        if (!isDevBuild() || !sentWith || isBusy) return;
        setOtp(DEV_BYPASS_CODE);
        submittedOtpRef.current = DEV_BYPASS_CODE;
        if (mode === 'link' && !linkVerified) await handleVerifyStep(DEV_BYPASS_CODE);
        await handleConfirm(DEV_BYPASS_CODE);
    };

    const handleSubmit = () => {
        if (awaitingSwitch) return void handleRetrySessionSwitch();
        if (mode === 'link' && !linkVerified) return void handleVerifyStep();
        void handleConfirm();
    };

    return {
        fields: {
            phoneInput,
            phoneError,
            onPhoneChange: handlePhoneChange,
            country,
            onCountryChange: handleCountryChange,
            canRequestCode: isValidMobileNumber(phoneInput, country) && !codeSent && !isBusy,
            onRequestCode: () => void handleSend(),
            otp,
            onOtpChange: handleOtpChange,
            codeSent,
            codeError: otpError || (isExpired ? t('phoneVerify.codeExpired') : ''),
            codeDescription: resendCount > 0 ? t('phoneVerify.resendKeepsCounter') : t('phoneVerify.digitsOnly'),
            countdown,
            isBusy,
            onResend: origin => void handleResend(origin),
            limit,
            onDismissLimit: () => setLimit(null),
            showDevSwitches: isDevBuild(),
            devDryRun,
            onDevDryRunChange: setDevDryRun,
            devSlack,
            onDevSlackChange: setDevSlack,
            canDevBypass: codeSent && !isBusy && !awaitingSwitch,
            onDevBypass: () => void handleDevBypass(),
        },
        submit: {
            isRetry: awaitingSwitch,
            disabled: awaitingSwitch ? isBusy : !isCodeComplete || isBusy || isExpired,
            loading: loadingState === 'verifying',
            onSubmit: handleSubmit,
        },
    };
};
