import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';

import { useDebugModeStore } from '../../../shared';

const TABS = [
    { to: '/debug', label: 'State', end: true },
    { to: '/debug/sync', label: 'Socket / Cache', end: false },
    { to: '/debug/chat', label: 'Cache stream', end: false },
    { to: '/debug/badge', label: 'OS badge', end: false },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(
        'block rounded-lg px-3 py-2 text-sm transition-colors',
        isActive ? 'bg-primary/15 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted'
    );

/**
 * Shared chrome for all /debug/* pages: a persistent left rail of tabs so you can
 * jump between debug tools in one click (no round-trip through a hub), plus exit
 * actions. Pages render only their content into the <Outlet/>.
 */
export const DebugLayout = () => {
    const navigate = useNavigate();
    const setDebugEnabled = useDebugModeStore(s => s.setEnabled);

    const exitDebug = () => {
        setDebugEnabled(false);
        navigate('/');
    };

    return (
        <div className="flex h-screen bg-background text-foreground">
            <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-card">
                <div className="flex h-14 shrink-0 items-center px-4 text-sm font-bold uppercase tracking-widest text-primary">
                    Debug
                </div>
                <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
                    {TABS.map(tab => (
                        <NavLink key={tab.to} to={tab.to} end={tab.end} className={navClass}>
                            {tab.label}
                        </NavLink>
                    ))}
                </nav>
                <div className="space-y-0.5 border-t border-border p-2">
                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
                    >
                        ← Back to app
                    </button>
                    <button
                        type="button"
                        onClick={exitDebug}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-500/10 dark:text-red-400"
                    >
                        Exit debug mode
                    </button>
                </div>
            </aside>
            <main className="scrollbar-thin flex-1 overflow-y-auto">
                <Outlet />
            </main>
        </div>
    );
};
