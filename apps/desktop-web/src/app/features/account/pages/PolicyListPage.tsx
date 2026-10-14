import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { PageShell, SettingsNavRow, SettingsRowGroup } from '../../../shared';

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
            <SettingsRowGroup>
                {(
                    [
                        { to: '/account/policies/terms', label: t('policy.list.terms') },
                        { to: '/account/policies/privacy', label: t('policy.list.privacy') },
                    ] as const
                ).map(entry => (
                    <SettingsNavRow key={entry.to} label={entry.label} onClick={() => navigate(entry.to)} />
                ))}
            </SettingsRowGroup>
        </PageShell>
    );
};
