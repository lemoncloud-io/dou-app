import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

/**
 * What a screen shows until it is built: its id and the URL it answers. Every route has a page from
 * the start, so a link or a guard can point at a screen before the screen exists.
 */
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
