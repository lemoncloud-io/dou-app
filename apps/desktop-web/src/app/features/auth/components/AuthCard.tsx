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
 * Shared auth-screen shell: a centered card with the brand mark, title, and
 * subtitle; the screen body (controls / form) is passed as children. Used by
 * WelcomePage and InviteLoginPage.
 *
 * It used to sit on a two-stop radial brand glow, with an accent-tinted drop
 * shadow on the card and another on the logo tile. Those are the decoration this
 * product's brand explicitly rules out — the first screen a person sees should
 * look like the app they are about to enter, not like a different product. The
 * card is held by a hairline and spacing instead.
 */
export const AuthCard = ({ title, subtitle, children, onBack }: AuthCardProps) => {
    const { t } = useTranslation();

    return (
        <div className="flex h-full items-center justify-center overflow-hidden bg-background">
            <div className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-border bg-card p-8 shadow-raised">
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        className="focus-ring -ml-1.5 flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowLeft size={16} />
                        {t('common.back')}
                    </button>
                )}
                <div className="flex flex-col gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
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
