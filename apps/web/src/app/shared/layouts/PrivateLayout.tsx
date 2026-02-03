import { Outlet } from 'react-router-dom';

import { Sidebar } from '../components';

/**
 * Private layout component for authenticated pages
 * Provides sidebar navigation and main content area
 */
export const PrivateLayout = (): JSX.Element => {
    return (
        <div className="flex h-screen overflow-hidden bg-background">
            {/* Sidebar Navigation */}
            <Sidebar />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
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
