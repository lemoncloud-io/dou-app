import { NavLink, Outlet } from 'react-router-dom';

import { SessionExpiredBanner } from '../components/SessionExpiredBanner';
import { LANGUAGES, setLanguage, useT } from '../i18n';

const NAV_LINKS = [
    { to: '/socket-lab', key: 'nav.socketLab' },
    { to: '/report-logs', key: 'nav.reportLogs' },
    { to: '/users', key: 'nav.users' },
    { to: '/memberships', key: 'nav.memberships' },
    { to: '/cloud-deployments', key: 'nav.cloudDeployments' },
    { to: '/cost-monitor', key: 'nav.costMonitor' },
] as const;

const linkClass = ({ isActive }: { isActive: boolean }): string =>
    `app-nav-link ${isActive ? 'app-nav-link-active' : ''}`;

export const LanguageSwitch = () => {
    const { t, lng } = useT('common');
    return (
        <div role="radiogroup" aria-label={t('language.label')} className="ml-auto flex shrink-0 gap-0.5 pl-3">
            {LANGUAGES.map(language => (
                <button
                    key={language}
                    type="button"
                    role="radio"
                    aria-checked={lng === language}
                    lang={language}
                    onClick={() => setLanguage(language)}
                    className={`app-nav-link ${lng === language ? 'app-nav-link-active' : ''}`}
                >
                    {t(`language.${language}`)}
                </button>
            ))}
        </div>
    );
};

export const PrivateLayout = () => {
    const { t } = useT('common');
    return (
        <div className="app-shell">
            <SessionExpiredBanner />
            <nav className="app-nav overflow-x-auto">
                <span className="app-brand">{t('nav.brand')}</span>
                {NAV_LINKS.map(link => (
                    <NavLink
                        key={link.to}
                        to={link.to}
                        className={state => `${linkClass(state)} shrink-0 whitespace-nowrap`}
                    >
                        {t(link.key)}
                    </NavLink>
                ))}
                <LanguageSwitch />
            </nav>
            <main className="app-main">
                <Outlet />
            </main>
        </div>
    );
};
