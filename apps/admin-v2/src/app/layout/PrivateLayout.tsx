import { NavLink, Outlet } from 'react-router-dom';

import { SessionExpiredBanner } from '../components/SessionExpiredBanner';
import { LANGUAGES, setLanguage, useT } from '../i18n';

/** App-level features reachable from the top nav. Labels are keys in the `common` namespace. */
const NAV_LINKS = [
    { to: '/socket-lab', key: 'nav.socketLab' },
    { to: '/report-logs', key: 'nav.reportLogs' },
    { to: '/users', key: 'nav.users' },
    { to: '/memberships', key: 'nav.memberships' },
    { to: '/cloud-deployments', key: 'nav.cloudDeployments' },
] as const;

const linkClass = ({ isActive }: { isActive: boolean }): string =>
    `app-nav-link ${isActive ? 'app-nav-link-active' : ''}`;

/**
 * The viewer's language, Korean or English. Remembered in this browser only — see `i18n/index.ts`.
 * Each option is written in its own language, so it can be found by someone who cannot read the
 * other one.
 */
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

/**
 * Full-height shell with a slim top nav, painted from the shared monitoring scale so the chrome and
 * the screens inside it read as one surface.
 *
 * The main area gets a definite height (`flex: 1; min-height: 0`) so feature screens that fill their
 * container — the socket-lab shell, the membership console — size to the remaining space instead of
 * overflowing the viewport.
 */
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
