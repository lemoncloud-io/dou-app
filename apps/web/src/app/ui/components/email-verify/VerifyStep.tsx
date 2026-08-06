import { useTranslation } from 'react-i18next';

import { ChevronLeft, HelpCircle, Loader2, X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Logo } from '@chatic/assets';

import { formatCountdown } from '../../../utils';
import { keyboardSafeBottom } from '../../layouts/KeyboardSafeAreaSpacer';
import { VerificationCodeInput } from '../VerificationCodeInput';

type LoadingState = 'idle' | 'verifying' | 'resending';

interface VerifyStepProps {
    code: string;
    verifyError: boolean;
    timeLeft: number;
    showTooltip: boolean;
    loadingState: LoadingState;
    isCodeComplete: boolean;
    isDarkTheme: boolean;
    onCodeChange: (value: string) => void;
    onToggleTooltip: () => void;
    onCloseTooltip: () => void;
    onResend: () => void;
    onVerify: () => void;
    onBack: () => void;
}

export const VerifyStep = ({
    code,
    verifyError,
    timeLeft,
    showTooltip,
    loadingState,
    isCodeComplete,
    isDarkTheme,
    onCodeChange,
    onToggleTooltip,
    onCloseTooltip,
    onResend,
    onVerify,
    onBack,
}: VerifyStepProps) => {
    const { t } = useTranslation();

    return (
        <div className="flex h-full flex-col p-6 pt-safe-top">
            <div className="flex flex-col gap-5">
                <button onClick={onBack} className="-ml-2 self-start rounded-full p-1">
                    <ChevronLeft size={24} strokeWidth={2} />
                </button>

                <div className="flex flex-col items-center pt-2">
                    <img src={isDarkTheme ? Logo.douWh : Logo.douBk} alt="DoU" className="h-[41px] object-contain" />
                </div>

                <div className="mt-[36px] flex flex-col gap-[6px]">
                    <h2 className="text-[18px] font-bold">{t('addAccount.verificationTitle')}</h2>
                    <p className="text-[14px] font-medium text-[#9FA2A7]">{t('addAccount.verificationDescription')}</p>
                </div>

                <div className="flex flex-col items-center gap-[22px]">
                    <VerificationCodeInput value={code} onChange={onCodeChange} hasError={verifyError} />

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
                                    {formatCountdown(timeLeft)}
                                </span>
                            </div>
                            <button type="button" onClick={onToggleTooltip} className="text-description">
                                <HelpCircle size={16} />
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={onResend}
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
                            onClick={onCloseTooltip}
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

            {/* Bottom inset + keyboard clearance: the code field keeps the keyboard up. */}
            <div className="mt-auto px-0 pt-5" style={{ paddingBottom: keyboardSafeBottom() }}>
                <button
                    onClick={onVerify}
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
    );
};
