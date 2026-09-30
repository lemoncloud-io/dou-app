import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowLeft } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import douMark from '../../../../assets/dou-mark.png';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, setLanguage } from '../../../../i18n';

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
 *
 * The language switch lives here because this is the one screen before
 * Settings exists: someone whose system language is not the one they read had
 * no way to change it until after signing in.
 */
export const AuthCard = ({ title, subtitle, children, onBack }: AuthCardProps) => {
    const { t, i18n } = useTranslation();

    return (
        // The page scrolls rather than clips: at the minimum window, zoomed, or with an error line the
        // card is taller than the window. It is centred with `my-auto`, not `justify-center` —
        // centring overflows both ways and puts the card's top above the scroll origin, where no
        // scrolling reaches it; an auto margin just drops to 0 once the card no longer fits.
        <main className="flex h-full flex-col items-center overflow-y-auto bg-background px-4 py-6">
            <div className="my-auto flex w-full max-w-sm shrink-0 flex-col gap-5 rounded-2xl border border-border bg-card p-8 shadow-raised">
                <div
                    role="radiogroup"
                    aria-label={t('settings.language')}
                    className="-mr-2 -mt-3 flex gap-1 self-end text-caption"
                >
                    {SUPPORTED_LANGUAGES.map(lng => (
                        <button
                            key={lng}
                            type="button"
                            role="radio"
                            aria-checked={i18n.language === lng}
                            onClick={() => setLanguage(lng)}
                            className={cn(
                                'focus-ring rounded-md px-2 py-1 transition-colors',
                                i18n.language === lng
                                    ? 'font-semibold text-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {LANGUAGE_LABELS[lng]}
                        </button>
                    ))}
                </div>
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        className="focus-ring -ml-1.5 flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-callout font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowLeft size={16} />
                        {t('common.back')}
                    </button>
                )}
                <div className="flex flex-col gap-3">
                    <img src={douMark} alt="" width={48} height={48} className="h-12 w-12 rounded-xl" />
                    <div className="flex flex-col gap-1">
                        <h1 className="text-headline font-bold tracking-tight text-foreground">{title}</h1>
                        <p className="text-callout text-muted-foreground">{subtitle}</p>
                    </div>
                </div>
                {children}
            </div>
        </main>
    );
};
