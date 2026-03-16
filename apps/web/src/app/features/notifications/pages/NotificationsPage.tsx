import { Bell, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/page-transition';

export const NotificationsPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();

    return (
        <div className="flex min-h-screen flex-col bg-background pt-safe-top">
            {/* Header */}
            <header className="flex items-center justify-center px-4 py-3">
                <button onClick={() => navigate(-1)} className="absolute left-4 p-2">
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">{t('notifications.title')}</h1>
            </header>

            {/* Empty State */}
            <div className="flex flex-1 flex-col items-center justify-center">
                <Bell size={48} className="mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('notifications.empty')}</p>
            </div>
        </div>
    );
};
