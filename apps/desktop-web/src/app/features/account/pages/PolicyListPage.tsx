import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { PageShell } from '../../../shared';

/**
 * Policy hub: terms + privacy entries. Licenses are deliberately absent —
 * desktop-web never emits the `/licenses.json` build artifact, and a new
 * build step outweighs a compliance-list page.
 */
export const PolicyListPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <PageShell title={t('policy.list.title')} backTo="/account" backLabel={t('account.title')}>
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
        </PageShell>
    );
};
