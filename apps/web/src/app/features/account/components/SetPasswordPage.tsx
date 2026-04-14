import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { useNavigateWithTransition } from '@chatic/shared';

import { KeyboardAwareLayout } from '../../../shared/layouts';
import { MIN_PASSWORD_LENGTH } from '../constants';
import { FloatingButton } from './FloatingButton';

interface SetPasswordPageProps {
    translationPrefix: string;
    onSubmit: (password: string) => Promise<void>;
}

export const SetPasswordPage = ({ translationPrefix, onSubmit }: SetPasswordPageProps) => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [touched, setTouched] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const passwordsMatch = password === confirmPassword;
    const isValid = password.length >= MIN_PASSWORD_LENGTH && confirmPassword.length > 0 && passwordsMatch;
    const showMismatch = touched && confirmPassword.length > 0 && !passwordsMatch;

    const handleComplete = async () => {
        setLoading(true);
        try {
            await onSubmit(password);
        } finally {
            setLoading(false);
        }
    };

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
                    disabled={!isValid}
                    loading={loading}
                    onClick={handleComplete}
                />
            }
        >
            <div className="px-4">
                <div className="mb-8 mt-6">
                    <h1 className="text-[22px] font-bold leading-[1.35] tracking-[0.11px]">
                        {t(`${translationPrefix}.passwordTitle`)}
                    </h1>
                    <p className="mt-[6px] text-[16px] font-medium leading-[1.45] tracking-[-0.24px] text-[#9FA2A7]">
                        {t(`${translationPrefix}.passwordDescription`)}
                    </p>
                </div>

                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <label className="text-[14px] font-semibold text-label">
                            {t(`${translationPrefix}.passwordLabel`)}
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder={t(`${translationPrefix}.passwordPlaceholder`)}
                                className="w-full rounded-[10px] border border-input-border bg-surface p-3 px-4 pr-11 text-[16px] text-foreground outline-none transition-colors placeholder:text-placeholder focus:border-[1.5px] focus:border-focus-border"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(prev => !prev)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-placeholder"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[14px] font-semibold text-label">
                            {t(`${translationPrefix}.confirmPasswordLabel`)}
                        </label>
                        <div className="relative">
                            <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                onBlur={() => setTouched(true)}
                                placeholder={t(`${translationPrefix}.confirmPasswordPlaceholder`)}
                                className={cn(
                                    'w-full rounded-[10px] border bg-surface p-3 px-4 pr-11 text-[16px] text-foreground outline-none transition-colors placeholder:text-placeholder',
                                    showMismatch
                                        ? 'border-[1.5px] border-destructive'
                                        : 'border-input-border focus:border-[1.5px] focus:border-focus-border'
                                )}
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(prev => !prev)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-placeholder"
                                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                            >
                                {showConfirmPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                            </button>
                        </div>
                        {showMismatch && (
                            <p className="pl-[2px] text-[12px] text-[#FF4C35]">
                                {t(`${translationPrefix}.passwordMismatch`)}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </KeyboardAwareLayout>
    );
};
