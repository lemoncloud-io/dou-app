import { useTranslation } from 'react-i18next';

import { Loader2, X, XCircle } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Logo } from '@chatic/assets';

interface EmailStepProps {
    email: string;
    hasError: boolean;
    isEmailValid: boolean;
    loading: boolean;
    isDarkTheme: boolean;
    onEmailChange: (value: string) => void;
    onBlur: () => void;
    onClear: () => void;
    onSendCode: () => void;
    onClose: () => void;
}

export const EmailStep = ({
    email,
    hasError,
    isEmailValid,
    loading,
    isDarkTheme,
    onEmailChange,
    onBlur,
    onClear,
    onSendCode,
    onClose,
}: EmailStepProps) => {
    const { t } = useTranslation();

    return (
        <div className="flex h-full flex-col p-6 pt-safe-top">
            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-end">
                    <button onClick={onClose} className="rounded-full p-1">
                        <X size={24} strokeWidth={2} />
                    </button>
                </div>
                <div className="flex flex-col items-center gap-[46px]">
                    <img src={isDarkTheme ? Logo.douWh : Logo.douBk} alt="DoU" className="h-[41px] object-contain" />

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
                            <label className="text-[14px] font-semibold text-label">{t('addAccount.emailLabel')}</label>
                            <div className="relative">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => onEmailChange(e.target.value)}
                                    onBlur={onBlur}
                                    enterKeyHint="done"
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                            e.preventDefault();
                                            e.currentTarget.blur();
                                        }
                                    }}
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
                                        onClick={onClear}
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
                    onClick={onSendCode}
                    disabled={!isEmailValid || loading}
                    className="flex w-full items-center justify-center rounded-full bg-foreground py-3 text-[16px] font-semibold text-background disabled:opacity-50"
                >
                    {loading ? <Loader2 size={20} className="animate-spin" /> : t('addAccount.sendCode')}
                </button>
            </div>
        </div>
    );
};
