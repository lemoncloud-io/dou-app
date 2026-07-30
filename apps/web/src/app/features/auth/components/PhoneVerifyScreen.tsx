import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { applySessionToken } from '@chatic/app-runtime';
import { AlertDialog, Button, TextField } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cn } from '@chatic/lib/utils';

// Concrete modules, not the account feature root: the root re-exports pages that pull web-core
// (whose transport reads import.meta) and a components barrel that pulls @chatic/assets — both
// unloadable under the jsdom test setup.
import { VERIFICATION_CODE_LENGTH } from '../../account/constants';
import { formatTime } from '../../account/utils';
import { useVerifyHashAlias } from '../../../hooks/useVerifyHashAlias';
import { getSocketErrorCode } from '../../../utils/errors';
import { useOtpExpiryCountdown } from '../hooks/useOtpExpiryCountdown';
import { isDevBuild } from '../utils/env';
import { isValidKoreanPhone, PHONE_DIGITS_MAX } from '../utils/phone';
import { PhoneVerifyBanner } from './PhoneVerifyBanner';

/**
 * Resend/extend cap enforced client-side BEFORE the server is asked; a server 429 (60s cooldown,
 * daily caps) always wins over this counter (roadmap Track A). "Extend time" and "resend" are the
 * same server step — the backend has no extend concept (ADR-0033 D9) — so one counter covers both,
 * even though the design gives each control its own over-limit dialog.
 */
const RESEND_LIMIT = 5;

/** Below this the countdown turns red (Figma 3428-60171 / 3432-61204 / 3430-60970). */
const IMMINENT_SECONDS = 60;

/** The raw phone field accepts what the user typed so a bad format is visible; digits drive logic. */
const PHONE_INPUT_MAX = 20;

type LoadingState = 'idle' | 'sending' | 'resending' | 'verifying';
/** Which control tripped the client-side cap — picks the over-limit dialog's copy. */
type LimitDialog = 'resend' | 'extend';

export interface PhoneVerifyScreenProps {
    /** Which flow summoned the screen — picks the heading copy (the packets are identical). */
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
 * Layout follows Figma 3421-59180 and siblings: ONE screen holding both fields, each with its
 * action inline in the field (인증 요청 / 재전송) and the countdown + 시간 연장 on the code field's
 * helper row — not a two-step wizard. Error copy branches on `getSocketErrorCode` only; server
 * messages are not a contract. See apps/web/docs/feature/auth/phone-verification.md.
 */
export const PhoneVerifyScreen = ({ context, inviteCode, onVerified, onClose }: PhoneVerifyScreenProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { send, check } = useVerifyHashAlias();

    const [phoneInput, setPhoneInput] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [otp, setOtp] = useState('');
    const [otpError, setOtpError] = useState('');
    const [expiredAt, setExpiredAt] = useState<number | undefined>(undefined);
    const [resendCount, setResendCount] = useState(0);
    const [limitDialog, setLimitDialog] = useState<LimitDialog | null>(null);
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
    const showDevSwitches = isDevBuild();

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
    const handleResend = async (origin: LimitDialog) => {
        if (resendExhausted) {
            setLimitDialog(origin);
            return;
        }
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

    // Auto-submit once all digits are in (same convention as EmailVerifyDialog).
    useEffect(() => {
        if (isCodeComplete && loadingState === 'idle' && !isExpired && !pendingToken) {
            handleVerify();
        }
    }, [isCodeComplete]);

    const canRequestCode = isValidKoreanPhone(phoneDigits) && !codeSent && !isBusy;
    // Expiry is surfaced on the code field even without a failed check, so the row never shows a
    // live-looking timer next to a dead code.
    const codeFieldError = otpError || (isExpired ? t('phoneVerify.codeExpired') : '');
    const codeFieldDescription = resendCount > 0 ? t('phoneVerify.resendKeepsCounter') : t('phoneVerify.digitsOnly');

    const inlineAction = (label: string, onClick: () => void, enabled: boolean, accent = false) => (
        <button
            type="button"
            onClick={onClick}
            disabled={!enabled}
            className={cn(
                'whitespace-nowrap text-[14px] font-medium underline',
                !enabled ? 'text-placeholder' : accent ? 'text-point-blue' : 'text-foreground'
            )}
        >
            {label}
        </button>
    );

    return (
        <Dialog open onOpenChange={value => !value && onClose()}>
            <DialogContent className="h-full max-w-none rounded-none p-0 sm:rounded-none" hideClose>
                <DialogTitle className="sr-only">{t('phoneVerify.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('phoneVerify.title')}</DialogDescription>

                <div className="flex h-full flex-col pt-safe-top">
                    <div className="flex h-[60px] shrink-0 items-center justify-end px-4">
                        <button onClick={onClose} className="-mr-1 rounded-full p-1" aria-label="close">
                            <X size={24} strokeWidth={2} />
                        </button>
                    </div>

                    <div className="flex flex-1 flex-col gap-8 overflow-y-auto">
                        <div className="flex flex-col gap-4 px-4">
                            <h2 className="whitespace-pre-line text-center text-[20px] font-bold leading-[27px] text-foreground">
                                {context === 'invite-accept'
                                    ? t('phoneVerify.descriptionInviteAccept')
                                    : t('phoneVerify.descriptionInviteCreate')}
                            </h2>
                            <p className="whitespace-pre-line text-center text-[14px] font-medium leading-[20px] text-description">
                                {t('phoneVerify.privacyNote')}
                            </p>
                        </div>

                        <div className="px-4">
                            <PhoneVerifyBanner onClose={onClose} />
                        </div>

                        <div className="flex flex-col gap-6">
                            <TextField
                                label={t('phoneVerify.phoneLabel')}
                                required
                                value={phoneInput}
                                onChange={handlePhoneChange}
                                placeholder={t('phoneVerify.phonePlaceholder')}
                                type="tel"
                                inputMode="numeric"
                                autoFocus
                                error={phoneError || undefined}
                                description={t('phoneVerify.digitsOnly')}
                                trailing={inlineAction(t('phoneVerify.sendCode'), handleSend, canRequestCode, true)}
                            />

                            <TextField
                                label={t('phoneVerify.codeLabel')}
                                required
                                value={otp}
                                onChange={handleOtpChange}
                                placeholder={t('phoneVerify.codePlaceholder')}
                                inputMode="numeric"
                                disabled={!codeSent}
                                error={codeFieldError || undefined}
                                description={codeFieldDescription}
                                trailing={inlineAction(
                                    t('phoneVerify.resend'),
                                    () => handleResend('resend'),
                                    codeSent && !isBusy
                                )}
                                helperTrailing={
                                    codeSent && (
                                        <span className="flex items-center gap-[6px] text-[12px] font-medium leading-[18px]">
                                            <span
                                                className={cn(
                                                    (countdown?.secondsLeft ?? 0) <= IMMINENT_SECONDS
                                                        ? 'text-destructive'
                                                        : 'text-point-blue'
                                                )}
                                            >
                                                {formatTime(countdown?.secondsLeft ?? 0)}
                                            </span>
                                            {inlineAction(
                                                t('phoneVerify.extend'),
                                                () => handleResend('extend'),
                                                !isBusy,
                                                true
                                            )}
                                        </span>
                                    )
                                }
                            />

                            {showDevSwitches && (
                                <div className="mx-4 flex flex-col gap-2 rounded-[10px] border border-dashed border-input-border p-3">
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
                    </div>

                    <div className="shrink-0 px-4 pb-safe-bottom pt-3">
                        {pendingToken ? (
                            <Button
                                tone="green"
                                size="lg"
                                fullWidth
                                loading={loadingState === 'verifying'}
                                onClick={handleRetrySessionSwitch}
                            >
                                {t('phoneVerify.retry')}
                            </Button>
                        ) : (
                            <Button
                                tone="green"
                                size="lg"
                                fullWidth
                                loading={loadingState === 'verifying'}
                                disabled={!isCodeComplete || isBusy || isExpired}
                                onClick={handleVerify}
                            >
                                {t('phoneVerify.complete')}
                            </Button>
                        )}
                    </div>
                </div>

                <AlertDialog
                    open={limitDialog !== null}
                    onOpenChange={open => !open && setLimitDialog(null)}
                    title={t(`phoneVerify.limit.${limitDialog ?? 'resend'}.title`)}
                    description={t(`phoneVerify.limit.${limitDialog ?? 'resend'}.description`)}
                    confirmLabel={t('common.confirm')}
                    onConfirm={() => setLimitDialog(null)}
                />
            </DialogContent>
        </Dialog>
    );
};
