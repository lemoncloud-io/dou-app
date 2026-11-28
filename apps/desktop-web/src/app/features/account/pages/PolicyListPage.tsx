import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { SettingsNavRow, SettingsRowGroup } from '@chatic/design-system-components-desktop';

import { PageShell } from '../../../shared';

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
