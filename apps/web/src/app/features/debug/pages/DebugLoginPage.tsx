import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLogin } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useNavigateWithTransition } from '@chatic/shared';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { ROUTES } from '../../../routes/paths';

export const DebugLoginPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { toast } = useToast();
    const { mutateAsync: login, isPending } = useLogin();

    const [uid, setUid] = useState('');
    const [pwd, setPwd] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // loginRelayUser builds credentials and hydrates the session internally.
            await login({ uid, pwd });
            window.location.href = ROUTES.root;
        } catch {
            toast({
                title: t('mypageLogin.error'),
                description: t('mypageLogin.errorDescription'),
                variant: 'destructive',
            });
        }
    };

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <header className="flex items-center px-[6px]">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
                <span className="ml-2 text-[14px] font-medium text-muted-foreground">Debug</span>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-none px-4 pb-safe-bottom">
                <div className="mt-6 mb-8">
                    <h1 className="text-[20px] font-semibold leading-[1.35]">{t('mypageLogin.title')}</h1>
                    <p className="mt-1 text-[13px] text-muted-foreground">Debug Mode - Email Login</p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <label className="text-[14px] font-semibold text-label">{t('mypageLogin.emailLabel')}</label>
                        <Input
                            type="email"
                            value={uid}
                            onChange={e => setUid(e.target.value)}
                            placeholder={t('mypageLogin.emailPlaceholder')}
                            required
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[14px] font-semibold text-label">{t('mypageLogin.passwordLabel')}</label>
                        <div className="relative">
                            <Input
                                type={showPassword ? 'text' : 'password'}
                                value={pwd}
                                onChange={e => setPwd(e.target.value)}
                                placeholder={t('mypageLogin.passwordPlaceholder')}
                                className="pr-11"
                                required
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

                    <div className="mt-4">
                        <button
                            type="submit"
                            disabled={isPending}
                            className="w-full rounded-[100px] bg-[#B0EA10] py-3 text-[16px] font-semibold text-[#222325] disabled:opacity-50"
                        >
                            {isPending ? t('mypageLogin.loading') : t('mypageLogin.submit')}
                        </button>
                    </div>
                </form>

                <div className="mt-6 flex items-center justify-center gap-6">
                    <button
                        type="button"
                        onClick={() => navigate(ROUTES.account.signup.root)}
                        className="flex items-center gap-0.5 text-[15px] font-medium text-label"
                    >
                        {t('mypageLogin.signup')}
                        <ChevronRight size={18} />
                    </button>
                    <div className="h-[14px] w-px bg-input-border" />
                    <button
                        type="button"
                        onClick={() => navigate(ROUTES.account.resetPassword.root)}
                        className="flex items-center gap-0.5 text-[15px] font-medium text-label"
                    >
                        {t('mypageLogin.forgotPassword')}
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};
