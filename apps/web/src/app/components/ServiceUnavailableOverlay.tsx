import { RefreshCw, ServerCrash } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useServiceStatusStore } from '@chatic/web-core';

export const ServiceUnavailableOverlay = () => {
    const { t } = useTranslation();
    const { isServiceUnavailable } = useServiceStatusStore();

    if (!isServiceUnavailable) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 px-6 text-center">
                <ServerCrash size={48} className="text-muted-foreground" />
                <h2 className="text-lg font-semibold text-foreground">{t('serviceUnavailable.title')}</h2>
                <p className="text-sm text-muted-foreground">{t('serviceUnavailable.description')}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-2 flex items-center gap-2 rounded-full border border-border px-6 py-2.5 text-sm font-medium text-foreground"
                >
                    <RefreshCw size={16} />
                    {t('serviceUnavailable.retry')}
                </button>
            </div>
        </div>
    );
};
