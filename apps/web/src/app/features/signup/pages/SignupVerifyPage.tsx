import { ChevronLeft, HelpCircle, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { DouLogo } from '../components/DouLogo';
import { FloatingButton } from '../components/FloatingButton';
import { VerificationCodeInput } from '../components/VerificationCodeInput';
import { VERIFICATION_CODE_LENGTH, VERIFICATION_TIMER_SECONDS } from '../constants';

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

export const SignupVerifyPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const [code, setCode] = useState('');
    const [timeLeft, setTimeLeft] = useState(VERIFICATION_TIMER_SECONDS);
    const [showTooltip, setShowTooltip] = useState(false);
    const [resending, setResending] = useState(false);
    const [verifying, setVerifying] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const handleResend = async () => {
        setResending(true);
        // TODO: Call resend verification code API
        await new Promise(resolve => setTimeout(resolve, 1000));
        setResending(false);
        setTimeLeft(VERIFICATION_TIMER_SECONDS);
        setCode('');
    };

    const MOCK_VALID_CODE = '910202';

    const handleComplete = async () => {
        setVerifying(true);
        // TODO: Call verify code API
        await new Promise(resolve => setTimeout(resolve, 1000));
        setVerifying(false);

        if (code !== MOCK_VALID_CODE) {
            toast({ title: t('signup.verifyFailed'), variant: 'destructive' });
            return;
        }
        navigate('/signup/password', { replace: true });
    };

    const isComplete = code.length === VERIFICATION_CODE_LENGTH;

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <header className="flex items-center px-[6px]">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-none pb-[120px]">
                <div className="flex flex-col items-center gap-[36px] pt-[28px]">
                    <DouLogo />

                    <div className="flex w-full flex-col gap-[22px]">
                        <div className="flex flex-col gap-[6px] px-4">
                            <h1 className="text-[22px] font-bold leading-[1.35] tracking-[0.11px]">
                                {t('signup.verificationTitle')}
                            </h1>
                            <p className="text-[16px] font-medium leading-[1.45] tracking-[-0.24px] text-[#9FA2A7]">
                                {t('signup.verificationDescription')}
                            </p>
                        </div>

                        <div className="flex flex-col gap-[22px]">
                            <VerificationCodeInput value={code} onChange={setCode} />

                            <div className="flex items-center justify-between px-6">
                                <div className="flex items-center gap-px">
                                    <div className="flex items-center gap-[2px] text-[14px] font-medium tracking-[-0.28px] text-[#53555B]">
                                        <span>{t('signup.timeRemaining')}</span>
                                        <span className="w-[40px]">{formatTime(timeLeft)}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowTooltip(prev => !prev)}
                                        className="text-[#84888F]"
                                    >
                                        <HelpCircle size={18} />
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleResend}
                                    disabled={resending}
                                    className="text-[15px] font-semibold text-[#90C304] underline disabled:opacity-50"
                                >
                                    {resending ? <Loader2 size={16} className="animate-spin" /> : t('signup.resend')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {showTooltip && (
                    <div className="mx-6 mt-4">
                        <div className="relative rounded-[8px] bg-white px-[10px] py-[10px] pr-[16px] shadow-[0px_0px_3px_0px_rgba(0,0,0,0.18)] dark:bg-[#1C1C1E]">
                            <div className="absolute -top-[7px] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[8px] border-b-[8px] border-x-transparent border-b-white dark:border-b-[#1C1C1E]" />
                            <button
                                type="button"
                                onClick={() => setShowTooltip(false)}
                                className="absolute right-[6px] top-[7px] text-[#9FA2A7]"
                            >
                                <X size={16} />
                            </button>
                            <p className="whitespace-pre-line text-[13px] font-medium leading-[1.45] tracking-[-0.325px] text-[#53555B]">
                                {t('signup.tooltip')}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <FloatingButton
                label={t('signup.complete')}
                disabled={!isComplete}
                loading={verifying}
                onClick={handleComplete}
            />
        </div>
    );
};
