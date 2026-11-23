import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

export const ScreenPlaceholder = ({ id }: { id: string }): JSX.Element => {
    const { t } = useTranslation();
    const { pathname, search } = useLocation();
    return (
        <section className="flex flex-col gap-2 py-10">
            <h1 className="text-2xl font-bold text-navy">{t('subscription.common.placeholder', { id })}</h1>
            <p className="font-mono text-xs text-subtitle">
                {pathname}
                {search}
            </p>
        </section>
    );
};
