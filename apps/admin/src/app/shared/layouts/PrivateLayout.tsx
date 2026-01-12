import { Outlet } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';

import { AdminSidebar } from '../components/Sidebar';
import { useSidebarStore } from '../stores';
import { AdminTopBar } from './AdminTopBar';

/**
 * Private layout component for authenticated pages
 * Provides sidebar navigation and topbar with main content area
 */
export const PrivateLayout = (): JSX.Element => {
    const { isMobileMenuOpen, setMobileMenuOpen } = useSidebarStore();

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            {/* Mobile Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar - Hidden on mobile unless menu is open */}
            <div
                className={cn(
                    'fixed lg:static inset-y-0 left-0 z-40 transition-transform duration-300 lg:translate-x-0',
                    isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <AdminSidebar />
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <AdminTopBar />

                <main
                    id="main-content"
                    className="flex-1 overflow-auto bg-background"
                    role="main"
                    aria-label="Main content"
                    tabIndex={-1}
                >
                    <div className="min-h-full flex flex-col">
                        <div className="flex-1">
                            <Outlet />
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};
