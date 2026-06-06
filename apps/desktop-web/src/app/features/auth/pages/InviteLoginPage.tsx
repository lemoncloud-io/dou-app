import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';

import { useInviteLogin } from '../hooks/useInviteLogin';

export const InviteLoginPage = () => {
    const { t } = useTranslation();
    const { login, isSubmitting, isError } = useInviteLogin();
    const [code, setCode] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        void login(code);
    };

    return (
        <div className="flex h-screen items-center justify-center bg-background">
            <form
                onSubmit={handleSubmit}
                className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm"
            >
                <h1 className="text-lg font-semibold text-foreground">{t('auth.invite.title')}</h1>
                <input
                    autoFocus
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    placeholder={t('auth.invite.placeholder')}
                    disabled={isSubmitting}
                    className={cn(
                        'h-11 rounded-lg border bg-background px-3 text-sm text-foreground outline-none',
                        'border-input focus:border-focus-border disabled:opacity-50'
                    )}
                />
                {isError && <p className="text-sm text-destructive">{t('auth.invite.failed')}</p>}
                <button
                    type="submit"
                    disabled={isSubmitting || !code.trim()}
                    className="h-11 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                    {isSubmitting ? t('auth.invite.preparing') : t('auth.invite.submit')}
                </button>
            </form>
        </div>
    );
};
