import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Eye, EyeOff } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import { useDebugLogin } from '../hooks';

export const DebugLoginPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { submit, isSubmitting, isError } = useDebugLogin();
    const [uid, setUid] = useState('');
    const [pwd, setPwd] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting || !uid.trim() || !pwd) return;
        void submit(uid.trim(), pwd);
    };

    const inputClass = cn(
        'h-11 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none transition-colors',
        'border-input focus:border-focus-border disabled:opacity-50'
    );

    return (
        <div className="relative flex h-screen items-center justify-center overflow-hidden bg-background">
            <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                    background:
                        'radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.12), transparent 70%), radial-gradient(40% 40% at 80% 100%, hsl(var(--primary) / 0.08), transparent 70%)',
                }}
                aria-hidden
            />
            <form
                onSubmit={handleSubmit}
                className="relative flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-border bg-card p-8 shadow-xl shadow-primary/5"
            >
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl font-bold tracking-tight text-foreground">{t('auth.debug.title')}</h1>
                    <p className="text-sm text-muted-foreground">{t('auth.debug.subtitle')}</p>
                </div>

                <div className="flex flex-col gap-2">
                    <label htmlFor="debug-email" className="text-sm font-medium text-label">
                        {t('auth.debug.email')}
                    </label>
                    <input
                        id="debug-email"
                        type="email"
                        autoFocus
                        value={uid}
                        onChange={e => setUid(e.target.value)}
                        placeholder={t('auth.debug.emailPlaceholder')}
                        disabled={isSubmitting}
                        className={inputClass}
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label htmlFor="debug-password" className="text-sm font-medium text-label">
                        {t('auth.debug.password')}
                    </label>
                    <div className="relative">
                        <input
                            id="debug-password"
                            type={showPassword ? 'text' : 'password'}
                            value={pwd}
                            onChange={e => setPwd(e.target.value)}
                            placeholder={t('auth.debug.passwordPlaceholder')}
                            disabled={isSubmitting}
                            className={cn(inputClass, 'pr-11')}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(prev => !prev)}
                            aria-label={showPassword ? t('auth.debug.hidePassword') : t('auth.debug.showPassword')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                        </button>
                    </div>
                </div>

                {isError && <p className="-mt-2 text-sm text-destructive">{t('auth.debug.failed')}</p>}

                <button
                    type="submit"
                    disabled={isSubmitting || !uid.trim() || !pwd}
                    className={cn(
                        'h-11 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-all',
                        'hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100'
                    )}
                >
                    {isSubmitting ? t('auth.debug.loading') : t('auth.debug.submit')}
                </button>

                <button
                    type="button"
                    onClick={() => navigate('/auth/login')}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                    {t('auth.debug.backToInvite')}
                </button>
            </form>
        </div>
    );
};
