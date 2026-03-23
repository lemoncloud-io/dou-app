import { ChevronLeft, HelpCircle, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { KeyboardAwareLayout } from '../../../shared/layouts';
import { VERIFICATION_CODE_LENGTH, VERIFICATION_TIMER_SECONDS } from '../constants';
import { DouLogo } from './DouLogo';
import { FloatingButton } from './FloatingButton';
import { VerificationCodeInput } from './VerificationCodeInput';

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

interface VerifyCodePageProps {
    translationPrefix: string;
    onVerify: (code: string) => Promise<boolean>;
    onResend?: () => Promise<void>;
}

export const VerifyCodePage = ({ translationPrefix, onVerify, onResend }: VerifyCodePageProps) => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const [code, setCode] = useState('');
    const [timeLeft, setTimeLeft] = useState(VERIFICATION_TIMER_SECONDS);
    const [showTooltip, setShowTooltip] = useState(false);
    const [loadingState, setLoadingState] = useState<'idle' | 'verifying' | 'resending'>('idle');
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const startTimer = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
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

    useEffect(() => {
        startTimer();
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [startTimer]);

    const handleResend = async () => {
        setLoadingState('resending');
        try {
            await onResend?.();
            setTimeLeft(VERIFICATION_TIMER_SECONDS);
            setCode('');
            startTimer();
        } finally {
            setLoadingState('idle');
        }
    };

    const handleComplete = async () => {
        setLoadingState('verifying');
        try {
            const success = await onVerify(code);
            if (!success) return;
        } finally {
            setLoadingState('idle');
        }
    };

    const isComplete = code.length === VERIFICATION_CODE_LENGTH;

    return (
        <KeyboardAwareLayout
            header={
                <header className="flex items-center px-[6px]">
                    <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                        <ChevronLeft size={26} strokeWidth={2} />
                    </button>
                </header>
            }
            footer={
                <FloatingButton
                    label={t(`${translationPrefix}.complete`)}
                    disabled={!isComplete}
                    loading={loadingState === 'verifying'}
                    onClick={handleComplete}
                />
            }
        >
            <div className="flex flex-col items-center gap-[36px] pt-[28px]">
                <DouLogo />

                <div className="flex w-full flex-col gap-[22px]">
                    <div className="flex flex-col gap-[6px] px-4">
                        <h1 className="text-[22px] font-bold leading-[1.35] tracking-[0.11px]">
                            {t(`${translationPrefix}.verificationTitle`)}
                        </h1>
                        <p className="text-[16px] font-medium leading-[1.45] tracking-[-0.24px] text-[#9FA2A7]">
                            {t(`${translationPrefix}.verificationDescription`)}
                        </p>
                    </div>

                    <div className="flex flex-col gap-[22px]">
                        <VerificationCodeInput value={code} onChange={setCode} />

                        <div className="flex items-center justify-between px-6">
                            <div className="flex items-center gap-px">
                                <div className="flex items-center gap-[2px] text-[14px] font-medium tracking-[-0.28px] text-label">
                                    <span>{t(`${translationPrefix}.timeRemaining`)}</span>
                                    <span className="w-[40px]">{formatTime(timeLeft)}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowTooltip(prev => !prev)}
                                    className="text-description"
                                >
                                    <HelpCircle size={18} />
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={handleResend}
                                disabled={loadingState === 'resending'}
                                className="text-[15px] font-semibold text-[#90C304] underline disabled:opacity-50"
                            >
                                {loadingState === 'resending' ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    t(`${translationPrefix}.resend`)
                                )}
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
                        <p className="whitespace-pre-line text-[13px] font-medium leading-[1.45] tracking-[-0.325px] text-label">
                            {t(`${translationPrefix}.tooltip`)}
                        </p>
                    </div>
                </div>
            )}
        </KeyboardAwareLayout>
    );
};
