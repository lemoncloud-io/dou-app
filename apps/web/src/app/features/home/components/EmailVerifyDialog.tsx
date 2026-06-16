import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronLeft, HelpCircle, Loader2, X, XCircle } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Logo } from '@chatic/assets';
import { useTheme } from '@chatic/theme';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useVerifyEmail } from '@chatic/users';

import { VerificationCodeInput } from '../../account/components/VerificationCodeInput';
import { VERIFICATION_CODE_LENGTH, VERIFICATION_TIMER_SECONDS } from '../../account/constants';
import { formatTime, isValidEmail } from '../../account/utils';

type Step = 'email' | 'verify';

interface EmailVerifyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onVerified: (email: string) => void;
}

export const EmailVerifyDialog = ({ open, onOpenChange, onVerified }: EmailVerifyDialogProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const verifyEmail = useVerifyEmail();
    const { isDarkTheme } = useTheme();

    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [touched, setTouched] = useState(false);
    const [loading, setLoading] = useState(false);
    const [timeLeft, setTimeLeft] = useState(VERIFICATION_TIMER_SECONDS);
    const [showTooltip, setShowTooltip] = useState(false);
    const [loadingState, setLoadingState] = useState<'idle' | 'verifying' | 'resending'>('idle');
    const [verifyError, setVerifyError] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const hasError = touched && email.length > 0 && !isValidEmail(email);
    const isEmailValid = isValidEmail(email);
    const isCodeComplete = code.length === VERIFICATION_CODE_LENGTH;

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

    const resetState = useCallback(() => {
        setStep('email');
        setEmail('');
        setCode('');
        setTouched(false);
        setLoading(false);
        setShowTooltip(false);
        setLoadingState('idle');
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);

    const handleClose = useCallback(() => {
        onOpenChange(false);
        resetState();
    }, [onOpenChange, resetState]);

    const handleBackToEmail = useCallback(() => {
        setStep('email');
        setCode('');
        setVerifyError(false);
        setShowTooltip(false);
        setLoadingState('idle');
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);

    const handleSendCode = async () => {
        setLoading(true);
        try {
            await verifyEmail.mutateAsync({ email, step: 'send' });
            setStep('verify');
            startTimer();
        } catch {
            toast({ title: t('addAccount.sendCodeFailed'), variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setLoadingState('resending');
        try {
            await verifyEmail.mutateAsync({ email, step: 'resend' });
            setCode('');
            setVerifyError(false);
            startTimer();
        } catch {
            toast({ title: t('addAccount.resendFailed'), variant: 'destructive' });
        } finally {
            setLoadingState('idle');
        }
    };

    useEffect(() => {
        if (isCodeComplete && loadingState === 'idle' && timeLeft > 0) {
            handleVerifyCode();
        }
    }, [isCodeComplete]);  

    const handleVerifyCode = async () => {
        setLoadingState('verifying');
        setVerifyError(false);
        try {
            await verifyEmail.mutateAsync({ email, step: 'check', code });
            onVerified(email);
            handleClose();
        } catch {
            setVerifyError(true);
        } finally {
            setLoadingState('idle');
        }
    };

    return (
        <Dialog open={open} onOpenChange={open => !open && handleClose()}>
            <DialogContent className="h-full max-w-none rounded-none p-0 sm:rounded-none" hideClose>
                <DialogTitle className="sr-only">{t('addAccount.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('addAccount.title')}</DialogDescription>

                {step === 'email' && (
                    <div className="flex h-full flex-col p-6 pt-safe-top">
                        <div className="flex flex-col gap-6">
                            <div className="flex items-center justify-end">
                                <button onClick={handleClose} className="rounded-full p-1">
                                    <X size={24} strokeWidth={2} />
                                </button>
                            </div>
                            <div className="flex flex-col items-center gap-[46px]">
                                <img
                                    src={isDarkTheme ? Logo.douWh : Logo.douBk}
                                    alt="DoU"
                                    className="h-[41px] object-contain"
                                />

                                <div className="flex w-full flex-col gap-6">
                                    <div className="flex flex-col gap-[6px]">
                                        <h2 className="text-[22px] font-bold leading-[1.35] tracking-[0.005em]">
                                            {t('addAccount.emailTitle')}
                                        </h2>
                                        <p className="text-[16px] font-medium leading-[1.45] tracking-[-0.015em] text-[#9FA2A7]">
                                            {t('addAccount.emailSubtitle')}
                                        </p>
                                    </div>

                                    <div className="flex w-full flex-col gap-2">
                                        <label className="text-[14px] font-semibold text-label">
                                            {t('addAccount.emailLabel')}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={e => setEmail(e.target.value)}
                                                onBlur={() => setTouched(true)}
                                                placeholder={t('addAccount.emailPlaceholder')}
                                                className={cn(
                                                    'w-full rounded-[10px] border bg-surface p-3 px-4 pr-10 text-[16px] text-foreground outline-none transition-colors placeholder:text-placeholder',
                                                    hasError
                                                        ? 'border-[1.5px] border-destructive'
                                                        : 'border-input-border focus:border-[1.5px] focus:border-focus-border'
                                                )}
                                            />
                                            {email.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setEmail('')}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-placeholder"
                                                >
                                                    <XCircle size={20} fill="currentColor" stroke="white" />
                                                </button>
                                            )}
                                        </div>
                                        <p
                                            className={cn(
                                                'pl-[2px] text-[12px]',
                                                hasError ? 'text-destructive' : 'text-description'
                                            )}
                                        >
                                            {t('addAccount.emailDescription')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-auto px-0 pb-safe-bottom pt-5">
                            <button
                                onClick={handleSendCode}
                                disabled={!isEmailValid || loading}
                                className="flex w-full items-center justify-center rounded-full bg-foreground py-3 text-[16px] font-semibold text-background disabled:opacity-50"
                            >
                                {loading ? <Loader2 size={20} className="animate-spin" /> : t('addAccount.sendCode')}
                            </button>
                        </div>
                    </div>
                )}

                {step === 'verify' && (
                    <div className="flex h-full flex-col p-6 pt-safe-top">
                        <div className="flex flex-col gap-5">
                            <button onClick={handleBackToEmail} className="-ml-2 self-start rounded-full p-1">
                                <ChevronLeft size={24} strokeWidth={2} />
                            </button>

                            <div className="flex flex-col items-center pt-2">
                                <img
                                    src={isDarkTheme ? Logo.douWh : Logo.douBk}
                                    alt="DoU"
                                    className="h-[41px] object-contain"
                                />
                            </div>

                            <div className="mt-[36px] flex flex-col gap-[6px]">
                                <h2 className="text-[18px] font-bold">{t('addAccount.verificationTitle')}</h2>
                                <p className="text-[14px] font-medium text-[#9FA2A7]">
                                    {t('addAccount.verificationDescription')}
                                </p>
                            </div>

                            <div className="flex flex-col items-center gap-[22px]">
                                <VerificationCodeInput
                                    value={code}
                                    onChange={v => {
                                        setCode(v);
                                        setVerifyError(false);
                                    }}
                                    hasError={verifyError}
                                />

                                {verifyError && (
                                    <p className="text-center text-[14px] font-medium tracking-[0.005em] text-[#FF4C35]">
                                        {t('addAccount.codeError')}
                                    </p>
                                )}

                                <div className="flex w-full items-center justify-between px-1">
                                    <div className="flex items-center gap-px">
                                        <div className="flex items-center gap-[2px] text-[13px] font-medium text-label">
                                            <span>{t('addAccount.timeRemaining')}</span>
                                            <span className={cn('w-[40px]', timeLeft === 0 && 'text-[#FF4C35]')}>
                                                {formatTime(timeLeft)}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowTooltip(prev => !prev)}
                                            className="text-description"
                                        >
                                            <HelpCircle size={16} />
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleResend}
                                        disabled={loadingState === 'resending'}
                                        className="text-[14px] font-semibold text-[#90C304] underline disabled:opacity-50"
                                    >
                                        {loadingState === 'resending' ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            t('addAccount.resend')
                                        )}
                                    </button>
                                </div>
                            </div>

                            {showTooltip && (
                                <div className="relative rounded-[8px] bg-card px-[10px] py-[10px] pr-[16px] shadow-[0px_0px_3px_0px_rgba(0,0,0,0.18)]">
                                    <button
                                        type="button"
                                        onClick={() => setShowTooltip(false)}
                                        className="absolute right-[6px] top-[7px] text-[#9FA2A7]"
                                    >
                                        <X size={14} />
                                    </button>
                                    <p className="whitespace-pre-line text-[12px] font-medium leading-[1.45] text-label">
                                        {t('addAccount.tooltip')}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="mt-auto px-0 pb-safe-bottom pt-5">
                            <button
                                onClick={handleVerifyCode}
                                disabled={!isCodeComplete || loadingState === 'verifying' || timeLeft === 0}
                                className="flex w-full items-center justify-center rounded-full bg-foreground py-3 text-[16px] font-semibold text-background disabled:opacity-50"
                            >
                                {loadingState === 'verifying' ? (
                                    <Loader2 size={20} className="animate-spin" />
                                ) : (
                                    t('addAccount.complete')
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
