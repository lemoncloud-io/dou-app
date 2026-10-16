import { useState } from 'react';

import { useI18n } from '../i18n';

const DISMISSED_KEY = 'virtual-shell.welcome-dismissed';

const readDismissed = (): boolean => {
    try {
        return globalThis.localStorage?.getItem(DISMISSED_KEY) === '1';
    } catch {
        return false;
    }
};

/** A first visit's three lines of orientation; gone for good once closed on this browser. */
export const Welcome = () => {
    const { t } = useI18n();
    const [dismissed, setDismissed] = useState(readDismissed);
    if (dismissed) return null;
    const close = () => {
        setDismissed(true);
        try {
            globalThis.localStorage?.setItem(DISMISSED_KEY, '1');
        } catch {
            // Shown again next time; nothing else depends on it.
        }
    };
    return (
        <section className="vs-welcome" aria-label={t('welcome.title')}>
            <strong>{t('welcome.title')}</strong>
            <ol>
                <li>{t('welcome.phone')}</li>
                <li>{t('welcome.tabs')}</li>
                <li>{t('welcome.log')}</li>
            </ol>
            <button type="button" className="vs-btn vs-btn-small" onClick={close}>
                {t('welcome.close')}
            </button>
        </section>
    );
};
