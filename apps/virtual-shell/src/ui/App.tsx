import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';

import {
    initialLanguage,
    LANGUAGE_NAMES,
    LANGUAGES,
    LanguageContext,
    saveLanguage,
    translator,
    useI18n,
    type Language,
} from '../i18n';
import type { MessageKey } from '../i18n/en';
import type { GoogleSignIn } from '../shell/googleSignIn';
import type { VirtualShell } from '../shell/VirtualShell';
import { BellIcon, InboxIcon, LinkIcon, ListIcon, PhoneIcon } from './icons';
import { EnvSwitch } from './EnvSwitch';
import { Tooltip } from './Tooltip';
import { Welcome } from './Welcome';
import { LogPanel } from './LogPanel';
import { NotificationCentre } from './NotificationCentre';
import { Phone } from './Phone';
import { AppCard, DeviceCard, EventsCard, KeyboardCard, LinkCard, PushCard, StorageCard } from './ToolPanel';

/** Re-renders on every change the shell reports, and twice a second for what the frame changes itself (its path). */
export const useShell = (shell: VirtualShell): void => {
    const [, tick] = useReducer((count: number) => count + 1, 0);
    useEffect(() => {
        const stop = shell.onChange(tick);
        const timer = setInterval(tick, 500);
        return () => {
            stop();
            clearInterval(timer);
        };
    }, [shell]);
};

type Tab = 'push' | 'link' | 'app' | 'logs' | 'notifications';

export const App = ({ shell, signIn }: { shell: VirtualShell; signIn: GoogleSignIn }) => {
    const [language, setLanguage] = useState<Language>(() => initialLanguage());
    const i18n = useMemo(
        () => ({
            language,
            t: translator(language),
            setLanguage: (next: Language) => {
                saveLanguage(next);
                setLanguage(next);
            },
        }),
        [language]
    );
    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    return (
        <LanguageContext.Provider value={i18n}>
            <Shell shell={shell} signIn={signIn} />
            <Tooltip />
        </LanguageContext.Provider>
    );
};

const Shell = ({ shell, signIn }: { shell: VirtualShell; signIn: GoogleSignIn }) => {
    useShell(shell);
    const { t } = useI18n();
    const status = shell.status();
    const [tab, setTab] = useState<Tab>('push');
    const appState = status.exited ? 'closed' : status.appState;

    return (
        <div className={`vs-root vs-env-${status.env}`}>
            {status.env === 'prod' && (
                <div className="vs-prod-band" role="alert">
                    {t('prod.band')}
                </div>
            )}
            <header className="vs-header">
                <div className="vs-brand">
                    <span className="vs-logo" aria-hidden="true">
                        D
                    </span>
                    <div>
                        <div className="vs-brand-title">{t('app.title')}</div>
                        <div className="vs-brand-sub">{t('app.subtitle')}</div>
                    </div>
                </div>
                <div className="vs-chips">
                    <EnvSwitch current={status.env} />
                    <span
                        className={`vs-chip vs-chip-conn vs-conn-${status.handshake}`}
                        data-tip={t('status.handshake.tip')}
                    >
                        <span className="vs-dot" aria-hidden="true" />
                        {t(`status.handshake.${status.handshake}` as MessageKey)}
                    </span>
                    <span className={`vs-chip vs-app-${appState}`} data-tip={t('status.app.tip')}>
                        {t(`status.app.${appState}` as MessageKey)}
                    </span>
                    <span
                        className="vs-chip vs-chip-path"
                        data-tip={t('status.path.tip', { path: status.path || '/' })}
                    >
                        <span className="vs-chip-label">{t('status.path')}</span>
                        <code>{status.path || '—'}</code>
                    </span>
                </div>
                <LanguageSwitch />
            </header>
            <main className="vs-main">
                <Phone shell={shell} signIn={signIn} />
                <aside className="vs-side">
                    <nav className="vs-tabs" role="tablist">
                        <TabButton
                            id="push"
                            tip={t('tab.push.tip')}
                            current={tab}
                            onSelect={setTab}
                            icon={<BellIcon />}
                            label={t('tab.push')}
                        />
                        <TabButton
                            id="link"
                            tip={t('tab.link.tip')}
                            current={tab}
                            onSelect={setTab}
                            icon={<LinkIcon />}
                            label={t('tab.link')}
                        />
                        <TabButton
                            id="app"
                            tip={t('tab.app.tip')}
                            current={tab}
                            onSelect={setTab}
                            icon={<PhoneIcon />}
                            label={t('tab.app')}
                        />
                        <TabButton
                            id="logs"
                            tip={t('tab.logs.tip')}
                            current={tab}
                            onSelect={setTab}
                            icon={<ListIcon />}
                            label={t('tab.logs')}
                        />
                        <TabButton
                            id="notifications"
                            tip={t('tab.notifications.tip')}
                            current={tab}
                            onSelect={setTab}
                            icon={<InboxIcon />}
                            label={t('tab.notifications')}
                            count={shell.notifications.length}
                        />
                    </nav>
                    <div className="vs-tab-body">
                        <Welcome />
                        {tab === 'push' && <PushCard shell={shell} />}
                        {tab === 'link' && <LinkCard shell={shell} />}
                        {tab === 'app' && (
                            <div className="vs-cards">
                                <AppCard shell={shell} />
                                <DeviceCard shell={shell} />
                                <KeyboardCard shell={shell} />
                                <StorageCard shell={shell} />
                                <EventsCard shell={shell} />
                            </div>
                        )}
                        {tab === 'logs' && <LogPanel shell={shell} />}
                        {tab === 'notifications' && <NotificationCentre shell={shell} />}
                    </div>
                </aside>
            </main>
        </div>
    );
};

const TabButton = ({
    id,
    current,
    onSelect,
    icon,
    label,
    count,
    tip,
}: {
    id: Tab;
    current: Tab;
    onSelect: (tab: Tab) => void;
    icon: ReactNode;
    label: string;
    count?: number;
    tip: string;
}) => (
    <button
        type="button"
        role="tab"
        aria-selected={current === id}
        className="vs-tab"
        data-tip={tip}
        onClick={() => onSelect(id)}
    >
        {icon}
        <span>{label}</span>
        {!!count && <span className="vs-count">{count}</span>}
    </button>
);

const LanguageSwitch = () => {
    const { language, setLanguage, t } = useI18n();
    return (
        <div className="vs-segment" role="group" aria-label={t('lang.label')} data-tip={t('lang.tip')}>
            {LANGUAGES.map(option => (
                <button
                    key={option}
                    type="button"
                    aria-pressed={language === option}
                    className={language === option ? 'vs-segment-on' : ''}
                    onClick={() => setLanguage(option)}
                >
                    {LANGUAGE_NAMES[option]}
                </button>
            ))}
        </div>
    );
};
