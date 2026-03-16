import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLogin } from '@chatic/auth';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { webCore } from '@chatic/web-core';

import { useNavigateWithTransition } from '../../../shared/hooks';
import { Input } from '@chatic/ui-kit/components/ui/input';

export const LoginPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { toast } = useToast();
    const { mutateAsync: login, isPending } = useLogin();

    const [uid, setUid] = useState('');
    const [pwd, setPwd] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const { Token } = await login({ uid, pwd });
            await webCore.buildCredentialsByToken(Token as Parameters<typeof webCore.buildCredentialsByToken>[0]);

            window.location.href = '/';
        } catch {
            toast({
                title: t('mypageLogin.error'),
                description: t('mypageLogin.errorDescription'),
                variant: 'destructive',
            });
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-background px-4 pt-safe-top">
            <header className="flex items-center py-3">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2">
                    <ChevronLeft size={24} strokeWidth={2} />
                </button>
            </header>

            <div className="mt-6 mb-8">
                <h1 className="text-[20px] font-semibold leading-[1.35] ">{t('mypageLogin.title')}</h1>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                    <label className="text-[14px] font-semibold text-[#53555B]">{t('mypageLogin.emailLabel')}</label>
                    <Input
                        type="email"
                        value={uid}
                        onChange={e => setUid(e.target.value)}
                        placeholder={t('mypageLogin.emailPlaceholder')}
                        required
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[14px] font-semibold text-[#53555B]">{t('mypageLogin.passwordLabel')}</label>
                    <Input
                        type="password"
                        value={pwd}
                        onChange={e => setPwd(e.target.value)}
                        placeholder={t('mypageLogin.passwordPlaceholder')}
                        required
                    />
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
        </div>
    );
};
