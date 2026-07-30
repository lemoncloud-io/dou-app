import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { applySessionToken } from '@chatic/app-runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

// Concrete modules, not the account feature root: the root re-exports pages that pull web-core
// (whose transport reads import.meta) and a components barrel that pulls @chatic/assets — both
// unloadable under the jsdom test setup.
import { VERIFICATION_CODE_LENGTH } from '../../account/constants';
import { useVerifyHashAlias } from '../../../hooks/useVerifyHashAlias';
import { getSocketErrorCode } from '../../../utils/errors';
import { isDevBuild } from '../utils/env';
import { isValidKoreanPhone, PHONE_DIGITS_MAX } from '../utils/phone';
import { useOtpExpiryCountdown, type OtpExpiryCountdown } from './useOtpExpiryCountdown';

/**
 * Resend/extend cap enforced client-side BEFORE the server is asked; a server 429 (60s cooldown,
 * daily caps) always wins over this counter (roadmap Track A). "Extend time" and "resend" are the
 * same server step — the backend has no extend concept (ADR-0033 D9) — so one counter covers both,
 * even though the design gives each control its own over-limit dialog.
 */
const RESEND_LIMIT = 5;

/** The raw phone field accepts what the user typed so a bad format is visible; digits drive logic. */
const PHONE_INPUT_MAX = 20;

type LoadingState = 'idle' | 'sending' | 'resending' | 'verifying';
/** Which control tripped the client-side cap — picks the over-limit dialog's copy. */
export type PhoneVerifyLimit = 'resend' | 'extend';

/** What the state machine itself needs. Chrome concerns (`onClose`, `context`) are not here. */
export interface PhoneVerifyOptions {
    /**
     * Invite code when verifying inside an accept flow. Sent with EVERY send/resend/check so a
     * number that does not match the invite is rejected at SEND time with 400 (client guide §B-2).
     */
    inviteCode?: string;
    /** Fired after the check succeeded AND the session/socket switch finished (main user active). */
    onVerified: () => void;
}

/** What every shell takes: the machine's options plus its own dismissal. */
export interface PhoneVerifyShellProps extends PhoneVerifyOptions {
    /** Fired when the user backs out (including via the social-login banner). */
    onClose: () => void;
}

/** What `PhoneVerifyFields` renders — every value it needs, already derived. */
export interface PhoneVerifyFieldsState {
    phoneInput: string;
    phoneError: string;
    onPhoneChange: (value: string) => void;
    /** Whether 인증 요청 may fire: a valid number, no live code, nothing in flight. */
    canRequestCode: boolean;
    onRequestCode: () => void;
    otp: string;
    onOtpChange: (value: string) => void;
    /** A code is outstanding — the code field and 재전송 unlock, and the timer row appears. */
    codeSent: boolean;
    codeError: string;
    codeDescription: string;
    countdown: OtpExpiryCountdown | null;
    isBusy: boolean;
    /** Both 재전송 and 시간 연장 land here; the argument only picks the over-limit dialog. */
    onResend: (origin: PhoneVerifyLimit) => void;
    limit: PhoneVerifyLimit | null;
    onDismissLimit: () => void;
    showDevSwitches: boolean;
    devDryRun: boolean;
    onDevDryRunChange: (next: boolean) => void;
    devSlack: boolean;
    onDevSlackChange: (next: boolean) => void;
}

/** The submit CTA. Shells place it differently (pinned vs sheet footer) but wire it identically. */
export interface PhoneVerifySubmitState {
    /** A committed `$token` is waiting — the button retries the SWITCH, never the consumed check. */
    isRetry: boolean;
    disabled: boolean;
    loading: boolean;
    onSubmit: () => void;
}

export interface PhoneVerifyController {
    fields: PhoneVerifyFieldsState;
    submit: PhoneVerifySubmitState;
}

/**
 * The phone self-verification state machine over `auth.verify-hash-alias`, independent of how it is
 * presented. `PhoneVerifyScreen` (full-screen) and `PhoneVerifySheet` (bottom sheet) both drive it.
 *
 * A successful check IS a login: when the response carries `$token`, the device user just became a
 * main user and `applySessionToken` pushes that identity into web-core and the live relay socket
 * BEFORE `onVerified` fires — so the caller can immediately `invite.create`/`invite.accept` without
 * a 403. An empty `$token` means the number was merely linked (session unchanged).
 *
 * Error copy branches on `getSocketErrorCode` only — server messages are not a contract. See
 * apps/web/docs/feature/auth/phone-verification.md for the full case table.
 */
export const usePhoneVerify = ({ inviteCode, onVerified }: PhoneVerifyOptions): PhoneVerifyController => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { send, check } = useVerifyHashAlias();

    const [phoneInput, setPhoneInput] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [otp, setOtp] = useState('');
    const [otpError, setOtpError] = useState('');
    const [expiredAt, setExpiredAt] = useState<number | undefined>(undefined);
    const [resendCount, setResendCount] = useState(0);
    const [limit, setLimit] = useState<PhoneVerifyLimit | null>(null);
    const [loadingState, setLoadingState] = useState<LoadingState>('idle');
    // The $token of a successful check, kept until applySessionToken succeeds: the OTP is consumed
    // by then, so a failed session switch retries the SWITCH, never the check.
    const [pendingToken, setPendingToken] = useState<unknown>(null);
    // Dev-only delivery switches; unset switches are omitted so server defaults survive (D13).
    const [devDryRun, setDevDryRun] = useState(false);
    const [devSlack, setDevSlack] = useState(false);

    const phoneDigits = phoneInput.replace(/\D/g, '').slice(0, PHONE_DIGITS_MAX);
    const countdown = useOtpExpiryCountdown(expiredAt);
    const isExpired = countdown?.isExpired ?? false;
    const isCodeComplete = otp.length === VERIFICATION_CODE_LENGTH;
    const resendExhausted = resendCount >= RESEND_LIMIT;
    const isBusy = loadingState !== 'idle';
    // A code is outstanding once a send/resend came back with an expiry. Retyping the number clears
    // it, which re-arms 인증 요청 for the new number (Figma greys it out while a code is live).
    const codeSent = expiredAt !== undefined;

    const devSwitches = () => ({
        ...(devDryRun ? { dryRun: true } : undefined),
        // Receiving over Slack means NOT over SMS (client guide §A-1 dev builds).
        ...(devSlack ? { slack: true, sms: false } : undefined),
    });

    const handlePhoneChange = (value: string) => {
        setPhoneInput(value.slice(0, PHONE_INPUT_MAX));
        if (phoneError) setPhoneError('');
        // A different number invalidates the outstanding code rather than silently checking it
        // against the new one.
        setExpiredAt(undefined);
        setOtp('');
        setOtpError('');
    };

    const handleSend = async () => {
        if (!isValidKoreanPhone(phoneDigits)) {
            setPhoneError(t('phoneVerify.phoneInvalidFormat'));
            return;
        }
        setLoadingState('sending');
        setPhoneError('');
        try {
            const result = await send(phoneDigits, { code: inviteCode, ...devSwitches() });
            setExpiredAt(result.expiredAt);
            setOtp('');
            setOtpError('');
            toast({ title: t('phoneVerify.sent') });
        } catch (error) {
            const code = getSocketErrorCode(error);
            if (code === 400 && inviteCode) {
                // The number does not match the invite — the code was never dispatched (§B-2).
                setPhoneError(t('phoneVerify.inviteMismatch'));
            } else if (code === 429) {
                // First send tripping 429 is the daily cap (10/day per number, 20/day per device).
                setPhoneError(t('phoneVerify.tooManyRequests'));
            } else {
                toast({ title: t('phoneVerify.sendFailed'), variant: 'destructive' });
            }
        } finally {
            setLoadingState('idle');
        }
    };

    /**
     * Shared by 재전송 and 시간 연장 — both are `step=resend` (D9). Past the client cap the server
     * is never asked; the design answers with a per-control dialog instead of a dead button.
     */
    const handleResend = async (origin: PhoneVerifyLimit) => {
        if (resendExhausted) {
            setLimit(origin);
            return;
        }
        setLoadingState('resending');
        try {
            const result = await send(phoneDigits, { code: inviteCode, resend: true, ...devSwitches() });
            setExpiredAt(result.expiredAt);
            setOtp('');
            setOtpError('');
            submittedOtpRef.current = null; // a fresh code makes the previous submission irrelevant
            setResendCount(count => count + 1);
            // The wrong-answer counter survives a resend (§발송 제한) — say so with the new code.
            toast({ title: t('phoneVerify.resent'), description: t('phoneVerify.resendKeepsCounter') });
        } catch (error) {
            if (getSocketErrorCode(error) === 429) {
                // Mid-flow resend tripping 429 is the 60s cooldown.
                setOtpError(t('phoneVerify.cooldown'));
            } else {
                toast({ title: t('phoneVerify.resendFailed'), variant: 'destructive' });
            }
        } finally {
            setLoadingState('idle');
        }
    };

    /** Applies a check-issued `$token`; kept separate so a failed switch is retryable on its own. */
    const applyToken = async (token: unknown) => {
        try {
            await applySessionToken(token);
            setPendingToken(null);
            toast({ title: t('phoneVerify.verified') });
            onVerified();
        } catch {
            setPendingToken(token);
            setOtpError(t('phoneVerify.sessionSwitchFailed'));
            setLoadingState('idle');
        }
    };

    const handleVerify = async () => {
        setLoadingState('verifying');
        setOtpError('');
        try {
            const result = await check(phoneDigits, otp, { code: inviteCode });
            if (result.$token) {
                await applyToken(result.$token);
                return;
            }
            // Linked-only result: the session did not change, nothing to switch.
            toast({ title: t('phoneVerify.verified') });
            onVerified();
        } catch (error) {
            const code = getSocketErrorCode(error);
            if (code === 403) {
                setOtpError(t('phoneVerify.wrongCode'));
            } else if (code === 429) {
                // 5 wrong answers — a fresh code will NOT reset the counter, but resending is still
                // the guided way out (roadmap Track A case table).
                setOtpError(t('phoneVerify.attemptsExceeded'));
            } else if (code === 400) {
                setOtpError(t('phoneVerify.codeExpired'));
            } else {
                toast({ title: t('phoneVerify.verifyFailed'), variant: 'destructive' });
            }
            setLoadingState('idle');
        }
    };

    const handleRetrySessionSwitch = async () => {
        if (!pendingToken) return;
        setLoadingState('verifying');
        setOtpError('');
        await applyToken(pendingToken);
    };

    const handleOtpChange = (value: string) => {
        setOtp(value.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH));
        setOtpError('');
    };

    /**
     * Auto-submit once all digits are in (same convention as EmailVerifyDialog). Keyed on the VALUE,
     * not on a "is it complete" boolean, so pasting a corrected code over a full one still submits.
     * The ref — not `loadingState` — is the re-entry guard: a tap landing on the last typed digit
     * would otherwise race the state update and spend two of the five attempts on one code.
     */
    const submittedOtpRef = useRef<string | null>(null);
    useEffect(() => {
        if (otp.length !== VERIFICATION_CODE_LENGTH) return;
        if (isExpired || pendingToken || submittedOtpRef.current === otp) return;
        submittedOtpRef.current = otp;
        void handleVerify();
    }, [otp]);

    return {
        fields: {
            phoneInput,
            phoneError,
            onPhoneChange: handlePhoneChange,
            canRequestCode: isValidKoreanPhone(phoneDigits) && !codeSent && !isBusy,
            onRequestCode: () => void handleSend(),
            otp,
            onOtpChange: handleOtpChange,
            codeSent,
            // Expiry is surfaced on the code field even without a failed check, so the row never
            // shows a live-looking timer next to a dead code.
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
        },
        submit: {
            isRetry: !!pendingToken,
            disabled: pendingToken ? isBusy : !isCodeComplete || isBusy || isExpired,
            loading: loadingState === 'verifying',
            onSubmit: () => void (pendingToken ? handleRetrySessionSwitch() : handleVerify()),
        },
    };
};
