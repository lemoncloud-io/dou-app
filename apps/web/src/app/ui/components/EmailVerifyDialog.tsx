import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useTheme } from '../../hooks';
import { isEmailVerifyRefusal, isValidEmail, VERIFICATION_CODE_LENGTH, VERIFICATION_TIMER_SECONDS } from '../../utils';
import { EmailStep, VerifyStep } from './email-verify';

type Step = 'email' | 'verify';

interface EmailVerifyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onVerified: (email: string) => void;
    /**
     * Runs one leg of the verification exchange, rejecting on failure. Supplied by the caller (see
     * `useVerifyEmailCode`) so this dialog stays free of the web-core surface.
     */
    verifyEmail: (request: { email: string; step: 'send' | 'resend' | 'check'; code?: string }) => Promise<void>;
}

/**
 * Full-screen email verification overlay: collect an address, send a code, then check the six digits
 * typed back. Resolves to the verified address via `onVerified`.
 *
 * Both subscription entry points use it — the plans page and the home subscription sheet — so it sits
 * here rather than in either feature (directory-structure.md §4-3).
 */
export const EmailVerifyDialog = ({ open, onOpenChange, onVerified, verifyEmail }: EmailVerifyDialogProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
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
            await verifyEmail({ email, step: 'send' });
            setStep('verify');
            startTimer();
        } catch (e) {
            // Only a deliberate refusal carries copy written for the user; anything else is a
            // failed request whose message is backend wording.
            const reason = isEmailVerifyRefusal(e) ? e.message : t('addAccount.sendCodeFailed');
            toast({ title: reason, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setLoadingState('resending');
        try {
            await verifyEmail({ email, step: 'resend' });
            setCode('');
            setVerifyError(false);
            startTimer();
        } catch (e) {
            const reason = isEmailVerifyRefusal(e) ? e.message : t('addAccount.resendFailed');
            toast({ title: reason, variant: 'destructive' });
        } finally {
            setLoadingState('idle');
        }
    };

    const handleVerifyCode = async () => {
        setLoadingState('verifying');
        setVerifyError(false);
        try {
            await verifyEmail({ email, step: 'check', code });
            onVerified(email);
            handleClose();
        } catch {
            setVerifyError(true);
        } finally {
            setLoadingState('idle');
        }
    };

    useEffect(() => {
        if (isCodeComplete && loadingState === 'idle' && timeLeft > 0) {
            handleVerifyCode();
        }
    }, [isCodeComplete]);

    const handleCodeChange = (value: string) => {
        setCode(value);
        setVerifyError(false);
    };

    return (
        <Dialog open={open} onOpenChange={open => !open && handleClose()}>
            <DialogContent className="h-full max-w-none rounded-none p-0 sm:rounded-none" hideClose>
                <DialogTitle className="sr-only">{t('addAccount.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('addAccount.title')}</DialogDescription>

                {step === 'email' && (
                    <EmailStep
                        email={email}
                        hasError={hasError}
                        isEmailValid={isEmailValid}
                        loading={loading}
                        isDarkTheme={isDarkTheme}
                        onEmailChange={setEmail}
                        onBlur={() => setTouched(true)}
                        onClear={() => setEmail('')}
                        onSendCode={handleSendCode}
                        onClose={handleClose}
                    />
                )}

                {step === 'verify' && (
                    <VerifyStep
                        code={code}
                        verifyError={verifyError}
                        timeLeft={timeLeft}
                        showTooltip={showTooltip}
                        loadingState={loadingState}
                        isCodeComplete={isCodeComplete}
                        isDarkTheme={isDarkTheme}
                        onCodeChange={handleCodeChange}
                        onToggleTooltip={() => setShowTooltip(prev => !prev)}
                        onCloseTooltip={() => setShowTooltip(false)}
                        onResend={handleResend}
                        onVerify={handleVerifyCode}
                        onBack={handleBackToEmail}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
};
