import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cn } from '@chatic/ui-kit';
import { FloatingButton, ModalTopBar, ScreenLayout, TextField } from '@chatic/web-ui-kit';

import { InlineAction } from '../../../ui/components/InlineAction';
import { formatCountdown, isValidEmail, VERIFICATION_CODE_LENGTH, VERIFICATION_TIMER_SECONDS } from '../../../utils';
import { isEmailVerifyRefusal } from '../lib';

const IMMINENT_SECONDS = 60;

interface EmailVerifyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onVerified: (email: string) => void;
    verifyEmail: (request: {
        email: string;
        step: 'send' | 'resend' | 'check' | 'confirm';
        code?: string;
        cloudId?: string;
    }) => Promise<void>;
    cloudId: string;
}

export const EmailVerifyDialog = ({ open, onOpenChange, onVerified, verifyEmail, cloudId }: EmailVerifyDialogProps) => {
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

    const handleClose = useCallback(() => {
        onOpenChange(false);
        reset();
    }, [onOpenChange, reset]);

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
            stage = 'confirm';
            await verifyEmail({ email, step: 'confirm', cloudId });
            onVerified(email);
            handleClose();
        } catch (error) {
            logger.warn('CLOUD', `cloud email verification failed (stage=${stage})`, { error, cloudId });
            setCodeError(true);
        } finally {
            setBusy('idle');
        }
    }, [verifyEmail, email, code, cloudId, onVerified, handleClose]);

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
            <DialogContent className="top-[50%] h-full max-h-none max-w-app rounded-none p-0 sm:rounded-none" hideClose>
                <DialogTitle className="sr-only">{t('addAccount.emailTitle')}</DialogTitle>
                <DialogDescription className="sr-only">{t('addAccount.emailSubtitle')}</DialogDescription>

                <ScreenLayout
                    header={<ModalTopBar safeArea title={t('addAccount.emailTitle')} onClose={handleClose} />}
                    footer={
                        <FloatingButton
                            label={t('addAccount.complete')}
                            onClick={() => void verify()}
                            disabled={!isCodeComplete || isBusy || expired}
                        />
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
