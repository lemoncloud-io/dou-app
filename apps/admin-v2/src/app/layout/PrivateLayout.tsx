import { NavLink, Outlet } from 'react-router-dom';

/** App-level features reachable from the top nav. */
const NAV_LINKS = [
    { to: '/socket-lab', label: 'Socket Lab' },
    { to: '/report-logs', label: 'Report Logs' },
];

const linkClass = ({ isActive }: { isActive: boolean }): string =>
    `rounded-md px-3 py-1.5 text-sm transition-colors ${
        isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

/**
 * Full-height shell with a slim top nav. The main area gets a definite height
 * (`flex-1 min-h-0`) so feature screens that fill their container — e.g. the
 * socket-lab shell (`.sm-root`, height:100%) — size to the remaining space
 * instead of overflowing the viewport.
 */
export const PrivateLayout = () => (
    <div className="flex h-screen flex-col bg-background">
        <nav className="flex items-center gap-1 border-b border-border bg-card px-4 py-2">
            <span className="mr-3 text-sm font-semibold text-foreground">Admin V2</span>
            {NAV_LINKS.map(link => (
                <NavLink key={link.to} to={link.to} className={linkClass}>
                    {link.label}
                </NavLink>
            ))}
        </nav>
        <main className="min-h-0 flex-1 overflow-auto">
            <Outlet />
        </main>
    </div>
);
