import { Outlet } from 'react-router-dom';

/**
 * Private layout component for authenticated pages
 * Provides main content area with optional sidebar/topbar
 */
export const PrivateLayout = (): JSX.Element => {
    return (
        <div className="flex h-screen overflow-hidden bg-background">
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
