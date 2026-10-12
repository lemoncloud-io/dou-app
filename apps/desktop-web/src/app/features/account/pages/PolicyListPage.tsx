import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

/**
 * Policy hub: terms + privacy entries. Licenses are deliberately absent —
 * desktop-web never emits the `/licenses.json` build artifact, and a new
 * build step outweighs a compliance-list page.
 */
export const PolicyListPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <div className="flex h-full flex-col bg-background">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-muted-foreground"
                    onClick={() => navigate('/account')}
                >
                    <ChevronLeft className="h-4 w-4" />
                    {t('settings.back')}
                </Button>
                <h1 className="text-heading text-foreground">{t('policy.list.title')}</h1>
            </header>

            <div className="scrollbar-thin mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-8">
                <ul className="flex flex-col gap-1">
                    {(
                        [
                            { to: '/account/policies/terms', label: t('policy.list.terms') },
                            { to: '/account/policies/privacy', label: t('policy.list.privacy') },
                        ] as const
                    ).map(entry => (
                        <li key={entry.to}>
                            <button
                                type="button"
                                onClick={() => navigate(entry.to)}
                                className="focus-ring tactile flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
                            >
                                <span className="min-w-0 flex-1 truncate text-callout font-medium text-foreground">
                                    {entry.label}
                                </span>
                                <ChevronRight size={16} aria-hidden className="shrink-0 text-muted-foreground" />
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};
