import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cn } from '@chatic/lib/utils';
import { FloatingButton, ModalTopBar, ScreenLayout, TextField } from '@chatic/web-ui-kit';

import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { InlineAction } from '../../../ui/components/InlineAction';
import { formatCountdown, isValidEmail, VERIFICATION_CODE_LENGTH, VERIFICATION_TIMER_SECONDS } from '../../../utils';
import { isEmailVerifyRefusal } from '../lib';

/** Below this the countdown turns red — same threshold the phone flow uses. */
const IMMINENT_SECONDS = 60;

interface EmailVerifyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onVerified: (email: string) => void;
    /**
     * Runs one leg of the verification exchange, rejecting on failure. Supplied by the caller (see
     * `useVerifyEmailCode`), which is also where a refusal is raised — see `EmailVerifyRefusal`.
     */
    verifyEmail: (request: {
        email: string;
        step: 'send' | 'resend' | 'check' | 'confirm';
        code?: string;
        cloudId?: string;
    }) => Promise<void>;
    /**
     * Lets the caller skip verification entirely. The backend accepts a cloud with no email at all
     * (`POST /clouds/0/make`, `POST /memberships/0`) — it still reaches `active` — so nothing here
     * is a hard requirement; the address can always be bound afterward via `cloudId` below.
     */
    onSkip?: () => void;
    /**
     * Binds the verified address to a cloud that ALREADY EXISTS, instead of the dialog's default of
     * just validating the address for a caller who will attach it elsewhere (a new purchase, a new
     * `make` call). When set, `verify` chains a `confirm` call after `check` — `check` alone only
     * validates the code typed back, it does not link the address to anything. Used to register an
     * email on a cloud that was created without one (see `EmailRequiredBanner`).
     */
    cloudId?: string;
}

/**
 * Email verification for a cloud: take an address, send a code, check the digits typed back.
 * Resolves to the verified address via `onVerified`.
 *
 * Both fields live on one screen, the way the design system intends and the phone flow already does
 * (`PhoneVerifyFields`): each field's action sits inside its border (`trailing`) and the countdown
 * opposite the helper text (`helperTrailing`). It used to be two full-screen steps of bespoke
 * markup, which is how it drifted away from the rest of the app's inputs.
 *
 * Owned by this feature: every caller is a subscription flow (the plans page, the subscribe sheet,
 * the add-cloud host). It sat in `ui/components` while the sheet still lived under `features/home`;
 * once that moved, the reason for it being cross-cutting went with it.
 */
export const EmailVerifyDialog = ({
    open,
    onOpenChange,
    onVerified,
    verifyEmail,
    onSkip,
    cloudId,
}: EmailVerifyDialogProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [touched, setTouched] = useState(false);
    const [codeSent, setCodeSent] = useState(false);
    const [busy, setBusy] = useState<'idle' | 'sending' | 'verifying'>('idle');
    const [timeLeft, setTimeLeft] = useState(0);
    const [codeError, setCodeError] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const isEmailValid = isValidEmail(email);
    const emailError = touched && email.length > 0 && !isEmailValid ? t('addAccount.emailInvalid') : undefined;
    const isCodeComplete = code.length === VERIFICATION_CODE_LENGTH;
    const isBusy = busy !== 'idle';
    const expired = codeSent && timeLeft === 0;

    const startTimer = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeLeft(VERIFICATION_TIMER_SECONDS);
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    const reset = useCallback(() => {
        setEmail('');
        setCode('');
        setTouched(false);
        setCodeSent(false);
        setBusy('idle');
        setTimeLeft(0);
        setCodeError(false);
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);

    // The dialog is kept mounted by its hosts, so state has to be cleared on close rather than on
    // unmount — otherwise the next open starts on the previous attempt's address.
    const handleClose = useCallback(() => {
        onOpenChange(false);
        reset();
    }, [onOpenChange, reset]);

    const handleSkip = useCallback(() => {
        onSkip?.();
        handleClose();
    }, [onSkip, handleClose]);

    useEffect(() => () => void (timerRef.current && clearInterval(timerRef.current)), []);

    const send = async (step: 'send' | 'resend') => {
        setBusy('sending');
        try {
            await verifyEmail({ email, step });
            setCode('');
            setCodeError(false);
            setCodeSent(true);
            startTimer();
        } catch (e) {
            // Only a deliberate refusal carries copy written for the user; anything else is a
            // failed request whose message is backend wording.
            const fallback = step === 'send' ? 'addAccount.sendCodeFailed' : 'addAccount.resendFailed';
            toast({ title: isEmailVerifyRefusal(e) ? e.message : t(fallback), variant: 'destructive' });
        } finally {
            setBusy('idle');
        }
    };

    const verify = useCallback(async () => {
        setBusy('verifying');
        setCodeError(false);
        let stage: 'check' | 'confirm' = 'check';
        try {
            await verifyEmail({ email, step: 'check', code });
            // `check` only validates the code — binding to a specific cloud is a separate `confirm`
            // call, and only needed when the caller asked to bind one (see `cloudId` on the props).
            stage = 'confirm';
            if (cloudId) await verifyEmail({ email, step: 'confirm', cloudId });
            onVerified(email);
            handleClose();
        } catch (error) {
            // A mistyped code is ordinary; a failed `confirm` is not — it leaves the cloud unbound
            // after the address was already proven. Both collapse into the same red field, so the
            // stage is the only thing that tells them apart afterward. The address is never logged.
            logger.warn('CLOUD', `cloud email verification failed (stage=${stage})`, { error, cloudId });
            setCodeError(true);
        } finally {
            setBusy('idle');
        }
    }, [verifyEmail, email, code, cloudId, onVerified, handleClose]);

    // Submit as soon as the last digit lands — typing six digits and then hunting for a button is
    // the friction this flow exists to avoid. Keyed on the value so it fires once per completion.
    useEffect(() => {
        if (isCodeComplete && busy === 'idle' && !expired) void verify();
    }, [isCodeComplete]);

    const codeDescription = expired
        ? t('addAccount.codeExpired')
        : codeError
          ? undefined
          : codeSent
            ? t('addAccount.tooltip')
            : undefined;

    return (
        <Dialog open={open} onOpenChange={next => !next && handleClose()}>
            <DialogContent className="h-full rounded-none p-0 sm:rounded-none" hideClose>
                <DialogTitle className="sr-only">{t('addAccount.emailTitle')}</DialogTitle>
                <DialogDescription className="sr-only">{t('addAccount.emailSubtitle')}</DialogDescription>

                <ScreenLayout
                    header={<ModalTopBar safeArea title={t('addAccount.emailTitle')} onClose={handleClose} />}
                    footer={
                        <>
                            <FloatingButton
                                label={t('addAccount.complete')}
                                onClick={() => void verify()}
                                disabled={!isCodeComplete || isBusy || expired}
                                link={
                                    onSkip && (
                                        <button
                                            type="button"
                                            onClick={handleSkip}
                                            className="text-center text-[15px] font-medium text-muted-foreground"
                                        >
                                            {t('addAccount.emailSkip')}
                                        </button>
                                    )
                                }
                            />
                            {/* Rides the CTA above the soft keyboard; collapses to nothing without one. */}
                            <KeyboardSafeAreaSpacer />
                        </>
                    }
                >
                    <div className="flex flex-col gap-6 pt-4">
                        <p className="whitespace-pre-line px-4 text-[15px] leading-[1.5] text-muted-foreground">
                            {t('addAccount.emailSubtitle')}
                        </p>

                        <TextField
                            label={t('addAccount.emailLabel')}
                            required
                            value={email}
                            onChange={setEmail}
                            onBlur={() => setTouched(true)}
                            placeholder={t('addAccount.emailPlaceholder')}
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            error={emailError}
                            description={t('addAccount.emailDescription')}
                            success={codeSent && !emailError}
                            trailing={
                                <InlineAction
                                    label={t('addAccount.sendCode')}
                                    onClick={() => void send(codeSent ? 'resend' : 'send')}
                                    enabled={isEmailValid && !isBusy}
                                    accent
                                />
                            }
                        />

                        <TextField
                            label={t('addAccount.verificationTitle')}
                            required
                            value={code}
                            onChange={value => {
                                setCode(value.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH));
                                setCodeError(false);
                            }}
                            placeholder={t('addAccount.verificationDescription')}
                            inputMode="numeric"
                            disabled={!codeSent}
                            error={codeError ? t('addAccount.codeError') : undefined}
                            description={codeDescription}
                            trailing={
                                <InlineAction
                                    label={t('addAccount.resend')}
                                    onClick={() => void send('resend')}
                                    enabled={codeSent && !isBusy}
                                />
                            }
                            helperTrailing={
                                codeSent && (
                                    <span
                                        className={cn(
                                            'text-[12px] font-medium leading-[18px]',
                                            timeLeft <= IMMINENT_SECONDS ? 'text-destructive' : 'text-point-blue'
                                        )}
                                    >
                                        {formatCountdown(timeLeft)}
                                    </span>
                                )
                            }
                        />
                    </div>
                </ScreenLayout>
            </DialogContent>
        </Dialog>
    );
};
