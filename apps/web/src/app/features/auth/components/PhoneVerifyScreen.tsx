import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronLeft, Loader2 } from 'lucide-react';

import { applySessionToken } from '@chatic/app-runtime';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cn } from '@chatic/lib/utils';

// Concrete modules, not the account feature root: the root re-exports pages that pull web-core
// (whose transport reads import.meta) and a components barrel that pulls @chatic/assets — both
// unloadable under the jsdom test setup.
import { VerificationCodeInput } from '../../account/components/VerificationCodeInput';
import { VERIFICATION_CODE_LENGTH } from '../../account/constants';
import { formatTime } from '../../account/utils';
import { useVerifyHashAlias } from '../../../hooks/useVerifyHashAlias';
import { getSocketErrorCode } from '../../../utils/errors';
import { useOtpExpiryCountdown } from '../hooks/useOtpExpiryCountdown';
import { isDevBuild } from '../utils/env';
import { formatPhoneNumber, isValidKoreanPhone, PHONE_DIGITS_MAX } from '../utils/phone';
import { PhoneVerifyBanner } from './PhoneVerifyBanner';

/**
 * Resend/extend cap enforced client-side BEFORE the server is asked; a server 429 (60s cooldown,
 * daily caps) always wins over this counter (roadmap Track A). "Extend time" and "resend" are the
 * same server step — the backend has no extend concept (ADR-0033 D9).
 */
const RESEND_LIMIT = 5;

type Step = 'phone' | 'otp';
type LoadingState = 'idle' | 'sending' | 'resending' | 'verifying';

export interface PhoneVerifyScreenProps {
    /** Which flow summoned the screen — picks the description copy (the packets are identical). */
    context: 'invite-accept' | 'invite-create';
    /**
     * Invite code when verifying inside an accept flow. Sent with EVERY send/resend/check so a
     * number that does not match the invite is rejected at SEND time with 400 (client guide §B-2).
     */
    inviteCode?: string;
    /** Fired after the check succeeded AND the session/socket switch finished (main user active). */
    onVerified: () => void;
    /** Fired when the user backs out (including via the social-login banner). */
    onClose: () => void;
}

/**
 * Full-screen phone self-verification over `auth.verify-hash-alias` (roadmap Track A contract;
 * consumed by Track B/C). A successful check IS a login: when the response carries `$token`, the
 * device user just became a main user and `applySessionToken` pushes that identity into web-core
 * and the live relay socket BEFORE `onVerified` fires — so the caller can immediately
 * `invite.create`/`invite.accept` without a 403. An empty `$token` means the number was merely
 * linked (session unchanged).
 *
 * Error copy branches on `getSocketErrorCode` only — server messages are not a contract. See
 * apps/web/docs/feature/auth/phone-verification.md for the full case table.
 */
export const PhoneVerifyScreen = ({ context, inviteCode, onVerified, onClose }: PhoneVerifyScreenProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { send, check } = useVerifyHashAlias();

    const [step, setStep] = useState<Step>('phone');
    const [phoneDigits, setPhoneDigits] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [otp, setOtp] = useState('');
    const [otpError, setOtpError] = useState('');
    const [expiredAt, setExpiredAt] = useState<number | undefined>(undefined);
    const [resendCount, setResendCount] = useState(0);
    const [loadingState, setLoadingState] = useState<LoadingState>('idle');
    // The $token of a successful check, kept until applySessionToken succeeds: the OTP is consumed
    // by then, so a failed session switch retries the SWITCH, never the check.
    const [pendingToken, setPendingToken] = useState<unknown>(null);
    // Dev-only delivery switches; unset switches are omitted so server defaults survive (D13).
    const [devDryRun, setDevDryRun] = useState(false);
    const [devSlack, setDevSlack] = useState(false);

    const countdown = useOtpExpiryCountdown(expiredAt);
    const isExpired = countdown?.isExpired ?? false;
    const isCodeComplete = otp.length === VERIFICATION_CODE_LENGTH;
    const resendExhausted = resendCount >= RESEND_LIMIT;
    const showDevSwitches = isDevBuild();

    const devSwitches = () => ({
        ...(devDryRun ? { dryRun: true } : undefined),
        // Receiving over Slack means NOT over SMS (client guide §A-1 dev builds).
        ...(devSlack ? { slack: true, sms: false } : undefined),
    });

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
            setStep('otp');
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

    /** Shared by the "resend" link and the "extend time" button — both are `step=resend` (D9). */
    const handleResend = async () => {
        if (resendExhausted) return;
        setLoadingState('resending');
        try {
            const result = await send(phoneDigits, { code: inviteCode, resend: true, ...devSwitches() });
            setExpiredAt(result.expiredAt);
            setOtp('');
            setOtpError('');
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

    const handleBackToPhone = () => {
        setStep('phone');
        setOtp('');
        setOtpError('');
        setExpiredAt(undefined);
    };

    const handleOtpChange = (value: string) => {
        setOtp(value);
        setOtpError('');
    };

    // Auto-submit once all digits are in (same convention as EmailVerifyDialog).
    useEffect(() => {
        if (isCodeComplete && loadingState === 'idle' && !isExpired && !pendingToken) {
            handleVerify();
        }
         
    }, [isCodeComplete]);

    const isBusy = loadingState !== 'idle';
    const formattedPhone = formatPhoneNumber(phoneDigits);

    return (
        <Dialog open onOpenChange={value => !value && onClose()}>
            <DialogContent className="h-full max-w-none rounded-none p-0 sm:rounded-none" hideClose>
                <DialogTitle className="sr-only">{t('phoneVerify.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('phoneVerify.title')}</DialogDescription>

                {step === 'phone' && (
                    <div className="flex h-full flex-col p-6 pt-safe-top">
                        <div className="flex flex-col gap-5">
                            <button onClick={onClose} className="-ml-2 self-start rounded-full p-1" aria-label="close">
                                <ChevronLeft size={24} strokeWidth={2} />
                            </button>

                            <PhoneVerifyBanner onClose={onClose} />

                            <div className="flex flex-col gap-[6px]">
                                <h2 className="text-[18px] font-bold">{t('phoneVerify.title')}</h2>
                                <p className="text-[14px] font-medium text-[#9FA2A7]">
                                    {context === 'invite-accept'
                                        ? t('phoneVerify.descriptionInviteAccept')
                                        : t('phoneVerify.descriptionInviteCreate')}
                                </p>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-[14px] font-semibold leading-[1.286] tracking-[0.005em] text-muted-foreground">
                                    {t('phoneVerify.phoneLabel')}
                                </label>
                                <div
                                    className={cn(
                                        'flex items-center rounded-[10px] border bg-background px-3 py-3',
                                        phoneError ? 'border-destructive' : 'border-border'
                                    )}
                                >
                                    <input
                                        value={formattedPhone}
                                        onChange={e => {
                                            setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, PHONE_DIGITS_MAX));
                                            if (phoneError) setPhoneError('');
                                        }}
                                        placeholder={t('phoneVerify.phonePlaceholder')}
                                        type="tel"
                                        autoFocus
                                        className="flex-1 bg-transparent text-[16px] font-normal leading-[1.45] tracking-[-0.015em] text-foreground outline-none placeholder:text-muted-foreground"
                                    />
                                    <span className="shrink-0 text-[13px] font-medium tracking-[0.019em] text-muted-foreground">
                                        {phoneDigits.length}/{PHONE_DIGITS_MAX}
                                    </span>
                                </div>
                                {phoneError && <span className="text-[12px] text-destructive">{phoneError}</span>}
                            </div>

                            {showDevSwitches && (
                                <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-input-border p-3">
                                    <span className="text-[12px] font-semibold text-description">
                                        {t('phoneVerify.devDelivery')}
                                    </span>
                                    <label className="flex items-center gap-2 text-[13px] text-label">
                                        <input
                                            type="checkbox"
                                            checked={devDryRun}
                                            onChange={e => setDevDryRun(e.target.checked)}
                                        />
                                        {t('phoneVerify.devDryRun')}
                                    </label>
                                    <label className="flex items-center gap-2 text-[13px] text-label">
                                        <input
                                            type="checkbox"
                                            checked={devSlack}
                                            onChange={e => setDevSlack(e.target.checked)}
                                        />
                                        {t('phoneVerify.devSlack')}
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="mt-auto pt-5 pb-safe-bottom">
                            <button
                                onClick={handleSend}
                                disabled={!isValidKoreanPhone(phoneDigits) || isBusy}
                                className="flex w-full items-center justify-center rounded-full bg-foreground py-3 text-[16px] font-semibold text-background disabled:opacity-50"
                            >
                                {loadingState === 'sending' ? (
                                    <Loader2 size={20} className="animate-spin" />
                                ) : (
                                    t('phoneVerify.sendCode')
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {step === 'otp' && (
                    <div className="flex h-full flex-col p-6 pt-safe-top">
                        <div className="flex flex-col gap-5">
                            <button
                                onClick={handleBackToPhone}
                                className="-ml-2 self-start rounded-full p-1"
                                aria-label="back"
                            >
                                <ChevronLeft size={24} strokeWidth={2} />
                            </button>

                            <div className="flex flex-col gap-[6px]">
                                <h2 className="text-[18px] font-bold">{t('phoneVerify.otpTitle')}</h2>
                                <p className="text-[14px] font-medium text-[#9FA2A7]">
                                    {t('phoneVerify.otpDescription', { phone: formattedPhone })}
                                </p>
                            </div>

                            <div className="flex flex-col items-center gap-[22px]">
                                <VerificationCodeInput
                                    value={otp}
                                    onChange={handleOtpChange}
                                    hasError={!!otpError && !pendingToken}
                                />

                                {otpError && (
                                    <p className="text-center text-[14px] font-medium tracking-[0.005em] text-[#FF4C35]">
                                        {otpError}
                                    </p>
                                )}
                                {!otpError && isExpired && (
                                    <p className="text-center text-[14px] font-medium tracking-[0.005em] text-[#FF4C35]">
                                        {t('phoneVerify.codeExpired')}
                                    </p>
                                )}

                                <div className="flex w-full items-center justify-between px-1">
                                    <div className="flex items-center gap-[6px] text-[13px] font-medium text-label">
                                        <span>{t('phoneVerify.timeRemaining')}</span>
                                        <span className={cn('w-[40px]', isExpired && 'text-[#FF4C35]')}>
                                            {formatTime(countdown?.secondsLeft ?? 0)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleResend}
                                            disabled={isBusy || resendExhausted}
                                            className="text-[13px] font-semibold text-main-accent underline disabled:opacity-50"
                                        >
                                            {t('phoneVerify.extend')}
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleResend}
                                        disabled={isBusy || resendExhausted}
                                        className="text-[14px] font-semibold text-[#90C304] underline disabled:opacity-50"
                                    >
                                        {loadingState === 'resending' ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            t('phoneVerify.resend')
                                        )}
                                    </button>
                                </div>

                                {resendExhausted && (
                                    <p className="text-center text-[12px] font-medium text-description">
                                        {t('phoneVerify.resendLimit')}
                                    </p>
                                )}
                                {!resendExhausted && resendCount > 0 && (
                                    <p className="text-center text-[12px] font-medium text-description">
                                        {t('phoneVerify.resendKeepsCounter')}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="mt-auto pt-5 pb-safe-bottom">
                            {pendingToken ? (
                                <button
                                    onClick={handleRetrySessionSwitch}
                                    disabled={isBusy}
                                    className="flex w-full items-center justify-center rounded-full bg-foreground py-3 text-[16px] font-semibold text-background disabled:opacity-50"
                                >
                                    {loadingState === 'verifying' ? (
                                        <Loader2 size={20} className="animate-spin" />
                                    ) : (
                                        t('phoneVerify.retry')
                                    )}
                                </button>
                            ) : (
                                <button
                                    onClick={handleVerify}
                                    disabled={!isCodeComplete || isBusy || isExpired}
                                    className="flex w-full items-center justify-center rounded-full bg-foreground py-3 text-[16px] font-semibold text-background disabled:opacity-50"
                                >
                                    {loadingState === 'verifying' ? (
                                        <Loader2 size={20} className="animate-spin" />
                                    ) : (
                                        t('phoneVerify.complete')
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
