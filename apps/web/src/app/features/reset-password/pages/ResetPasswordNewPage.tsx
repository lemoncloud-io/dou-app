import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { FloatingButton } from '../../signup/components/FloatingButton';

export const ResetPasswordNewPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [touched, setTouched] = useState(false);
    const [loading, setLoading] = useState(false);

    const passwordsMatch = password === confirmPassword;
    const isValid = password.length > 0 && confirmPassword.length > 0 && passwordsMatch;
    const showMismatch = touched && confirmPassword.length > 0 && !passwordsMatch;

    const handleComplete = async () => {
        setLoading(true);
        // TODO: Call reset password API
        await new Promise(resolve => setTimeout(resolve, 1000));
        setLoading(false);
        toast({ title: t('resetPassword.success') });
        navigate(-1);
    };

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <header className="flex items-center px-[6px]">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-none px-4 pb-[120px]">
                <div className="mb-8 mt-6">
                    <h1 className="text-[22px] font-bold leading-[1.35] tracking-[0.11px]">
                        {t('resetPassword.newPasswordTitle')}
                    </h1>
                    <p className="mt-[6px] text-[16px] font-medium leading-[1.45] tracking-[-0.24px] text-[#9FA2A7]">
                        {t('resetPassword.newPasswordDescription')}
                    </p>
                </div>

                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <label className="text-[14px] font-semibold text-[#53555B]">
                            {t('resetPassword.passwordLabel')}
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder={t('resetPassword.passwordPlaceholder')}
                            className="w-full rounded-[10px] border border-[#EAEAEC] bg-white p-3 px-4 text-[16px] text-black outline-none transition-colors placeholder:text-[#BABCC0] focus:border-[1.5px] focus:border-[#3A3C40] dark:border-[#3A3C40] dark:bg-background dark:text-white"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[14px] font-semibold text-[#53555B]">
                            {t('resetPassword.confirmPasswordLabel')}
                        </label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            onBlur={() => setTouched(true)}
                            placeholder={t('resetPassword.confirmPasswordPlaceholder')}
                            className={cn(
                                'w-full rounded-[10px] border bg-white p-3 px-4 text-[16px] text-black outline-none transition-colors placeholder:text-[#BABCC0] dark:bg-background dark:text-white',
                                showMismatch
                                    ? 'border-[1.5px] border-[#FF4C35]'
                                    : 'border-[#EAEAEC] focus:border-[1.5px] focus:border-[#3A3C40] dark:border-[#3A3C40]'
                            )}
                        />
                        {showMismatch && (
                            <p className="pl-[2px] text-[12px] text-[#FF4C35]">{t('resetPassword.passwordMismatch')}</p>
                        )}
                    </div>
                </div>
            </div>

            <FloatingButton
                label={t('resetPassword.complete')}
                disabled={!isValid}
                loading={loading}
                onClick={handleComplete}
            />
        </div>
    );
};
