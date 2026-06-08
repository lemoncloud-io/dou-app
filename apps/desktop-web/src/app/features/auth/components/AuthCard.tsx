import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowLeft } from 'lucide-react';

interface AuthCardProps {
    title: string;
    subtitle: string;
    children: ReactNode;
    /** When set, renders a back button in the card's top-left corner. */
    onBack?: () => void;
}

/**
 * Shared auth-screen shell: full-screen ambient brand glow + a centered card
 * with the brand mark, title, and subtitle. The screen body (controls / form)
 * is passed as children. Used by WelcomePage and InviteLoginPage.
 */
export const AuthCard = ({ title, subtitle, children, onBack }: AuthCardProps) => {
    const { t } = useTranslation();

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
            <div className="relative flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-border bg-card p-8 shadow-xl shadow-primary/5">
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        className="-ml-1.5 flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <ArrowLeft size={16} />
                        {t('common.back')}
                    </button>
                )}
                <div className="flex flex-col gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground shadow-lg shadow-primary/25">
                        C
                    </div>
                    <div className="flex flex-col gap-1">
                        <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
                        <p className="text-sm text-muted-foreground">{subtitle}</p>
                    </div>
                </div>
                {children}
            </div>
        </div>
    );
};
