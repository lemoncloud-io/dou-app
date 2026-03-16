import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '../../../shared/components';

export const NotificationsPage = () => {
    const { t } = useTranslation();

    return (
        <div className="flex min-h-screen flex-col bg-background pt-safe-top">
            <PageHeader title={t('notifications.title')} />

            {/* Empty State */}
            <div className="flex flex-1 flex-col items-center justify-center">
                <Bell size={48} className="mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('notifications.empty')}</p>
            </div>
        </div>
    );
};
