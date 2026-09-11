import { NavLink, Outlet } from 'react-router-dom';

import { SessionExpiredBanner } from '../components/SessionExpiredBanner';

/** App-level features reachable from the top nav. */
const NAV_LINKS = [
    { to: '/socket-lab', label: 'Socket Lab' },
    { to: '/report-logs', label: 'Report Logs' },
    { to: '/users', label: 'Users' },
    { to: '/memberships', label: 'Memberships' },
];

const linkClass = ({ isActive }: { isActive: boolean }): string =>
    `app-nav-link ${isActive ? 'app-nav-link-active' : ''}`;

/**
 * Full-height shell with a slim top nav, painted from the shared monitoring scale so the chrome and
 * the screens inside it read as one surface.
 *
 * The main area gets a definite height (`flex: 1; min-height: 0`) so feature screens that fill their
 * container — the socket-lab shell, the membership console — size to the remaining space instead of
 * overflowing the viewport.
 */
export const PrivateLayout = () => (
    <div className="app-shell">
        <SessionExpiredBanner />
        <nav className="app-nav">
            <span className="app-brand">Admin V2</span>
            {NAV_LINKS.map(link => (
                <NavLink key={link.to} to={link.to} className={linkClass}>
                    {link.label}
                </NavLink>
            ))}
        </nav>
        <main className="app-main">
            <Outlet />
        </main>
    </div>
);
